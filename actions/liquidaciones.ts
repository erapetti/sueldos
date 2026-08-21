'use server'

/**
 * §7.6 y §7.6.1 — confirmar, anular y recalcular liquidaciones.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import { exigirEdicion } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import { anularLiquidacion as esquemaAnular, confirmarLiquidacion } from '@/lib/validacion/esquemas'
import { calcularPeriodo } from '@/lib/liquidacion/datos'
import { aColumnaImporte } from '@/lib/db/mapeo'
import type { ResultadoLiquidacion } from '@/lib/calculo/tipos'
import { formatearPeriodo, hoy, parsePeriodo, primerDiaDelMes } from '@/lib/format/dates'

/** Snapshot completo del cálculo, para que reimprimir la liquidación dé lo mismo (§4.14). */
function armarSnapshot(resultado: ResultadoLiquidacion, entrada: unknown) {
  return {
    version: 1,
    calculadoEn: new Date().toISOString(),
    entrada: JSON.parse(JSON.stringify(entrada, (_clave, valor) => valor)),
    resultado: {
      valorHoraCalculado: resultado.valorHoraCalculado.toString(),
      factorProrrateo: resultado.factorProrrateo.toString(),
      diasConVinculo: resultado.diasConVinculo,
      diasDelMes: resultado.diasDelMes,
      materiaGravada: resultado.materiaGravada.toFixed(2),
      totalDescuentosBps: resultado.totalDescuentosBps.toFixed(2),
      subtotal: resultado.subtotal.toFixed(2),
      boletos: resultado.boletos,
      totalRecalculado: resultado.totalRecalculado.toFixed(2),
      totalYaLiquidado: resultado.totalYaLiquidado.toFixed(2),
      totalAPagar: resultado.totalAPagar.toFixed(2),
      avisos: resultado.avisos,
      lineas: resultado.lineas.map((l) => ({
        orden: l.orden,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad?.toString() ?? null,
        valorUnitario: l.valorUnitario?.toString() ?? null,
        importe: l.importe.toFixed(2),
        signo: l.signo,
      })),
    },
  }
}

/**
 * §7.6 — confirmar la liquidación del período. En una transacción:
 *
 *  - persiste la liquidación con su snapshot y sus líneas;
 *  - marca `APLICADA` las cuotas del plan que estaban `PENDIENTE`;
 *  - crea el movimiento `LIQUIDACION` en cuenta corriente por el **devengado bruto**.
 *
 * §7.6.1 — si el período ya tiene una liquidación confirmada y pagada, no se modifica: se
 * genera una complementaria por la diferencia, previa confirmación explícita del usuario.
 */
