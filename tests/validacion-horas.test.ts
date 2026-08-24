/**
 * §4.5 y §4.6 — la cantidad de horas de una novedad tiene que ser múltiplo de 0,5.
 *
 * Las inasistencias exigen además que sea > 0. Las horas extras **admiten el cero**: un
 * renglón en cero no paga nada y existe solo para que ese día entre en el cálculo de
 * boletos (§6.5), que cuenta las fechas con horas extras registradas sin mirar la cantidad.
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

describe('horas de una novedad', () => {
  it('la inasistencia rechaza el cero, que es el valor con el que arranca el renglón', () => {
    expect(validarHorasFalta(0).ok).toBe(false)
  })

  it('§6.5 — la hora extra acepta el cero: marca el día para el boleto', () => {
    expect(validarHorasExtra(0).ok).toBe(true)
  })

  it('rechaza negativos', () => {
    expect(validarHorasExtra(-1).ok).toBe(false)
    expect(validarHorasExtra(-0.5).ok).toBe(false)
    expect(validarHorasFalta(-8).ok).toBe(false)
  })

  it('el mensaje de la inasistencia dice que tiene que ser mayor que cero', () => {
    expect(validarHorasFalta(0).errores).toContain('Tiene que ser mayor que cero')
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
