/**
 * §7.6 y §7.7 — la secuencia de períodos liquidables, con el aguinaldo intercalado después de
 * junio y de diciembre. Es lo que recorren las flechas de la pantalla de liquidación.
 */
import { describe, expect, it } from 'vitest'
import {
  anteriorPeriodo,
  consultaDePeriodo,
  etiquetaPeriodo,
  periodoValido,
  siguientePeriodo,
  tipoDesdeUrl,
  type PeriodoLiquidable,
} from '@/lib/calculo/periodos'
import { periodoDe } from './helpers'

const mensual = (anio: number, mes: number): PeriodoLiquidable => ({
  periodo: periodoDe(anio, mes),
  tipo: 'MENSUAL',
})
const aguinaldo = (anio: number, mes: number): PeriodoLiquidable => ({
  periodo: periodoDe(anio, mes),
  tipo: 'AGUINALDO',
})
const clave = (p: PeriodoLiquidable) => `${p.periodo.toISOString().slice(0, 7)} ${p.tipo}`

describe('§7.7 el año tiene catorce períodos', () => {
  it('recorre enero a enero pasando por los dos aguinaldos', () => {
    const secuencia: string[] = []
    let actual = mensual(2026, 1)
    for (let i = 0; i < 14; i++) {
      secuencia.push(clave(actual))
      actual = siguientePeriodo(actual)
    }
    expect(secuencia).toEqual([
      '2026-01 MENSUAL',
      '2026-02 MENSUAL',
      '2026-03 MENSUAL',
      '2026-04 MENSUAL',
      '2026-05 MENSUAL',
      '2026-06 MENSUAL',
      '2026-06 AGUINALDO',
      '2026-07 MENSUAL',
      '2026-08 MENSUAL',
      '2026-09 MENSUAL',
      '2026-10 MENSUAL',
      '2026-11 MENSUAL',
      '2026-12 MENSUAL',
      '2026-12 AGUINALDO',
    ])
    // El siguiente del aguinaldo de diciembre es enero del año que viene.
    expect(clave(actual)).toBe('2027-01 MENSUAL')
  })

  it('ir y volver deja en el mismo lugar, en los seis bordes', () => {
    for (const p of [
      mensual(2026, 5),
      mensual(2026, 6),
      aguinaldo(2026, 6),
      mensual(2026, 7),
      mensual(2026, 12),
      aguinaldo(2026, 12),
    ]) {
      expect(clave(anteriorPeriodo(siguientePeriodo(p)))).toBe(clave(p))
      expect(clave(siguientePeriodo(anteriorPeriodo(p)))).toBe(clave(p))
    }
  })

  it('atrás desde julio cae en el aguinaldo de junio, no en el mensual', () => {
    expect(clave(anteriorPeriodo(mensual(2026, 7)))).toBe('2026-06 AGUINALDO')
    expect(clave(anteriorPeriodo(aguinaldo(2026, 6)))).toBe('2026-06 MENSUAL')
  })

  it('atrás desde enero cae en el aguinaldo de diciembre del año anterior', () => {
    expect(clave(anteriorPeriodo(mensual(2026, 1)))).toBe('2025-12 AGUINALDO')
  })

  it('la etiqueta distingue el aguinaldo del mes', () => {
    expect(etiquetaPeriodo(mensual(2026, 6))).toBe('Junio 2026')
    expect(etiquetaPeriodo(aguinaldo(2026, 6))).toBe('½ Aguinaldo Junio 2026')
  })

  it('solo hay aguinaldo en junio y en diciembre', () => {
    expect(periodoValido(aguinaldo(2026, 6))).toBe(true)
    expect(periodoValido(aguinaldo(2026, 12))).toBe(true)
    expect(periodoValido(aguinaldo(2026, 3))).toBe(false)
    // El mensual existe en los doce meses.
    for (let m = 1; m <= 12; m++) expect(periodoValido(mensual(2026, m))).toBe(true)
  })

  it('el tipo viaja en la URL y el mensual es el valor por defecto', () => {
    expect(consultaDePeriodo(mensual(2026, 8))).toBe('periodo=2026-08')
    expect(consultaDePeriodo(aguinaldo(2026, 12))).toBe('periodo=2026-12&tipo=aguinaldo')
    expect(tipoDesdeUrl('aguinaldo')).toBe('AGUINALDO')
    expect(tipoDesdeUrl(undefined)).toBe('MENSUAL')
    expect(tipoDesdeUrl('cualquier-cosa')).toBe('MENSUAL')
  })
})
