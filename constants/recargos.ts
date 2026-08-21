/** Anexo B — Recargo de horas extras. */
export const RECARGOS = [0, 20, 100, 120, 150, 170, 200, 220] as const

export type Recargo = (typeof RECARGOS)[number]

export function esRecargoValido(valor: number): valor is Recargo {
  return (RECARGOS as readonly number[]).includes(valor)
}
