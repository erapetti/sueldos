'use client'

/**
 * §8.3 — botonera de acciones de cada fila del listado.
 *
 * Cada icono lleva tooltip con el nombre de la acción y `aria-label`. En mobile la botonera
 * pasa a un menú de tres puntos. Con permiso `VER` los iconos de registro quedan
 * deshabilitados; el de detalle y el de cálculo siguen activos.
 */
import Link from 'next/link'
import { useState } from 'react'
import {
  CalendarOff,
  Calculator,
  Eye,
  EyeOff,
  HandCoins,
  Landmark,
  MoreVertical,
  Palmtree,
  PlusCircle,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DialogoPagoAdicional } from './DialogoPagoAdicional'
import { DialogoPagoBancario } from './DialogoPagoBancario'
import { DialogoLicencia } from './DialogoLicencia'
import { DialogoOcultar } from './DialogoOcultar'
import { cn } from '@/lib/utils'

export type AccionesEmpleadoProps = {
  empleadoId: string
  alias: string
  fechaIngreso: string
  puedeEditar: boolean
  /** §8.3 — "Ocultar del listado" solo si el empleado está dado de baja. */
  dadoDeBaja: boolean
  /** §8.7 — en el listado de todos, además se puede volver a mostrar. */
  mostrarVisibilidad?: boolean
  visible?: boolean
  /**
   * `iconos` es la fila de acciones del listado. `tarjeta` es la hoja «Acciones» de la ficha:
   * botones con etiqueta, y solo los movimientos que se cargan de a uno. Los diálogos son los
   * mismos, así que viven en un solo lugar y no en dos copias.
   */
  variante?: 'iconos' | 'tarjeta'
}

/**
 * Lo que muestra la variante `tarjeta`: los movimientos que se cargan de a uno, sin la
 * navegación —que ahora es el menú de la empleada— y con la visibilidad, que desde que los
 * listados no tienen fila de acciones no se podía cambiar en ningún otro lado.
 */
const CLAVES_DE_MOVIMIENTO = new Set([
  'pago-adicional',
  'prestamo',
  'licencia',
  'pago-bancario',
  'visibilidad',
])

type Dialogo = 'PAGO_ADICIONAL' | 'PAGO_BANCARIO' | 'LICENCIA' | 'VISIBILIDAD' | null

