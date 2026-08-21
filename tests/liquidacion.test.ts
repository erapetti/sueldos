/**
 * §12 — pruebas obligatorias del motor de cálculo, casos 1 a 17 y 23.
 *
 * Calendario de referencia: abril de 2026 tiene 30 días, arranca miércoles, tiene 22 días
 * de lunes a viernes y 4 sábados. Marzo de 2026 tiene 31 días y 22 de lunes a viernes.
 *
 * Empleado base: $65.000 por 30 h semanales, régimen de lunes a viernes de 6 h.
 * Valor hora calculado = 65.000 / (30 × 52/12) = 65.000 / 130 = $500 exactos (§4.3).
 */
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { calcularLiquidacionMensual, valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { resolverConceptosBps, type FilaBpsConcepto } from '@/lib/calculo/bps'
import { vigenteEn } from '@/lib/calculo/series'
import { ErrorDatosFaltantes } from '@/lib/calculo/errores'
import { CODIGOS } from '@/lib/calculo/tipos'
import { RECARGOS } from '@/constants/recargos'
import { periodoDe } from '@/lib/format/dates'
import {
  D,
  conceptoBps,
  entradaBase,
  f,
  falta,
  horaExtra,
  lineasCon,
  regimen,
  regimenLunesAViernes,
  sumarLineas,
} from './helpers'

const VHC = D(500)
const VHN = D(300)

describe('1. liquidación simple sin novedades', () => {
  it('paga el salario íntegro más los boletos de los días trabajados', () => {
    const r = calcularLiquidacionMensual(entradaBase())

    expect(r.valorHoraCalculado.toString()).toBe(VHC.toString())
    expect(r.factorProrrateo.toString()).toBe('1')
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
    expect(r.boletos).toEqual({ diasATrabajar: 22, diasExtraConBoleto: 0, boletos: 44 })
    // 65.000 + 44 boletos × $50 = 67.200
    expect(r.totalRecalculado.toFixed(2)).toBe('67200.00')
    expect(r.totalAPagar.toFixed(2)).toBe('67200.00')
  })

  it('no emite líneas de faltas, horas extras ni descuentos', () => {
    const r = calcularLiquidacionMensual(entradaBase())
    expect(lineasCon(r.lineas, CODIGOS.FALTAS)).toBe(0)
    expect(lineasCon(r.lineas, CODIGOS.HORAS_EXTRAS_CON_BPS)).toBe(0)
    expect(lineasCon(r.lineas, CODIGOS.DESCUENTO_BPS)).toBe(0)
  })

  it('el orden de las líneas es el de los 11 pasos del §6.2', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        conceptosBps: [conceptoBps('Montepío', 15)],
        faltas: [falta('2026-04-08', 3)],
        horasExtras: [horaExtra('2026-04-09', 1, true, 0), horaExtra('2026-04-10', 1, false, 0)],
        pagosAdicionales: [{ fecha: f('2026-04-15'), monto: D(1000), concepto: 'Premio' }],
        cuotasPlan: [{ fecha: f('2026-04-01'), monto: D(500), yaAplicada: false }],
      }),
    )

    expect(r.lineas.map((l) => l.codigo)).toEqual([
      CODIGOS.SALARIO_BASE,
      CODIGOS.FALTAS,
      CODIGOS.HORAS_EXTRAS_CON_BPS,
      CODIGOS.MATERIA_GRAVADA,
      CODIGOS.DESCUENTO_BPS,
      CODIGOS.SUBTOTAL,
      CODIGOS.PAGO_ADICIONAL,
      CODIGOS.CUOTA_PLAN,
      CODIGOS.BOLETOS,
      CODIGOS.HORAS_EXTRAS_SIN_BPS,
      CODIGOS.TOTAL,
    ])
    // Los pasos 6 y 11 se muestran destacados.
    expect(r.lineas.filter((l) => l.destacada).map((l) => l.codigo)).toEqual([
      CODIGOS.SUBTOTAL,
      CODIGOS.TOTAL,
    ])
  })
})

