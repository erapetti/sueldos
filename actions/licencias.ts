'use server'

/**
 * §7.11 — registrar una licencia.
 *
 * Al confirmar, en una única transacción (§11):
 *  1. se inserta el registro en `licencias` con sus días hábiles persistidos;
 *  2. el movimiento `GOCE` en `licencia_movimientos`, al debe;
 *  3. una liquidación de tipo `SALARIO_VACACIONAL` en estado `CONFIRMADA`;
 *  4. el asiento `LIQUIDACION` en la cuenta corriente de dinero, al haber.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import { exigirEdicion } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import { idUuid, registrarLicencia as esquemaLicencia } from '@/lib/validacion/esquemas'
import {
  calcularDiasHabiles,
  calcularSalarioVacacional,
  saldoDiasLicencia,
  seSuperponen,
} from '@/lib/calculo/licencias'
import { aColumnaCantidad, aColumnaImporte, aDecimal } from '@/lib/db/mapeo'
import { CODIGOS } from '@/lib/calculo/tipos'
import { formatearDiasHabiles } from '@/lib/format/money'
import {
  formatearFecha,
  formatearPeriodo,
  hoy,
  parseFechaISO,
  primerDiaDelMes,
} from '@/lib/format/dates'

/** Datos en vivo del diálogo de §7.11, antes de confirmar. */
export async function previsualizarLicencia(
  empleadoId: string,
  fechaDesdeISO: string,
  fechaHastaISO: string,
) {
  return ejecutar('licencias.previsualizar', async (log) => {
    const { usuario, empleado } = await exigirEdicion(empleadoId)
    log({ usuarioId: usuario.id, entidad: 'licencia', entidadId: empleado.id })

    const fechaDesde = parseFechaISO(fechaDesdeISO)
    const fechaHasta = parseFechaISO(fechaHastaISO)
    if (fechaHasta.getTime() < fechaDesde.getTime()) {
      throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')
    }

    const [feriados, movimientos, salario] = await Promise.all([
      prisma.feriado.findMany({ where: { fecha: { gte: fechaDesde, lte: fechaHasta } } }),
      prisma.licenciaMovimiento.findMany({ where: { empleadoId }, select: { debe: true, haber: true } }),
      prisma.empleadoSalario.findFirst({
        where: { empleadoId, fechaVigencia: { lte: primerDiaDelMes(fechaDesde) } },
        orderBy: { fechaVigencia: 'desc' },
      }),
    ])

    const desglose = calcularDiasHabiles(fechaDesde, fechaHasta, feriados)
    const saldoAntes = saldoDiasLicencia(
      movimientos.map((m) => ({ debe: aDecimal(m.debe), haber: aDecimal(m.haber) })),
    )

    return exito({
      diasCorridos: desglose.diasCorridos,
      domingos: desglose.domingos,
      feriados: desglose.feriados,
      diasHabiles: desglose.diasHabiles.toString(),
      saldoAntes: saldoAntes.toString(),
      saldoDespues: saldoAntes.minus(desglose.diasHabiles).toString(),
      salarioVigente: salario ? aDecimal(salario.salario).toFixed(2) : null,
      salarioVacacional: salario
        ? calcularSalarioVacacional(aDecimal(salario.salario), desglose.diasHabiles).toFixed(2)
        : null,
    })
  })
}

