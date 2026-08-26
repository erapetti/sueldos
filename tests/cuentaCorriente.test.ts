/**
 * §12 — pruebas de cuenta corriente y liquidación complementaria, casos 18 a 22.
 *
 * La aritmética del libro (§4.9) y del cálculo de la diferencia (§7.6.1) se testea acá con
 * los movimientos como datos; la parte transaccional está en tests/integracion.test.ts.
 */
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  conSaldoAcumulado,
  devengadoBruto,
  estadoDePago,
  repartirEnCuotas,
  saldo,
} from '@/lib/calculo/cuentaCorriente'
import { calcularLiquidacionMensual } from '@/lib/calculo/liquidacion'
import { periodoDe } from '@/lib/format/dates'
import { cuotaPlan, D, entradaBase, f, horaExtra, yaLiquidado } from './helpers'

const debe = (monto: number) => ({ debe: D(monto), haber: D(0) })
const haber = (monto: number) => ({ debe: D(0), haber: D(monto) })

describe('18. cuenta corriente: préstamo + liquidación + pago (§4.9)', () => {
  it('reproduce el ejemplo del SPECS', () => {
    // Préstamo de $10.000 en enero, 5 cuotas de $2.000.
    // Liquidación de febrero: total a pagar $48.000, ya con la cuota descontada.
    const movimientos = [
      debe(10000), // 15/01 préstamo
      haber(50000), // 28/02 liquidación por el devengado bruto: 48.000 + 2.000
      debe(48000), // 05/03 pago bancario
    ]

    const acumulado = conSaldoAcumulado(movimientos).map((m) => m.saldoAcumulado.toFixed(2))
    expect(acumulado).toEqual(['-10000.00', '40000.00', '-8000.00'])
    // El saldo final es el préstamo pendiente.
    expect(saldo(movimientos).toFixed(2)).toBe('-8000.00')
  })

  it('el asiento de la liquidación va por el devengado bruto (§7.6)', () => {
    expect(devengadoBruto(D(48000), D(2000)).toFixed(2)).toBe('50000.00')
    expect(devengadoBruto(D(67200), D(0)).toFixed(2)).toBe('67200.00')
  })

  it('anular la liquidación deja el saldo como antes de confirmarla', () => {
    const antes = [debe(10000)]
    const conLiquidacion = [...antes, haber(50000)]
    const conContraAsiento = [...conLiquidacion, debe(50000)]

    expect(saldo(antes).toFixed(2)).toBe('-10000.00')
    expect(saldo(conLiquidacion).toFixed(2)).toBe('40000.00')
    expect(saldo(conContraAsiento).toFixed(2)).toBe(saldo(antes).toFixed(2))
  })

  it('saldo cero es estar al día', () => {
    expect(saldo([haber(50000), debe(50000)]).toFixed(2)).toBe('0.00')
  })
})

describe('19. liquidación complementaria (§7.6.1)', () => {
  const conHorasExtras = () =>
    entradaBase({
      periodo: periodoDe(2026, 4),
      horasExtras: [horaExtra('2026-04-08', 4, true, 100)],
    })

  it('con diferencia positiva', () => {
    // La original se confirmó sin las horas extras: $67.200.
    const original = calcularLiquidacionMensual(entradaBase())
    expect(original.totalAPagar.toFixed(2)).toBe('67200.00')

    // Se cargan 4 h extras al 100 % (4 × 500 × 2 = 4.000) y se recalcula.
    const complementaria = calcularLiquidacionMensual({
      ...conHorasExtras(),
      ...yaLiquidado(original),
    })

    expect(complementaria.totalRecalculado.toFixed(2)).toBe('71200.00')
    expect(complementaria.totalYaLiquidado.toFixed(2)).toBe('67200.00')
    expect(complementaria.totalAPagar.toFixed(2)).toBe('4000.00')
  })

  it('con diferencia negativa', () => {
    // La original se confirmó con las horas extras; después se borran.
    const original = calcularLiquidacionMensual(conHorasExtras())
    const complementaria = calcularLiquidacionMensual({
      ...entradaBase(),
      ...yaLiquidado(original),
    })

    expect(complementaria.totalAPagar.toFixed(2)).toBe('-4000.00')
    expect(complementaria.totalAPagar.isNegative()).toBe(true)
  })

  it('el saldo con complementaria iguala al de haber liquidado bien de entrada', () => {
    const original = calcularLiquidacionMensual(entradaBase())
    const complementaria = calcularLiquidacionMensual({
      ...conHorasExtras(),
      ...yaLiquidado(original),
    })

    // Camino real: asiento de la original + un único asiento por la diferencia.
    const enDosPasos = saldo([
      haber(original.totalAPagar.toNumber()),
      haber(complementaria.totalAPagar.toNumber()),
    ])

    // Camino ideal: se hubiera liquidado el mes completo de una sola vez.
    const deUnaVez = saldo([haber(complementaria.totalRecalculado.toNumber())])

    expect(enDosPasos.toFixed(2)).toBe(deUnaVez.toFixed(2))
  })

  it('la diferencia negativa queda como saldo a favor de la empresa', () => {
    const original = calcularLiquidacionMensual(conHorasExtras())
    const complementaria = calcularLiquidacionMensual({
      ...entradaBase(),
      ...yaLiquidado(original),
    })

    // Una diferencia negativa se asienta al debe.
    const movimientos = [
      haber(original.totalAPagar.toNumber()),
      debe(complementaria.totalAPagar.abs().toNumber()),
      debe(original.totalAPagar.toNumber()), // el pago bancario que ya se había hecho
    ]
    expect(saldo(movimientos).toFixed(2)).toBe('-4000.00')
  })
})

