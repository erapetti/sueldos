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
import { redondearPesos } from '@/lib/format/money'
import { resolverConceptosBps } from '@/lib/calculo/bps'
import { calcularLiquidacionMensual } from '@/lib/calculo/liquidacion'
import { diasDeLicenciaEnRango } from '@/lib/calculo/licencias'
import type { EntradaLiquidacion, ResultadoLiquidacion } from '@/lib/calculo/tipos'
import type { EstadoDePago } from '@/lib/calculo/cuentaCorriente'
import { INCLUIR_PAGOS, pagoDeLiquidacion, ultimoPago } from './pago'
import { primerDiaDelMes, ultimoDiaDelMes } from '@/lib/format/dates'

export type ContextoLiquidacion = {
  entrada: EntradaLiquidacion
  /** Cuotas del período que todavía están PENDIENTE: son las que se marcan APLICADA (§7.6.1). */
  cuotasPendientesIds: string[]
  /** Suma de las cuotas consideradas en el paso 7, para el devengado bruto (§4.9). */
  totalCuotas: Decimal
  /** Secuencia que le tocaría a una liquidación nueva de este período (§4.14). */
  proximaSecuencia: number
  /** Liquidaciones vigentes previas del mismo (empleado, período, tipo). */
  liquidacionesPrevias: {
    id: string
    secuencia: number
    totalAPagar: Decimal
    /** §4.14 — qué libros de esta liquidación ya se pagaron. */
    pago: EstadoDePago
    confirmadaEn: Date | null
    /** Cuándo se terminó de cobrar, o `null` si no cobró ningún libro. */
    pagadaEn: Date | null
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
    aporteBps,
    cobraBoletos,
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
    // §4.4.1 — el aporte a BPS es una serie más: se resuelve al período, no se lee de hoy.
    prisma.empleadoAporteBps.findFirst({
      where: { empleadoId, ...vigenteAlPeriodo },
      orderBy: { fechaVigencia: 'desc' },
    }),
    // §6.4 — «cobra boletos», por el mismo motivo y con la misma fecha.
    prisma.empleadoCobraBoletos.findFirst({
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
      /*
        El plan entero del préstamo, para poder decir «cuota 2 de 5» en la línea. La cuota
        sola no alcanza: no sabe cuántas hermanas tiene ni en qué lugar de la fila está.
      */
      include: {
        prestamo: {
          select: {
            fecha: true,
            // §4.9 — la cuota descuenta en el libro donde quedó el préstamo, no en el que le
            // tocaría hoy a la empleada.
            libro: true,
            cuotas: { select: { id: true }, orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }] },
          },
        },
      },
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
      include: INCLUIR_PAGOS,
    }),
  ])

  // Días comprendidos en algún período de licencia, recortados al mes (§4.15.2, §6.4).
  const diasLicencia = diasDeLicenciaEnRango(licencias, desde, hasta)

  const liquidacionesPrevias = previas.map((l) => ({
    id: l.id,
    secuencia: l.secuencia,
    totalAPagar: aDecimal(l.totalAPagar),
    pago: pagoDeLiquidacion(l),
    confirmadaEn: l.confirmadaEn,
    pagadaEn: ultimoPago(l),
  }))

  // §7.6.1 — solo cuentan las confirmadas; un borrador todavía no liquidó nada.
  const confirmadas = previas.filter((l) => l.estado === 'CONFIRMADA')
  const yaLiquidado = (columna: 'totalAPagarFormal' | 'totalAPagarInformal') =>
    confirmadas.reduce((acc, l) => acc.plus(aDecimal(l[columna])), new Decimal(0))

  const totalYaLiquidadoFormal = yaLiquidado('totalAPagarFormal')
  const totalYaLiquidadoInformal = yaLiquidado('totalAPagarInformal')

  const entrada: EntradaLiquidacion = {
    periodo: desde,
    empleado: {
      fechaIngreso: empleado.fechaIngreso,
      fechaEgreso: empleado.fechaEgreso,
    },
    aporteBps: aporteBps
      ? { aportaBps: aporteBps.aportaBps, seguroSalud: aporteBps.seguroSalud }
      : null,
    cobraBoletos: cobraBoletos ? cobraBoletos.cobraBoletos : null,
    salario: salario
      ? { salario: aDecimal(salario.salario), horasSemanales: aDecimal(salario.horasSemanales) }
      : null,
    regimen: regimen ? aRegimenHoras(regimen) : null,
    valorHoraNegro: valorHoraNegro ? aDecimal(valorHoraNegro.valor) : null,
    valorBoleto: valorBoleto ? aDecimal(valorBoleto.monto) : null,
    // §6.3 — sin aporte a BPS no se resuelve ningún concepto y el seguro se ignora. Sin
    // registro vigente tampoco se resuelve nada: el motor falla antes, por §6.8.
    conceptosBps: aporteBps?.aportaBps
      ? resolverConceptosBps(
          filasBps.map((f) => ({
            concepto: f.concepto,
            porcentaje: aDecimalOpcional(f.porcentaje),
            seguroSalud: f.seguroSalud,
            fechaVigencia: f.fechaVigencia,
          })),
          desde,
          aporteBps.seguroSalud,
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
    cuotasPlan: cuotas.map((c) => {
      /*
        La numeración cuenta **todas** las cuotas del plan, incluidas las canceladas: si
        cancelar la cuarta convirtiera la quinta en «4 de 4», la misma cuota cambiaría de
        nombre entre una liquidación y la siguiente.
      */
      const hermanas = c.prestamo.cuotas
      return {
        id: c.id,
        fecha: c.fecha,
        // Se redondea acá y no solo en la línea, para que el importe que descuenta la
        // liquidación y el que se suma al devengado bruto del asiento (§4.9) sean el mismo.
        monto: redondearPesos(aDecimal(c.monto)),
        yaAplicada: c.estado === 'APLICADA',
        fechaPrestamo: c.prestamo.fecha,
        libro: c.prestamo.libro,
        ordinal: hermanas.findIndex((h) => h.id === c.id) + 1,
        deTotal: hermanas.length,
      }
    }),
    feriados: feriados.map((f) => ({ fecha: f.fecha, noLaborable: f.noLaborable })),
    diasLicencia,
    totalYaLiquidadoFormal,
    totalYaLiquidadoInformal,
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
