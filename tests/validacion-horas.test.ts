/**
 * §4.5 y §4.6 — la cantidad de horas de una novedad tiene que ser > 0 y múltiplo
 * de 0,5. Se cubre acá porque es la única barrera del backend: el motor de cálculo
 * de boletos (§6.5) cuenta las fechas con horas extras registradas sin volver a
 * mirar la cantidad, así que confía en que estas validaciones ya la filtraron.
 */
import { describe, expect, it } from 'vitest'
import { renglonHoraExtra, renglonFalta } from '@/lib/validacion/esquemas'

function validarHorasExtra(horas: number) {
  const r = renglonHoraExtra.safeParse({
    fecha: '2026-08-01',
    horas,
    conBps: true,
    recargoPct: 100,
  })
  if (r.success) return { ok: true as const }
  return { ok: false as const, errores: r.error.issues.filter((i) => i.path[0] === 'horas').map((i) => i.message) }
}

function validarHorasFalta(horas: number) {
  const r = renglonFalta.safeParse({
    fecha: '2026-08-01',
    horas,
    causal: 'CON_AVISO',
    descuenta: true,
  })
  if (r.success) return { ok: true as const }
  return { ok: false as const, errores: r.error.issues.filter((i) => i.path[0] === 'horas').map((i) => i.message) }
}

describe('horas de una novedad — tienen que ser > 0', () => {
  it('rechaza el cero, que es el valor con el que arranca el renglón en la UI', () => {
    expect(validarHorasExtra(0).ok).toBe(false)
    expect(validarHorasFalta(0).ok).toBe(false)
  })

  it('rechaza negativos', () => {
    expect(validarHorasExtra(-1).ok).toBe(false)
    expect(validarHorasExtra(-0.5).ok).toBe(false)
    expect(validarHorasFalta(-8).ok).toBe(false)
  })

  it('el mensaje dice que tiene que ser mayor que cero', () => {
    expect(validarHorasExtra(0).errores).toContain('Tiene que ser mayor que cero')
  })

  it('acepta múltiplos de media hora', () => {
    expect(validarHorasExtra(0.5).ok).toBe(true)
    expect(validarHorasExtra(3).ok).toBe(true)
    expect(validarHorasFalta(8).ok).toBe(true)
  })

  it('rechaza cantidades que no son múltiplo de 0,5', () => {
    expect(validarHorasExtra(1.25).ok).toBe(false)
    expect(validarHorasFalta(0.1).ok).toBe(false)
  })
})
