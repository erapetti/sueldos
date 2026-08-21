/**
 * §4.9 — cuenta corriente de dinero.
 *
 * Se lee desde el punto de vista del empleado como acreedor:
 *   saldo = Σ haber − Σ debe
 *   saldo > 0  la empresa le debe al empleado
 *   saldo = 0  al día
 *   saldo < 0  el empleado adeuda: es el saldo pendiente de préstamos
 */
import Decimal from 'decimal.js'

export type MovimientoCalculo = {
  debe: Decimal
  haber: Decimal
}

export function saldo(movimientos: readonly MovimientoCalculo[]): Decimal {
  return movimientos.reduce((acc, m) => acc.plus(m.haber).minus(m.debe), new Decimal(0))
}

export type MovimientoConSaldo<T extends MovimientoCalculo> = T & { saldoAcumulado: Decimal }

/** Acumula el saldo movimiento a movimiento, en el orden recibido. */
export function conSaldoAcumulado<T extends MovimientoCalculo>(
  movimientos: readonly T[],
): MovimientoConSaldo<T>[] {
  let acumulado = new Decimal(0)
  return movimientos.map((m) => {
    acumulado = acumulado.plus(m.haber).minus(m.debe)
    return { ...m, saldoAcumulado: acumulado }
  })
}

/**
 * §7.6 — el asiento que genera una liquidación confirmada va al haber por el **devengado
 * bruto**: el total a pagar más las cuotas del plan descontadas en esa liquidación.
 */
export function devengadoBruto(totalAPagar: Decimal, cuotasDescontadas: Decimal): Decimal {
  return totalAPagar.plus(cuotasDescontadas)
}

/**
 * §7.4 — reparto de un préstamo en cuotas. El redondeo se ajusta en la última cuota para
 * que la suma dé exactamente el monto prestado.
 */
export function repartirEnCuotas(monto: Decimal, cantidad: number): Decimal[] {
  if (cantidad < 1) return []
  const base = monto.dividedBy(cantidad).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const cuotas = Array.from({ length: cantidad }, () => base)
  const suma = base.times(cantidad)
  cuotas[cantidad - 1] = base.plus(monto.minus(suma))
  return cuotas
}
