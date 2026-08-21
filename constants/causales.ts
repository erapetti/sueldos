/** Anexo B — Causales de falta (§4.6). */
export const CAUSALES_FALTA = [
  { valor: 'CON_AVISO', etiqueta: 'Con aviso' },
  { valor: 'SIN_AVISO', etiqueta: 'Sin aviso' },
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad' },
  { valor: 'MATERNIDAD', etiqueta: 'Maternidad' },
] as const

export type CausalFaltaValor = (typeof CAUSALES_FALTA)[number]['valor']

/**
 * §4.6.1 — el campo `descuenta` solo es editable con causal ENFERMEDAD.
 * En CON_AVISO, SIN_AVISO y MATERNIDAD se fuerza a true.
 */
export function descuentaEsEditable(causal: CausalFaltaValor): boolean {
  return causal === 'ENFERMEDAD'
}

/** Normaliza `descuenta` según la causal, sin confiar en lo que llegue del cliente. */
export function normalizarDescuenta(causal: CausalFaltaValor, descuenta: boolean): boolean {
  return descuentaEsEditable(causal) ? descuenta : true
}

export function etiquetaCausal(causal: CausalFaltaValor): string {
  return CAUSALES_FALTA.find((c) => c.valor === causal)?.etiqueta ?? causal
}
