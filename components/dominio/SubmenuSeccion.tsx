/**
 * Submenú de segundo nivel: la fila de botones que cuelga de un ítem del menú de la empleada.
 *
 * Lo usan «Datos» —Generales, Salario, Régimen, Compartido con— y «Movimientos» —Préstamos,
 * pagos adicionales, licencias, pagos bancarios—. Las dos se dibujaban distinto: Datos como
 * una fila suelta siempre presente, y Movimientos como una tarjeta con un texto explicativo
 * arriba. Queda la de Datos, que es la que se comporta como un submenú: está siempre a la
 * vista mientras estás en esa rama y el botón de donde estás parado queda marcado.
 *
 * Es un `<nav>` y no un `<div>`: un submenú es navegación, y el landmark le da al lector de
 * pantalla una forma de saltar hasta acá y de saber que estos botones son hermanos entre sí.
 * En «Movimientos» tres de los cuatro todavía abren un diálogo en vez de navegar, que es lo
 * único que hoy desentona con el landmark; se corrige solo cuando tengan su pantalla.
 */
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function SubmenuSeccion({
  etiqueta,
  children,
}: {
  /** Nombre del submenú para el lector de pantalla: «Datos», «Movimientos». */
  etiqueta: string
  children: React.ReactNode
}) {
  return (
    <nav aria-label={etiqueta} className="flex flex-wrap gap-2">
      {children}
    </nav>
  )
}

/**
 * Un botón del submenú. Con `href` navega y marca `aria-current` cuando es el activo; sin
 * `href` es un disparador de diálogo, que es como funcionan por ahora tres de los cuatro
 * movimientos.
 */
export function ItemSubmenu({
  activo,
  href,
  onClick,
  disabled,
  children,
}: {
  activo?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  // El activo va en `default` y el resto en `outline`: es lo que marca dónde estás parado.
  const variante = activo ? 'default' : 'outline'

  // Con `asChild` el `disabled` se pierde —un `<a>` no lo tiene—, así que un link
  // deshabilitado se dibuja como botón sin link.
  if (href && !disabled) {
    return (
      <Button asChild variant={variante} size="sm">
        <Link href={href} aria-current={activo ? 'page' : undefined}>
          {children}
        </Link>
      </Button>
    )
  }

  return (
    <Button variant={variante} size="sm" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