export async function confirmarLiquidacionMensual(entrada: unknown) {
  return ejecutar('liquidaciones.confirmar', async (log) => {
    const datos = validar(confirmarLiquidacion, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'liquidacion', entidadId: empleado.id })

    const periodo = parsePeriodo(datos.periodo)

    // §6.10 — no se permiten períodos futuros.
    if (periodo.getTime() > primerDiaDelMes(hoy()).getTime()) {
      throw new ErrorNegocio('No se puede liquidar un período futuro.')
    }

    const { contexto, resultado } = await calcularPeriodo(empleado.id, periodo)

    const previasConfirmadas = contexto.liquidacionesPrevias.filter((l) => l.confirmadaEn !== null)
    const hayPagada = previasConfirmadas.some((l) => l.pagada)
    const esComplementaria = previasConfirmadas.length > 0

    if (hayPagada && !datos.aceptaComplementaria) {
      throw new ErrorNegocio(
        `La liquidación de ${formatearPeriodo(periodo)} ya fue pagada. No se puede modificar: hay que generar una liquidación complementaria por la diferencia.`,
      )
    }

    if (esComplementaria && !hayPagada && !datos.aceptaComplementaria) {
      throw new ErrorNegocio(
        `${formatearPeriodo(periodo)} ya tiene una liquidación confirmada sin pagar. Anulala y volvé a confirmar, o generá una complementaria.`,
      )
    }

    // §4.9 — el asiento va por el devengado bruto: total a pagar + cuotas descontadas.
    // En una complementaria la diferencia ya viene neta de las cuotas que se descontaron en
    // la liquidación previa, así que solo se suman las que se aplican ahora.
    const cuotasAplicadasAhora = contexto.entrada.cuotasPlan
      .filter((c) => !c.yaAplicada)
      .reduce((acc, c) => acc.plus(c.monto), new Decimal(0))

    const montoAsiento = resultado.totalAPagar.plus(cuotasAplicadasAhora)

    const liquidacion = await prisma.$transaction(async (tx) => {
      const creada = await tx.liquidacion.create({
        data: {
          empleadoId: empleado.id,
          periodo,
          tipo: 'MENSUAL',
          secuencia: contexto.proximaSecuencia,
          estado: 'CONFIRMADA',
          totalRecalculado: aColumnaImporte(resultado.totalRecalculado),
          totalYaLiquidado: aColumnaImporte(resultado.totalYaLiquidado),
          totalAPagar: aColumnaImporte(resultado.totalAPagar),
          snapshot: armarSnapshot(resultado, contexto.entrada),
          ukVigente: 1,
          confirmadaEn: new Date(),
          confirmadaPor: usuario.id,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
          lineas: {
            create: resultado.lineas.map((l) => ({
              orden: l.orden,
              codigo: l.codigo,
              descripcion: l.descripcion,
              cantidad: l.cantidad ? l.cantidad.toDecimalPlaces(4).toString() : null,
              valorUnitario: l.valorUnitario ? l.valorUnitario.toDecimalPlaces(4).toString() : null,
              importe: aColumnaImporte(l.importe),
              signo: l.signo,
            })),
          },
        },
      })

      // §7.6.1 — solo se marcan las que estaban PENDIENTE; las ya aplicadas no se tocan.
      // Se guarda qué liquidación las aplicó, para poder revertir exactamente esas al anular.
      if (contexto.cuotasPendientesIds.length > 0) {
        await tx.planPago.updateMany({
          where: { id: { in: contexto.cuotasPendientesIds } },
          data: {
            estado: 'APLICADA',
            liquidacionAplicadaId: creada.id,
            modificadoPor: usuario.id,
          },
        })
      }

      // Un único asiento, al haber si la diferencia es positiva y al debe si es negativa.
      await tx.cuentaCorriente.create({
        data: {
          empleadoId: empleado.id,
          fecha: hoy(),
          tipo: 'LIQUIDACION',
          debe: montoAsiento.isNegative() ? aColumnaImporte(montoAsiento.abs()) : '0',
          haber: montoAsiento.isNegative() ? '0' : aColumnaImporte(montoAsiento),
          concepto: esComplementaria
            ? `Liquidación complementaria ${formatearPeriodo(periodo)} (#${contexto.proximaSecuencia})`
            : `Liquidación ${formatearPeriodo(periodo)}`,
          liquidacionId: creada.id,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })

      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'liquidacion',
          entidadId: creada.id,
          accion: esComplementaria ? 'CONFIRMAR_COMPLEMENTARIA' : 'CONFIRMAR_LIQUIDACION',
          datosDespues: {
            periodo: formatearPeriodo(periodo),
            secuencia: contexto.proximaSecuencia,
            totalAPagar: resultado.totalAPagar.toFixed(2),
          },
        },
        tx,
      )

      return creada
    })

    log({ entidadId: liquidacion.id })
    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)

    return exito(
      { id: liquidacion.id, secuencia: liquidacion.secuencia },
      esComplementaria
        ? `Complementaria #${liquidacion.secuencia} de ${formatearPeriodo(periodo)} confirmada.`
        : `Liquidación de ${formatearPeriodo(periodo)} confirmada.`,
    )
  })
}

