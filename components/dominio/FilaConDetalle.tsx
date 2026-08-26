'use client'

/**
 * Fila de tabla que abre un detalle.
 *
 * Criterio único de las tablas de la aplicación:
 *
 * - **La fila tiene detalle** → la primera columna es el enlace, con `ENLACE_PRINCIPAL`, y la
 *   fila entera lleva al mismo lado y se resalta al pasar por encima.
 * - **La fila no tiene detalle** —las líneas de la liquidación, la cuenta corriente, los
 *   listados de administración— → ni enlace ni resaltado. El resaltado es la promesa de que
 *   hay algo del otro lado; sin destino, engaña.
 *
 * Por eso `TableRow` ya no trae `hover:bg-muted/50` de fábrica (ver el README): el resaltado
 * se pide acá, que es donde se sabe que hay a dónde ir.
 *
 * **El enlace real vive en la celda**, no en la fila: un `<a>` no puede envolver un `<tr>`.
 * La fila solo agrega el clic, así que el teclado y el lector de pantalla siguen viendo un
 * único enlace por fila y sin JavaScript la tabla sigue navegándose por la primera columna.
 */
import { useRouter } from 'next/navigation'
import { TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** La primera columna de una fila con detalle, igual en todas las tablas. */
export const ENLACE_PRINCIPAL = 'text-lg font-medium hover:underline'

/** Controles de la fila que tienen lo suyo que hacer y le ganan al clic de la fila. */
const CONTROLES_PROPIOS = 'a, button, input, select, textarea, label, [role="menuitem"]'

export function FilaConDetalle({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <TableRow
      className={cn('cursor-pointer hover:bg-muted/5', className)}
      onClick={(e) => {
        // El chip de estado y el menú de acciones llevan a otro lado: mandan ellos.
        if ((e.target as HTMLElement).closest(CONTROLES_PROPIOS)) return
        // Arrastrar para seleccionar texto termina en un clic sobre la fila, y no es navegar.
        if (window.getSelection()?.toString()) return
        router.push(href)
      }}
    >
      {children}
    </TableRow>
  )
}