describe('2. faltas parciales y de día completo', () => {
  it('la falta parcial descuenta sueldo pero no el boleto', () => {
    // Miércoles 8/4/2026: 3 de las 6 horas del día.
    const r = calcularLiquidacionMensual(entradaBase({ faltas: [falta('2026-04-08', 3)] }))

    expect(r.boletos!.diasATrabajar).toBe(22)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.FALTAS)!.importe.toFixed(2)).toBe('1500.00')
    expect(r.materiaGravada.toFixed(2)).toBe('63500.00')
  })

  it('la falta de jornada completa descuenta sueldo y boleto', () => {
    const r = calcularLiquidacionMensual(entradaBase({ faltas: [falta('2026-04-08', 6)] }))

    expect(r.boletos!.diasATrabajar).toBe(21)
    expect(r.materiaGravada.toFixed(2)).toBe('62000.00')
  })

  it('varias faltas parciales del mismo día que suman la jornada descuentan el boleto', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ faltas: [falta('2026-04-08', 3), falta('2026-04-08', 3)] }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
    expect(r.materiaGravada.toFixed(2)).toBe('62000.00')
  })

  it('una falta en un día sin horas en el régimen no cambia los boletos', () => {
    // Sábado 11/4/2026.
    const r = calcularLiquidacionMensual(entradaBase({ faltas: [falta('2026-04-11', 2)] }))
    expect(r.boletos!.diasATrabajar).toBe(22)
  })
})

describe('3. horas extras con y sin BPS', () => {
  it('las de con_bps entran antes de los descuentos y las de sin_bps al final', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        conceptosBps: [conceptoBps('Montepío', 15)],
        horasExtras: [horaExtra('2026-04-08', 2, true, 100), horaExtra('2026-04-09', 2, false, 100)],
      }),
    )

    // Con BPS: 2 h × 500 × 2 = 2.000, dentro de la materia gravada
    expect(r.materiaGravada.toFixed(2)).toBe('67000.00')
    // El descuento cae sobre la materia gravada ya aumentada
    expect(r.totalDescuentosBps.toFixed(2)).toBe('10050.00')
    // Sin BPS: 2 h × 300 × 2 = 1.200, después de los boletos y sin descuento
    const sinBps = r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_SIN_BPS)!
    expect(sinBps.importe.toFixed(2)).toBe('1200.00')
    expect(sinBps.orden).toBeGreaterThan(r.lineas.find((l) => l.codigo === CODIGOS.BOLETOS)!.orden)
  })

  it('la hora extra con BPS se paga al valor hora calculado, no al "en negro"', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ horasExtras: [horaExtra('2026-04-08', 1, true, 0)] }),
    )
    expect(r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_CON_BPS)!.importe.toFixed(2)).toBe(
      '500.00',
    )
  })
})

describe('4. los ocho porcentajes de recargo del Anexo B', () => {
  it.each(RECARGOS)('recargo %i %% con BPS, al valor hora calculado', (recargoPct) => {
    const r = calcularLiquidacionMensual(
      entradaBase({ horasExtras: [horaExtra('2026-04-08', 2, true, recargoPct)] }),
    )
    const esperado = VHC.times(1 + recargoPct / 100).times(2)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_CON_BPS)!.importe.toFixed(2)).toBe(
      esperado.toFixed(2),
    )
  })

  it.each(RECARGOS)('recargo %i %% sin BPS, al valor hora "en negro"', (recargoPct) => {
    const r = calcularLiquidacionMensual(
      entradaBase({ horasExtras: [horaExtra('2026-04-08', 2, false, recargoPct)] }),
    )
    const esperado = VHN.times(1 + recargoPct / 100).times(2)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_SIN_BPS)!.importe.toFixed(2)).toBe(
      esperado.toFixed(2),
    )
  })

  it('emite una línea por recargo distinto y agrupa las del mismo recargo', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        horasExtras: [
          horaExtra('2026-04-08', 1, true, 0),
          horaExtra('2026-04-09', 1, true, 100),
          horaExtra('2026-04-10', 1, true, 100),
        ],
      }),
    )
    const lineas = r.lineas.filter((l) => l.codigo === CODIGOS.HORAS_EXTRAS_CON_BPS)
    expect(lineas).toHaveLength(2)
    expect(lineas[1].cantidad!.toString()).toBe('2') // las dos de recargo 100 %
  })
})