describe('20. complementaria con cuotas del plan ya aplicadas', () => {
  it('la cuota se considera en el paso 8 pero no se descuenta dos veces', () => {
    const conCuota = () =>
      entradaBase({
        cuotasPlan: [cuotaPlan('2026-04-01', D(2000), { yaAplicada: true })],
      })

    const original = calcularLiquidacionMensual(conCuota())
    expect(original.totalAPagar.toFixed(2)).toBe('65200.00') // 67.200 − 2.000

    // El recálculo vuelve a considerar la misma cuota, ya aplicada.
    const complementaria = calcularLiquidacionMensual({
      ...conCuota(),
      horasExtras: [horaExtra('2026-04-08', 4, true, 100)],
      ...yaLiquidado(original),
    })

    // La cuota entra una sola vez en el recálculo total.
    expect(complementaria.totalRecalculado.toFixed(2)).toBe('69200.00')
    // Y la diferencia es exactamente el importe de las horas extras nuevas.
    expect(complementaria.totalAPagar.toFixed(2)).toBe('4000.00')
  })

  it('el recálculo emite una sola línea por cuota, sin duplicar', () => {
    const r = calcularLiquidacionMensual(
      entradaBase({
        cuotasPlan: [cuotaPlan('2026-04-01', D(2000), { yaAplicada: true })],
        totalYaLiquidadoFormal: D(65200),
        totalYaLiquidadoInformal: D(0),
      }),
    )
    expect(r.lineas.filter((l) => l.codigo === 'CUOTA_PLAN')).toHaveLength(1)
  })
})

describe('21. dos complementarias sucesivas sobre el mismo período', () => {
  it('total_ya_liquidado acumula bien', () => {
    // Secuencia 1: sin novedades.
    const s1 = calcularLiquidacionMensual(entradaBase())
    expect(s1.totalAPagar.toFixed(2)).toBe('67200.00')

    // Secuencia 2: aparecen 4 h extras al 100 %.
    const s2 = calcularLiquidacionMensual({
      ...entradaBase({ horasExtras: [horaExtra('2026-04-08', 4, true, 100)] }),
      ...yaLiquidado(s1),
    })
    expect(s2.totalAPagar.toFixed(2)).toBe('4000.00')

    // Secuencia 3: además un pago adicional de $1.500.
    const s3 = calcularLiquidacionMensual({
      ...entradaBase({
        horasExtras: [horaExtra('2026-04-08', 4, true, 100)],
        pagosAdicionales: [{ fecha: f('2026-04-20'), monto: D(1500), concepto: 'Premio' }],
      }),
      ...yaLiquidado(s1, s2),
    })

    expect(s3.totalYaLiquidado.toFixed(2)).toBe('71200.00')
    expect(s3.totalRecalculado.toFixed(2)).toBe('72700.00')
    expect(s3.totalAPagar.toFixed(2)).toBe('1500.00')

    // La suma de las tres da el total del período.
    const sumaSecuencias = s1.totalAPagar.plus(s2.totalAPagar).plus(s3.totalAPagar)
    expect(sumaSecuencias.toFixed(2)).toBe(s3.totalRecalculado.toFixed(2))
  })

  it('una complementaria negativa seguida de una positiva también cierra', () => {
    const s1 = calcularLiquidacionMensual(
      entradaBase({ horasExtras: [horaExtra('2026-04-08', 4, true, 100)] }),
    )
    const s2 = calcularLiquidacionMensual({
      ...entradaBase(),
      ...yaLiquidado(s1),
    })
    const s3 = calcularLiquidacionMensual({
      ...entradaBase({ pagosAdicionales: [{ fecha: f('2026-04-20'), monto: D(900), concepto: null }] }),
      ...yaLiquidado(s1, s2),
    })

    expect(s2.totalAPagar.toFixed(2)).toBe('-4000.00')
    expect(s3.totalAPagar.toFixed(2)).toBe('900.00')
    expect(
      s1.totalAPagar.plus(s2.totalAPagar).plus(s3.totalAPagar).toFixed(2),
    ).toBe(s3.totalRecalculado.toFixed(2))
  })
})