export async function registrarLicencia(entrada: unknown) {
  return ejecutar('licencias.registrar', async (log) => {
    const datos = validar(esquemaLicencia, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'licencia', entidadId: empleado.id })

    const fechaDesde = parseFechaISO(datos.fechaDesde)
    const fechaHasta = parseFechaISO(datos.fechaHasta)

    if (fechaDesde.getTime() < empleado.fechaIngreso.getTime()) {
      throw new ErrorNegocio('La licencia no puede empezar antes del ingreso del empleado.', {
        fechaDesde: 'Anterior al ingreso',
      })
    }

    // §4.15.2 — no se admiten períodos superpuestos para el mismo empleado.
    const existentes = await prisma.licencia.findMany({
      where: { empleadoId: empleado.id },
      select: { fechaDesde: true, fechaHasta: true },
    })
    const solapada = existentes.find((l) =>
      seSuperponen(fechaDesde, fechaHasta, l.fechaDesde, l.fechaHasta),
    )
    if (solapada) {
      throw new ErrorNegocio(
        `Se superpone con la licencia del ${formatearFecha(solapada.fechaDesde)} al ${formatearFecha(solapada.fechaHasta)}.`,
        { fechaDesde: 'Período superpuesto' },
      )
    }

    const periodo = primerDiaDelMes(fechaDesde)

    const [feriados, salarioVigente, previas] = await Promise.all([
      prisma.feriado.findMany({ where: { fecha: { gte: fechaDesde, lte: fechaHasta } } }),
      prisma.empleadoSalario.findFirst({
        where: { empleadoId: empleado.id, fechaVigencia: { lte: periodo } },
        orderBy: { fechaVigencia: 'desc' },
      }),
      prisma.liquidacion.count({
        where: {
          empleadoId: empleado.id,
          periodo,
          tipo: 'SALARIO_VACACIONAL',
          estado: { not: 'ANULADA' },
        },
      }),
    ])

    if (!salarioVigente) {
      throw new ErrorNegocio(
        `No hay salario vigente para ${formatearPeriodo(periodo)}: no se puede calcular el salario vacacional.`,
      )
    }

    const desglose = calcularDiasHabiles(fechaDesde, fechaHasta, feriados)
    const salarioMensual = aDecimal(salarioVigente.salario)
    // §13.2 sigue pendiente: hoy el salario vacacional se liquida bruto, sin descuentos.
    const salarioVacacional = calcularSalarioVacacional(salarioMensual, desglose.diasHabiles)

    const auditoriaCols = { creadoPor: usuario.id, modificadoPor: usuario.id }
    const secuencia = previas + 1

    const resultado = await prisma.$transaction(async (tx) => {
      const licencia = await tx.licencia.create({
        data: {
          empleadoId: empleado.id,
          fechaDesde,
          fechaHasta,
          diasHabiles: aColumnaCantidad(desglose.diasHabiles),
          nota: datos.nota?.trim() || null,
          ...auditoriaCols,
        },
      })

      await tx.licenciaMovimiento.create({
        data: {
          empleadoId: empleado.id,
          fecha: fechaDesde,
          tipo: 'GOCE',
          debe: aColumnaCantidad(desglose.diasHabiles),
          haber: '0',
          concepto: `Licencia del ${formatearFecha(fechaDesde)} al ${formatearFecha(fechaHasta)}`,
          licenciaId: licencia.id,
          ...auditoriaCols,
        },
      })

      const liquidacion = await tx.liquidacion.create({
        data: {
          empleadoId: empleado.id,
          periodo,
          tipo: 'SALARIO_VACACIONAL',
          secuencia,
          estado: 'CONFIRMADA',
          totalRecalculado: aColumnaImporte(salarioVacacional),
          totalYaLiquidado: '0.00',
          totalAPagar: aColumnaImporte(salarioVacacional),
          ukVigente: 1,
          confirmadaEn: new Date(),
          confirmadaPor: usuario.id,
          snapshot: {
            version: 1,
            tipo: 'SALARIO_VACACIONAL',
            fechaDesde: datos.fechaDesde,
            fechaHasta: datos.fechaHasta,
            diasCorridos: desglose.diasCorridos,
            domingos: desglose.domingos,
            feriados: desglose.feriados,
            diasHabiles: desglose.diasHabiles.toString(),
            salarioMensual: salarioMensual.toFixed(2),
            salarioVacacional: salarioVacacional.toFixed(2),
            aportaBps: empleado.aportaBps,
            nota: 'Liquidado bruto, sin descuentos de BPS (SPECS §13.2 pendiente).',
          },
          ...auditoriaCols,
          lineas: {
            create: [
              {
                orden: 1,
                codigo: CODIGOS.SALARIO_VACACIONAL,
                descripcion: `Salario vacacional (${formatearDiasHabiles(desglose.diasHabiles)})`,
                cantidad: desglose.diasHabiles.toString(),
                valorUnitario: salarioMensual.dividedBy(30).toDecimalPlaces(4).toString(),
                importe: aColumnaImporte(salarioVacacional),
                signo: 1,
              },
              {
                orden: 2,
                codigo: CODIGOS.TOTAL,
                descripcion: 'Total a pagar',
                cantidad: null,
                valorUnitario: null,
                importe: aColumnaImporte(salarioVacacional),
                signo: 0,
              },
            ],
          },
        },
      })

      await tx.licencia.update({
        where: { id: licencia.id },
        data: { liquidacionId: liquidacion.id },
      })

      await tx.cuentaCorriente.create({
        data: {
          empleadoId: empleado.id,
          fecha: hoy(),
          tipo: 'LIQUIDACION',
          debe: '0',
          haber: aColumnaImporte(salarioVacacional),
          concepto: `Salario vacacional ${formatearPeriodo(periodo)}`,
          liquidacionId: liquidacion.id,
          ...auditoriaCols,
        },
      })

      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'licencia',
          entidadId: licencia.id,
          accion: 'REGISTRAR_LICENCIA',
          datosDespues: {
            fechaDesde: datos.fechaDesde,
            fechaHasta: datos.fechaHasta,
            diasHabiles: desglose.diasHabiles.toString(),
            salarioVacacional: salarioVacacional.toFixed(2),
          },
        },
        tx,
      )

      return { licencia, liquidacion }
    })

    log({ entidadId: resultado.licencia.id })
    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)

    const movimientos = await prisma.licenciaMovimiento.findMany({
      where: { empleadoId: empleado.id },
      select: { debe: true, haber: true },
    })
    const saldo = saldoDiasLicencia(
      movimientos.map((m) => ({ debe: aDecimal(m.debe), haber: aDecimal(m.haber) })),
    )

    return exito(
      { licenciaId: resultado.licencia.id, liquidacionId: resultado.liquidacion.id },
      saldo.isNegative()
        ? `Licencia registrada. El saldo de licencia queda en ${saldo.toString()} días.`
        : 'Licencia registrada.',
    )
  })
}

