'use client'

/**
 * §7.6 — cuál de las dos caras de la pantalla de liquidación se está mostrando.
 *
 * La vista es estado del componente, igual que en las planillas: el conmutador Lista /
 * Detalle no toca la URL. Pero la Lista sí enlaza al Detalle, y con la vista solamente en el
 * estado ese clic cambiaba el período y dejaba la Lista puesta, así que parecía no hacer
 * nada. Por eso los enlaces de la Lista dicen `vista=detalle`.
 *
 * `pedido` es la firma de lo que pide la URL —período, tipo y secuencia—. Cuando cambia, un
 * `vista` explícito manda; cuando la URL no dice nada, como en las flechas del navegador, se
 * conserva la cara que el usuario había elegido.
 */
import { useState } from 'react'
import type { VistaDeLiquidacion } from '@/lib/calculo/periodos'

export function useModoLista(
  vista: VistaDeLiquidacion | null,
  pedido: string,
): [boolean, (v: boolean) => void] {
  const [modoLista, setModoLista] = useState(vista === 'lista')
  const [ultimoPedido, setUltimoPedido] = useState(pedido)

  // Ajuste de estado durante el dibujado: React lo vuelve a dibujar sin pasar por el DOM, y
  // así la pantalla no aparece un instante con la cara vieja.
  if (pedido !== ultimoPedido) {
    setUltimoPedido(pedido)
    if (vista) setModoLista(vista === 'lista')
  }

  return [modoLista, setModoLista]
}
