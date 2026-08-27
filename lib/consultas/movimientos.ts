/**
 * §7.4 y §7.5 — los movimientos que se cargan de a uno, listados y en detalle.
 *
 * **No hay tabla de préstamos y no hace falta.** Un préstamo *es* el asiento `PRESTAMO` de
 * `cuenta_corriente` (§4.9), y sus cuotas ya cuelgan de él: `plan_pagos.prestamo_id` es FK a
 * `cuenta_corriente` y el §4.8 la describe como «préstamo que originó el plan». Darle tabla
 * propia duplicaría la identidad del movimiento y obligaría a migrar esa FK.
 *
 * Las otras tres acciones de a una —pago adicional, licencia y pago bancario— son el mismo
 * caso, así que este módulo está partido para que cada una entre al lado de la de acá: una
 * función de listado que devuelve filas ya formateadas y una de detalle. Están las de pago
 * adicional, las de pago bancario y las de licencia.
 *
 * **El detalle siempre devuelve `null` si el id no es de esa empleada**, y no lanza: es lo que
 * la página traduce a 404, y así el id de otra empleada no filtra ni que exista.
 */
import 'server-only'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { aDecimal, type DecimalPrisma } from '@/lib/db/mapeo'
import { conSaldoAcumulado } from '@/lib/calculo/cuentaCorriente'
import { saldoDiasLicencia } from '@/lib/calculo/licencias'
import { aISO, formatearFecha, formatearPeriodo, primerDiaDelMes } from '@/lib/format/dates'
import type { Libro } from '@/lib/calculo/tipos'

/** Fila del listado de préstamos. Los importes viajan como string, como en el resto. */
export type FilaPrestamo = {
  id: string
  fecha: string
  fechaISO: string
  concepto: string
  monto: string
  saldo: string
  conPlan: boolean
  anulado: boolean
}

/**
 * Lo que falta devolver de un préstamo: el monto menos las cuotas **aplicadas**, que son las
 * que una liquidación confirmada ya descontó del sueldo.
 *
 * Una cuota `CANCELADA` no baja el saldo: cancelarla significa que ese mes no se descuenta,
 * no que la plata se haya devuelto. Un préstamo sin plan de devolución queda con el monto
 * entero, que es lo correcto: no hay nada que lo descuente automáticamente.
 *
 * Un préstamo anulado tiene su contra-asiento en la cuenta corriente y sus cuotas pendientes
 * quedaron canceladas, así que su saldo se muestra en cero: ya no se debe.
 */
function saldoDePrestamo(
  monto: Decimal,
  cuotas: readonly { monto: Decimal; estado: string }[],
  anulado: boolean,
): Decimal {
  if (anulado) return new Decimal(0)
  const aplicadas = cuotas
    .filter((c) => c.estado === 'APLICADA')
    .reduce((acc, c) => acc.plus(c.monto), new Decimal(0))
  return monto.minus(aplicadas)
}

export async function listarPrestamos(empleadoId: string): Promise<FilaPrestamo[]> {
  const prestamos = await prisma.cuentaCorriente.findMany({
    where: { empleadoId, tipo: 'PRESTAMO', reversaDeId: null },
    include: {
      cuotas: { select: { monto: true, estado: true } },
      reversas: { select: { id: true } },
    },
    orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
  })

  return prestamos.map((p) => {
    const monto = aDecimal(p.debe)
    const cuotas = p.cuotas.map((c) => ({ monto: aDecimal(c.monto), estado: c.estado }))
    const anulado = p.reversas.length > 0

    return {
      id: p.id,
      fecha: formatearFecha(p.fecha),
      fechaISO: aISO(p.fecha),
      concepto: p.concepto,
      monto: monto.toFixed(2),
      saldo: saldoDePrestamo(monto, cuotas, anulado).toFixed(2),
      conPlan: cuotas.length > 0,
      anulado,
    }
  })
}

export type CuotaDetalle = {
  id: string
  fechaISO: string
  periodo: string
  monto: string
  estado: string
}

export type DetallePrestamo = {
  id: string
  empleadoId: string
  fecha: string
  fechaISO: string
  concepto: string
  monto: string
  saldo: string
  anulado: boolean
  cuotas: CuotaDetalle[]
}

/**
 * Un préstamo con sus cuotas. Devuelve `null` si el id no es de un préstamo de ese empleado:
 * la página lo traduce a 404 y así el id de otra empleada no filtra nada.
 */
