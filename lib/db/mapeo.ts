/**
 * Conversión entre los tipos que devuelve Prisma y los que usa el motor de cálculo.
 *
 * Prisma trae los `DECIMAL` como instancias de su propia clase Decimal, que no es la misma
 * que la de `decimal.js` que usa la aplicación. Se convierte siempre por `toString()` para
 * no perder precisión ni depender de que las dos clases sean compatibles.
 */
import Decimal from 'decimal.js'

export type DecimalPrisma = { toString(): string }

export function aDecimal(valor: DecimalPrisma): Decimal {
  return new Decimal(valor.toString())
}

export function aDecimalOpcional(valor: DecimalPrisma | null | undefined): Decimal | null {
  return valor === null || valor === undefined ? null : aDecimal(valor)
}

/** Serializa un Decimal para escribirlo en una columna `DECIMAL(14,2)`. */
export function aColumnaImporte(valor: Decimal): string {
  return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

/** Serializa un Decimal para una columna de horas o días `DECIMAL(n,2)`. */
export function aColumnaCantidad(valor: Decimal): string {
  return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

/** Serializa un Decimal para una columna de porcentaje `DECIMAL(7,4)`. */
export function aColumnaPorcentaje(valor: Decimal): string {
  return valor.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4)
}

/** Régimen horario de Prisma al que espera el motor de cálculo. */
export function aRegimenHoras(fila: {
  horasLunes: DecimalPrisma
  horasMartes: DecimalPrisma
  horasMiercoles: DecimalPrisma
  horasJueves: DecimalPrisma
  horasViernes: DecimalPrisma
  horasSabado: DecimalPrisma
  horasDomingo: DecimalPrisma
}) {
  return {
    lunes: aDecimal(fila.horasLunes),
    martes: aDecimal(fila.horasMartes),
    miercoles: aDecimal(fila.horasMiercoles),
    jueves: aDecimal(fila.horasJueves),
    viernes: aDecimal(fila.horasViernes),
    sabado: aDecimal(fila.horasSabado),
    domingo: aDecimal(fila.horasDomingo),
  }
}
