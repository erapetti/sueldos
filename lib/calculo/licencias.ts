/**
 * §4.15 y §7.11 — licencia: días hábiles, generación anual y salario vacacional.
 */
import Decimal from 'decimal.js'
import { redondear2 } from '@/lib/format/money'
import {
  aISO,
  aniversario,
  diasCorridos,
  esDomingo,
  sumarDias,
} from '@/lib/format/dates'
import type { FeriadoCalculo } from './tipos'

export type DesgloseDiasHabiles = {
  diasCorridos: number
  domingos: number
  feriados: number
  diasHabiles: Decimal
}

/**
 * §4.15.3 — días hábiles de un período de licencia:
 *
 *   días corridos − domingos − feriados con `noLaborable = true`
 *
 * Los sábados sí cuentan. No depende del régimen horario: es la definición legal del
 * período. Un domingo que además es feriado se descuenta una sola vez.
 */
export function calcularDiasHabiles(
  fechaDesde: Date,
  fechaHasta: Date,
  feriados: readonly FeriadoCalculo[],
): DesgloseDiasHabiles {
  const corridos = diasCorridos(fechaDesde, fechaHasta)
  if (corridos === 0) {
    return { diasCorridos: 0, domingos: 0, feriados: 0, diasHabiles: new Decimal(0) }
  }

  const feriadosNoLaborables = new Set(
    feriados.filter((f) => f.noLaborable).map((f) => aISO(f.fecha)),
  )

  let domingos = 0
  let feriadosContados = 0

  for (let i = 0; i < corridos; i += 1) {
    const f = sumarDias(fechaDesde, i)
    if (esDomingo(f)) {
      domingos += 1
      continue // un domingo feriado se descuenta una sola vez
    }
    if (feriadosNoLaborables.has(aISO(f))) feriadosContados += 1
  }

  return {
    diasCorridos: corridos,
    domingos,
    feriados: feriadosContados,
    diasHabiles: new Decimal(corridos - domingos - feriadosContados),
  }
}

/** Todos los días corridos comprendidos en un período de licencia. */
export function diasDeLicencia(fechaDesde: Date, fechaHasta: Date): Date[] {
  const total = diasCorridos(fechaDesde, fechaHasta)
  return Array.from({ length: total }, (_, i) => sumarDias(fechaDesde, i))
}

/** Dos períodos se superponen si comparten al menos un día (§4.15.2). */
export function seSuperponen(
  aDesde: Date,
  aHasta: Date,
  bDesde: Date,
  bHasta: Date,
): boolean {
  return aDesde.getTime() <= bHasta.getTime() && bDesde.getTime() <= aHasta.getTime()
}

/**
 * §4.15.4 — días que genera el aniversario `n` (n >= 1):
 *
 *   dias_generados = 20 + ( n > 4 ? int(n / 4) : 0 )
 *
 * En `n = 4` la condición no se cumple y corresponden 20 días, aunque int(4/4) sea 1.
 */
export function diasGeneradosPorAniversario(n: number): number {
  if (n < 1) return 0
  return 20 + (n > 4 ? Math.trunc(n / 4) : 0)
}

export type AniversarioPendiente = {
  n: number
  fecha: Date
  dias: number
}

/**
 * §7.12 — aniversarios `n >= 1` cuya fecha es menor o igual a `hasta` y que todavía no
 * fueron acreditados. Devuelve todos los pendientes, no solo el de hoy, para que el proceso
 * se recupere solo si un día no llegó a ejecutarse.
 */
export function aniversariosPendientes(
  fechaIngreso: Date,
  hasta: Date,
  yaAcreditados: readonly number[],
): AniversarioPendiente[] {
  const acreditados = new Set(yaAcreditados)
  const pendientes: AniversarioPendiente[] = []

  for (let n = 1; ; n += 1) {
    const fecha = aniversario(fechaIngreso, n)
    if (fecha.getTime() > hasta.getTime()) break
    if (!acreditados.has(n)) {
      pendientes.push({ n, fecha, dias: diasGeneradosPorAniversario(n) })
    }
    // Cota de seguridad: nadie acumula más de 120 aniversarios.
    if (n > 120) break
  }

  return pendientes
}

/**
 * §7.11 — salario vacacional:
 *
 *   salario_vacacional = salario_mensual_vigente / 30 × dias_habiles
 *
 * El salario vigente se resuelve (§5.2) para el mes de `fechaDesde`.
 *
 * §13.2 sigue pendiente: hoy se liquida por el monto bruto, sin descuentos de BPS, tanto
 * para `aportaBps = true` como para `false` (en este último caso ya está resuelto por §6.3).
 */
export function calcularSalarioVacacional(
  salarioMensual: Decimal,
  diasHabiles: Decimal,
): Decimal {
  return redondear2(salarioMensual.dividedBy(30).times(diasHabiles))
}

/** Saldo de días de licencia: Σ haber − Σ debe (§4.15.1). */
export function saldoDiasLicencia(
  movimientos: readonly { debe: Decimal; haber: Decimal }[],
): Decimal {
  return movimientos.reduce(
    (acc, m) => acc.plus(m.haber).minus(m.debe),
    new Decimal(0),
  )
}
