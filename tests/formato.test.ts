/**
 * Presentación de importes (§8.5) y el redondeo de solo-visualización de la pantalla de
 * liquidación (§7.6).
 */
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { formatearImporte, formatearImporteEntero } from '@/lib/format/money'

describe('formatearImporte — con centavos (§8.5)', () => {
  it('usa el formato es-UY: punto de miles y coma decimal', () => {
    expect(formatearImporte('12345.67')).toBe('$ 12.345,67')
    expect(formatearImporte('0.5')).toBe('$ 0,50')
    expect(formatearImporte('1000000')).toBe('$ 1.000.000,00')
  })

  it('los negativos llevan el signo menos tipográfico', () => {
    expect(formatearImporte('-2400')).toBe('−$ 2.400,00')
  })
})

describe('formatearImporteEntero — redondeo solo de presentación', () => {
  it('redondea a pesos enteros, sin decimales', () => {
    expect(formatearImporteEntero('12345.67')).toBe('$ 12.346')
    expect(formatearImporteEntero('12345.49')).toBe('$ 12.345')
    expect(formatearImporteEntero('57777')).toBe('$ 57.777')
  })

  it('el medio peso redondea hacia arriba, igual que §6.7', () => {
    expect(formatearImporteEntero('100.5')).toBe('$ 101')
    expect(formatearImporteEntero('99.5')).toBe('$ 100')
    expect(formatearImporteEntero('0.5')).toBe('$ 1')
    expect(formatearImporteEntero('0.49')).toBe('$ 0')
  })

  it('los negativos llevan el signo menos y redondean por valor absoluto', () => {
    expect(formatearImporteEntero('-2400.4')).toBe('−$ 2.400')
    expect(formatearImporteEntero('-2400.5')).toBe('−$ 2.401')
  })

  it('acepta Decimal, número y texto', () => {
    expect(formatearImporteEntero(new Decimal('346.153846'))).toBe('$ 346')
    expect(formatearImporteEntero(346.153846)).toBe('$ 346')
    expect(formatearImporteEntero('346.153846')).toBe('$ 346')
  })

  it('sin valor no muestra nada', () => {
    expect(formatearImporteEntero(null)).toBe('')
    expect(formatearImporteEntero(undefined)).toBe('')
  })

  it('no altera el valor original: el redondeo es solo de presentación', () => {
    const exacto = new Decimal('52259.62')
    expect(formatearImporteEntero(exacto)).toBe('$ 52.260')
    // El Decimal sigue intacto para seguir calculando con él.
    expect(exacto.toFixed(2)).toBe('52259.62')
  })
})
