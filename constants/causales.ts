/** Anexo B — Causales de falta (§4.6). */
export const CAUSALES_FALTA = [
  { valor: 'CON_AVISO', etiqueta: 'Con aviso' },
  { valor: 'SIN_AVISO', etiqueta: 'Sin aviso' },
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad' },
  { valor: 'MATERNIDAD', etiqueta: 'Maternidad' },
  { valor: 'RECUPERA_OTRO_DIA', etiqueta: 'Recupera otro día' },
] as const

export type CausalFaltaValor = (typeof CAUSALES_FALTA)[number]['valor']

/**
 * §4.6.1 — el campo `descuenta` solo es editable con causal ENFERMEDAD.
 * En CON_AVISO, SIN_AVISO y MATERNIDAD se fuerza a true, y en RECUPERA_OTRO_DIA a false.
 */
export function descuentaEsEditable(causal: CausalFaltaValor): boolean {
  return causal === 'ENFERMEDAD'
}

/**
 * Normaliza `descuenta` según la causal, sin confiar en lo que llegue del cliente.
 *
 * `RECUPERA_OTRO_DIA` es la única causal que **nunca** descuenta: las horas se trabajan otro
 * día, así que el sueldo no se toca. Lo que sí pierde es el boleto de ese día, y eso sale
 * solo de la regla de la jornada completa del §6.4, que no mira `descuenta`.
 */
export function normalizarDescuenta(causal: CausalFaltaValor, descuenta: boolean): boolean {
  if (causal === 'RECUPERA_OTRO_DIA') return false
  return descuentaEsEditable(causal) ? descuenta : true
}

export function etiquetaCausal(causal: CausalFaltaValor): string {
  return CAUSALES_FALTA.find((c) => c.valor === causal)?.etiqueta ?? causal
}
