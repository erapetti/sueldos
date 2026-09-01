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
import { DIA_UMBRAL_LIQUIDACION } from './estado'
import {
  anio,
  aPeriodoISO,
  fecha,
  formatearPeriodoCapitalizado,
  hoy,
  maxFecha,
  mes,
  minFecha,
  parsePeriodo,
  primerDiaDelMes,
  sumarMeses,
} from '@/lib/format/dates'

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

/**
 * §7.6 — el día a partir del cual se puede confirmar la liquidación de un período: el
 * **día 23 de su propio mes**. El de setiembre 2026 se confirma el 23/09/2026 o después, sin
 * tope.
 *
 * Es el mismo umbral del §4.2.3 —`DIA_UMBRAL_LIQUIDACION`— y no otro a propósito: el día en
 * que la empleada empieza a figurar «Falta liquidación» es el día en que se puede liquidar.
 * Con dos números distintos quedaba una ventana en la que la aplicación reclamaba algo que
 * ella misma no dejaba hacer.
 */
export function primerDiaConfirmable(periodo: Date): Date {
  return fecha(anio(periodo), mes(periodo), DIA_UMBRAL_LIQUIDACION)
}

/**
 * §7.6 — si el período ya está en fecha de confirmarse. Los meses pasados siempre lo están:
 * el umbral es del mes del período, así que el único que puede quedar por debajo es el mes en
 * curso, y solo hasta su día 22.
 *
 * **Divergencia con el §4.2.3**, que dice que el umbral «no restringe la operación». Ver
 * `IMPLEMENTATION_HINTS.md`.
 */
export function sePuedeConfirmar(periodo: Date, referencia: Date = hoy()): boolean {
  return referencia.getTime() >= primerDiaConfirmable(periodo).getTime()
}

/**
 * El tramo de meses que el selector puede recorrer, en las tres pantallas de la empleada:
 * horas extras, inasistencias y liquidación.
 *
 * Antes cada pantalla tenía su propia idea. Las planillas retrocedían sin tope —hasta meses
 * anteriores al ingreso, donde no hay régimen ni salario— y la liquidación solo retrocedía si
 * ya existía una liquidación anterior, así que un mes atrasado quedaba inalcanzable
 * justamente cuando había que liquidarlo. Ahora es un rango solo: desde el mes de ingreso
 * hasta el mes de egreso, sin pasar del mes en curso (§6.10 — no hay períodos futuros).
 */
export type RangoDePeriodos = { desde: Date; hasta: Date }

export function rangoDePeriodos(
  empleado: { fechaIngreso: Date; fechaEgreso: Date | null },
  referencia: Date = hoy(),
): RangoDePeriodos {
  const desde = primerDiaDelMes(empleado.fechaIngreso)
  const mesActual = primerDiaDelMes(referencia)
  const hasta = empleado.fechaEgreso
    ? minFecha(primerDiaDelMes(empleado.fechaEgreso), mesActual)
    : mesActual
  // Una empleada que ingresó y egresó dentro del mismo mes deja el rango en ese único mes;
  // el `max` también cubre la ficha con el egreso cargado antes del ingreso.
  return { desde, hasta: maxFecha(hasta, desde) }
}

export function mesEnRango(periodo: Date, { desde, hasta }: RangoDePeriodos): boolean {
  return periodo.getTime() >= desde.getTime() && periodo.getTime() <= hasta.getTime()
}

/** El mes pedido, traído al rango: lo que se abre cuando la URL o la memoria caen afuera. */
export function acotarPeriodo(periodo: Date, rango: RangoDePeriodos): Date {
  return minFecha(maxFecha(periodo, rango.desde), rango.hasta)
}

/**
 * Cómo se recuerda el mes elegido de una pantalla a la otra, y de una empleada a la siguiente.
 *
 * Es una cookie y no `sessionStorage` porque el que decide qué mes abrir es el servidor: las
 * tres pantallas son componentes de servidor y leen la cookie del request. Guardarlo en el
 * cliente obligaría a dibujar un mes y redirigir al otro, con el parpadeo de por medio.
 * Sin `expires`: dura lo que dure la ventana del navegador.
 */
export const COOKIE_PERIODO = 'periodo'

/**
 * `AAAA-MM` que llega de afuera —la URL o la cookie— y puede ser cualquier cosa. Devuelve
 * `null` en vez de tirar: un valor roto se ignora y la pantalla abre en el mes por defecto.
 */
export function parsePeriodoSeguro(texto: string | null | undefined): Date | null {
  if (!texto) return null
  try {
    return parsePeriodo(texto)
  } catch {
    return null
  }
}