describe('§4.9 y §7.6.1 — los dos libros', () => {
  /*
    Lo que hace falta para que un libro ya pagado no se vuelva a mover: la diferencia se
    calcula libro contra libro, no sobre el total del período.
  */
  it('un cambio en el informal deja la diferencia del formal en cero', () => {
    const conExtras = (horas: number) =>
      entradaBase({ horasExtras: [horaExtra('2026-04-08', horas, false, 0)] })

    // Secuencia 1: 2 h sin BPS → $600 informales, más los $67.200 formales de siempre.
    const s1 = calcularLiquidacionMensual(conExtras(2))
    expect(s1.totalAPagarFormal.toFixed(2)).toBe('67200.00')
    expect(s1.totalAPagarInformal.toFixed(2)).toBe('600.00')

    // Secuencia 2: aparecen 3 h sin BPS más. El formal no cambió.
    const s2 = calcularLiquidacionMensual({ ...conExtras(5), ...yaLiquidado(s1) })

    expect(s2.totalRecalculadoFormal.toFixed(2)).toBe('67200.00')
    expect(s2.totalAPagarFormal.toFixed(2)).toBe('0.00')
    expect(s2.totalAPagarInformal.toFixed(2)).toBe('900.00')
    // El total de la complementaria es la suma de los dos libros.
    expect(s2.totalAPagar.toFixed(2)).toBe('900.00')
  })

  it('el estado de pago se mira libro por libro (§4.14)', () => {
    const totales = { formal: D(50000), informal: D(1200) }

    expect(estadoDePago(totales, []).estado).toBe('SIN_PAGAR')
    expect(estadoDePago(totales, []).faltan).toEqual(['FORMAL', 'INFORMAL'])

    const soloFormal = estadoDePago(totales, [{ libro: 'FORMAL' }])
    expect(soloFormal.estado).toBe('PARCIAL')
    expect(soloFormal.faltan).toEqual(['INFORMAL'])

    const losDos = estadoDePago(totales, [{ libro: 'FORMAL' }, { libro: 'INFORMAL' }])
    expect(losDos.estado).toBe('PAGADA')
    expect(losDos.faltan).toEqual([])
  })

  it('el libro sin nada a pagar no deja la liquidación esperando un pago', () => {
    // Una empleada sin horas extras sin BPS no tiene nada informal que cobrar.
    const soloFormal = estadoDePago({ formal: D(50000), informal: D(0) }, [{ libro: 'FORMAL' }])
    expect(soloFormal.libros).toEqual(['FORMAL'])
    expect(soloFormal.estado).toBe('PAGADA')

    /*
      Y una diferencia negativa tampoco: no se paga con una transferencia, queda como saldo a
      favor de la empresa en su libro (§7.6.1).
    */
    const negativa = estadoDePago({ formal: D(-4000), informal: D(0) }, [])
    expect(negativa.libros).toEqual([])
    expect(negativa.estado).toBe('PAGADA')
  })
})

describe('reparto de un préstamo en cuotas (§7.4)', () => {
  it('cuotas iguales cuando el monto es divisible', () => {
    const cuotas = repartirEnCuotas(D(10000), 5)
    expect(cuotas.map((c) => c.toFixed(2))).toEqual([
      '2000.00',
      '2000.00',
      '2000.00',
      '2000.00',
      '2000.00',
    ])
  })

  it('las cuotas son pesos enteros y la última ajusta la diferencia', () => {
    const cuotas = repartirEnCuotas(D(10000), 3)
    expect(cuotas.map((c) => c.toFixed(2))).toEqual(['3333.00', '3333.00', '3334.00'])
    expect(cuotas.every((c) => c.isInteger())).toBe(true)
    const suma = cuotas.reduce((acc: Decimal, c) => acc.plus(c), D(0))
    expect(suma.toFixed(2)).toBe('10000.00')
  })

  it('siempre suma exactamente el monto prestado', () => {
    for (const [monto, n] of [
      [10000, 7],
      [12345.67, 4],
      [999.99, 6],
      [1, 3],
    ] as const) {
      const cuotas = repartirEnCuotas(D(monto), n)
      const suma = cuotas.reduce((acc: Decimal, c) => acc.plus(c), D(0))
      expect(suma.toFixed(2)).toBe(D(monto).toFixed(2))
    }
  })

  it('una sola cuota es el monto entero', () => {
    expect(repartirEnCuotas(D(10000), 1).map((c) => c.toFixed(2))).toEqual(['10000.00'])
  })
})
