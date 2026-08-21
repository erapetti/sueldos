/**
 * §7.7 — aguinaldo (junio y diciembre).
 *
 * La fórmula está **pendiente de definición** (§13.3): falta resolver si la base es el
 * promedio del semestre, qué conceptos la integran (salario, horas extras con BPS, horas
 * extras sin BPS, salario vacacional), si lleva descuentos de BPS y si los semestres son
 * dic–may / jun–nov. Lo único definido es que los pagos adicionales no integran la base y
 * que los boletos tampoco.
 *
 * Hasta entonces la pantalla muestra "funcionalidad no implementada aún" y este módulo solo
 * expone lo que ya está decidido: en qué meses se habilita la opción.
 */
import { ErrorNoImplementado } from './errores'
import { mes } from '@/lib/format/dates'

/** §7.7 — el aguinaldo se liquida en junio y en diciembre. */
export function esMesDeAguinaldo(periodo: Date): boolean {
  const m = mes(periodo)
  return m === 6 || m === 12
}

/**
 * §7.7 — semestre que integra la base:
 *   junio     = 1/dic del año anterior … 31/may
 *   diciembre = 1/jun … 30/nov
 *
 * Se deja expresado porque el SPECS lo enuncia, pero §13.3 todavía no confirma que sea el
 * criterio final, así que no se usa en ningún cálculo.
 */
export function semestreDelAguinaldo(periodo: Date): { desde: Date; hasta: Date } {
  const anio = periodo.getUTCFullYear()
  if (mes(periodo) === 6) {
    return {
      desde: new Date(Date.UTC(anio - 1, 11, 1)),
      hasta: new Date(Date.UTC(anio, 4, 31)),
    }
  }
  return {
    desde: new Date(Date.UTC(anio, 5, 1)),
    hasta: new Date(Date.UTC(anio, 10, 30)),
  }
}

export const MOTIVO_NO_IMPLEMENTADO =
  'El cálculo del aguinaldo está pendiente de definición (SPECS §13.3).'

export function calcularAguinaldo(): never {
  throw new ErrorNoImplementado(MOTIVO_NO_IMPLEMENTADO)
}
