/**
 * §7.6 y §7.7 — la secuencia de períodos liquidables de una empleada.
 *
 * El aguinaldo no es una pantalla aparte: es **un período más**, que se intercala después de
 * junio y de diciembre. Así el año tiene catorce paradas en vez de doce, y el selector de la
 * pantalla de liquidación las recorre en orden:
 *
 *     … Mayo · Junio · ½ Aguinaldo Junio · Julio … Diciembre · ½ Aguinaldo Diciembre · Enero …
 *
 * El tipo `SALARIO_VACACIONAL` (§7.11) no entra en esta secuencia: se genera al registrar una
 * licencia, en la fecha que corresponda, y no tiene un lugar fijo en el calendario.
 */
import { esMesDeAguinaldo } from './aguinaldo'
import { aPeriodoISO, formatearPeriodoCapitalizado, sumarMeses } from '@/lib/format/dates'

/** Los dos tipos que se recorren con las flechas. */
export type TipoPeriodo = 'MENSUAL' | 'AGUINALDO'

export type PeriodoLiquidable = {
  /** Primer día del mes. */
  periodo: Date
  tipo: TipoPeriodo
}

/** Cómo viaja el tipo en la URL. `MENSUAL` no viaja: es el valor por defecto. */
export function tipoDesdeUrl(valor: string | undefined): TipoPeriodo {
  return valor === 'aguinaldo' ? 'AGUINALDO' : 'MENSUAL'
}

export function urlDesdeTipo(tipo: TipoPeriodo): string | null {
  return tipo === 'AGUINALDO' ? 'aguinaldo' : null
}

/** Query string del período, para armar los enlaces de la pantalla. */
export function consultaDePeriodo({ periodo, tipo }: PeriodoLiquidable): string {
  const sufijo = urlDesdeTipo(tipo)
  return `periodo=${aPeriodoISO(periodo)}${sufijo ? `&tipo=${sufijo}` : ''}`
}

/**
 * El siguiente en la secuencia. Después del mensual de junio o diciembre viene su aguinaldo,
 * y después del aguinaldo, el mensual del mes siguiente.
 */
export function siguientePeriodo(actual: PeriodoLiquidable): PeriodoLiquidable {
  if (actual.tipo === 'MENSUAL' && esMesDeAguinaldo(actual.periodo)) {
    return { periodo: actual.periodo, tipo: 'AGUINALDO' }
  }
  return { periodo: sumarMeses(actual.periodo, 1), tipo: 'MENSUAL' }
}

/** El anterior en la secuencia: el espejo de `siguientePeriodo`. */
export function anteriorPeriodo(actual: PeriodoLiquidable): PeriodoLiquidable {
  if (actual.tipo === 'AGUINALDO') {
    return { periodo: actual.periodo, tipo: 'MENSUAL' }
  }
  const mesAnterior = sumarMeses(actual.periodo, -1)
  return esMesDeAguinaldo(mesAnterior)
    ? { periodo: mesAnterior, tipo: 'AGUINALDO' }
    : { periodo: mesAnterior, tipo: 'MENSUAL' }
}

/** Lo que se lee entre las dos flechas. */
export function etiquetaPeriodo({ periodo, tipo }: PeriodoLiquidable): string {
  const nombre = formatearPeriodoCapitalizado(periodo)
  return tipo === 'AGUINALDO' ? `½ Aguinaldo ${nombre}` : nombre
}

/**
 * Un aguinaldo solo existe en junio y en diciembre. Sirve para descartar una URL armada a
 * mano —`?periodo=2026-03&tipo=aguinaldo`— antes de mostrar una pantalla que no corresponde.
 */
export function periodoValido({ periodo, tipo }: PeriodoLiquidable): boolean {
  return tipo === 'MENSUAL' || esMesDeAguinaldo(periodo)
}
