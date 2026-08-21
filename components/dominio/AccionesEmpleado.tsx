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
  Gift,
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
import { DialogoPrestamo } from './DialogoPrestamo'
import { DialogoPagoBancario } from './DialogoPagoBancario'
import { DialogoLicencia } from './DialogoLicencia'
import { DialogoOcultar } from './DialogoOcultar'
import { mesDeAguinaldo } from '@/lib/format/aguinaldo'

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
}

type Dialogo = 'PRESTAMO' | 'PAGO_ADICIONAL' | 'PAGO_BANCARIO' | 'LICENCIA' | 'VISIBILIDAD' | null

export function AccionesEmpleado(props: AccionesEmpleadoProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const { empleadoId, alias, puedeEditar, dadoDeBaja } = props

  // §7.7 — el aguinaldo solo se habilita en junio y diciembre.
  const habilitaAguinaldo = mesDeAguinaldo()

  type Accion = {
    clave: string
    etiqueta: string
    icono: React.ComponentType<{ className?: string }>
    href?: string
    dialogo?: Exclude<Dialogo, null>
    habilitada: boolean
  }

  const acciones: Accion[] = [
    {
      clave: 'ver',
      etiqueta: 'Ver hoja de detalles',
      icono: Eye,
      href: `/empleados/${empleadoId}`,
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
      clave: 'prestamo',
      etiqueta: 'Registrar préstamo',
      icono: HandCoins,
      dialogo: 'PRESTAMO',
      habilitada: puedeEditar,
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
    {
      clave: 'aguinaldo',
      etiqueta: habilitaAguinaldo
        ? 'Aguinaldo'
        : 'Aguinaldo (solo disponible en junio y diciembre)',
      icono: Gift,
      href: `/empleados/${empleadoId}/aguinaldo`,
      habilitada: habilitaAguinaldo,
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

  return (
    <>
      {/* Desktop: iconos con tooltip */}
      <div className="hidden items-center gap-0.5 sm:flex">
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
              <TooltipContent>{accion.etiqueta}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Mobile: menú de tres puntos */}
      <div className="sm:hidden">
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

      <DialogoPrestamo
        abierto={dialogo === 'PRESTAMO'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        fechaIngreso={props.fechaIngreso}
      />
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
