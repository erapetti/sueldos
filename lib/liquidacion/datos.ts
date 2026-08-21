/**
 * Puente entre la base y el motor de cálculo.
 *
 * El motor (`/lib/calculo`) es código puro: no accede a la base (§9). Este módulo resuelve
 * las series vigentes (§5.2), los conceptos de BPS aplicables (§4.11) y las novedades del
 * período, y arma el objeto de entrada.
 */
import 'server-only'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { aDecimal, aDecimalOpcional, aRegimenHoras } from '@/lib/db/mapeo'
import { resolverConceptosBps } from '@/lib/calculo/bps'
import { calcularLiquidacionMensual } from '@/lib/calculo/liquidacion'
import type { EntradaLiquidacion, ResultadoLiquidacion } from '@/lib/calculo/tipos'
import { primerDiaDelMes, sumarDias, ultimoDiaDelMes } from '@/lib/format/dates'

export type ContextoLiquidacion = {
  entrada: EntradaLiquidacion
  /** Cuotas del período que todavía están PENDIENTE: son las que se marcan APLICADA (§7.6.1). */
  cuotasPendientesIds: string[]
  /** Suma de las cuotas consideradas en el paso 8, para el devengado bruto (§4.9). */
  totalCuotas: Decimal
  /** Secuencia que le tocaría a una liquidación nueva de este período (§4.14). */
  proximaSecuencia: number
  /** Liquidaciones vigentes previas del mismo (empleado, período, tipo). */
  liquidacionesPrevias: {
    id: string
    secuencia: number
    totalAPagar: Decimal
    pagada: boolean
    confirmadaEn: Date | null
  }[]
}

/**
 * §5.2 — el registro vigente para el período P es el de mayor `fechaVigencia <= P`.
 * Se resuelve en la base con un `ORDER BY ... LIMIT 1` por serie.
 */
