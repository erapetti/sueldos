'use client'

/**
 * El marco de una pantalla de la rama «Movimientos»: el encabezado de la empleada arriba y su
 * submenú debajo, con el ítem de donde estás parado marcado.
 *
 * Las pantallas de la rama —el listado y el detalle de cada movimiento— empiezan igual, y los
 * datos de la empleada que necesitan esas dos piezas viajaban repetidos prop por prop en cada
 * una. Acá viajan en un solo objeto, que la página arma con `empleadaDelMarco`
 * (`lib/auth/guards.ts`) desde el mismo `accesoAEmpleado` que ya resolvió el permiso. La
 * `fechaIngreso` no la usa el marco: la usan los diálogos de alta de cada pantalla, para no
 * ofrecer fechas anteriores al ingreso.
 */
import type { ListadoDePersonal } from '@/constants/listados'
import { EncabezadoEmpleada } from './EncabezadoEmpleada'
import { MovimientosEmpleado } from './MovimientosEmpleado'

/** Lo que el marco necesita saber de la empleada. Lo arma `empleadaDelMarco`. */
export type EmpleadaDelMarco = {
  id: string
  alias: string
  nombreCompleto: string
  fechaIngreso: string
  /** De qué listado se vino, para el breadcrumb del encabezado. */
  listadoDeOrigen: ListadoDePersonal
  soloLectura: boolean
  dadoDeBaja: boolean
  visible: boolean
}

export function MarcoDeMovimientos({
  empleada,
  activo,
  children,
}: {
  empleada: EmpleadaDelMarco
  /** Clave del ítem del submenú donde estás parado. */
  activo: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-5">
      <EncabezadoEmpleada
        empleadoId={empleada.id}
        alias={empleada.alias}
        nombreCompleto={empleada.nombreCompleto}
        activa="movimientos"
        listadoDeOrigen={empleada.listadoDeOrigen}
      />

      {/* El submenú acompaña como en Datos: está presente en toda la rama, no solo en su índice. */}
      <MovimientosEmpleado
        empleadoId={empleada.id}
        alias={empleada.alias}
        puedeEditar={!empleada.soloLectura}
        dadoDeBaja={empleada.dadoDeBaja}
        mostrarVisibilidad={!empleada.visible}
        visible={empleada.visible}
        activo={activo}
      />

      {children}
    </div>
  )
}