export async function detalleDePrestamo(
  empleadoId: string,
  prestamoId: string,
): Promise<DetallePrestamo | null> {
  const prestamo = await prisma.cuentaCorriente.findFirst({
    where: { id: prestamoId, empleadoId, tipo: 'PRESTAMO', reversaDeId: null },
    include: {
      cuotas: { orderBy: { fecha: 'asc' } },
      reversas: { select: { id: true } },
    },
  })
  if (!prestamo) return null

  const monto = aDecimal(prestamo.debe)
  const cuotas = prestamo.cuotas.map((c) => ({ monto: aDecimal(c.monto), estado: c.estado }))
  const anulado = prestamo.reversas.length > 0

  return {
    id: prestamo.id,
    empleadoId: prestamo.empleadoId,
    fecha: formatearFecha(prestamo.fecha),
    fechaISO: aISO(prestamo.fecha),
    concepto: prestamo.concepto,
    monto: monto.toFixed(2),
    saldo: saldoDePrestamo(monto, cuotas, anulado).toFixed(2),
    anulado,
    cuotas: prestamo.cuotas.map((c) => ({
      id: c.id,
      fechaISO: aISO(c.fecha),
      periodo: aISO(c.fecha).slice(0, 7),
      monto: aDecimal(c.monto).toFixed(2),
      estado: c.estado,
    })),
  }
}

// ── §7.3 pagos adicionales ───────────────────────────────────────────────────

/**
 * §6.11 — los períodos que ya tienen una liquidación mensual confirmada.
 *
 * El pago adicional no es un asiento: es una novedad que entra en la liquidación del mes de su
 * fecha (§4.7). Saber si ese mes ya está liquidado es lo que deja avisar **antes** de tocarlo,
 * con el enlace a la pantalla de cálculo, en vez de que el aviso llegue recién al guardar.
 */
async function periodosLiquidados(empleadoId: string): Promise<Set<string>> {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { empleadoId, tipo: 'MENSUAL', estado: 'CONFIRMADA' },
    select: { periodo: true },
  })
  return new Set(liquidaciones.map((l) => aISO(l.periodo)))
}

/** Fila del listado de pagos adicionales. */
export type FilaPagoAdicional = {
  id: string
  fecha: string
  fechaISO: string
  concepto: string | null
  monto: string
  /** El mes en el que se liquida, que sale de la fecha (§4.7). */
  periodo: string
  periodoISO: string
  /** Ese mes ya tiene una liquidación mensual confirmada (§6.11). */
  periodoLiquidado: boolean
}

export async function listarPagosAdicionales(empleadoId: string): Promise<FilaPagoAdicional[]> {
  const [pagos, liquidados] = await Promise.all([
    prisma.pagoAdicional.findMany({
      where: { empleadoId },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
    }),
    periodosLiquidados(empleadoId),
  ])

  return pagos.map((p) => {
    const periodo = primerDiaDelMes(p.fecha)
    return {
      id: p.id,
      fecha: formatearFecha(p.fecha),
      fechaISO: aISO(p.fecha),
      concepto: p.concepto,
      monto: aDecimal(p.monto).toFixed(2),
      periodo: formatearPeriodo(periodo),
      periodoISO: aISO(periodo),
      periodoLiquidado: liquidados.has(aISO(periodo)),
    }
  })
}

export type DetallePagoAdicional = FilaPagoAdicional & { empleadoId: string }

export async function detalleDePagoAdicional(
  empleadoId: string,
  pagoId: string,
): Promise<DetallePagoAdicional | null> {
  const pago = await prisma.pagoAdicional.findFirst({ where: { id: pagoId, empleadoId } })
  if (!pago) return null

  const periodo = primerDiaDelMes(pago.fecha)
  const liquidados = await periodosLiquidados(empleadoId)

  return {
    id: pago.id,
    empleadoId: pago.empleadoId,
    fecha: formatearFecha(pago.fecha),
    fechaISO: aISO(pago.fecha),
    concepto: pago.concepto,
    monto: aDecimal(pago.monto).toFixed(2),
    periodo: formatearPeriodo(periodo),
    periodoISO: aISO(periodo),
    periodoLiquidado: liquidados.has(aISO(periodo)),
  }
}

// ── §7.5 pagos bancarios ─────────────────────────────────────────────────────

/** La liquidación que un pago cancela, cuando está vinculado (§4.14). */
export type LiquidacionDelPago = {
  id: string
  periodo: string
  periodoISO: string
  tipo: string
  secuencia: number
}

/** Fila del listado de pagos bancarios. */
export type FilaPagoBancario = {
  id: string
  fecha: string
  fechaISO: string
  concepto: string
  monto: string
  /** §4.9 — cada pago es de un libro, y es el que decide qué queda por pagar (§4.14). */
  libro: Libro
  liquidacion: LiquidacionDelPago | null
  anulado: boolean
}

/** El `include` que necesitan las dos consultas de pago bancario. */
const INCLUIR_PAGO_BANCARIO = {
  liquidacion: { select: { id: true, periodo: true, tipo: true, secuencia: true } },
  reversas: { select: { id: true } },
} as const

type PagoBancarioConVinculos = {
  id: string
  fecha: Date
  libro: Libro
  debe: DecimalPrisma
  concepto: string
  liquidacion: { id: string; periodo: Date; tipo: string; secuencia: number } | null
  reversas: readonly { id: string }[]
}

