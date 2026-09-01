/**
 * Datos de encabezado y de calendario que comparten las dos planillas mensuales
 * (§7.1 y §7.2).
 */
import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { horasDelDia } from '@/lib/calculo/boletos'
import { diasDeLicenciaEnRango } from '@/lib/calculo/licencias'
import { valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from '@/lib/liquidacion/pago'
import { aISO, diasDelPeriodo, primerDiaDelMes, ultimoDiaDelMes } from '@/lib/format/dates'
import type { DiaContexto, MarcaDia } from '@/components/dominio/PlanillaMensual'

export type ContextoPlanilla = {
  dias: DiaContexto[]
  /** §7.1 — valores hora vigentes en ese mes, para el encabezado. */
  valorHoraCalculado: string | null
  valorHoraNegro: string | null
  /**
   * §4.4.1 — si la empleada aporta al BPS **en ese mes**. Es una serie como las otras, así
   * que se resuelve al período y no a hoy: la planilla de un mes anterior a un cambio de
   * aporte se sigue cargando con el aporte que regía entonces.
   *
   * `null` es «no hay registro»: no es lo mismo que «no aporta», y el que consume decide.
   */
  aportaBps: boolean | null
  /**
   * §6.4 — si cobra boletos **en ese mes**. También es una serie, así que sale de acá y no de
   * `accesoAEmpleado`, que resuelve hoy: el pie de un mes viejo anuncia los boletos que ese
   * mes correspondían.
   *
   * `null` es «no hay registro». El pie no anuncia nada: ese mes tampoco liquida (§6.8).
   */
  cobraBoletos: boolean | null
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  hayRegimen: boolean
}

export async function contextoDePlanilla(
  empleadoId: string,
  periodo: Date,
): Promise<ContextoPlanilla> {
  const desde = primerDiaDelMes(periodo)
  const hasta = ultimoDiaDelMes(periodo)

  const [
    regimenFila,
    salario,
    valorHoraNegro,
    aporteBps,
    cobraBoletos,
    feriados,
    licencias,
    empleado,
    liquidacion,
    extras,
    faltas,
  ] = await Promise.all([
    prisma.empleadoRegimen.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoSalario.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoValorHoraNegro.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoAporteBps.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoCobraBoletos.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.feriado.findMany({ where: { fecha: { gte: desde, lte: hasta } } }),
    // §4.15.2 — una licencia puede empezar antes del mes y terminar después.
    prisma.licencia.findMany({
      where: { empleadoId, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
    }),
    // §6.4 — el vínculo recorta los días que pagan boleto.
    prisma.empleado.findUniqueOrThrow({
      where: { id: empleadoId },
      select: { fechaIngreso: true, fechaEgreso: true },
    }),
    prisma.liquidacion.findFirst({
      where: { empleadoId, periodo: desde, tipo: 'MENSUAL', estado: 'CONFIRMADA' },
      include: INCLUIR_PAGOS,
      orderBy: { secuencia: 'desc' },
    }),
    // §7.1 y §7.2 — las dos planillas muestran la misma celda, así que las dos necesitan las
    // novedades de los dos tipos. Cada página vuelve a leer las suyas para armar los renglones
    // editables; son dos consultas chicas sobre el mismo índice y evitan mezclar acá el
    // modelo de edición con el de presentación.
    prisma.horaExtra.findMany({
      where: { empleadoId, fecha: { gte: desde, lte: hasta } },
      select: { fecha: true, horas: true, conBps: true },
    }),
    prisma.falta.findMany({
      where: { empleadoId, fecha: { gte: desde, lte: hasta } },
      select: { fecha: true, horas: true, descuenta: true },
    }),
  ])

  const regimen = regimenFila ? aRegimenHoras(regimenFila) : null
  const porFecha = new Map(feriados.map((f) => [aISO(f.fecha), f]))

  // Días comprendidos en algún período de licencia, recortados al mes (§4.15.2, §6.4). Es la
  // misma expansión que hace `lib/liquidacion/datos.ts` para el motor.
  const diasDeLicencia = new Set(diasDeLicenciaEnRango(licencias, desde, hasta).map(aISO))

  const marcasPorFecha = new Map<string, MarcaDia[]>()
  function agregarMarca(fecha: Date, marca: MarcaDia) {
    const clave = aISO(fecha)
    const lista = marcasPorFecha.get(clave) ?? []
    lista.push(marca)
    marcasPorFecha.set(clave, lista)
  }
  for (const e of extras) {
    agregarMarca(e.fecha, {
      signo: '+',
      horas: aDecimal(e.horas).toNumber(),
      plena: e.conBps,
      guardada: true,
    })
  }
  for (const f of faltas) {
    agregarMarca(f.fecha, {
      signo: '−',
      horas: aDecimal(f.horas).toNumber(),
      plena: f.descuenta,
      guardada: true,
    })
  }

  const dias: DiaContexto[] = diasDelPeriodo(periodo).map((f) => {
    const clave = aISO(f)
    const feriado = porFecha.get(clave)
    return {
      fecha: clave,
      horasRegimen: regimen ? aDecimal(horasDelDia(regimen, f)).toNumber() : 0,
      enLicencia: diasDeLicencia.has(clave),
      dentroDelVinculo:
        f.getTime() >= empleado.fechaIngreso.getTime() &&
        (!empleado.fechaEgreso || f.getTime() <= empleado.fechaEgreso.getTime()),
      feriado: feriado?.descripcion ?? null,
      feriadoNoLaborable: feriado?.noLaborable ?? false,
      marcas: marcasPorFecha.get(clave) ?? [],
    }
  })

  return {
    dias,
    valorHoraCalculado: salario
      ? valorHoraCalculado({
          salario: aDecimal(salario.salario),
          horasSemanales: aDecimal(salario.horasSemanales),
        }).toFixed(2)
      : null,
    valorHoraNegro: valorHoraNegro ? aDecimal(valorHoraNegro.valor).toFixed(2) : null,
    aportaBps: aporteBps ? aporteBps.aportaBps : null,
    cobraBoletos: cobraBoletos ? cobraBoletos.cobraBoletos : null,
    estadoLiquidacion: !liquidacion
      ? 'SIN_LIQUIDAR'
      // §4.14 — «pagada» es que no falte ningún libro: con el formal transferido y las horas
      // en negro pendientes, el mes sigue mostrándose como liquidado y no como pagado.
      : pagoDeLiquidacion(liquidacion).estado === 'PAGADA'
        ? 'LIQUIDADA_Y_PAGADA'
        : 'LIQUIDADA',
    hayRegimen: regimen !== null,
  }
}
