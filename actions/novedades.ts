'use server'

/**
 * §7.1, §7.2 y §7.3 — horas extras, faltas y pagos adicionales.
 *
 * Las planillas mensuales de §7.1 y §7.2 guardan **todos** los renglones en una sola
 * transacción, y el aviso de §6.11 sale **una sola vez para todo el lote**.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { exigirEdicion } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import { loteFaltas, loteHorasExtras, pagoAdicional, idUuid } from '@/lib/validacion/esquemas'
import { aColumnaCantidad, aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { horasDelDia } from '@/lib/calculo/boletos'
import { normalizarDescuenta } from '@/constants/causales'
import {
  aISO,
  formatearPeriodo,
  hoy,
  parseFechaISO,
  parsePeriodo,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from '@/lib/format/dates'

/**
 * §6.11 — si el período de la novedad ya tiene una liquidación confirmada, se avisa. El
 * aviso es uno por lote guardado, no uno por renglón.
 */
async function avisoDePeriodoLiquidado(
  empleadoId: string,
  periodo: Date,
): Promise<string | undefined> {
  const confirmada = await prisma.liquidacion.findFirst({
    where: { empleadoId, periodo, tipo: 'MENSUAL', estado: 'CONFIRMADA' },
    include: { movimientos: { where: { tipo: 'PAGO' }, select: { id: true } } },
    orderBy: { secuencia: 'desc' },
  })

  if (!confirmada) return undefined

  const base = `Esta novedad corresponde a ${formatearPeriodo(periodo)}, que ya tiene una liquidación confirmada. Para que se refleje hay que recalcular el período.`
  return confirmada.movimientos.length > 0
    ? `${base} Como ya está pagada, el recálculo genera una liquidación complementaria por la diferencia.`
    : base
}

/**
 * Validación de fecha común a las tres novedades (§6.11).
 *
 * **Divergencia con el §6.11**, que pide «no posterior al día de hoy». Las planillas
 * mensuales aceptan **cualquier día del mes en curso**, incluso los que todavía no pasaron:
 * se cargan sobre la marcha y hay ausencias y horas que se saben antes de que ocurran. Lo
 * que se sigue impidiendo es cargar en un mes posterior al actual.
 *
 * El pago adicional conserva el tope de hoy: es un hecho consumado, y su selector de fecha
 * ya no ofrece días futuros.
 */
function verificarFechaDeNovedad(
  fecha: Date,
  fechaIngreso: Date,
  campo: string,
  limite: 'HOY' | 'FIN_DEL_MES_EN_CURSO',
) {
  if (fecha.getTime() < fechaIngreso.getTime()) {
    throw new ErrorNegocio('La fecha no puede ser anterior al ingreso de la empleada.', {
      [campo]: 'Anterior al ingreso',
    })
  }

  if (limite === 'HOY' && fecha.getTime() > hoy().getTime()) {
    throw new ErrorNegocio('La fecha no puede ser posterior a hoy.', { [campo]: 'Fecha futura' })
  }

  if (limite === 'FIN_DEL_MES_EN_CURSO' && fecha.getTime() > ultimoDiaDelMes(hoy()).getTime()) {
    throw new ErrorNegocio('No se pueden cargar novedades de un mes posterior al actual.', {
      [campo]: 'Mes futuro',
    })
  }
}

