/**
 * Presentación de importes, horas y porcentajes (§8.5) y utilidades de redondeo (§6.7).
 *
 * En la base solo se guarda el número: la moneda no se persiste ni se muestra como código.
 */
import Decimal from 'decimal.js'

// El motor de cálculo no redondea en los pasos intermedios; el redondeo se aplica línea
// por línea con ROUND_HALF_UP (§6.7).
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP })

export type Numerico = Decimal | number | string

export function d(valor: Numerico): Decimal {
  return valor instanceof Decimal ? valor : new Decimal(valor)
}

/** Redondeo a 2 decimales con ROUND_HALF_UP (§6.7). */
export function redondear2(valor: Numerico): Decimal {
  return d(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/** Redondeo a 2 decimales devuelto como `string`, apto para columnas DECIMAL(14,2). */
export function aDecimalSql(valor: Numerico): string {
  return redondear2(valor).toFixed(2)
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * `$ 12.345,67`. Los negativos se muestran con el signo menos tipográfico (§8.5);
 * el color rojo lo pone la UI.
 */
export function formatearImporte(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = redondear2(valor)
  const texto = FORMATO_NUMERO.format(n.abs().toNumber())
  return n.isNegative() ? `−$ ${texto}` : `$ ${texto}`
}

/** Igual que `formatearImporte` pero sin el `$`, para columnas de tabla ya rotuladas. */
export function formatearNumero(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = redondear2(valor)
  const texto = FORMATO_NUMERO.format(n.abs().toNumber())
  return n.isNegative() ? `−${texto}` : texto
}

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** `7,5 h` (§8.5). */
export function formatearHoras(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return `${FORMATO_CANTIDAD.format(d(valor).toNumber())} h`
}

/** `20 días` / `1 día`. */
export function formatearDias(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = d(valor)
  const texto = FORMATO_CANTIDAD.format(n.toNumber())
  return n.abs().equals(1) ? `${texto} día` : `${texto} días`
}

/** `12 días hábiles` / `1 día hábil`. */
export function formatearDiasHabiles(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = d(valor)
  const texto = FORMATO_CANTIDAD.format(n.toNumber())
  return n.abs().equals(1) ? `${texto} día hábil` : `${texto} días hábiles`
}

/** `18,1 %` (§8.5). */
export function formatearPorcentaje(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(d(valor).toNumber())
  return `${n} %`
}

/** Cantidad sin unidad, con hasta 2 decimales. */
export function formatearCantidad(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return FORMATO_CANTIDAD.format(d(valor).toNumber())
}

/** Parsea lo que se tipea en un input `1.234,56` o `1234.56`. Devuelve null si no es número. */
export function parsearNumero(texto: string): Decimal | null {
  const limpio = texto.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (limpio === '' || !/^-?\d+(\.\d+)?$/.test(limpio)) return null
  try {
    return new Decimal(limpio)
  } catch {
    return null
  }
}

export { Decimal }
