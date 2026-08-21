/**
 * §5 — resolución de series con fecha de vigencia.
 *
 * Aplica igual a empleado_salarios, empleado_valor_hora_negro, empleado_regimenes,
 * bps_conceptos y valor_boleto.
 */
import { dia, primerDiaDelMes } from '@/lib/format/dates'

export type RegistroConVigencia = { fechaVigencia: Date }

/**
 * §5.2 — el registro vigente para el período P es el de mayor `fechaVigencia` que sea
 * `<= primer día de P`. Devuelve `null` si no hay ninguno; nunca asume cero (§6.8).
 */
export function vigenteEn<T extends RegistroConVigencia>(registros: readonly T[], periodo: Date): T | null {
  const limite = primerDiaDelMes(periodo).getTime()
  let elegido: T | null = null
  for (const r of registros) {
    const t = r.fechaVigencia.getTime()
    if (t > limite) continue
    if (elegido === null || t > elegido.fechaVigencia.getTime()) elegido = r
  }
  return elegido
}

/** Todos los registros vigentes o futuros respecto de un período, ordenados. */
export function ordenarPorVigencia<T extends RegistroConVigencia>(registros: readonly T[]): T[] {
  return [...registros].sort((a, b) => a.fechaVigencia.getTime() - b.fechaVigencia.getTime())
}

/** §5.1 — toda fecha de vigencia es el día 1 de un mes. */
export function esFechaVigenciaValida(f: Date): boolean {
  return dia(f) === 1
}
