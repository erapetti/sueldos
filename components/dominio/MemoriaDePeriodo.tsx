'use client'

/**
 * Anota el mes que está mirando la pantalla, para que la siguiente lo abra en el mismo.
 *
 * El que lo lee es el servidor —las tres pantallas resuelven su período antes de dibujarse
 * (`lib/consultas/periodoDePantalla.ts`)—, así que el lugar donde se guarda tiene que viajar
 * en el request: una cookie, y no `sessionStorage`. Escribirla desde el cliente es la única
 * opción que queda, porque un componente de servidor no puede mandar `Set-Cookie`.
 *
 * No dibuja nada: es solo el efecto.
 */
import { useEffect } from 'react'
import { COOKIE_PERIODO } from '@/lib/calculo/periodos'

export function MemoriaDePeriodo({ periodo }: { periodo: string }) {
  useEffect(() => {
    // Sin `max-age` ni `expires`: es una cookie de sesión y muere con la ventana.
    document.cookie = `${COOKIE_PERIODO}=${periodo}; path=/; samesite=lax`
  }, [periodo])

  return null
}
