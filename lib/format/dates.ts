/**
 * Manejo de fechas de negocio.
 *
 * Todas las fechas de negocio del SPECS son de tipo `DATE`: no tienen hora ni zona.
 * Para que no se corran de día al serializar, se representan siempre como un `Date`
 * posicionado a la **medianoche UTC** del día en cuestión, y se leen y escriben con los
 * getters/setters `UTC*`. La zona `America/Montevideo` interviene en un solo lugar: al
 * preguntar qué día es hoy.
 */

export const TZ = 'America/Montevideo'

const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** Construye una fecha de negocio. `mes` es 1–12. */
export function fecha(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia))
}

/** Parsea `AAAA-MM-DD`. Lanza si el formato no es ese. */
export function parseFechaISO(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  return fecha(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** Serializa a `AAAA-MM-DD`. */
export function aISO(f: Date): string {
  const a = f.getUTCFullYear().toString().padStart(4, '0')
  const m = (f.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = f.getUTCDate().toString().padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** Normaliza cualquier `Date` a la medianoche UTC de su día (según sus componentes UTC). */
export function soloFecha(f: Date): Date {
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()))
}

/** El día de hoy en `America/Montevideo`, como fecha de negocio. */
export function hoy(referencia: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referencia)
  return parseFechaISO(partes)
}

export function anio(f: Date): number {
  return f.getUTCFullYear()
}

/** Mes 1–12. */
export function mes(f: Date): number {
  return f.getUTCMonth() + 1
}

export function dia(f: Date): number {
  return f.getUTCDate()
}

/** Día de la semana con **lunes = 0** … domingo = 6 (la semana arranca en lunes, §8.6). */
export function diaSemana(f: Date): number {
  return (f.getUTCDay() + 6) % 7
}

export function esDomingo(f: Date): boolean {
  return f.getUTCDay() === 0
}

export function primerDiaDelMes(f: Date): Date {
  return fecha(f.getUTCFullYear(), f.getUTCMonth() + 1, 1)
}

export function ultimoDiaDelMes(f: Date): Date {
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0))
}

export function diasDelMes(f: Date): number {
  return ultimoDiaDelMes(f).getUTCDate()
}

export function sumarDias(f: Date, dias: number): Date {
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + dias))
}

/** Suma meses conservando el día 1; pensado para períodos y vigencias. */
export function sumarMeses(f: Date, meses: number): Date {
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + meses, f.getUTCDate()))
}

export function mismoDia(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime()
}

export function esAnterior(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime()
}

export function esPosterior(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime()
}

/** `desde <= f <= hasta`, con extremos inclusive. */
export function entre(f: Date, desde: Date, hasta: Date): boolean {
  return f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime()
}

export function minFecha(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

export function maxFecha(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

/** Días corridos entre dos fechas, ambos extremos inclusive. 0 si el rango está invertido. */
export function diasCorridos(desde: Date, hasta: Date): number {
  const ms = hasta.getTime() - desde.getTime()
  if (ms < 0) return 0
  return Math.round(ms / 86_400_000) + 1
}

/** Todos los días de un mes, en orden. */
export function diasDelPeriodo(periodo: Date): Date[] {
  const inicio = primerDiaDelMes(periodo)
  const total = diasDelMes(inicio)
  return Array.from({ length: total }, (_, i) => sumarDias(inicio, i))
}

// ── Períodos (mes/año) ───────────────────────────────────────────────────────

/** Un período es el primer día del mes que representa. */
export function periodoDe(anioP: number, mesP: number): Date {
  return fecha(anioP, mesP, 1)
}

/** Parsea `AAAA-MM`. */
export function parsePeriodo(texto: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(texto)
  if (!m) throw new Error(`Período inválido: ${texto}`)
  const mesP = Number(m[2])
  if (mesP < 1 || mesP > 12) throw new Error(`Período inválido: ${texto}`)
  return periodoDe(Number(m[1]), mesP)
}

/** Serializa a `AAAA-MM`. */
export function aPeriodoISO(f: Date): string {
  return `${f.getUTCFullYear().toString().padStart(4, '0')}-${(f.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`
}

export function mismoPeriodo(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

/**
 * §4.15.4 — aniversario `n` de una fecha de ingreso.
 * Si el ingreso fue un 29/02, en los años no bisiestos el aniversario cae el 28/02.
 */
export function aniversario(fechaIngreso: Date, n: number): Date {
  const a = fechaIngreso.getUTCFullYear() + n
  const m = fechaIngreso.getUTCMonth()
  const d = fechaIngreso.getUTCDate()
  const candidato = new Date(Date.UTC(a, m, d))
  // Si el día se desbordó al mes siguiente (29/02 en año no bisiesto), retroceder al último
  // día del mes original.
  if (candidato.getUTCMonth() !== m) return new Date(Date.UTC(a, m + 1, 0))
  return candidato
}

/**
 * §4.15.4 — años enteros completos entre `fechaIngreso` y `referencia`.
 * Es 0 durante el primer año y pasa a 1 el día del primer aniversario.
 */
export function antiguedadEnAnios(fechaIngreso: Date, referencia: Date): number {
  if (referencia.getTime() < fechaIngreso.getTime()) return 0
  let n = referencia.getUTCFullYear() - fechaIngreso.getUTCFullYear()
  if (n > 0 && aniversario(fechaIngreso, n).getTime() > referencia.getTime()) n -= 1
  return Math.max(0, n)
}

// ── Presentación ─────────────────────────────────────────────────────────────

/** `dd/mm/aaaa` (§2). */
export function formatearFecha(f: Date | null | undefined): string {
  if (!f) return ''
  const d = f.getUTCDate().toString().padStart(2, '0')
  const m = (f.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${d}/${m}/${f.getUTCFullYear()}`
}

/** `enero 2026`. */
export function formatearPeriodo(f: Date): string {
  return `${MESES[f.getUTCMonth()]} ${f.getUTCFullYear()}`
}

/** `Enero 2026`. */
export function formatearPeriodoCapitalizado(f: Date): string {
  const t = formatearPeriodo(f)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function nombreMes(mesP: number): string {
  return MESES[mesP - 1]
}

export function nombreDiaSemanaCorto(indiceLunes0: number): string {
  return DIAS_SEMANA_CORTOS[indiceLunes0]
}

export const NOMBRES_MESES = MESES
export const NOMBRES_DIAS_CORTOS = DIAS_SEMANA_CORTOS