describe('5. horas extras en un día no laborable del régimen', () => {
  it('generan boletos adicionales (§6.5)', () => {
    // Sábado 11/4/2026: el régimen no tiene horas ese día.
    const r = calcularLiquidacionMensual(
      entradaBase({ horasExtras: [horaExtra('2026-04-11', 4, true, 100)] }),
    )
    expect(r.boletos).toEqual({ diasATrabajar: 22, diasExtraConBoleto: 1, boletos: 46 })
  })

  it('no dependen de con_bps y no duplican un día ya contado', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        horasExtras: [
          horaExtra('2026-04-11', 2, false, 0), // sábado: suma un día
          horaExtra('2026-04-11', 2, true, 0), // el mismo sábado: no lo suma de nuevo
          horaExtra('2026-04-08', 2, true, 0), // miércoles laborable: no suma
        ],
      }),
    )
    expect(r.boletos!.diasExtraConBoleto).toBe(1)
  })

  it('no genera boletos adicionales si el empleado no cobra boletos', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        empleado: { ...entradaBase().empleado, cobraBoletos: false },
        horasExtras: [horaExtra('2026-04-11', 4, true, 0)],
      }),
    )
    expect(r.boletos).toBeNull()
  })
})

describe('6 y 7. resolución de conceptos de BPS (§4.11)', () => {
  const filas: FilaBpsConcepto[] = [
    { concepto: 'Montepío', porcentaje: D(15), seguroSalud: null, fechaVigencia: f('2024-01-01') },
    { concepto: 'FRL', porcentaje: D('0.1'), seguroSalud: null, fechaVigencia: f('2024-01-01') },
    { concepto: 'FONASA', porcentaje: D(3), seguroSalud: '15', fechaVigencia: f('2024-01-01') },
    { concepto: 'FONASA', porcentaje: D(6), seguroSalud: '16', fechaVigencia: f('2024-01-01') },
  ]

  it('6. se suman el concepto específico del seguro de salud y los generales', () => {
    const resueltos = resolverConceptosBps(filas, periodoDe(2026, 4), '15')
    expect(resueltos.map((c) => c.concepto).sort()).toEqual(['FONASA', 'FRL', 'Montepío'])

    const r = calcularLiquidacionMensual(
      entradaBase({
        empleado: { ...entradaBase().empleado, seguroSalud: '15' },
        conceptosBps: resueltos,
      }),
    )
    // 15 % + 0,1 % + 3 % sobre 65.000 = 9.750 + 65 + 1.950
    expect(lineasCon(r.lineas, CODIGOS.DESCUENTO_BPS)).toBe(3)
    expect(r.totalDescuentosBps.toFixed(2)).toBe('11765.00')
    expect(r.subtotal.toFixed(2)).toBe('53235.00')
  })

  it('6. un empleado con otro seguro recibe el concepto de su propio código', () => {
    const resueltos = resolverConceptosBps(filas, periodoDe(2026, 4), '16')
    expect(resueltos.find((c) => c.concepto === 'FONASA')!.porcentaje.toString()).toBe('6')
  })

  it('6. un empleado sin seguro de salud solo recibe los generales', () => {
    const resueltos = resolverConceptosBps(filas, periodoDe(2026, 4), null)
    expect(resueltos.map((c) => c.concepto).sort()).toEqual(['FRL', 'Montepío'])
  })

  it('7. un concepto dado de baja con porcentaje NULL deja de aplicarse', () => {
    const conBaja: FilaBpsConcepto[] = [
      ...filas,
      { concepto: 'FRL', porcentaje: null, seguroSalud: null, fechaVigencia: f('2026-03-01') },
    ]
    expect(resolverConceptosBps(conBaja, periodoDe(2026, 4), '15').map((c) => c.concepto).sort()).toEqual(
      ['FONASA', 'Montepío'],
    )
  })

  it('7. la baja no afecta a los períodos anteriores a su vigencia', () => {
    const conBaja: FilaBpsConcepto[] = [
      ...filas,
      { concepto: 'FRL', porcentaje: null, seguroSalud: null, fechaVigencia: f('2026-03-01') },
    ]
    expect(resolverConceptosBps(conBaja, periodoDe(2026, 2), '15').map((c) => c.concepto)).toContain(
      'FRL',
    )
  })

  it('se queda con la vigencia máxima de cada grupo (concepto, seguro)', () => {
    const conCambio: FilaBpsConcepto[] = [
      ...filas,
      { concepto: 'Montepío', porcentaje: D(18), seguroSalud: null, fechaVigencia: f('2026-04-01') },
    ]
    const resueltos = resolverConceptosBps(conCambio, periodoDe(2026, 4), null)
    expect(resueltos.find((c) => c.concepto === 'Montepío')!.porcentaje.toString()).toBe('18')
  })

  it('el total de descuentos es la suma de las líneas ya redondeadas (§6.3)', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        conceptosBps: [conceptoBps('A', 7.3333), conceptoBps('B', 4.6667)],
      }),
    )
    const lineas = r.lineas.filter((l) => l.codigo === CODIGOS.DESCUENTO_BPS)
    const suma = lineas.reduce((acc: Decimal, l) => acc.plus(l.importe), D(0))
    expect(r.totalDescuentosBps.toFixed(2)).toBe(suma.toFixed(2))
  })
})

