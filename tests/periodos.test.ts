/**
 * §7.6 y §7.7 — la secuencia de períodos liquidables, con el aguinaldo intercalado después de
 * junio y de diciembre. Es lo que recorren las flechas de la pantalla de liquidación.
 */
import { describe, expect, it } from 'vitest'
import {
  acotarPeriodo,
  anteriorPeriodo,
  consultaDePeriodo,
  etiquetaPeriodo,
  mesEnRango,
  parsePeriodoSeguro,
  periodoValido,
  rangoDePeriodos,
  siguientePeriodo,
  tipoDesdeUrl,
  type PeriodoLiquidable,
} from '@/lib/calculo/periodos'
import { fecha, periodoDe } from './helpers'

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

describe('el rango de meses que recorre el selector', () => {
  // Todo se mide contra un «hoy» fijo, así el test no cambia de resultado el mes que viene.
  const hoy = fecha(2026, 9, 1)
  const rango = (ingreso: Date, egreso: Date | null = null) =>
    rangoDePeriodos({ fechaIngreso: ingreso, fechaEgreso: egreso }, hoy)
  const clave = (p: Date) => p.toISOString().slice(0, 7)

  it('va del mes de ingreso al mes en curso', () => {
    const r = rango(fecha(2025, 3, 17))
    expect(clave(r.desde)).toBe('2025-03')
    expect(clave(r.hasta)).toBe('2026-09')
  })

  it('la empleada dada de baja llega hasta su mes de egreso', () => {
    const r = rango(fecha(2025, 3, 17), fecha(2026, 4, 10))
    expect(clave(r.hasta)).toBe('2026-04')
  })

  it('un egreso futuro no habilita meses futuros', () => {
    const r = rango(fecha(2025, 3, 17), fecha(2026, 12, 31))
    expect(clave(r.hasta)).toBe('2026-09')
  })

  it('la que entró y salió el mismo mes tiene un rango de un solo mes', () => {
    const r = rango(fecha(2026, 5, 2), fecha(2026, 5, 28))
    expect(clave(r.desde)).toBe('2026-05')
    expect(clave(r.hasta)).toBe('2026-05')
  })

  it('el mes pedido se trae al rango en vez de romper la pantalla', () => {
    const r = rango(fecha(2025, 3, 17))
    // El de otra empleada que quedó en la memoria de la navegación, anterior a este ingreso.
    expect(clave(acotarPeriodo(periodoDe(2024, 1), r))).toBe('2025-03')
    // Y un `?periodo=` futuro armado a mano.
    expect(clave(acotarPeriodo(periodoDe(2027, 1), r))).toBe('2026-09')
    expect(clave(acotarPeriodo(periodoDe(2025, 8), r))).toBe('2025-08')
  })

  it('las flechas se apagan en los dos bordes', () => {
    const r = rango(fecha(2025, 3, 17))
    const atras = (p: PeriodoLiquidable) => mesEnRango(anteriorPeriodo(p).periodo, r)
    const adelante = (p: PeriodoLiquidable) => mesEnRango(siguientePeriodo(p).periodo, r)

    expect(atras(mensual(2025, 3))).toBe(false)
    expect(adelante(mensual(2025, 3))).toBe(true)
    expect(atras(mensual(2026, 9))).toBe(true)
    expect(adelante(mensual(2026, 9))).toBe(false)
  })

  it('el aguinaldo del último mes sí se alcanza, porque es el mismo mes', () => {
    const r = rango(fecha(2025, 3, 17), fecha(2026, 6, 30))
    expect(mesEnRango(siguientePeriodo(mensual(2026, 6)).periodo, r)).toBe(true)
    expect(mesEnRango(siguientePeriodo(aguinaldo(2026, 6)).periodo, r)).toBe(false)
  })
})

describe('el período que llega de la URL o de la cookie', () => {
  it('acepta el AAAA-MM y descarta cualquier otra cosa', () => {
    expect(parsePeriodoSeguro('2026-07')?.toISOString().slice(0, 7)).toBe('2026-07')
    expect(parsePeriodoSeguro('2026-13')).toBeNull()
    expect(parsePeriodoSeguro('julio')).toBeNull()
    expect(parsePeriodoSeguro('2026-07-15')).toBeNull()
    expect(parsePeriodoSeguro('')).toBeNull()
    expect(parsePeriodoSeguro(undefined)).toBeNull()
  })
})
