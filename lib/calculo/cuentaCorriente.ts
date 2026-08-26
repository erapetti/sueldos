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
import type { Libro } from './tipos'

export const LIBROS: readonly Libro[] = ['FORMAL', 'INFORMAL']

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
 * §4.14 — en qué anda el pago de una liquidación, mirando **libro por libro**.
 *
 * Con dos libros «pagada» ya no es «existe algún movimiento PAGO»: una liquidación puede tener
 * el sueldo formal transferido y las horas en negro todavía no. Los tres estados son
 * `SIN_PAGAR`, `PARCIAL` y `PAGADA`, y `faltan` dice qué libro queda, que es lo que el diálogo
 * de pago necesita para precargar el monto correcto.
 *
 * Cuentan solo los libros **con importe positivo**: son los que se pagan con una
 * transferencia. Un importe negativo —la diferencia a favor de la empresa de una
 * complementaria (§7.6.1)— no se paga, se compensa contra el saldo de su libro, así que no
 * deja la liquidación esperando un pago que no va a existir. Una liquidación sin ningún libro
 * a pagar no tiene nada pendiente: cuenta como `PAGADA`.
 */
export type EstadoDePago = {
  /** Libros que esta liquidación paga. */
  libros: Libro[]
  /** De esos, los que ya tienen al menos un movimiento `PAGO`. */
  pagados: Libro[]
  /** Los que todavía no. */
  faltan: Libro[]
  estado: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA'
}

export function estadoDePago(
  totalAPagar: Record<'formal' | 'informal', Decimal>,
  pagos: readonly { libro: Libro }[],
): EstadoDePago {
  const libros = LIBROS.filter((libro) =>
    (libro === 'FORMAL' ? totalAPagar.formal : totalAPagar.informal).greaterThan(0),
  )
  const pagados = libros.filter((libro) => pagos.some((p) => p.libro === libro))
  const faltan = libros.filter((libro) => !pagados.includes(libro))

  return {
    libros,
    pagados,
    faltan,
    estado: faltan.length === 0 ? 'PAGADA' : pagados.length === 0 ? 'SIN_PAGAR' : 'PARCIAL',
  }
}

/**
 * §7.6 — el asiento que genera una liquidación confirmada va al haber por el **devengado
 * bruto**: el total a pagar más las cuotas del plan descontadas en esa liquidación.
 */
export function devengadoBruto(totalAPagar: Decimal, cuotasDescontadas: Decimal): Decimal {
  return totalAPagar.plus(cuotasDescontadas)
}

/**
 * §7.4 — reparto de un préstamo en cuotas, en pesos enteros.
 *
 * La última cuota absorbe la diferencia para que la suma dé **exactamente** el monto
 * prestado: no se inventa ni se pierde dinero. Si el préstamo se cargó con centavos, esos
 * centavos quedan en la última cuota, que es lo honesto; con montos enteros —el caso
 * normal— todas las cuotas salen enteras.
 */
export function repartirEnCuotas(monto: Decimal, cantidad: number): Decimal[] {
  if (cantidad < 1) return []
  const base = monto.dividedBy(cantidad).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  const cuotas = Array.from({ length: cantidad }, () => base)
  cuotas[cantidad - 1] = monto.minus(base.times(cantidad - 1))
  return cuotas
}
