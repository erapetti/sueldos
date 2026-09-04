/**
 * §4.14 — cómo se muestra en qué estado está una liquidación.
 *
 * Lo dicen dos lugares de la misma pantalla —la columna «Estado» de la vista Lista y el chip
 * que acompaña al navegador de períodos en el detalle— y tienen que decir lo mismo con las
 * mismas palabras: si la Lista dice «Pago parcial» y el chip dice «Sin pagar» para la misma
 * liquidación, la que está mal es la aplicación.
 *
 * Lo que cambia entre los dos es el dibujo. En la Lista es un `Badge`, que es lo que llevan
 * las otras tablas; al lado del navegador es la píldora de las planillas, para que las tres
 * pantallas de la empleada tengan la misma fila de controles.
 *
 * No lleva `'use client'` a propósito: es presentación pura, sin estado ni eventos, así que
 * la usan igual la Lista, que es de cliente, y la página, que es de servidor.
 */
import { Badge } from '@/components/ui/badge'
import type { EstadoVisible } from '@/lib/liquidacion/estadoVisible'

const ETIQUETA: Record<EstadoVisible, string> = {
  SIN_CONFIRMAR: 'Sin confirmar',
  SIN_PAGAR: 'Sin pagar',
  PARCIAL: 'Pago parcial',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
}

/** Solo la liquidación cobrada se destaca; las demás son el estado normal de las cosas. */
const VARIANTE: Record<EstadoVisible, 'secondary' | 'outline'> = {
  SIN_CONFIRMAR: 'outline',
  SIN_PAGAR: 'outline',
  PARCIAL: 'outline',
  PAGADA: 'secondary',
  ANULADA: 'outline',
}

/**
 * La píldora que va al lado del navegador de meses. La clase la comparten la liquidación y
 * las planillas —donde además es un enlace y agrega su hover—, que es lo único que hace que
 * las dos filas de controles se vean como la misma cosa.
 */
export const CHIP_DE_PERIODO = 'rounded-full border px-3 py-1 text-sm text-muted-foreground'

/** El estado como celda de tabla: la columna «Estado» de la Lista. */
export function EstadoLiquidacion({
  estado,
  className,
}: {
  estado: EstadoVisible
  className?: string
}) {
  return (
    <Badge variant={VARIANTE[estado]} className={className}>
      {ETIQUETA[estado]}
    </Badge>
  )
}

/** El estado como chip de la fila de controles. */
export function ChipDeEstado({ estado }: { estado: EstadoVisible }) {
  return <span className={CHIP_DE_PERIODO}>{ETIQUETA[estado]}</span>
}
