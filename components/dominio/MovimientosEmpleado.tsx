'use client'

/**
 * §8.3 — sección «Movimientos» de la ficha: un botón con etiqueta por cada movimiento que se
 * carga de a uno, con su fecha, y no en la planilla. Con permiso `VER` los de registro quedan
 * deshabilitados; Préstamos, que solo lleva al listado, sigue activo.
 */
import Link from 'next/link'
import { useState } from 'react'
import { Eye, EyeOff, HandCoins, Landmark, Palmtree, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogoPagoAdicional } from './DialogoPagoAdicional'
import { DialogoPagoBancario } from './DialogoPagoBancario'
import { DialogoLicencia } from './DialogoLicencia'
import { DialogoOcultar } from './DialogoOcultar'

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
}

type Dialogo = 'PAGO_ADICIONAL' | 'PAGO_BANCARIO' | 'LICENCIA' | 'VISIBILIDAD' | null

export function MovimientosEmpleado(props: MovimientosEmpleadoProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const { empleadoId, alias, puedeEditar, dadoDeBaja } = props

  type Movimiento = {
    clave: string
    etiqueta: string
    icono: React.ComponentType<{ className?: string }>
    href?: string
    dialogo?: Exclude<Dialogo, null>
    habilitada: boolean
  }

  /*
    Los cuatro que se cargan de a uno. Horas extras, inasistencias y liquidación estaban acá
    cuando esto era la botonera de «Acciones»; ahora cada una tiene su sección en el menú de
    la empleada, así que no se repiten.
  */
  const movimientos: Movimiento[] = [
    {
      /*
        Préstamos ya tiene pantalla propia: el botón lleva al listado y el alta vive ahí. Los
        otros tres siguen abriendo su diálogo hasta que tengan la suya, así que conservan el
        «Registrar …» —prometer un listado que todavía no existe sería peor—.
      */
      clave: 'prestamo',
      etiqueta: 'Préstamos',
      icono: HandCoins,
      href: `/empleados/${empleadoId}/prestamos`,
      // Mirar el listado no pide permiso de edición; el alta la esconde la propia pantalla.
      habilitada: true,
    },
    {
      clave: 'pago-adicional',
      etiqueta: 'Registrar pago adicional',
      icono: PlusCircle,
      dialogo: 'PAGO_ADICIONAL',
      habilitada: puedeEditar,
    },
    {
      clave: 'licencia',
      etiqueta: 'Registrar licencia',
      icono: Palmtree,
      dialogo: 'LICENCIA',
      habilitada: puedeEditar,
    },
    {
      clave: 'pago-bancario',
      etiqueta: 'Registrar pago bancario',
      icono: Landmark,
      dialogo: 'PAGO_BANCARIO',
      habilitada: puedeEditar,
    },
  ]

  /*
    §8.3 / §8.7 — ocultar del listado, o volver a mostrarlo. No es un movimiento, pero desde
    que los listados no tienen fila de acciones este es el único lugar donde se puede cambiar.
  */
  const puedeCambiarVisibilidad =
    puedeEditar && (props.mostrarVisibilidad ? true : dadoDeBaja)

  if (puedeCambiarVisibilidad) {
    const ocultando = props.visible !== false
    movimientos.push({
      clave: 'visibilidad',
      etiqueta: ocultando ? 'Ocultar del listado' : 'Volver a mostrar en el listado',
      icono: ocultando ? EyeOff : Eye,
      dialogo: 'VISIBILIDAD',
      habilitada: ocultando ? dadoDeBaja : true,
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {movimientos.map((movimiento) => {
          const Icono = movimiento.icono
          const contenido = (
            <>
              <Icono className="size-4" aria-hidden />
              {movimiento.etiqueta}
            </>
          )
          /*
            Abajo de `sm` cada botón ocupa el ancho completo y su etiqueta envuelve: los
            botones vienen con `whitespace-nowrap` y `shrink-0`, y «Aguinaldo (solo
            disponible en junio y diciembre)» se iba 28px afuera de la pantalla y hacía
            scrollear la página en horizontal. De paso, apilados son más fáciles de tocar.
          */
          const clases =
            'h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal sm:w-auto'

          // Con `asChild` el `disabled` se pierde: un `<a>` no lo tiene. Cuando el movimiento
          // no está habilitado se dibuja el botón sin link.
          return movimiento.href && movimiento.habilitada ? (
            <Button
              key={movimiento.clave}
              asChild
              variant="outline"
              className={clases}
            >
              <Link href={movimiento.href}>{contenido}</Link>
            </Button>
          ) : movimiento.href ? (
            <Button
              key={movimiento.clave}
              variant="outline"
              disabled
              className={clases}
            >
              {contenido}
            </Button>
          ) : (
            <Button
              key={movimiento.clave}
              variant="outline"
              disabled={!movimiento.habilitada}
              onClick={() => setDialogo(movimiento.dialogo!)}
              className={clases}
            >
              {contenido}
            </Button>
          )
        })}
      </div>

      <DialogoPagoAdicional
        abierto={dialogo === 'PAGO_ADICIONAL'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        fechaIngreso={props.fechaIngreso}
      />
      <DialogoPagoBancario
        abierto={dialogo === 'PAGO_BANCARIO'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        fechaIngreso={props.fechaIngreso}
      />
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