describe('8. empleado con aporta_bps = false (§6.3)', () => {
  const sinBps = () =>
    entradaBase({
      empleado: {
        ...entradaBase().empleado,
        aportaBps: false,
        seguroSalud: '15', // tiene que ignorarse
      },
      conceptosBps: [conceptoBps('Montepío', 15), conceptoBps('FONASA', 3, '15')],
    })

  it('no emite ninguna línea de descuento aunque haya conceptos vigentes que le aplicarían', () => {
    const r = calcularLiquidacionMensual(sinBps())
    expect(lineasCon(r.lineas, CODIGOS.DESCUENTO_BPS)).toBe(0)
    expect(r.totalDescuentosBps.toFixed(2)).toBe('0.00')
  })

  it('no renderiza la línea de materia gravada: el paso 4 pasa directo al 6', () => {
    const r = calcularLiquidacionMensual(sinBps())
    expect(lineasCon(r.lineas, CODIGOS.MATERIA_GRAVADA)).toBe(0)
    expect(r.subtotal.toFixed(2)).toBe(r.materiaGravada.toFixed(2))
    expect(r.subtotal.toFixed(2)).toBe('65000.00')
  })

  it('muestra la leyenda "Empleado sin aportes al BPS"', () => {
    expect(calcularLiquidacionMensual(sinBps()).avisos).toContain('Empleado sin aportes al BPS')
  })

  it('las horas extras con con_bps = true se pagan al valor hora calculado, enteras', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        empleado: { ...entradaBase().empleado, aportaBps: false },
        conceptosBps: [conceptoBps('Montepío', 15)],
        horasExtras: [horaExtra('2026-04-08', 2, true, 0)],
      }),
    )
    expect(r.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_CON_BPS)!.importe.toFixed(2)).toBe(
      '1000.00',
    )
    expect(r.totalDescuentosBps.toFixed(2)).toBe('0.00')
  })
})