export function AccionesEmpleado(props: AccionesEmpleadoProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const { empleadoId, alias, puedeEditar, dadoDeBaja } = props

  type Accion = {
    clave: string
    etiqueta: string
    icono: React.ComponentType<{ className?: string }>
    href?: string
    dialogo?: Exclude<Dialogo, null>
    habilitada: boolean
    /** Por qué está deshabilitada, para el `title`. */
    motivo?: string
  }

  const acciones: Accion[] = [
    {
      clave: 'ver',
      etiqueta: 'Ver hoja de detalles',
      icono: Eye,
      // Con `?seccion=datos` explícito: entrar sin sección redirige a Inasistencias, y esta
      // acción dice «ver los detalles», así que tiene que abrir los datos.
      href: `/empleados/${empleadoId}?seccion=datos`,
      habilitada: true,
    },
    {
      clave: 'horas-extras',
      etiqueta: 'Registrar horas extras',
      icono: Timer,
      href: `/empleados/${empleadoId}/horas-extras`,
      habilitada: puedeEditar,
    },
    {
      clave: 'faltas',
      etiqueta: 'Registrar inasistencias',
      icono: CalendarOff,
      href: `/empleados/${empleadoId}/faltas`,
      habilitada: puedeEditar,
    },
    {
      /*
        Préstamos ya tiene pantalla propia: el botón lleva al listado y el alta vive ahí. Las
        otras tres siguen abriendo su diálogo hasta que tengan la suya, así que conservan el
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
      clave: 'liquidacion',
      etiqueta: 'Cálculo de sueldo del mes',
      icono: Calculator,
      href: `/empleados/${empleadoId}/liquidacion`,
      habilitada: true,
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

  // §8.3 / §8.7 — ocultar del listado, o volver a mostrarlo.
  const puedeCambiarVisibilidad =
    puedeEditar && (props.mostrarVisibilidad ? true : dadoDeBaja)

  if (puedeCambiarVisibilidad) {
    const ocultando = props.visible !== false
    acciones.push({
      clave: 'visibilidad',
      etiqueta: ocultando ? 'Ocultar del listado' : 'Volver a mostrar en el listado',
      icono: ocultando ? EyeOff : Eye,
      dialogo: 'VISIBILIDAD',
      habilitada: ocultando ? dadoDeBaja : true,
    })
  }

  const visibles = acciones.filter((a) => a.href || a.dialogo)

  const enTarjeta = props.variante === 'tarjeta'
  const paraTarjeta = visibles.filter((a) => CLAVES_DE_MOVIMIENTO.has(a.clave))

  return (
    <>
      {enTarjeta ? (
        <div className="flex flex-wrap gap-2">
          {paraTarjeta.map((accion) => {
            const Icono = accion.icono
            const contenido = (
              <>
                <Icono className="size-4" aria-hidden />
                {accion.etiqueta}
              </>
            )
            /*
              Abajo de `sm` cada acción ocupa el ancho completo y su etiqueta envuelve: los
              botones vienen con `whitespace-nowrap` y `shrink-0`, y «Aguinaldo (solo
              disponible en junio y diciembre)» se iba 28px afuera de la pantalla y hacía
              scrollear la página en horizontal. De paso, apilados son más fáciles de tocar.
            */
            const clases =
              'h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal sm:w-auto'

            // Con `asChild` el `disabled` se pierde: un `<a>` no lo tiene. Cuando la acción
            // no está habilitada se dibuja el botón sin link, igual que en la fila de iconos.
            return accion.href && accion.habilitada ? (
              <Button
                key={accion.clave}
                asChild
                variant="outline"
                title={accion.motivo}
                className={clases}
              >
                <Link href={accion.href}>{contenido}</Link>
              </Button>
            ) : accion.href ? (
              <Button
                key={accion.clave}
                variant="outline"
                disabled
                title={accion.motivo}
                className={clases}
              >
                {contenido}
              </Button>
            ) : (
              <Button
                key={accion.clave}
                variant="outline"
                disabled={!accion.habilitada}
                onClick={() => setDialogo(accion.dialogo!)}
                title={accion.motivo}
                className={clases}
              >
                {contenido}
              </Button>
            )
          })}
        </div>
      ) : null}

      {/* Desktop: iconos con tooltip */}
      <div className={cn('hidden items-center gap-0.5', !enTarjeta && 'sm:flex')}>
        {visibles.map((accion) => {
          const Icono = accion.icono
          const contenido = (
            <Icono className="size-4" aria-hidden />
          )

          const boton = accion.href ? (
            <Button
              asChild={accion.habilitada}
              variant="ghost"
              size="icon"
              disabled={!accion.habilitada}
              aria-label={accion.etiqueta}
              aria-disabled={!accion.habilitada}
            >
              {accion.habilitada ? (
                <Link href={accion.href} aria-label={accion.etiqueta}>
                  {contenido}
                </Link>
              ) : (
                contenido
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              disabled={!accion.habilitada}
              aria-label={accion.etiqueta}
              onClick={() => setDialogo(accion.dialogo!)}
            >
              {contenido}
            </Button>
          )

          return (
            <Tooltip key={accion.clave}>
              <TooltipTrigger asChild>
                <span className="inline-flex">{boton}</span>
              </TooltipTrigger>
              <TooltipContent>
                {accion.motivo ? `${accion.etiqueta} — ${accion.motivo}` : accion.etiqueta}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Mobile: menú de tres puntos */}
      <div className={enTarjeta ? 'hidden' : 'sm:hidden'}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Acciones de ${alias}`}>
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {visibles.map((accion) => {
              const Icono = accion.icono
              if (accion.href) {
                return (
                  <DropdownMenuItem key={accion.clave} asChild disabled={!accion.habilitada}>
                    <Link href={accion.href}>
                      <Icono className="size-4" aria-hidden />
                      {accion.etiqueta}
                    </Link>
                  </DropdownMenuItem>
                )
              }
              return (
                <DropdownMenuItem
                  key={accion.clave}
                  disabled={!accion.habilitada}
                  onSelect={() => setDialogo(accion.dialogo!)}
                >
                  <Icono className="size-4" aria-hidden />
                  {accion.etiqueta}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
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
