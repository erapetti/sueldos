/**
 * §12 — pruebas de licencia, casos 24, 25, 27, 29, 30, 31 y 32.
 * Los casos 26, 28 y 33, que dependen de la base, están en tests/integracion.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  aniversariosPendientes,
  calcularDiasHabiles,
  calcularSalarioVacacional,
  diasDeLicencia,
  diasGeneradosPorAniversario,
  saldoDiasLicencia,
  seSuperponen,
} from '@/lib/calculo/licencias'
import { calcularLiquidacionMensual } from '@/lib/calculo/liquidacion'
import { aniversario, antiguedadEnAnios } from '@/lib/format/dates'
import { D, entradaBase, f, falta } from './helpers'

describe('24. días hábiles de un período de licencia (§4.15.3)', () => {
  it('descuenta domingos y feriados no laborables, pero no sábados', () => {
    // Lunes 6/4/2026 al domingo 19/4/2026: 14 días corridos, 2 domingos (12 y 19).
    const r = calcularDiasHabiles(f('2026-04-06'), f('2026-04-19'), [])
    expect(r.diasCorridos).toBe(14)
    expect(r.domingos).toBe(2)
    expect(r.feriados).toBe(0)
    expect(r.diasHabiles.toString()).toBe('12')
  })

  it('un feriado no laborable en día hábil se descuenta', () => {
    const r = calcularDiasHabiles(f('2026-04-06'), f('2026-04-19'), [
      { fecha: f('2026-04-08'), noLaborable: true },
    ])
    expect(r.feriados).toBe(1)
    expect(r.diasHabiles.toString()).toBe('11')
  })

  it('un feriado con no_laborable = false cuenta como hábil', () => {
    const r = calcularDiasHabiles(f('2026-04-06'), f('2026-04-19'), [
      { fecha: f('2026-04-08'), noLaborable: false },
    ])
    expect(r.feriados).toBe(0)
    expect(r.diasHabiles.toString()).toBe('12')
  })

  it('un domingo que además es feriado se descuenta una sola vez', () => {
    // Domingo 12/4/2026 declarado feriado.
    const r = calcularDiasHabiles(f('2026-04-06'), f('2026-04-19'), [
      { fecha: f('2026-04-12'), noLaborable: true },
    ])
    expect(r.domingos).toBe(2)
    expect(r.feriados).toBe(0)
    expect(r.diasHabiles.toString()).toBe('12')
  })

  it('no depende del régimen horario: los sábados cuentan', () => {
    // Sábado 11/4/2026 solo: 1 día corrido, 0 domingos.
    const r = calcularDiasHabiles(f('2026-04-11'), f('2026-04-11'), [])
    expect(r.diasHabiles.toString()).toBe('1')
  })

  it('un solo día que es domingo da 0 días hábiles', () => {
    expect(calcularDiasHabiles(f('2026-04-12'), f('2026-04-12'), []).diasHabiles.toString()).toBe('0')
  })

  it('un período de 20 días corridos típico', () => {
    // Lunes 6/4 al sábado 25/4: 20 días corridos, domingos 12 y 19.
    const r = calcularDiasHabiles(f('2026-04-06'), f('2026-04-25'), [])
    expect(r.diasCorridos).toBe(20)
    expect(r.diasHabiles.toString()).toBe('18')
  })
})

describe('25. salario vacacional (§7.11)', () => {
  it('salario / 30 × días hábiles', () => {
    expect(calcularSalarioVacacional(D(65000), D(12)).toFixed(2)).toBe('26000.00')
    expect(calcularSalarioVacacional(D(60000), D(20)).toFixed(2)).toBe('40000.00')
  })

  it('se registra en pesos enteros', () => {
    // 57.777 / 30 × 11 = 21.184,90 -> 21.185
    expect(calcularSalarioVacacional(D(57777), D(11)).toFixed(2)).toBe('21185.00')
    expect(calcularSalarioVacacional(D(57777), D(11)).isInteger()).toBe(true)
  })

  it('con 0 días hábiles da 0', () => {
    expect(calcularSalarioVacacional(D(65000), D(0)).toFixed(2)).toBe('0.00')
  })
})

describe('27. licencia mayor al saldo disponible', () => {
  it('el saldo queda negativo, sin bloquear', () => {
    const movimientos = [
      { debe: D(0), haber: D(20) },
      { debe: D(25), haber: D(0) },
    ]
    expect(saldoDiasLicencia(movimientos).toString()).toBe('-5')
  })

  it('el saldo acumula generaciones y goces', () => {
    const movimientos = [
      { debe: D(0), haber: D(20) },
      { debe: D(0), haber: D(21) },
      { debe: D(12), haber: D(0) },
      { debe: D(5), haber: D(0) },
    ]
    expect(saldoDiasLicencia(movimientos).toString()).toBe('24')
  })
})

describe('28. períodos superpuestos (§4.15.2)', () => {
  it('detecta la superposición en cualquier orden', () => {
    expect(seSuperponen(f('2026-04-06'), f('2026-04-17'), f('2026-04-15'), f('2026-04-20'))).toBe(true)
    expect(seSuperponen(f('2026-04-15'), f('2026-04-20'), f('2026-04-06'), f('2026-04-17'))).toBe(true)
  })

  it('un solo día compartido ya es superposición', () => {
    expect(seSuperponen(f('2026-04-06'), f('2026-04-17'), f('2026-04-17'), f('2026-04-20'))).toBe(true)
  })

  it('períodos consecutivos sin solaparse no lo son', () => {
    expect(seSuperponen(f('2026-04-06'), f('2026-04-17'), f('2026-04-18'), f('2026-04-20'))).toBe(false)
  })

  it('un período contenido en otro sí lo es', () => {
    expect(seSuperponen(f('2026-04-06'), f('2026-04-30'), f('2026-04-10'), f('2026-04-12'))).toBe(true)
  })
})

describe('29. los días de licencia descuentan boletos y no descuentan sueldo (§6.4)', () => {
  it('no resta sueldo pero sí los boletos de esos días', () => {
    // Del lunes 6/4 al viernes 10/4: 5 días laborables del régimen.
    const r = calcularLiquidacionMensual(
      entradaBase({ diasLicencia: diasDeLicencia(f('2026-04-06'), f('2026-04-10')) }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
    expect(r.boletos!.diasATrabajar).toBe(17) // 22 − 5
  })

  it('los días de licencia que caen en sábado o domingo no cambian nada', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ diasLicencia: diasDeLicencia(f('2026-04-11'), f('2026-04-12')) }),
    )
    expect(r.boletos!.diasATrabajar).toBe(22)
  })

  it('un día de licencia que además es feriado se descuenta una sola vez', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        diasLicencia: diasDeLicencia(f('2026-04-30'), f('2026-04-30')),
        feriados: [{ fecha: f('2026-04-30'), noLaborable: true }],
      }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
  })

  it('un día de licencia que además tiene falta registrada se descuenta una sola vez', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        diasLicencia: diasDeLicencia(f('2026-04-08'), f('2026-04-08')),
        faltas: [falta('2026-04-08', 6)],
      }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
  })
})

describe('30. generación anual de días (§4.15.4)', () => {
  it.each([
    [1, 20],
    [2, 20],
    [3, 20],
    [4, 20],
    [5, 21],
    [6, 21],
    [7, 21],
    [8, 22],
    [11, 22],
    [12, 23],
    [15, 23],
    [16, 24],
  ])('aniversario %i genera %i días', (n, dias) => {
    expect(diasGeneradosPorAniversario(n)).toBe(dias)
  })

  it('el aniversario 4 da 20, no 21, aunque int(4/4) sea 1', () => {
    expect(diasGeneradosPorAniversario(4)).toBe(20)
    expect(diasGeneradosPorAniversario(5)).toBe(21)
  })

  it('n = 0 no genera nada', () => {
    expect(diasGeneradosPorAniversario(0)).toBe(0)
  })
})

describe('31. antigüedad (§4.15.4)', () => {
  it('es 0 durante todo el primer año', () => {
    const ingreso = f('2025-06-10')
    expect(antiguedadEnAnios(ingreso, f('2025-06-10'))).toBe(0)
    expect(antiguedadEnAnios(ingreso, f('2025-12-31'))).toBe(0)
    expect(antiguedadEnAnios(ingreso, f('2026-06-09'))).toBe(0)
  })

  it('pasa a 1 el día del primer aniversario', () => {
    const ingreso = f('2025-06-10')
    expect(antiguedadEnAnios(ingreso, f('2026-06-10'))).toBe(1)
    expect(antiguedadEnAnios(ingreso, f('2027-06-09'))).toBe(1)
    expect(antiguedadEnAnios(ingreso, f('2027-06-10'))).toBe(2)
  })
})

describe('32. ingreso el 29/02', () => {
  it('el aniversario cae el 28/02 en los años no bisiestos', () => {
    const ingreso = f('2024-02-29')
    expect(aniversario(ingreso, 1).toISOString().slice(0, 10)).toBe('2025-02-28')
    expect(aniversario(ingreso, 2).toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(aniversario(ingreso, 3).toISOString().slice(0, 10)).toBe('2027-02-28')
  })

  it('vuelve al 29/02 en los años bisiestos', () => {
    expect(aniversario(f('2024-02-29'), 4).toISOString().slice(0, 10)).toBe('2028-02-29')
  })

  it('la antigüedad se cuenta contra esa fecha', () => {
    const ingreso = f('2024-02-29')
    expect(antiguedadEnAnios(ingreso, f('2025-02-27'))).toBe(0)
    expect(antiguedadEnAnios(ingreso, f('2025-02-28'))).toBe(1)
  })
})

describe('aniversarios pendientes (§7.12)', () => {
  it('devuelve todos los que quedaron atrasados, no solo el de hoy', () => {
    const pendientes = aniversariosPendientes(f('2020-03-15'), f('2026-08-18'), [])
    expect(pendientes.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(pendientes.map((p) => p.dias)).toEqual([20, 20, 20, 20, 21, 21])
  })

  it('saltea los que ya fueron acreditados', () => {
    const pendientes = aniversariosPendientes(f('2020-03-15'), f('2026-08-18'), [1, 2, 3])
    expect(pendientes.map((p) => p.n)).toEqual([4, 5, 6])
  })

  it('no adelanta un aniversario que todavía no llegó', () => {
    // El aniversario 7 cae el 15/03/2027.
    const pendientes = aniversariosPendientes(f('2020-03-15'), f('2027-03-14'), [1, 2, 3, 4, 5, 6])
    expect(pendientes).toHaveLength(0)
  })

  it('lo acredita el mismo día del aniversario', () => {
    const pendientes = aniversariosPendientes(f('2020-03-15'), f('2027-03-15'), [1, 2, 3, 4, 5, 6])
    expect(pendientes.map((p) => p.n)).toEqual([7])
    expect(pendientes[0].dias).toBe(21)
  })

  it('un empleado con menos de un año no genera nada', () => {
    expect(aniversariosPendientes(f('2026-01-10'), f('2026-08-18'), [])).toHaveLength(0)
  })

  it('cada pendiente trae la fecha del aniversario', () => {
    const pendientes = aniversariosPendientes(f('2024-02-29'), f('2026-08-18'), [])
    expect(pendientes.map((p) => p.fecha.toISOString().slice(0, 10))).toEqual([
      '2025-02-28',
      '2026-02-28',
    ])
  })
})

describe('días comprendidos en un período de licencia', () => {
  it('devuelve todos los días corridos, extremos inclusive', () => {
    const dias = diasDeLicencia(f('2026-04-06'), f('2026-04-10'))
    expect(dias).toHaveLength(5)
    expect(dias[0].toISOString().slice(0, 10)).toBe('2026-04-06')
    expect(dias[4].toISOString().slice(0, 10)).toBe('2026-04-10')
  })

  it('un solo día da un solo elemento', () => {
    expect(diasDeLicencia(f('2026-04-06'), f('2026-04-06'))).toHaveLength(1)
  })
})