describe('9. regla de resolución de series (§5.2)', () => {
  const serie = [
    { fechaVigencia: f('2024-01-01'), valor: 'viejo' },
    { fechaVigencia: f('2026-04-01'), valor: 'del mes' },
    { fechaVigencia: f('2026-05-01'), valor: 'del mes siguiente' },
  ]

  it('el registro con vigencia el 1° del mes liquidado sí aplica', () => {
    expect(vigenteEn(serie, periodoDe(2026, 4))!.valor).toBe('del mes')
  })

  it('el registro con vigencia el 1° del mes siguiente no aplica', () => {
    expect(vigenteEn(serie, periodoDe(2026, 4))!.valor).not.toBe('del mes siguiente')
    expect(vigenteEn(serie, periodoDe(2026, 5))!.valor).toBe('del mes siguiente')
  })

  it('devuelve null si no hay ningún registro vigente', () => {
    expect(vigenteEn(serie, periodoDe(2023, 12))).toBeNull()
  })

  it('un cambio de salario vigente el 1° del mes cambia el cálculo', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ salario: { salario: D(71500), horasSemanales: D(30) } }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('71500.00')
    expect(r.valorHoraCalculado.toFixed(2)).toBe('550.00')
  })

  it('un cambio de régimen vigente cambia los boletos', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        salario: { salario: D(65000), horasSemanales: D(24) },
        regimen: regimen(8, 0, 8, 0, 8, 0, 0), // lunes, miércoles y viernes
      }),
    )
    // Abril 2026: 4 lunes + 5 miércoles + 4 viernes = 13 días
    expect(r.boletos!.diasATrabajar).toBe(13)
  })

  it('un cambio de valor de boleto vigente cambia el importe', () => {
    const r = calcularLiquidacionMensual(entradaBase({ valorBoleto: D(60) }))
    expect(r.lineas.find((l) => l.codigo === CODIGOS.BOLETOS)!.importe.toFixed(2)).toBe('2640.00')
  })
})

describe('10. feriados', () => {
  it('el feriado no laborable en día laborable del régimen descuenta el boleto', () => {
    // Jueves 30/4/2026, laborable según el régimen.
    const r = calcularLiquidacionMensual(
      entradaBase({ feriados: [{ fecha: f('2026-04-30'), noLaborable: true }] }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
    // No descuenta sueldo: es feriado pago.
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
  })

  it('el feriado no laborable en día no laborable del régimen no cambia nada', () => {
    // Sábado 25/4/2026.
    const r = calcularLiquidacionMensual(
      entradaBase({ feriados: [{ fecha: f('2026-04-25'), noLaborable: true }] }),
    )
    expect(r.boletos!.diasATrabajar).toBe(22)
  })

  it('el feriado laborable (no_laborable = false) no afecta ni el sueldo ni los boletos', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ feriados: [{ fecha: f('2026-04-30'), noLaborable: false }] }),
    )
    expect(r.boletos!.diasATrabajar).toBe(22)
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
  })

  it('un día que es feriado y además falta de jornada completa se descuenta una sola vez', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        feriados: [{ fecha: f('2026-04-30'), noLaborable: true }],
        faltas: [falta('2026-04-30', 6)],
      }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
  })
})

describe('11. plan de pagos', () => {
  it('la cuota del mes se descuenta después del subtotal', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ cuotasPlan: [{ fecha: f('2026-04-01'), monto: D(2000), yaAplicada: false }] }),
    )
    expect(r.totalRecalculado.toFixed(2)).toBe('65200.00') // 67.200 − 2.000
    const cuota = r.lineas.find((l) => l.codigo === CODIGOS.CUOTA_PLAN)!
    expect(cuota.signo).toBe(-1)
    expect(cuota.orden).toBeGreaterThan(r.lineas.find((l) => l.codigo === CODIGOS.SUBTOTAL)!.orden)
  })

  it('sin cuota del mes el total no cambia', () => {
    const r = calcularLiquidacionMensual(entradaBase({ cuotasPlan: [] }))
    expect(r.totalRecalculado.toFixed(2)).toBe('67200.00')
    expect(lineasCon(r.lineas, CODIGOS.CUOTA_PLAN)).toBe(0)
  })
})

