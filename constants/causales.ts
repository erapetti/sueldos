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
 * Con qué valor nace `descuenta` al elegir la causal. Al cambiar de causal el interruptor
 * vuelve a este valor, aunque se lo haya movido a mano.
 *
 * `RECUPERA_OTRO_DIA` es la única que arranca sin descontar: las horas se trabajan otro día,
 * así que el sueldo no se toca. Lo que sí pierde es el boleto de ese día, y eso sale de la
 * regla de la jornada completa del §6.4, que no mira `descuenta`.
 */
export function descuentaInicial(causal: CausalFaltaValor): boolean {
  return causal !== 'RECUPERA_OTRO_DIA'
}

/**
 * Si el interruptor se puede mover. El resto de las causales lo muestran igual, pero
 * deshabilitado, para que se vea el efecto que tienen.
 *
 * - `ENFERMEDAD` — §4.6.1: el subsidio de BPS cubre desde el 4° día, así que los primeros
 *   pueden quedar a cargo del empleador y hay que poder decidirlo caso por caso.
 * - `CON_AVISO` — por flexibilidad, a pedido del usuario. **Divergencia con el §4.6.1**, que
 *   la lista entre las que se fuerzan a `true`.
 *
 * `SIN_AVISO` descuenta siempre; `MATERNIDAD` también, porque esa licencia la paga BPS y
 * nunca el empleador; `RECUPERA_OTRO_DIA` nunca descuenta.
 */
export function descuentaEsEditable(causal: CausalFaltaValor): boolean {
  return causal === 'ENFERMEDAD' || causal === 'CON_AVISO'
}

/** Normaliza `descuenta` según la causal, sin confiar en lo que llegue del cliente. */
export function normalizarDescuenta(causal: CausalFaltaValor, descuenta: boolean): boolean {
  return descuentaEsEditable(causal) ? descuenta : descuentaInicial(causal)
}

export function etiquetaCausal(causal: CausalFaltaValor): string {
  return CAUSALES_FALTA.find((c) => c.valor === causal)?.etiqueta ?? causal
}
