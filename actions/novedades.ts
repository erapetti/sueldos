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
import { exigirEdicion, vinculoDe } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import {
  edicionConcepto,
  loteFaltas,
  loteHorasExtras,
  pagoAdicional,
  idUuid,
} from '@/lib/validacion/esquemas'
import {
  ETIQUETA_FUERA_DEL_VINCULO,
  MENSAJE_FUERA_DEL_VINCULO,
  fechaEnElVinculo,
  type Vinculo,
} from '@/lib/validacion/vinculo'
import { aColumnaCantidad, aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { horasDelDia } from '@/lib/calculo/boletos'
import { diasDeLicenciaEnRango } from '@/lib/calculo/licencias'
import { TEXTO_SIN_JORNADA, motivoSinJornada, topeDeFaltaDelDia } from '@/lib/calculo/jornada'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from '@/lib/liquidacion/pago'
import { normalizarDescuenta } from '@/constants/causales'
import { aporteBpsALaFecha } from '@/lib/consultas/aporteBps'
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
    include: INCLUIR_PAGOS,
    orderBy: { secuencia: 'desc' },
  })

  if (!confirmada) return undefined

  const base = `Esta novedad corresponde a ${formatearPeriodo(periodo)}, que ya tiene una liquidación confirmada. Para que se refleje hay que recalcular el período.`
  // Alcanza con que se haya pagado un libro: ese asiento ya no se toca (§7.6.1).
  return pagoDeLiquidacion(confirmada).estado !== 'SIN_PAGAR'
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
  vinculo: Vinculo,
  campo: string,
  limite: 'HOY' | 'FIN_DEL_MES_EN_CURSO',
) {
  const posicion = fechaEnElVinculo(aISO(fecha), vinculo)
  if (posicion !== 'OK') {
    throw new ErrorNegocio(MENSAJE_FUERA_DEL_VINCULO[posicion], {
      [campo]: ETIQUETA_FUERA_DEL_VINCULO[posicion],
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
      verificarFechaDeNovedad(fecha, vinculoDe(empleado), 'fecha', 'FIN_DEL_MES_EN_CURSO')
    }

    /*
      §6.6 — la marca «con BPS» no puede quedar puesta en un mes en el que la empleada no
      aporta: el motor pagaría esas horas al valor hora calculado y la liquidación mostraría
      una línea «con BPS» para alguien sin aportes. La UI ya deshabilita el interruptor; acá
      se fuerza igual, sin confiar en lo que llegue del cliente, como hace
      `normalizarDescuenta` con las faltas.

      El aporte se resuelve **al período de la planilla** y no a hoy (§4.4.1, §5.2): cargar un
      mes anterior a un cambio de aporte se rige por el que valía entonces. Sin ningún registro
      no se normaliza nada: no se sabe, y ese mes tampoco se puede liquidar (§6.8).
    */
    const aporte = await aporteBpsALaFecha(empleado.id, desde)
    const normalizarConBps = (conBps: boolean) => (aporte?.aportaBps === false ? false : conBps)

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
          conBps: normalizarConBps(renglon.conBps),
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
 * según el régimen vigente, y ese tope es cero en los días sin jornada: el feriado no
 * laborable y el día de licencia (`topeDeFaltaDelDia`). §4.6.1 — `descuenta` se fuerza a
 * `true` salvo en ENFERMEDAD, sin confiar en lo que mande el cliente.
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

    /*
      §4.6 — el tope del día no sale del régimen crudo: sale de si ese día **había jornada**.
      El feriado no laborable y el día de licencia dejan el tope en cero, así que hacen falta
      los dos calendarios además del régimen (`topeDeFaltaDelDia`, `lib/calculo/jornada.ts`).
    */
    const [existentes, feriados, licencias] = await Promise.all([
      // Faltas ya guardadas del período que no se están editando ni borrando en este lote.
      prisma.falta.findMany({
        where: { empleadoId: empleado.id, fecha: { gte: desde, lte: hasta } },
      }),
      prisma.feriado.findMany({ where: { fecha: { gte: desde, lte: hasta } } }),
      // §4.15.2 — una licencia puede empezar antes del mes y terminar después.
      prisma.licencia.findMany({
        where: { empleadoId: empleado.id, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
      }),
    ])

    const feriadosNoLaborables = new Set(
      feriados.filter((f) => f.noLaborable).map((f) => aISO(f.fecha)),
    )
    const diasEnLicencia = new Set(diasDeLicenciaEnRango(licencias, desde, hasta).map(aISO))
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
      verificarFechaDeNovedad(fecha, vinculoDe(empleado), 'fecha', 'FIN_DEL_MES_EN_CURSO')

      const clave = aISO(fecha)
      const acumulado = (acumuladoPorDia.get(clave) ?? new Decimal(0)).plus(renglon.horas)
      const dia = {
        horasRegimen: horasDelDia(regimen, fecha).toNumber(),
        feriadoNoLaborable: feriadosNoLaborables.has(clave),
        enLicencia: diasEnLicencia.has(clave),
        // El vínculo ya se verificó arriba; el día llega entero para que el motivo sea el que
        // corresponde y no «fuera del vínculo» para todos.
        dentroDelVinculo: true,
      }

      // Un día sin jornada no admite falta de ninguna clase, y decir «corresponden 0 h» no
      // explica nada: el motivo es lo que hace entendible el rechazo (§4.6, §6.5).
      const sinJornada = motivoSinJornada(dia)
      if (sinJornada) {
        throw new ErrorNegocio(
          `El ${renglon.fecha} ${TEXTO_SIN_JORNADA[sinJornada]}: no hay jornada a la que faltar.`,
          { fecha: 'Sin jornada ese día' },
        )
      }

      const tope = topeDeFaltaDelDia(dia)
      if (acumulado.greaterThan(tope)) {
        throw new ErrorNegocio(
          `El ${renglon.fecha} corresponden ${tope} h según el régimen y las faltas suman ${acumulado.toString()} h.`,
          { fecha: `Corresponden ${tope} horas ese día` },
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
    /*
      El pago adicional sigue con el tope del §6.11: no es una novedad que se anticipe.

      Y **el egreso no lo limita**, por decisión del dueño del proyecto: una liquidación final,
      un premio o una diferencia se pagan después del cese. Por eso el vínculo va sin fecha de
      egreso y le queda solo el piso del ingreso.
    */
    verificarFechaDeNovedad(
      fecha,
      { fechaIngreso: aISO(empleado.fechaIngreso), fechaEgreso: null },
      'fecha',
      'HOY',
    )

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
    revalidatePath(`/empleados/${empleado.id}/pagos-adicionales`)
    return exito(undefined, await avisoDePeriodoLiquidado(empleado.id, primerDiaDelMes(fecha)))
  })
}

/**
 * §7.3 — edita un pago adicional ya registrado desde su pantalla de detalle.
 *
 * Solo el concepto, por el mismo motivo que en los asientos (§7.4): la fecha decide en qué mes
 * se liquida (§4.7) y el monto puede estar dentro de una liquidación confirmada, así que
 * corregirlos sería reescribir un período. El camino es borrarlo y registrarlo de nuevo.
 *
 * El concepto **sí** cambia el resultado: es la descripción de la línea de la liquidación
 * (§6.2, paso 10). Por eso también devuelve el aviso del §6.11 si el mes ya está liquidado.
 */
export async function actualizarPagoAdicional(entrada: unknown) {
  return ejecutar('novedades.actualizarPagoAdicional', async (log) => {
    const datos = validar(edicionConcepto, entrada)

    const pago = await prisma.pagoAdicional.findUnique({ where: { id: datos.id } })
    if (!pago) throw new ErrorNegocio('No se encontró el pago adicional.')

    const { usuario, empleado } = await exigirEdicion(pago.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'pagos_adicionales', entidadId: pago.id })

    await prisma.pagoAdicional.update({
      where: { id: pago.id },
      data: { concepto: datos.concepto?.trim() || null, modificadoPor: usuario.id },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(`/empleados/${empleado.id}/pagos-adicionales`)
    return exito(
      undefined,
      await avisoDePeriodoLiquidado(empleado.id, primerDiaDelMes(pago.fecha)),
    )
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
    if (tipo === 'PAGO_ADICIONAL') revalidatePath(`/empleados/${empleado.id}/pagos-adicionales`)
    return exito(
      undefined,
      await avisoDePeriodoLiquidado(empleado.id, primerDiaDelMes(registro.fecha)),
    )
  })
}