function aFilaDePagoBancario(pago: PagoBancarioConVinculos): FilaPagoBancario {
  return {
    id: pago.id,
    fecha: formatearFecha(pago.fecha),
    fechaISO: aISO(pago.fecha),
    concepto: pago.concepto,
    // §4.9 — el pago va al debe: cancela lo devengado.
    monto: aDecimal(pago.debe).toFixed(2),
    libro: pago.libro,
    liquidacion: pago.liquidacion
      ? {
          id: pago.liquidacion.id,
          periodo: formatearPeriodo(pago.liquidacion.periodo),
          periodoISO: aISO(pago.liquidacion.periodo),
          tipo: pago.liquidacion.tipo,
          secuencia: pago.liquidacion.secuencia,
        }
      : null,
    anulado: pago.reversas.length > 0,
  }
}

export async function listarPagosBancarios(empleadoId: string): Promise<FilaPagoBancario[]> {
  const pagos = await prisma.cuentaCorriente.findMany({
    where: { empleadoId, tipo: 'PAGO', reversaDeId: null },
    include: INCLUIR_PAGO_BANCARIO,
    orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
  })

  return pagos.map(aFilaDePagoBancario)
}

export type DetallePagoBancario = FilaPagoBancario & { empleadoId: string }

export async function detalleDePagoBancario(
  empleadoId: string,
  pagoId: string,
): Promise<DetallePagoBancario | null> {
  const pago = await prisma.cuentaCorriente.findFirst({
    where: { id: pagoId, empleadoId, tipo: 'PAGO', reversaDeId: null },
    include: INCLUIR_PAGO_BANCARIO,
  })
  if (!pago) return null

  return { ...aFilaDePagoBancario(pago), empleadoId: pago.empleadoId }
}

// ── §7.11 licencias ──────────────────────────────────────────────────────────

/** Lo que aportó el período gozado, en la fila de su goce. */
export type PeriodoGozado = {
  licenciaId: string
  desde: string
  hasta: string
  /** §4.15.3 — los días hábiles del período, que son los que consumió. */
  diasHabiles: string
  salarioVacacional: string | null
  liquidacionAnulada: boolean
}

/** Fila del estado de cuenta de días (§4.15.1). */
export type FilaLicencia = {
  id: string
  fecha: string
  fechaISO: string
  tipo: string
  concepto: string
  /** Días consumidos y generados, como los guarda el libro. */
  debe: string
  haber: string
  saldoAcumulado: string
  /** El período gozado, en las filas de tipo `GOCE`: hay uno por licencia. */
  periodo: PeriodoGozado | null
}

export type LibroDeLicencia = {
  /** §4.15.1 — Σ haber − Σ debe. Puede ser negativo: licencia adelantada. */
  saldoDias: string
  filas: FilaLicencia[]
}

/**
 * §4.15.1 — el estado de cuenta de días, que es a la vez el listado de licencias: las filas de
 * goce traen el período que las generó, así que las dos tablas que había en Datos/Licencia
 * —el libro y «Períodos gozados»— quedan condensadas en una.
 *
 * **Ordenado por fecha**, como cualquier libro, y el saldo acumulado corre en ese orden. Los días
 * no se imputan a un año: el §4.15.1 define un saldo único —`Σ haber − Σ debe`— y el año solo
 * existe en el haber, porque la generación anual acredita un asiento por aniversario (§4.15.4).
 * Con una licencia adelantada el saldo queda negativo hasta que llega la generación que la cubre,
 * igual que en la cuenta corriente de dinero.
 */
export async function listarLicencias(empleadoId: string): Promise<LibroDeLicencia> {
  const movimientos = await prisma.licenciaMovimiento.findMany({
    where: { empleadoId },
    include: {
      licencia: {
        include: { liquidacion: { select: { totalAPagar: true, estado: true } } },
      },
    },
    orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
  })

  const conSaldo = conSaldoAcumulado(
    movimientos.map((m) => ({
      id: m.id,
      fecha: formatearFecha(m.fecha),
      fechaISO: aISO(m.fecha),
      tipo: m.tipo,
      concepto: m.concepto,
      debe: aDecimal(m.debe),
      haber: aDecimal(m.haber),
      licencia: m.licencia,
    })),
  )

  return {
    saldoDias: saldoDiasLicencia(
      movimientos.map((m) => ({ debe: aDecimal(m.debe), haber: aDecimal(m.haber) })),
    ).toString(),
    filas: conSaldo.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      fechaISO: m.fechaISO,
      tipo: m.tipo,
      concepto: m.concepto,
      debe: m.debe.toString(),
      haber: m.haber.toString(),
      saldoAcumulado: m.saldoAcumulado.toString(),
      periodo: m.licencia
        ? {
            licenciaId: m.licencia.id,
            desde: formatearFecha(m.licencia.fechaDesde),
            hasta: formatearFecha(m.licencia.fechaHasta),
            diasHabiles: aDecimal(m.licencia.diasHabiles).toString(),
            salarioVacacional: m.licencia.liquidacion
              ? aDecimal(m.licencia.liquidacion.totalAPagar).toFixed(2)
              : null,
            liquidacionAnulada: m.licencia.liquidacion?.estado === 'ANULADA',
          }
        : null,
    })),
  }
}
