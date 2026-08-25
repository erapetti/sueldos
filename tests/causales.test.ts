/**
 * §4.6.1 y su divergencia — qué causales dejan mover el interruptor «Descontar horas» y con
 * qué valor arranca cada una. Es la tabla que decide si una falta resta horas en el paso 2
 * del cálculo, así que conviene tenerla fijada acá y no solo en la UI.
 */
import { describe, expect, it } from 'vitest'
import {
  CAUSALES_FALTA,
  descuentaEsEditable,
  descuentaInicial,
  normalizarDescuenta,
} from '@/constants/causales'

describe('§4.6.1 interruptor «Descontar horas» por causal', () => {
  const esperado = [
    { causal: 'CON_AVISO', inicial: true, editable: true },
    { causal: 'SIN_AVISO', inicial: true, editable: false },
    { causal: 'ENFERMEDAD', inicial: true, editable: true },
    { causal: 'MATERNIDAD', inicial: true, editable: false },
    { causal: 'RECUPERA_OTRO_DIA', inicial: false, editable: false },
  ] as const

  it('cubre todas las causales del Anexo B', () => {
    expect(CAUSALES_FALTA.map((c) => c.valor)).toEqual(esperado.map((e) => e.causal))
  })

  for (const { causal, inicial, editable } of esperado) {
    it(`${causal}: arranca en ${inicial} y ${editable ? 'se puede' : 'no se puede'} cambiar`, () => {
      expect(descuentaInicial(causal)).toBe(inicial)
      expect(descuentaEsEditable(causal)).toBe(editable)
    })
  }

  it('las que no son editables ignoran lo que llegue del cliente', () => {
    for (const { causal, inicial, editable } of esperado) {
      if (editable) continue
      expect(normalizarDescuenta(causal, true)).toBe(inicial)
      expect(normalizarDescuenta(causal, false)).toBe(inicial)
    }
  })

  it('las editables respetan lo elegido', () => {
    for (const causal of ['CON_AVISO', 'ENFERMEDAD'] as const) {
      expect(normalizarDescuenta(causal, true)).toBe(true)
      expect(normalizarDescuenta(causal, false)).toBe(false)
    }
  })
})
