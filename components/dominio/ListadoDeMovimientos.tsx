'use client'

/**
 * Listado de uno de los movimientos que se cargan de a uno: préstamos, pagos adicionales,
 * licencias y pagos bancarios.
 *
 * Es el patrón de «Mi Personal» (§8.3) llevado adentro de la empleada. Lo único que agrega
 * sobre `Tabla` es el encabezado —el título, el botón que da de alta uno nuevo y un resumen
 * opcional—; las cuatro pantallas se diferencian en las columnas y en el diálogo de alta, y eso
 * entra por props.
 */
import { Tabla, type Columna } from './Tabla'

/** Las columnas son las de cualquier tabla; el alias es para que la pantalla no importe dos. */
export type ColumnaListado<T> = Columna<T>

export function ListadoDeMovimientos<T extends { id: string }>({
  titulo,
  accion,
  resumen,
  columnas,
  filas,
  hrefDetalle,
  vacio,
  atenuada,
}: {
  titulo: string
  /** El botón de alta, a la derecha del título. */
  accion?: React.ReactNode
  /** Lo que se lee antes de la tabla: el saldo de días de licencia (§4.15.1). */
  resumen?: React.ReactNode
  columnas: ColumnaListado<T>[]
  filas: T[]
  /**
   * A dónde lleva cada fila. La primera columna es el enlace; lo pone `Tabla`. Sin esto la tabla
   * no tiene detalle: ni enlace ni resaltado, que es el criterio de §1.10.
   */
  hrefDetalle?: (fila: T) => string
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

      {resumen}

      <Tabla
        columnas={columnas}
        filas={filas}
        hrefDetalle={hrefDetalle}
        vacio={vacio}
        claseDeFila={(fila) => (atenuada?.(fila) ? 'opacity-60' : undefined)}
      />
    </section>
  )
}
