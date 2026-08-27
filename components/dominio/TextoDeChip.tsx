/**
 * Contenido de un chip de listado: el icono siempre, y el texto cuando hay ancho para él.
 *
 * En los listados el chip compite por el espacio con el alias y el nombre, y «Falta
 * liquidación» era el elemento más ancho de la fila. Antes se probó partirlo en dos renglones
 * y quedaba feo; el icono dice lo mismo y ocupa una fracción.
 *
 * El icono **no lleva clase de tamaño**: queda en el suyo, que es el que se lee bien tanto en
 * el chip de solo icono como al lado del texto. Con `size-3` —12px, que es lo que le pone el
 * `Badge` a un `<svg>` que sea hijo directo— quedaba demasiado chico para reconocerlo.
 *
 * **El texto está siempre en el DOM**, nunca se quita: abajo de `lg` va con `sr-only`, que lo
 * saca de la pantalla pero lo deja para el lector de pantalla. Un chip que abajo de `lg` fuera
 * solo un dibujo no diría nada.
 *
 * Y como ahí el texto no se ve, el icono lleva `title`: el que está en una pantalla mediana
 * —con mouse pero sin lugar para el texto— lo averigua pasando por encima. Va en un envoltorio
 * porque un `title` como atributo de `<svg>` no muestra nada; el tooltip de SVG pide un
 * elemento `<title>` adentro.
 */
import type { LucideIcon } from 'lucide-react'

export function TextoDeChip({ icono: Icono, children }: { icono: LucideIcon; children: string }) {
  return (
    <>
      <span title={children} className="inline-flex shrink-0">
        <Icono aria-hidden />
      </span>
      {/* Las clases van literales: Tailwind lee el código como texto y no resuelve variables. */}
      <span className="sr-only lg:not-sr-only">{children}</span>
    </>
  )
}