/**
 * §7.6 — anular una liquidación confirmada **no pagada**: las cuotas vuelven a `PENDIENTE` y
 * el movimiento de cuenta corriente se revierte con un contra-asiento. Nunca se borra nada.
 */
export async function anularLiquidacionConfirmada(entrada: unknown) {
  return ejecutar('liquidaciones.anular', async (log) => {
    const datos = validar(esquemaAnular, entrada)

    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: datos.liquidacionId },
      include: {
        movimientos: true,
        lineas: { select: { codigo: true } },
      },
    })
    if (!liquidacion) throw new ErrorNegocio('No se encontró la liquidación.')

    const { usuario, empleado } = await exigirEdicion(liquidacion.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'liquidacion', entidadId: liquidacion.id })

    if (liquidacion.estado !== 'CONFIRMADA') {
      throw new ErrorNegocio('Solo se puede anular una liquidación confirmada.')
    }

    // §7.6.1 — si está pagada, el único camino es la complementaria.
    const pagada = liquidacion.movimientos.some((m) => m.tipo === 'PAGO')
    if (pagada) {
      throw new ErrorNegocio(
        'La liquidación ya fue pagada: no se puede anular. Generá una liquidación complementaria por la diferencia.',
      )
    }

    // Solo se puede anular la última secuencia vigente del período.
    const posterior = await prisma.liquidacion.findFirst({
      where: {
        empleadoId: liquidacion.empleadoId,
        periodo: liquidacion.periodo,
        tipo: liquidacion.tipo,
        secuencia: { gt: liquidacion.secuencia },
        estado: { not: 'ANULADA' },
      },
      select: { secuencia: true },
    })
    if (posterior) {
      throw new ErrorNegocio(
        `Hay una liquidación posterior (#${posterior.secuencia}) para el mismo período: anulá primero esa.`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.liquidacion.update({
        where: { id: liquidacion.id },
        data: {
          estado: 'ANULADA',
          // Libera la clave del índice único parcial de §4.14.
          ukVigente: null,
          anuladaEn: new Date(),
          anuladaPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })

      // Vuelven a PENDIENTE exactamente las cuotas que **esta** liquidación aplicó; las que
      // aplicó una secuencia anterior del mismo período quedan como están (§7.6.1).
      await tx.planPago.updateMany({
        where: { liquidacionAplicadaId: liquidacion.id, estado: 'APLICADA' },
        data: { estado: 'PENDIENTE', liquidacionAplicadaId: null, modificadoPor: usuario.id },
      })

      // Contra-asiento por cada movimiento que nació de esta liquidación y sigue vigente.
      const yaRevertidos = new Set(
        liquidacion.movimientos.map((m) => m.reversaDeId).filter(Boolean) as string[],
      )

      for (const movimiento of liquidacion.movimientos) {
        if (movimiento.tipo !== 'LIQUIDACION') continue
        if (movimiento.reversaDeId) continue
        if (yaRevertidos.has(movimiento.id)) continue

        await tx.cuentaCorriente.create({
          data: {
            empleadoId: liquidacion.empleadoId,
            fecha: hoy(),
            tipo: 'LIQUIDACION',
            debe: movimiento.haber,
            haber: movimiento.debe,
            concepto: `Anulación: ${movimiento.concepto}`,
            liquidacionId: liquidacion.id,
            reversaDeId: movimiento.id,
            creadoPor: usuario.id,
            modificadoPor: usuario.id,
          },
        })
      }

      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'liquidacion',
          entidadId: liquidacion.id,
          accion: 'ANULAR_LIQUIDACION',
          datosAntes: {
            periodo: formatearPeriodo(liquidacion.periodo),
            secuencia: liquidacion.secuencia,
            totalAPagar: liquidacion.totalAPagar.toString(),
          },
        },
        tx,
      )
    })

    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, `Se anuló la liquidación de ${formatearPeriodo(liquidacion.periodo)}.`)
  })
}
