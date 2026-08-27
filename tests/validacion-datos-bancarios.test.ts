/**
 * §4.2 — los datos bancarios son opcionales: banco y número de cuenta se conocen
 * juntos o no se conocen. La cuenta además admite el guion como separador de
 * cuenta-subcuenta.
 */
import { describe, expect, it } from 'vitest'
import { datosEmpleado } from '@/lib/validacion/esquemas'

/** Valida un campo bancario, con el resto del empleado en valores válidos. */
function validar(campos: { banco?: string; cuenta?: string }) {
  const resultado = datosEmpleado.safeParse({
    alias: 'Ana',
    nombreCompleto: 'Ana Pereyra',
    banco: 'BROU',
    ...campos,
    fechaIngreso: '2026-01-01',
    cobraBoletos: true,
  })
  const clave = 'banco' in campos ? 'banco' : 'cuenta'
  if (resultado.success) return { ok: true as const, valor: resultado.data[clave] }
  const propios = resultado.error.issues.filter((i) => i.path[0] === clave)
  return { ok: propios.length === 0, errores: propios.map((i) => i.message) }
}

const validarCuenta = (cuenta: string | undefined) => validar({ cuenta })
const validarBanco = (banco: string | undefined) => validar({ banco })

describe('cuenta bancaria — opcional', () => {
  it('acepta la cadena vacía', () => {
    expect(validarCuenta('').ok).toBe(true)
  })

  it('acepta que el campo no venga', () => {
    expect(validarCuenta(undefined).ok).toBe(true)
  })

  it('acepta solo espacios, que se normalizan a vacío', () => {
    const r = validarCuenta('   ')
    expect(r.ok).toBe(true)
  })
})

describe('cuenta bancaria — formato', () => {
  it('acepta alfanumérica sin guion', () => {
    expect(validarCuenta('001234567').ok).toBe(true)
    expect(validarCuenta('AB4455661').ok).toBe(true)
  })

  it('acepta el guion como separador de cuenta-subcuenta', () => {
    expect(validarCuenta('1234567-001').ok).toBe(true)
    expect(validarCuenta('123-45-678').ok).toBe(true)
  })

  it('rechaza el guion al principio o al final', () => {
    expect(validarCuenta('-1234567').ok).toBe(false)
    expect(validarCuenta('1234567-').ok).toBe(false)
  })

  it('rechaza guiones consecutivos', () => {
    expect(validarCuenta('123--456').ok).toBe(false)
  })

  it('rechaza otros separadores y símbolos', () => {
    expect(validarCuenta('123/456').ok).toBe(false)
    expect(validarCuenta('123 456').ok).toBe(false)
    expect(validarCuenta('123.456').ok).toBe(false)
  })

  it('rechaza más de 32 caracteres', () => {
    expect(validarCuenta('1'.repeat(32)).ok).toBe(true)
    expect(validarCuenta('1'.repeat(33)).ok).toBe(false)
  })
})

describe('banco — opcional', () => {
  it('acepta la cadena vacía', () => {
    expect(validarBanco('').ok).toBe(true)
  })

  it('acepta que el campo no venga', () => {
    expect(validarBanco(undefined).ok).toBe(true)
  })

  it('acepta solo espacios', () => {
    expect(validarBanco('   ').ok).toBe(true)
  })

  it('acepta un nombre de banco normal', () => {
    expect(validarBanco('BROU').ok).toBe(true)
    expect(validarBanco('Banco de la República Oriental del Uruguay').ok).toBe(true)
  })

  it('rechaza más de 120 caracteres', () => {
    expect(validarBanco('B'.repeat(120)).ok).toBe(true)
    expect(validarBanco('B'.repeat(121)).ok).toBe(false)
  })
})