describe('12. empleado que no cobra boletos', () => {
  it('no emite la línea de boletos', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ empleado: { ...entradaBase().empleado, cobraBoletos: false } }),
    )
    expect(lineasCon(r.lineas, CODIGOS.BOLETOS)).toBe(0)
    expect(r.boletos).toBeNull()
    expect(r.totalRecalculado.toFixed(2)).toBe('65000.00')
  })

  it('no exige que haya un valor de boleto vigente', () => {
    expect(() =>
      calcularLiquidacionMensual(
        entradaBase({
          empleado: { ...entradaBase().empleado, cobraBoletos: false },
          valorBoleto: null,
        }),
      ),
    ).not.toThrow()
  })
})

describe('13. redondeo: las líneas suman exactamente el total (§6.7)', () => {
  it('con importes que no dan redondos', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        salario: { salario: D(57777), horasSemanales: D(37) },
        regimen: regimen(7.5, 7.5, 7.5, 7.5, 7, 0, 0),
        conceptosBps: [conceptoBps('Montepío', 15), conceptoBps('FRL', 0.125)],
        faltas: [falta('2026-04-08', 3.5)],
        horasExtras: [
          horaExtra('2026-04-09', 2.5, true, 120),
          horaExtra('2026-04-11', 1.5, false, 170),
        ],
        pagosAdicionales: [{ fecha: f('2026-04-15'), monto: D('1234.57'), concepto: 'Premio' }],
        cuotasPlan: [{ fecha: f('2026-04-01'), monto: D('333.33'), yaAplicada: false }],
        valorBoleto: D('47.35'),
      }),
    )

    expect(sumarLineas(r.lineas).toFixed(2)).toBe(r.totalRecalculado.toFixed(2))
    for (const l of r.lineas) {
      expect(l.importe.decimalPlaces()).toBeLessThanOrEqual(2)
    }
  })

  it('el subtotal es la materia gravada menos las líneas de descuento ya redondeadas', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ conceptosBps: [conceptoBps('Montepío', 15.3333)] }),
    )
    const descuentos = r.lineas
      .filter((l) => l.codigo === CODIGOS.DESCUENTO_BPS)
      .reduce((acc: Decimal, l) => acc.plus(l.importe), D(0))
    expect(r.subtotal.toFixed(2)).toBe(r.materiaGravada.minus(descuentos).toFixed(2))
  })

  it('el redondeo de cada línea es ROUND_HALF_UP', () => {
    // 65.000 × 0,005 % = 3,25 exactos; con 0,0077 % da 5,005 → 5,01
    const r = calcularLiquidacionMensual(
      entradaBase({ conceptosBps: [conceptoBps('Medio', 0.0077)] }),
    )
    expect(r.totalDescuentosBps.toFixed(2)).toBe('5.01')
  })
})