export async function armarContextoLiquidacion(
  empleadoId: string,
  periodo: Date,
): Promise<ContextoLiquidacion> {
  const desde = primerDiaDelMes(periodo)
  const hasta = ultimoDiaDelMes(periodo)
  const rangoDelMes = { gte: desde, lte: hasta }
  const vigenteAlPeriodo = { fechaVigencia: { lte: desde } }

  const [
    empleado,
    salario,
    regimen,
    valorHoraNegro,
    valorBoleto,
    filasBps,
    faltas,
    horasExtras,
    pagosAdicionales,
    cuotas,
    feriados,
    licencias,
    previas,
  ] = await Promise.all([
    prisma.empleado.findUniqueOrThrow({ where: { id: empleadoId } }),
    prisma.empleadoSalario.findFirst({
      where: { empleadoId, ...vigenteAlPeriodo },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoRegimen.findFirst({
      where: { empleadoId, ...vigenteAlPeriodo },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoValorHoraNegro.findFirst({
      where: { empleadoId, ...vigenteAlPeriodo },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.valorBoleto.findFirst({
      where: vigenteAlPeriodo,
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.bpsConcepto.findMany({ where: vigenteAlPeriodo }),
    prisma.falta.findMany({ where: { empleadoId, fecha: rangoDelMes }, orderBy: { fecha: 'asc' } }),
    prisma.horaExtra.findMany({
      where: { empleadoId, fecha: rangoDelMes },
      orderBy: { fecha: 'asc' },
    }),
    prisma.pagoAdicional.findMany({
      where: { empleadoId, fecha: rangoDelMes },
      orderBy: { fecha: 'asc' },
    }),
    // §7.6.1: el recálculo considera también las cuotas ya aplicadas de este período.
    prisma.planPago.findMany({
      where: { empleadoId, fecha: rangoDelMes, estado: { in: ['PENDIENTE', 'APLICADA'] } },
      orderBy: { fecha: 'asc' },
    }),
    prisma.feriado.findMany({ where: { fecha: rangoDelMes } }),
    // Una licencia puede empezar antes del mes y terminar después.
    prisma.licencia.findMany({
      where: { empleadoId, fechaDesde: { lte: hasta }, fechaHasta: { gte: desde } },
    }),
    prisma.liquidacion.findMany({
      where: {
        empleadoId,
        periodo: desde,
        tipo: 'MENSUAL',
        estado: { not: 'ANULADA' },
      },
      orderBy: { secuencia: 'asc' },
      include: { movimientos: { where: { tipo: 'PAGO' }, select: { id: true } } },
    }),
  ])

  // Días comprendidos en algún período de licencia, recortados al mes (§4.15.2, §6.4).
  const diasLicencia: Date[] = []
  for (const licencia of licencias) {
    const inicio = licencia.fechaDesde < desde ? desde : licencia.fechaDesde
    const fin = licencia.fechaHasta > hasta ? hasta : licencia.fechaHasta
    for (let f = inicio; f.getTime() <= fin.getTime(); f = sumarDias(f, 1)) {
      diasLicencia.push(f)
    }
  }

  const liquidacionesPrevias = previas.map((l) => ({
    id: l.id,
    secuencia: l.secuencia,
    totalAPagar: aDecimal(l.totalAPagar),
    pagada: l.movimientos.length > 0,
    confirmadaEn: l.confirmadaEn,
  }))

  // §7.6.1 — solo cuentan las confirmadas; un borrador todavía no liquidó nada.
  const totalYaLiquidado = previas
    .filter((l) => l.estado === 'CONFIRMADA')
    .reduce((acc, l) => acc.plus(aDecimal(l.totalAPagar)), new Decimal(0))

  const entrada: EntradaLiquidacion = {
    periodo: desde,
    empleado: {
      fechaIngreso: empleado.fechaIngreso,
      fechaEgreso: empleado.fechaEgreso,
      cobraBoletos: empleado.cobraBoletos,
      aportaBps: empleado.aportaBps,
      seguroSalud: empleado.seguroSalud,
    },
    salario: salario
      ? { salario: aDecimal(salario.salario), horasSemanales: aDecimal(salario.horasSemanales) }
      : null,
    regimen: regimen ? aRegimenHoras(regimen) : null,
    valorHoraNegro: valorHoraNegro ? aDecimal(valorHoraNegro.valor) : null,
    valorBoleto: valorBoleto ? aDecimal(valorBoleto.monto) : null,
    // §6.3 — con aportaBps = false no se resuelve ningún concepto y el seguro se ignora.
    conceptosBps: empleado.aportaBps
      ? resolverConceptosBps(
          filasBps.map((f) => ({
            concepto: f.concepto,
            porcentaje: aDecimalOpcional(f.porcentaje),
            seguroSalud: f.seguroSalud,
            fechaVigencia: f.fechaVigencia,
          })),
          desde,
          empleado.seguroSalud,
        )
      : [],
    faltas: faltas.map((f) => ({
      fecha: f.fecha,
      horas: aDecimal(f.horas),
      causal: f.causal,
      descuenta: f.descuenta,
    })),
    horasExtras: horasExtras.map((h) => ({
      fecha: h.fecha,
      horas: aDecimal(h.horas),
      conBps: h.conBps,
      recargoPct: h.recargoPct,
    })),
    pagosAdicionales: pagosAdicionales.map((p) => ({
      fecha: p.fecha,
      monto: aDecimal(p.monto),
      concepto: p.concepto,
    })),
    cuotasPlan: cuotas.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      monto: aDecimal(c.monto),
      yaAplicada: c.estado === 'APLICADA',
    })),
    feriados: feriados.map((f) => ({ fecha: f.fecha, noLaborable: f.noLaborable })),
    diasLicencia,
    totalYaLiquidado,
  }

  return {
    entrada,
    cuotasPendientesIds: cuotas.filter((c) => c.estado === 'PENDIENTE').map((c) => c.id),
    totalCuotas: cuotas.reduce((acc, c) => acc.plus(aDecimal(c.monto)), new Decimal(0)),
    proximaSecuencia: previas.length + 1,
    liquidacionesPrevias,
  }
}

export type LiquidacionCalculada = {
  contexto: ContextoLiquidacion
  resultado: ResultadoLiquidacion
}

/** Calcula el período completo. Propaga `ErrorDatosFaltantes` (§6.8) sin atraparlo. */
export async function calcularPeriodo(
  empleadoId: string,
  periodo: Date,
): Promise<LiquidacionCalculada> {
  const contexto = await armarContextoLiquidacion(empleadoId, periodo)
  return { contexto, resultado: calcularLiquidacionMensual(contexto.entrada) }
}
