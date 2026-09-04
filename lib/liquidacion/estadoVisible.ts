/**
 * §4.14 — en qué estado está una liquidación, en los términos en que la pantalla lo dice.
 *
 * La fila de la base guarda dos cosas por separado —si está anulada y si está pagada— y las
 * dos pantallas que lo muestran, la vista Lista y el chip del detalle, tienen que combinarlas
 * igual. Los rótulos y el dibujo del chip están en `components/dominio/EstadoLiquidacion`;
 * acá vive solo la regla, que es lo que también necesita el servidor.
 */

/**
 * Los cinco estados que se pueden ver. `SIN_CONFIRMAR` no sale de ninguna fila: es lo que le
 * pasa al período que todavía no tiene liquidación, y por eso no aparece en la Lista, que
 * solo tiene filas.
 */
export type EstadoVisible = 'SIN_CONFIRMAR' | 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA' | 'ANULADA'

/**
 * La anulación tapa al pago: una anulada no tiene estado de pago que valga la pena mostrar.
 * Sin liquidación —`null`— el período está sin confirmar.
 */
export function estadoVisible(
  liquidacion: { estado: string; pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA' } | null,
): EstadoVisible {
  if (!liquidacion) return 'SIN_CONFIRMAR'
  return liquidacion.estado === 'ANULADA' ? 'ANULADA' : liquidacion.pago
}
