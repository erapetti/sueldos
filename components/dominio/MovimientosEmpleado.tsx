'use client'

/**
 * §8.3 — submenú de «Movimientos»: los que se cargan de a uno, con su fecha, y no en la
 * planilla.
 *
 * Se dibuja con la misma plantilla que el submenú de «Datos» y, como aquél, **está siempre
 * presente mientras estás en esta rama**: en la sección de la ficha y también en las
 * pantallas que cuelgan de ella, con el botón de donde estás parado marcado. Así se salta de
 * un movimiento a otro sin volver atrás.
 *
 * Tres de los cuatro son **links a su listado**, donde vive el alta; el único que todavía abre
 * un diálogo es Licencia, hasta que tenga su pantalla. Con permiso `VER` el que registra queda
 * deshabilitado y los que llevan al listado siguen activos: mirar no pide permiso de edición, y
 * el alta la esconde la propia pantalla.
 */
import { useState } from 'react'
import { DialogoLicencia } from './DialogoLicencia'
import { DialogoOcultar } from './DialogoOcultar'
import { ItemSubmenu, SubmenuSeccion } from './SubmenuSeccion'

export type MovimientosEmpleadoProps = {
  empleadoId: string
  alias: string
  fechaIngreso: string
  puedeEditar: boolean
  /** §8.3 — "Ocultar del listado" solo si el empleado está dado de baja. */
  dadoDeBaja: boolean
  /** §8.7 — en el listado de todos, además se puede volver a mostrar. */
  mostrarVisibilidad?: boolean
  visible?: boolean
  /** Clave del movimiento donde estás parado, cuando el submenú se dibuja sobre su pantalla. */
  activo?: string
}

type Dialogo = 'LICENCIA' | 'VISIBILIDAD' | null

export function MovimientosEmpleado(props: MovimientosEmpleadoProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const { empleadoId, alias, puedeEditar, dadoDeBaja, activo } = props

  type Movimiento = {
    clave: string
    etiqueta: string
    href?: string
    dialogo?: Exclude<Dialogo, null>
    habilitada: boolean
  }

  /*
    Los cuatro que se cargan de a uno. Horas extras, inasistencias y liquidación tienen cada
    una su sección en el menú de la empleada, así que no se repiten acá.
  */
  const movimientos: Movimiento[] = [
    /*
      Los tres que ya tienen pantalla propia llevan al listado, y el alta vive ahí. Licencia
      sigue abriendo su diálogo hasta que tenga la suya, así que conserva el «Registrar …»
      —prometer un listado que todavía no existe sería peor—.

      Mirar un listado no pide permiso de edición: el alta la esconde la propia pantalla.
    */
    {
      clave: 'prestamo',
      etiqueta: 'Préstamos',
      href: `/empleados/${empleadoId}/prestamos`,
      habilitada: true,
    },
    {
      clave: 'pago-adicional',
      etiqueta: 'Pagos adicionales',
      href: `/empleados/${empleadoId}/pagos-adicionales`,
      habilitada: true,
    },
    {
      clave: 'licencia',
      etiqueta: 'Registrar licencia',
      dialogo: 'LICENCIA',
      habilitada: puedeEditar,
    },
    {
      clave: 'pago-bancario',
      etiqueta: 'Pagos bancarios',
      href: `/empleados/${empleadoId}/pagos-bancarios`,
      habilitada: true,
    },
  ]

  /*
    §8.3 / §8.7 — ocultar del listado, o volver a mostrarlo. No es un movimiento, pero desde
    que los listados no tienen fila de acciones este es el único lugar donde se puede cambiar.
  */
  const puedeCambiarVisibilidad = puedeEditar && (props.mostrarVisibilidad ? true : dadoDeBaja)

  if (puedeCambiarVisibilidad) {
    const ocultando = props.visible !== false
    movimientos.push({
      clave: 'visibilidad',
      etiqueta: ocultando ? 'Ocultar del listado' : 'Volver a mostrar en el listado',
      dialogo: 'VISIBILIDAD',
      habilitada: ocultando ? dadoDeBaja : true,
    })
  }

  return (
    <>
      <SubmenuSeccion etiqueta="Movimientos">
        {movimientos.map((movimiento) => (
          <ItemSubmenu
            key={movimiento.clave}
            activo={activo === movimiento.clave}
            href={movimiento.href}
            disabled={!movimiento.habilitada}
            onClick={movimiento.dialogo ? () => setDialogo(movimiento.dialogo!) : undefined}
          >
            {movimiento.etiqueta}
          </ItemSubmenu>
        ))}
      </SubmenuSeccion>

      <DialogoLicencia
        abierto={dialogo === 'LICENCIA'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        fechaIngreso={props.fechaIngreso}
      />
      <DialogoOcultar
        abierto={dialogo === 'VISIBILIDAD'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        visible={props.visible !== false}
      />
    </>
  )
}
