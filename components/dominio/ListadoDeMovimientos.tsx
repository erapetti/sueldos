/**
 * Listado de una de las acciones que se cargan de a una: préstamos, y en su momento pagos
 * adicionales, licencias y pagos bancarios.
 *
 * Es el patrón de «Mi Personal» (§8.3) llevado adentro de la empleada: título, el botón que
 * da de alta uno nuevo, y la tabla donde una columna enlaza al detalle. Las cuatro pantallas
 * se diferencian en las columnas y en el diálogo de alta, así que eso entra por props y la
 * cáscara se escribe una sola vez.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type ColumnaListado<T> = {
  clave: string
  etiqueta: string
  /** Alinea a la derecha y usa la tipografía tabular; para importes y cantidades. */
  numerica?: boolean
  celda: (fila: T) => React.ReactNode
}

export function ListadoDeMovimientos<T extends { id: string }>({
  titulo,
  accion,
  columnas,
  filas,
  vacio,
  atenuada,
}: {
  titulo: string
  /** El botón de alta, a la derecha del título. */
  accion?: React.ReactNode
  columnas: ColumnaListado<T>[]
  filas: T[]
  /** Qué decir cuando no hay ninguno todavía. */
  vacio: React.ReactNode
  /** Filas que van en gris, como las anuladas. */
  atenuada?: (fila: T) => boolean
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[28px] leading-tight">{titulo}</h2>
        {accion}
      </div>

      <div className="overflow-x-auto rounded-card border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              {columnas.map((c) => (
                <TableHead key={c.clave} className={cn(c.numerica && 'text-right')}>
                  {c.etiqueta}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              filas.map((fila) => (
                <TableRow key={fila.id} className={cn(atenuada?.(fila) && 'opacity-60')}>
                  {columnas.map((c) => (
                    <TableCell
                      key={c.clave}
                      className={cn(c.numerica && 'text-right tabular')}
                    >
                      {c.celda(fila)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
