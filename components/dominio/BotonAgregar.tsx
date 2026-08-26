/**
 * El botón de agregar de un listado: el «+» y la etiqueta de lo que se agrega.
 *
 * Estaba copiado en los tres listados de movimientos y en el de personal, y cada copia volvía
 * a decidir el icono, su tamaño y el `aria-hidden`. Es un solo gesto —«acá se agrega uno»— así
 * que vive en un solo lugar: si mañana cambia el icono o el acento del botón, cambia una vez.
 *
 * Con `href` navega y con `onClick` abre un diálogo, que son las dos formas que hay hoy. Es la
 * misma bifurcación de `ItemSubmenu`, y por el mismo motivo: con `asChild` el `disabled` se
 * pierde, porque un `<a>` no lo tiene.
 */
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BotonAgregar({
  href,
  onClick,
  disabled,
  children,
}: {
  /** Adónde lleva, si agregar es navegar a un formulario. */
  href?: string
  /** Qué hace, si agregar es abrir un diálogo. */
  onClick?: () => void
  disabled?: boolean
  /** La etiqueta: «Nuevo préstamo», «Nueva empleada». */
  children: React.ReactNode
}) {
  const contenido = (
    <>
      <Plus className="size-4" aria-hidden />
      {children}
    </>
  )

  if (href && !disabled) {
    return (
      <Button asChild>
        <Link href={href}>{contenido}</Link>
      </Button>
    )
  }

  return (
    <Button onClick={onClick} disabled={disabled}>
      {contenido}
    </Button>
  )
}
