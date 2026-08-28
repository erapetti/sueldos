/**
 * La empleada sin régimen horario: existe, no aporta al BPS y todo lo suyo son horas extras
 * sin aportes y pagos adicionales.
 *
 * El régimen vacío **es un registro con los siete días en cero**, no la ausencia de registro:
 * así el §6.8 no corta por `REGIMEN` faltante y la resolución de series del §5.2 sigue
 * funcionando igual. Por decisión del dueño del proyecto el salario la acompaña: sin jornada
 * tampoco hay salario, porque el valor hora calculado del §4.3 sería una división por cero.
 *
 * La invariante que sale de ahí, en las dos direcciones: **aportar al BPS exige un régimen con
 * horas**. La parte que necesita la base —las dos series condicionándose por período— está en
 * `integracion.test.ts`.
 *
 * Calendario de referencia: abril de 2026 arranca miércoles y tiene 22 días de lunes a viernes.
 */
import { describe, expect, it } from 'vitest'
import { calcularLiquidacionMensual, valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { CODIGOS } from '@/lib/calculo/tipos'
import { altaEmpleado, nuevoSalario } from '@/lib/validacion/esquemas'
import { D, entradaBase, f, horaExtra, regimen } from './helpers'

/** La empleada del caso: sin jornada, sin salario y sin aporte. */
function sinRegimen(over: Parameters<typeof entradaBase>[0] = {}) {
  return entradaBase({
    salario: { salario: D(0), horasSemanales: D(0) },
    regimen: regimen(0, 0, 0, 0, 0, 0, 0),
    aporteBps: { aportaBps: false, seguroSalud: null },
    valorHoraNegro: D(300),
    ...over,
  })
}

describe('valor hora calculado sin horas semanales', () => {
  it('da cero en vez de dividir por cero', () => {
    expect(valorHoraCalculado({ salario: D(0), horasSemanales: D(0) }).toFixed(2)).toBe('0.00')
  })
})

describe('liquidación de la empleada sin régimen', () => {
  it('§6.8 — no corta por dato faltante: el régimen en cero es un registro', () => {
    expect(() => calcularLiquidacionMensual(sinRegimen())).not.toThrow()
  })

  it('liquida sus horas extras sin aportes y sus pagos adicionales, todo en la informal', () => {
    const r = calcularLiquidacionMensual(
      sinRegimen({
        horasExtras: [horaExtra('2026-04-08', 4, false, 0)],
        pagosAdicionales: [{ fecha: f('2026-04-15'), monto: D(1000), concepto: 'Premio' }],
      }),
    )

    expect(r.lineas.every((l) => l.tabla === 'INFORMAL')).toBe(true)
    expect(r.totalRecalculadoFormal.toFixed(2)).toBe('0.00')

    const extras = r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_SIN_BPS)!
    // 4 h × $300 del valor hora sin aportes.
    expect(extras.importe.toFixed(2)).toBe('1200.00')
  })

  it('el salario base queda en cero y no hay descuentos de BPS', () => {
    const r = calcularLiquidacionMensual(sinRegimen())
    expect(r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!.importe.toFixed(2)).toBe('0.00')
    expect(r.totalDescuentosBps.toFixed(2)).toBe('0.00')
  })

  /*
    §6.5 — lo que ya funcionaba solo: con el régimen en cero `días_a_trabajar` da 0, así que
    los únicos boletos son los de los días con horas extras. Es justo el caso de esta empleada.
  */
  it('los boletos son solo los días con horas extras (§6.5)', () => {
    const r = calcularLiquidacionMensual(
      sinRegimen({ horasExtras: [horaExtra('2026-04-08', 4, false, 0)] }),
    )
    expect(r.boletos!.diasATrabajar).toBe(0)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.BOLETOS)!.cantidad!.toString()).toBe('2')
  })
})

describe('salario y horas semanales van los dos en cero o los dos en positivo', () => {
  const salarioBase = {
    empleadoId: 'e1',
    fechaVigencia: '2026-04-01',
    reemplazar: false,
  }

  it('acepta el par en cero: es la empleada sin régimen', () => {
    expect(nuevoSalario.safeParse({ ...salarioBase, salario: '0', horasSemanales: 0 }).success).toBe(
      true,
    )
  })

  it('rechaza el salario en cero con horas semanales', () => {
    const r = nuevoSalario.safeParse({ ...salarioBase, salario: '0', horasSemanales: 40 })
    expect(r.success).toBe(false)
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('horasSemanales')
  })

  it('rechaza el salario positivo sin horas semanales: no habría valor hora', () => {
    const r = nuevoSalario.safeParse({ ...salarioBase, salario: '50000', horasSemanales: 0 })
    expect(r.success).toBe(false)
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('salario')
  })
})

describe('el alta sin régimen', () => {
  const alta = (over: Record<string, unknown>) =>
    altaEmpleado.safeParse({
      alias: 'Sin régimen',
      nombreCompleto: 'Empleada Sin Régimen',
      fechaIngreso: '2026-04-01',
      cobraBoletos: true,
      aportaBps: false,
      salario: '0',
      horasSemanales: 0,
      valorHoraNegro: '300',
      regimen: {
        lunes: 0,
        martes: 0,
        miercoles: 0,
        jueves: 0,
        viernes: 0,
        sabado: 0,
        domingo: 0,
      },
      ...over,
    })

  it('se puede dar de alta sin jornada, sin salario y sin aporte', () => {
    expect(alta({}).success).toBe(true)
  })

  it('sin horas semanales no puede aportar al BPS', () => {
    const r = alta({ aportaBps: true })
    expect(r.success).toBe(false)
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('aportaBps')
  })

  it('el valor hora sin aportes sigue siendo obligatorio: es con lo que se le paga', () => {
    expect(alta({ valorHoraNegro: '0' }).success).toBe(false)
  })
})
