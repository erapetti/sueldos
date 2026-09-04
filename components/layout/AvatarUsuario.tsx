'use client'

/**
 * §8.1 — el avatar de la barra superior.
 *
 * La foto sale del claim `picture` de Google y llega ya validada desde `currentUser.ts`
 * (README §5.7). Puede no haber —usuarios sin foto, o un claim que no vino— y puede fallar la
 * carga, porque la URL la sirve Google y nosotros no la controlamos. En los dos casos quedan
 * las iniciales, que es lo que se mostraba antes.
 */
import { useEffect, useRef, useState } from 'react'

/** Iniciales para el avatar (dos palabras como máximo). */
function iniciales(nombre: string | null, email: string) {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length > 0) {
    return partes
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function AvatarUsuario({
  nombre,
  email,
  foto,
}: {
  nombre: string | null
  email: string
  foto: string | null
}) {
  const [rota, setRota] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  /**
   * Con SSR el `onError` no alcanza. El navegador pide la imagen mientras parsea el HTML, o
   * sea **antes** de que React hidrate y enganche el handler, así que si falla ahí el evento
   * ya pasó y nunca se entera: queda el ícono de imagen rota en la barra, para siempre. Al
   * montar, una imagen `complete` con `naturalWidth` en 0 es exactamente una que falló.
   */
  useEffect(() => {
    const img = ref.current
    if (img?.complete) setRota(img.naturalWidth === 0)
  }, [foto])

  return (
    <span
      title={email}
      className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-xs font-semibold tracking-wide text-primary-ink"
    >
      {foto && !rota ? (
        // 34 px de un host externo: el optimizador de Next no aporta nada acá y obligaría a
        // declarar `remotePatterns` para googleusercontent.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={foto}
          alt=""
          width={34}
          height={34}
          className="size-full object-cover"
          // googleusercontent contesta 403 si le llega un Referer de otro origen.
          referrerPolicy="no-referrer"
          onError={() => setRota(true)}
        />
      ) : (
        iniciales(nombre, email)
      )}
    </span>
  )
}