/**
 * §7.11 — borrar una licencia exige anular antes su salario vacacional. Anular la
 * liquidación no revierte la licencia.
 */
export async function borrarLicencia(licenciaId: string) {
  return ejecutar('licencias.borrar', async (log) => {
    const licencia = await prisma.licencia.findUnique({
      where: { id: validar(idUuid, licenciaId) },
      include: { liquidacion: { select: { id: true, estado: true } } },
    })
    if (!licencia) throw new ErrorNegocio('No se encontró la licencia.')

    const { usuario, empleado } = await exigirEdicion(licencia.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'licencia', entidadId: licencia.id })

    if (licencia.liquidacion && licencia.liquidacion.estado !== 'ANULADA') {
      throw new ErrorNegocio(
        'Antes de borrar la licencia hay que anular la liquidación del salario vacacional que generó.',
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.licenciaMovimiento.deleteMany({ where: { licenciaId: licencia.id } })
      await tx.licencia.delete({ where: { id: licencia.id } })
      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'licencia',
          entidadId: licencia.id,
          accion: 'BORRAR_LICENCIA',
          datosAntes: {
            fechaDesde: licencia.fechaDesde.toISOString().slice(0, 10),
            fechaHasta: licencia.fechaHasta.toISOString().slice(0, 10),
            diasHabiles: licencia.diasHabiles.toString(),
          },
        },
        tx,
      )
    })

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, 'Se borró la licencia.')
  })
}

/** §4.15.1 — ajuste manual del saldo de días. */
export async function ajustarSaldoLicencia(
  empleadoId: string,
  dias: string,
  concepto: string,
) {
  return ejecutar('licencias.ajustar', async (log) => {
    const { usuario, empleado } = await exigirEdicion(empleadoId)
    log({ usuarioId: usuario.id, entidad: 'licencia_movimiento', entidadId: empleado.id })

    const cantidad = new Decimal(dias.replace(',', '.'))
    if (cantidad.isZero()) throw new ErrorNegocio('El ajuste no puede ser de cero días.')
    if (!concepto.trim()) throw new ErrorNegocio('El concepto es obligatorio.')

    await prisma.licenciaMovimiento.create({
      data: {
        empleadoId: empleado.id,
        fecha: hoy(),
        tipo: 'AJUSTE',
        debe: cantidad.isNegative() ? aColumnaCantidad(cantidad.abs()) : '0',
        haber: cantidad.isNegative() ? '0' : aColumnaCantidad(cantidad),
        concepto: concepto.trim(),
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, 'Ajuste registrado.')
  })
}
