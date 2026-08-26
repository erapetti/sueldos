'use client'

/**
 * La tabla de la aplicación. Las diez tablas se dibujan con esta.
 *
 * Antes cada pantalla repetía el mismo andamio a mano —el envoltorio de tarjeta con su
 * `overflow-x-auto`, el `<TableHeader>`, la fila de «todavía no hay nada»— y eso se había
 * copiado quince veces. Con el andamio duplicado, un `colSpan` escrito a mano quedaba viejo en
 * cuanto alguien agregaba una columna, y un cambio de estilo había que ir a buscarlo a diez
 * archivos.
 *
 * **Los dos tipos de tabla son el mismo componente**, y lo que los separa es `hrefDetalle`:
 *
 * - **Con `hrefDetalle`** → la fila lleva a un detalle: la primera columna se dibuja como
 *   enlace y la fila entera va al mismo lado y se resalta (ver `FilaConDetalle`).
 * - **Sin `hrefDetalle`** → la fila no lleva a ningún lado: ni enlace ni resaltado, y la
 *   primera columna se dibuja como le convenga a la pantalla.
 *
 * Las columnas se declaran en un array en vez de escribir el `<thead>` y el `<tbody>` por
 * separado, que es lo que hacía que se desincronizaran.
 */
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ENLACE_PRINCIPAL, FilaConDetalle } from './FilaConDetalle'

/** Desde qué ancho aparece una columna; abajo de eso se esconde. */
type Breakpoint = 'sm' | 'md' | 'lg'

const CLASES_BREAKPOINT: Record<Breakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

export type Columna<T> = {
  clave: string
  etiqueta: React.ReactNode
  /** Alinea la columna a la derecha, encabezado incluido. */
  derecha?: boolean
  /** Como `derecha`, y además tipografía tabular; para importes y cantidades. */
  numerica?: boolean
  /** Se esconde abajo de este ancho. La información que se pierde va en otra celda. */
  desde?: Breakpoint
  /** Clases extra de la celda, para las que no son ni numéricas ni de texto común. */
  className?: string
  celda: (fila: T) => React.ReactNode
  /**
   * Solo para la primera columna de una tabla con detalle: lo que va **fuera** del enlace.
   * `alLado` en la misma línea —un chip de estado— y `debajo` en la de abajo —el dato que la
   * columna escondida por breakpoint dejó de mostrar—.
   *
   * Existen porque el enlace envuelve a `celda`, y todo lo que quede adentro pasa a ser texto
   * del enlace: sin esto, el lector de pantalla anuncia «Ana Ana Pereyra Gómez» en vez de
   * «Ana».
   */
  alLado?: (fila: T) => React.ReactNode
  debajo?: (fila: T) => React.ReactNode
}

export function Tabla<T extends { id: string }>({
  columnas,
  filas,
  hrefDetalle,
  vacio,
  claseDeFila,
  className,
}: {
  columnas: Columna<T>[]
  filas: T[]
  /**
   * A dónde lleva cada fila. Presente convierte la tabla en una «con detalle»: la primera
   * columna pasa a ser el enlace y la fila entera lleva al mismo lado.
   */
  hrefDetalle?: (fila: T) => string
  /** Qué decir cuando no hay ninguna fila. Sin esto, la tabla vacía no dice nada. */
  vacio?: React.ReactNode
  /** Clases de una fila concreta: las anuladas van atenuadas, las reversas en gris. */
  claseDeFila?: (fila: T) => string | undefined
  className?: string
}) {
  /** Lo que comparten encabezado y celda: la alineación y el breakpoint. */
  const claseComun = (c: Columna<T>) =>
    cn((c.derecha || c.numerica) && 'text-right', c.desde && CLASES_BREAKPOINT[c.desde])

  const claseDeCelda = (c: Columna<T>) =>
    cn(claseComun(c), c.numerica && 'tabular', c.className)

  /** Las celdas de una fila. La primera columna sabe si tiene que ser el enlace. */
  const celdas = (fila: T) =>
    columnas.map((c, i) => (
      <TableCell key={c.clave} className={claseDeCelda(c)}>
        {i === 0 && hrefDetalle ? (
          <>
            <span className="flex flex-wrap items-center gap-2">
              <Link href={hrefDetalle(fila)} className={ENLACE_PRINCIPAL}>
                {c.celda(fila)}
              </Link>
              {c.alLado?.(fila)}
            </span>
            {c.debajo?.(fila)}
          </>
        ) : (
          c.celda(fila)
        )}
      </TableCell>
    ))

  return (
    <div className={cn('overflow-x-auto rounded-card border bg-card shadow-soft', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columnas.map((c) => (
              <TableHead key={c.clave} className={claseComun(c)}>
                {c.etiqueta}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.length === 0 ? (
            vacio ? (
              <TableRow>
                {/* El `colSpan` sale de las columnas declaradas y no se puede quedar viejo. */}
                <TableCell
                  colSpan={columnas.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : null
          ) : (
            filas.map((fila) =>
              hrefDetalle ? (
                <FilaConDetalle
                  key={fila.id}
                  href={hrefDetalle(fila)}
                  className={claseDeFila?.(fila)}
                >
                  {celdas(fila)}
                </FilaConDetalle>
              ) : (
                <TableRow key={fila.id} className={claseDeFila?.(fila)}>
                  {celdas(fila)}
                </TableRow>
              ),
            )
          )}
        </TableBody>
      </Table>
    </div>
  )
}
