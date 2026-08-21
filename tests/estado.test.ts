/**
 * §12 — pruebas del estado derivado del empleado (§4.2.3), casos 34 a 41.
 */
import { describe, expect, it } from 'vitest'
import { estadoEmpleado, faltaLiquidacion, type EntradaEstado } from '@/lib/calculo/estado'
import { periodoDe } from '@/lib/format/dates'
import { f } from './helpers'

function entrada(over: Partial<EntradaEstado> = {}): EntradaEstado {
  return {
    hoy: f('2026-04-10'),
    fechaIngreso: f('2020-01-01'),
    fechaEgreso: null,
    periodosMensualesConfirmados: [],
    hayLiquidacionImpaga: false,
    ...over,
  }
}

describe('34. día 10, mes anterior liquidado y pagado, mes en curso sin liquidar', () => {
  it('da Activo: el umbral del 23 todavía no se alcanzó', () => {
    const e = entrada({
      hoy: f('2026-04-10'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
    })
    expect(faltaLiquidacion(e)).toBe(false)
    expect(estadoEmpleado(e)).toBe('ACTIVO')
  })
})

describe('35. día 23, mismo escenario', () => {
  it('da Falta liquidación', () => {
    const e = entrada({
      hoy: f('2026-04-23'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
    })
    expect(estadoEmpleado(e)).toBe('FALTA_LIQUIDACION')
  })

  it('el día 22 todavía no', () => {
    const e = entrada({
      hoy: f('2026-04-22'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
    })
    expect(estadoEmpleado(e)).toBe('ACTIVO')
  })

  it('el día 23 con el mes en curso ya liquidado da Activo', () => {
    const e = entrada({
      hoy: f('2026-04-23'),
      periodosMensualesConfirmados: [periodoDe(2026, 3), periodoDe(2026, 4)],
    })
    expect(estadoEmpleado(e)).toBe('ACTIVO')
  })
})

describe('36. día 5 y mes anterior sin liquidar', () => {
  it('da Falta liquidación sin que intervenga el umbral del 23', () => {
    const e = entrada({ hoy: f('2026-04-05'), periodosMensualesConfirmados: [] })
    expect(estadoEmpleado(e)).toBe('FALTA_LIQUIDACION')
  })
})

describe('37. precedencia de Falta pagar sobre Falta liquidación', () => {
  it('mes anterior liquidado sin pago registrado da Falta pagar', () => {
    const e = entrada({
      hoy: f('2026-04-10'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
      hayLiquidacionImpaga: true,
    })
    expect(estadoEmpleado(e)).toBe('FALTA_PAGAR')
  })

  it('aunque además falte liquidar el mes en curso', () => {
    const e = entrada({
      hoy: f('2026-04-25'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
      hayLiquidacionImpaga: true,
    })
    expect(faltaLiquidacion(e)).toBe(true)
    expect(estadoEmpleado(e)).toBe('FALTA_PAGAR')
  })
})

describe('38. empleado dado de baja con la liquidación final impaga', () => {
  it('muestra Falta pagar, no Baja', () => {
    const e = entrada({
      hoy: f('2026-04-10'),
      fechaEgreso: f('2026-03-20'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
      hayLiquidacionImpaga: true,
    })
    expect(estadoEmpleado(e)).toBe('FALTA_PAGAR')
  })
})

describe('39. empleado dado de baja con todo liquidado y pagado', () => {
  it('muestra Baja', () => {
    const e = entrada({
      hoy: f('2026-04-10'),
      fechaEgreso: f('2026-03-20'),
      periodosMensualesConfirmados: [periodoDe(2026, 3)],
      hayLiquidacionImpaga: false,
    })
    expect(estadoEmpleado(e)).toBe('BAJA')
  })
})

describe('40. empleado que ingresó este mes', () => {
  it('no se le exige la liquidación del mes anterior', () => {
    const e = entrada({ hoy: f('2026-04-10'), fechaIngreso: f('2026-04-06') })
    expect(faltaLiquidacion(e)).toBe(false)
    expect(estadoEmpleado(e)).toBe('ACTIVO')
  })

  it('pero pasado el 23 sí se le exige la del mes en curso', () => {
    const e = entrada({ hoy: f('2026-04-23'), fechaIngreso: f('2026-04-06') })
    expect(estadoEmpleado(e)).toBe('FALTA_LIQUIDACION')
  })
})

describe('41. empleado dado de baja hace tres meses', () => {
  it('no se le exigen liquidaciones posteriores al egreso', () => {
    const e = entrada({
      hoy: f('2026-04-10'),
      fechaEgreso: f('2026-01-20'),
      periodosMensualesConfirmados: [periodoDe(2026, 1)],
    })
    expect(faltaLiquidacion(e)).toBe(false)
    expect(estadoEmpleado(e)).toBe('BAJA')
  })

  it('ni siquiera pasado el día 23', () => {
    const e = entrada({
      hoy: f('2026-04-25'),
      fechaEgreso: f('2026-01-20'),
      periodosMensualesConfirmados: [periodoDe(2026, 1)],
    })
    expect(estadoEmpleado(e)).toBe('BAJA')
  })

  it('si le falta liquidar el mes del egreso, sí lo reclama', () => {
    const e = entrada({
      hoy: f('2026-02-10'),
      fechaEgreso: f('2026-01-20'),
      periodosMensualesConfirmados: [],
    })
    expect(estadoEmpleado(e)).toBe('FALTA_LIQUIDACION')
  })
})

describe('cambio de año', () => {
  it('en enero el mes anterior es diciembre del año pasado', () => {
    const e = entrada({
      hoy: f('2026-01-10'),
      periodosMensualesConfirmados: [periodoDe(2025, 12)],
    })
    expect(estadoEmpleado(e)).toBe('ACTIVO')

    const sinDiciembre = entrada({ hoy: f('2026-01-10'), periodosMensualesConfirmados: [] })
    expect(estadoEmpleado(sinDiciembre)).toBe('FALTA_LIQUIDACION')
  })
})