describe('14. datos faltantes: error explícito, no cálculo parcial (§6.8)', () => {
  it('sin salario vigente', () => {
    expect(() => calcularLiquidacionMensual(entradaBase({ salario: null }))).toThrow(
      ErrorDatosFaltantes,
    )
  })

  it('sin régimen vigente', () => {
    expect(() => calcularLiquidacionMensual(entradaBase({ regimen: null }))).toThrow(
      ErrorDatosFaltantes,
    )
  })

  it('sin valor hora "en negro" y con horas extras sin BPS', () => {
    try {
      calcularLiquidacionMensual(
        entradaBase({ valorHoraNegro: null, horasExtras: [horaExtra('2026-04-08', 2, false, 0)] }),
      )
      expect.unreachable('debía lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDatosFaltantes)
      expect((e as ErrorDatosFaltantes).faltantes.map((x) => x.codigo)).toEqual([
        'VALOR_HORA_NEGRO',
      ])
    }
  })

  it('sin valor hora "en negro" pero sin horas extras sin BPS no es error', () => {
    expect(() =>
      calcularLiquidacionMensual(
        entradaBase({ valorHoraNegro: null, horasExtras: [horaExtra('2026-04-08', 2, true, 0)] }),
      ),
    ).not.toThrow()
  })

  it('sin valor de boleto y el empleado cobra boletos', () => {
    try {
      calcularLiquidacionMensual(entradaBase({ valorBoleto: null }))
      expect.unreachable('debía lanzar')
    } catch (e) {
      expect((e as ErrorDatosFaltantes).faltantes.map((x) => x.codigo)).toEqual(['VALOR_BOLETO'])
    }
  })

  it('acumula todos los faltantes en un solo error', () => {
    try {
      calcularLiquidacionMensual(entradaBase({ salario: null, regimen: null, valorBoleto: null }))
      expect.unreachable('debía lanzar')
    } catch (e) {
      expect((e as ErrorDatosFaltantes).faltantes).toHaveLength(3)
    }
  })
})

describe('15. falta por enfermedad con descuenta = false (§4.6.1)', () => {
  it('no resta sueldo, pero de jornada completa sí descuenta el boleto', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ faltas: [falta('2026-04-08', 6, 'ENFERMEDAD', false)] }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
    expect(lineasCon(r.lineas, CODIGOS.FALTAS)).toBe(0)
    expect(r.boletos!.diasATrabajar).toBe(21)
  })

  it('con descuenta = true resta sueldo y boleto', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ faltas: [falta('2026-04-08', 6, 'ENFERMEDAD', true)] }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('62000.00')
    expect(r.boletos!.diasATrabajar).toBe(21)
  })

  it('la falta parcial que no descuenta tampoco toca el boleto', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ faltas: [falta('2026-04-08', 3, 'ENFERMEDAD', false)] }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('65000.00')
    expect(r.boletos!.diasATrabajar).toBe(22)
  })

  it('MATERNIDAD siempre descuenta sueldo', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ faltas: [falta('2026-04-08', 6, 'MATERNIDAD', true)] }),
    )
    expect(r.materiaGravada.toFixed(2)).toBe('62000.00')
  })
})

describe('16. prorrateo del primer mes (§6.9)', () => {
  it('ingreso a mitad de mes', () => {
    // Ingreso el 12/03. Marzo tiene 31 días; con vínculo vigente hay 20 (del 12 al 31).
    const r = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 3),
        empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-03-12') },
      }),
    )
    expect(r.diasConVinculo).toBe(20)
    expect(r.diasDelMes).toBe(31)
    const linea = r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!
    expect(linea.importe.toFixed(2)).toBe('41935.48') // 65.000 × 20/31
    expect(linea.descripcion).toBe('Salario base (20/31 días)')
  })

  it('ingreso el día 1: factor 1 y sin detalle de prorrateo', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 3),
        empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-03-01') },
      }),
    )
    expect(r.factorProrrateo.toString()).toBe('1')
    expect(r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!.descripcion).toBe('Salario base')
  })

  it('ingreso el último día del mes: un solo día', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 3),
        empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-03-31') },
      }),
    )
    expect(r.diasConVinculo).toBe(1)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!.importe.toFixed(2)).toBe(
      '2096.77', // 65.000 × 1/31
    )
  })

  it('el prorrateo solo alcanza al salario base: los boletos siguen por día trabajado', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 3),
        empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-03-12') },
      }),
    )
    // Del 12 al 31 de marzo de 2026 hay 14 días de lunes a viernes.
    expect(r.boletos!.diasATrabajar).toBe(14)
  })

  it('los descuentos de BPS se calculan sobre la materia gravada ya prorrateada', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 3),
        empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-03-12') },
        conceptosBps: [conceptoBps('Montepío', 15)],
      }),
    )
    expect(r.totalDescuentosBps.toFixed(2)).toBe('6290.32') // 15 % de 41.935,48
  })

  it('mes de egreso: prorratea y avisa que la liquidación final está incompleta (§13.1)', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ empleado: { ...entradaBase().empleado, fechaEgreso: f('2026-04-15') } }),
    )
    expect(r.diasConVinculo).toBe(15)
    expect(r.avisos).toContain('Liquidación final: falta calcular despido y licencia no gozada.')
  })

  it('período anterior al ingreso: salario base cero y aviso', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({ empleado: { ...entradaBase().empleado, fechaIngreso: f('2026-06-01') } }),
    )
    expect(r.diasConVinculo).toBe(0)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!.importe.toFixed(2)).toBe('0.00')
    expect(r.boletos!.diasATrabajar).toBe(0)
  })
})