/** §7.1 — guardado en lote de la planilla mensual de horas extras. */
export async function guardarHorasExtras(entrada: unknown) {
  return ejecutar('novedades.horasExtras', async (log) => {
    const datos = validar(loteHorasExtras, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'horas_extras', entidadId: empleado.id })

    const periodo = parsePeriodo(datos.periodo)
    const desde = primerDiaDelMes(periodo)
    const hasta = ultimoDiaDelMes(periodo)

    for (const renglon of datos.renglones) {
      const fecha = parseFechaISO(renglon.fecha)
      if (fecha.getTime() < desde.getTime() || fecha.getTime() > hasta.getTime()) {
        throw new ErrorNegocio(
          `El renglón del ${renglon.fecha} no pertenece a ${formatearPeriodo(periodo)}.`,
        )
      }
      verificarFechaDeNovedad(fecha, empleado.fechaIngreso, 'fecha', 'FIN_DEL_MES_EN_CURSO')
    }

    const auditoria = { creadoPor: usuario.id, modificadoPor: usuario.id }

    await prisma.$transaction(async (tx) => {
      if (datos.borrar.length > 0) {
        await tx.horaExtra.deleteMany({
          where: { id: { in: datos.borrar }, empleadoId: empleado.id },
        })
      }

      for (const renglon of datos.renglones) {
        const comun = {
          fecha: parseFechaISO(renglon.fecha),
          horas: aColumnaCantidad(new Decimal(renglon.horas)),
          conBps: renglon.conBps,
          recargoPct: renglon.recargoPct,
          nota: renglon.nota?.trim() || null,
        }

        if (renglon.id) {
          await tx.horaExtra.update({
            where: { id: renglon.id },
            data: { ...comun, modificadoPor: usuario.id },
          })
        } else {
          await tx.horaExtra.create({
            data: { empleadoId: empleado.id, ...comun, ...auditoria },
          })
        }
      }
    })

    revalidatePath(`/empleados/${empleado.id}/horas-extras`)
    revalidatePath(`/empleados/${empleado.id}`)

    return exito(
      { guardados: datos.renglones.length, borrados: datos.borrar.length },
      await avisoDePeriodoLiquidado(empleado.id, desde),
    )
  })
}

/**
 * §7.2 — guardado en lote de la planilla mensual de faltas.
 *
 * §4.6 — la suma de horas de falta de un día no puede superar las horas que le corresponden
 * según el régimen vigente. §4.6.1 — `descuenta` se fuerza a `true` salvo en ENFERMEDAD,
 * sin confiar en lo que mande el cliente.
 */
export async function guardarFaltas(entrada: unknown) {
  return ejecutar('novedades.faltas', async (log) => {
    const datos = validar(loteFaltas, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'faltas', entidadId: empleado.id })

    const periodo = parsePeriodo(datos.periodo)
    const desde = primerDiaDelMes(periodo)
    const hasta = ultimoDiaDelMes(periodo)

    const regimenFila = await prisma.empleadoRegimen.findFirst({
      where: { empleadoId: empleado.id, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    })
    if (!regimenFila) {
      throw new ErrorNegocio(
        `No hay un régimen horario vigente para ${formatearPeriodo(periodo)}: no se puede validar el tope de horas por día.`,
      )
    }
    const regimen = aRegimenHoras(regimenFila)

    // Faltas ya guardadas del período que no se están editando ni borrando en este lote.
    const existentes = await prisma.falta.findMany({
      where: { empleadoId: empleado.id, fecha: { gte: desde, lte: hasta } },
    })
    const editadas = new Set(datos.renglones.map((r) => r.id).filter(Boolean) as string[])
    const borradas = new Set(datos.borrar)

    const acumuladoPorDia = new Map<string, Decimal>()
    for (const falta of existentes) {
      if (editadas.has(falta.id) || borradas.has(falta.id)) continue
      const clave = aISO(falta.fecha)
      acumuladoPorDia.set(clave, (acumuladoPorDia.get(clave) ?? new Decimal(0)).plus(aDecimal(falta.horas)))
    }

    for (const renglon of datos.renglones) {
      const fecha = parseFechaISO(renglon.fecha)
      if (fecha.getTime() < desde.getTime() || fecha.getTime() > hasta.getTime()) {
        throw new ErrorNegocio(
          `El renglón del ${renglon.fecha} no pertenece a ${formatearPeriodo(periodo)}.`,
        )
      }
      verificarFechaDeNovedad(fecha, empleado.fechaIngreso, 'fecha', 'FIN_DEL_MES_EN_CURSO')

      const clave = aISO(fecha)
      const acumulado = (acumuladoPorDia.get(clave) ?? new Decimal(0)).plus(renglon.horas)
      const tope = horasDelDia(regimen, fecha)

      if (acumulado.greaterThan(tope)) {
        throw new ErrorNegocio(
          `El ${renglon.fecha} corresponden ${tope.toString()} h según el régimen y las faltas suman ${acumulado.toString()} h.`,
          { fecha: `Corresponden ${tope.toString()} horas ese día` },
        )
      }
      acumuladoPorDia.set(clave, acumulado)
    }

    const auditoria = { creadoPor: usuario.id, modificadoPor: usuario.id }

    await prisma.$transaction(async (tx) => {
      if (datos.borrar.length > 0) {
        await tx.falta.deleteMany({ where: { id: { in: datos.borrar }, empleadoId: empleado.id } })
      }

      for (const renglon of datos.renglones) {
        const comun = {
          fecha: parseFechaISO(renglon.fecha),
          horas: aColumnaCantidad(new Decimal(renglon.horas)),
          causal: renglon.causal,
          // §4.6.1 — el servidor fuerza el valor aunque llegue en false desde el cliente.
          descuenta: normalizarDescuenta(renglon.causal, renglon.descuenta),
          nota: renglon.nota?.trim() || null,
        }

        if (renglon.id) {
          await tx.falta.update({
            where: { id: renglon.id },
            data: { ...comun, modificadoPor: usuario.id },
          })
        } else {
          await tx.falta.create({ data: { empleadoId: empleado.id, ...comun, ...auditoria } })
        }
      }
    })

    revalidatePath(`/empleados/${empleado.id}/faltas`)
    revalidatePath(`/empleados/${empleado.id}`)

    return exito(
      { guardados: datos.renglones.length, borrados: datos.borrar.length },
      await avisoDePeriodoLiquidado(empleado.id, desde),
    )
  })
}

