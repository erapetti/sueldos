/**
 * §4.2.3 — estado derivado del empleado.
 *
 * No se persiste: se calcula a la fecha de hoy. La versión de producción lo resuelve en la
 * misma consulta que lista los empleados (§11); esta función es la definición de referencia
 * y la que se testea.
 */
import { dia, mismoPeriodo, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'

export type EstadoEmpleado = 'FALTA_PAGAR' | 'FALTA_LIQUIDACION' | 'BAJA' | 'ACTIVO'

export type EntradaEstado = {
  hoy: Date
  fechaIngreso: Date
  fechaEgreso: Date | null
  /** Períodos (primer día del mes) con liquidación MENSUAL confirmada y no anulada. */
  periodosMensualesConfirmados: readonly Date[]
  /**
   * §4.2.3 — existe alguna liquidación confirmada, de cualquier período y tipo, sin ningún
   * movimiento de cuenta corriente de tipo PAGO vinculado.
   */
  hayLiquidacionImpaga: boolean
}

/**
 * El umbral del §4.2.3 a partir del cual se espera tener liquidado el mes en curso.
 *
 * Es también el día desde el que se habilita el botón de confirmar la liquidación del mes
 * (`sePuedeConfirmar`, en `lib/calculo/periodos.ts`). Un solo número para las dos cosas: el
 * día en que la empleada empieza a figurar «Falta liquidación» es el día en que se puede
 * liquidar.
 */
export const DIA_UMBRAL_LIQUIDACION = 23

/**
 * Un período cuenta solo si el empleado tuvo vínculo vigente en ese mes:
 * `>= mes de fechaIngreso` y `<= mes de fechaEgreso` si existe.
 */
function tuvoVinculoEn(periodo: Date, fechaIngreso: Date, fechaEgreso: Date | null): boolean {
  const p = primerDiaDelMes(periodo).getTime()
  if (p < primerDiaDelMes(fechaIngreso).getTime()) return false
  if (fechaEgreso && p > primerDiaDelMes(fechaEgreso).getTime()) return false
  return true
}

function hayConfirmadaDe(periodos: readonly Date[], periodo: Date): boolean {
  return periodos.some((p) => mismoPeriodo(p, periodo))
}

export function faltaLiquidacion(entrada: EntradaEstado): boolean {
  const { hoy, fechaIngreso, fechaEgreso, periodosMensualesConfirmados } = entrada

  const m0 = primerDiaDelMes(hoy)
  const m1 = sumarMeses(m0, -1)

  const faltaM0 =
    dia(hoy) >= DIA_UMBRAL_LIQUIDACION &&
    tuvoVinculoEn(m0, fechaIngreso, fechaEgreso) &&
    !hayConfirmadaDe(periodosMensualesConfirmados, m0)

  const faltaM1 =
    tuvoVinculoEn(m1, fechaIngreso, fechaEgreso) &&
    !hayConfirmadaDe(periodosMensualesConfirmados, m1)

  return faltaM0 || faltaM1
}

/**
 * §4.2.3 — el estado resultante es el primero de la tabla que se cumple. El orden es
 * normativo: un empleado dado de baja con la liquidación final impaga muestra "Falta pagar",
 * no "Baja".
 */
export function estadoEmpleado(entrada: EntradaEstado): EstadoEmpleado {
  if (entrada.hayLiquidacionImpaga) return 'FALTA_PAGAR'
  if (faltaLiquidacion(entrada)) return 'FALTA_LIQUIDACION'
  if (entrada.fechaEgreso) return 'BAJA'
  return 'ACTIVO'
}

export const ETIQUETAS_ESTADO: Record<EstadoEmpleado, string> = {
  FALTA_PAGAR: 'Falta pagar',
  FALTA_LIQUIDACION: 'Falta liquidación',
  BAJA: 'Baja',
  ACTIVO: 'Activo',
}