describe('17. mes intermedio', () => {
  it('factor 1, sin línea de prorrateo y sin aviso de liquidación final', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        empleado: {
          ...entradaBase().empleado,
          fechaIngreso: f('2026-01-10'),
          fechaEgreso: f('2026-08-20'),
        },
      }),
    )
    expect(r.factorProrrateo.toString()).toBe('1')
    expect(r.diasConVinculo).toBe(30)
    expect(r.lineas.find((l) => l.codigo === CODIGOS.SALARIO_BASE)!.descripcion).toBe('Salario base')
    expect(r.avisos).not.toContain('Liquidación final: falta calcular despido y licencia no gozada.')
  })
})

describe('23. horas extras sin BPS de un mes anterior a un aumento', () => {
  it('se pagan al valor hora "en negro" vigente en su propio período (§6.11 + §5.2)', () => {
    const serieVhn = [
      { fechaVigencia: f('2025-01-01'), valor: D(300) },
      { fechaVigencia: f('2026-05-01'), valor: D(360) },
    ]

    const enAbril = vigenteEn(serieVhn, periodoDe(2026, 4))!.valor
    const enMayo = vigenteEn(serieVhn, periodoDe(2026, 5))!.valor
    expect(enAbril.toString()).toBe('300')
    expect(enMayo.toString()).toBe('360')

    const abril = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 4),
        valorHoraNegro: enAbril,
        horasExtras: [horaExtra('2026-04-08', 2, false, 0)],
      }),
    )
    expect(
      abril.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_SIN_BPS)!.importe.toFixed(2),
    ).toBe('600.00')

    const mayo = calcularLiquidacionMensual(
      entradaBase({
        periodo: periodoDe(2026, 5),
        valorHoraNegro: enMayo,
        horasExtras: [horaExtra('2026-05-06', 2, false, 0)],
      }),
    )
    expect(
      mayo.lineas.find((l) => l.codigo === CODIGOS.HORAS_EXTRAS_SIN_BPS)!.importe.toFixed(2),
    ).toBe('720.00')
  })
})

describe('valor hora calculado (§4.3)', () => {
  it('salario / (horas semanales × 52/12)', () => {
    expect(valorHoraCalculado({ salario: D(65000), horasSemanales: D(30) }).toFixed(2)).toBe('500.00')
    expect(valorHoraCalculado({ salario: D(60000), horasSemanales: D(40) }).toFixed(2)).toBe('346.15')
    // A igual proporción salario/horas, igual valor hora.
    expect(valorHoraCalculado({ salario: D(45000), horasSemanales: D(30) }).toFixed(2)).toBe('346.15')
  })

  it('se usa con precisión completa, no redondeado a 2 decimales', () => {
    const vhc = valorHoraCalculado({ salario: D(57777), horasSemanales: D(37) })
    expect(vhc.toFixed(6)).toBe('360.355509')
    expect(vhc.times(10).toDecimalPlaces(2).toFixed(2)).toBe('3603.56')
  })
})

describe('régimenes atípicos', () => {
  it('régimen de solo sábados', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        salario: { salario: D(65000), horasSemanales: D(8) },
        regimen: regimen(0, 0, 0, 0, 0, 8, 0),
      }),
    )
    // Abril 2026 tiene 4 sábados
    expect(r.boletos!.diasATrabajar).toBe(4)
  })

  it('régimen de 5 h de lunes a viernes: la jornada completa son 5 h', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        salario: { salario: D(65000), horasSemanales: D(25) },
        regimen: regimenLunesAViernes(5),
        faltas: [falta('2026-04-08', 5)],
      }),
    )
    expect(r.boletos!.diasATrabajar).toBe(21)
  })

  it('régimen con horas todos los días de la semana', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        salario: { salario: D(65000), horasSemanales: D(42) },
        regimen: regimen(6, 6, 6, 6, 6, 6, 6),
      }),
    )
    expect(r.boletos!.diasATrabajar).toBe(30)
  })
})