/** §7.3 — pago adicional. No lleva descuentos de ningún tipo. */
export async function guardarPagoAdicional(entrada: unknown) {
  return ejecutar('novedades.pagoAdicional', async (log) => {
    const datos = validar(pagoAdicional, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'pagos_adicionales', entidadId: empleado.id })

    const fecha = parseFechaISO(datos.fecha)
    // El pago adicional sigue con el tope del §6.11: no es una novedad que se anticipe.
    verificarFechaDeNovedad(fecha, empleado.fechaIngreso, 'fecha', 'HOY')

    const comun = {
      fecha,
      monto: datos.monto,
      concepto: datos.concepto?.trim() || null,
    }

    if (datos.id) {
      await prisma.pagoAdicional.update({
        where: { id: datos.id },
        data: { ...comun, modificadoPor: usuario.id },
      })
    } else {
      await prisma.pagoAdicional.create({
        data: {
          empleadoId: empleado.id,
          ...comun,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoDePeriodoLiquidado(empleado.id, primerDiaDelMes(fecha)))
  })
}

type TipoNovedad = 'HORA_EXTRA' | 'FALTA' | 'PAGO_ADICIONAL'

export async function borrarNovedad(tipo: TipoNovedad, id: string) {
  return ejecutar('novedades.borrar', async (log) => {
    const identificador = validar(idUuid, id)

    const registro =
      tipo === 'HORA_EXTRA'
        ? await prisma.horaExtra.findUnique({ where: { id: identificador } })
        : tipo === 'FALTA'
          ? await prisma.falta.findUnique({ where: { id: identificador } })
          : await prisma.pagoAdicional.findUnique({ where: { id: identificador } })

    if (!registro) throw new ErrorNegocio('No se encontró la novedad.')

    const { usuario, empleado } = await exigirEdicion(registro.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'novedad', entidadId: identificador })

    if (tipo === 'HORA_EXTRA') await prisma.horaExtra.delete({ where: { id: identificador } })
    else if (tipo === 'FALTA') await prisma.falta.delete({ where: { id: identificador } })
    else await prisma.pagoAdicional.delete({ where: { id: identificador } })

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(
      undefined,
      await avisoDePeriodoLiquidado(empleado.id, primerDiaDelMes(registro.fecha)),
    )
  })
}
