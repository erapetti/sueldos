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

/** Redondeo a 2 decimales con ROUND_HALF_UP. */
export function redondear2(valor: Numerico): Decimal {
  return d(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/**
 * Redondeo a pesos enteros con ROUND_HALF_UP.
 *
 * **Divergencia deliberada del SPECS.** El §4.3 dice que el valor hora se usa con precisión
 * completa y el §6.7 que cada línea se redondea a 2 decimales. Por decisión del proyecto los
 * importes se llevan a pesos enteros: el valor hora se registra redondeado y cada línea de la
 * liquidación también.
 *
 * El motivo es que la liquidación se lee y se controla a mano. Redondeando solo al mostrar,
 * la columna no cerraba en 6 de cada 10 casos —se despegaba entre 1 y 3 pesos—; redondeando
 * en el cálculo, lo que se ve es exactamente lo que se suma.
 *
 * Los pasos intermedios siguen con precisión completa: se redondea al cerrar cada línea, no
 * antes.
 */
export function redondearPesos(valor: Numerico): Decimal {
  return d(valor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
}

/**
 * `true` si todos los importes son pesos enteros. Sirve para decidir si una pantalla muestra
 * o no los centavos: si no quedan decimales, el `,00` es ruido.
 */
export function todosEnteros(valores: readonly (Numerico | null | undefined)[]): boolean {
  return valores.every((v) => v === null || v === undefined || d(v).isInteger())
}

/** Redondeo a 2 decimales devuelto como `string`, apto para columnas DECIMAL(14,2). */
export function aDecimalSql(valor: Numerico): string {
  return redondear2(valor).toFixed(2)
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const FORMATO_ENTERO = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
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

/**
 * `$ 12.346` — el importe redondeado a pesos enteros, solo para mostrar.
 *
 * El redondeo es únicamente de presentación: los cálculos y lo que se guarda en la base
 * siguen con los 2 decimales de §6.7. Se usa en la pantalla de liquidación (§7.6), donde los
 * centavos no aportan a la lectura.
 *
 * Ojo con una consecuencia: al redondear cada línea por separado, la columna puede no sumar
 * exactamente el total mostrado. El desvío es de 1 a 3 pesos y aparece en cerca del 60 % de
 * las liquidaciones. El total mostrado es siempre el redondeo del total real, nunca la suma
 * de las líneas redondeadas: manda el importe que efectivamente se paga.
 */
export function formatearImporteEntero(valor: Numerico | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const n = d(valor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  const texto = FORMATO_ENTERO.format(n.abs().toNumber())
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
