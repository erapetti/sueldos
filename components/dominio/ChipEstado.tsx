/**
 * §4.2.3 y §8.3 — chip de color del estado derivado del empleado.
 *
 * Cuando el estado tiene algo que resolver, el chip es un **link a la pantalla donde se
 * resuelve**: decir «Falta pagar» y obligar a buscar dónde pagarlo es media respuesta. Los
 * estados que no piden acción —Activo— quedan como chip a secas, porque un link que no lleva
 * a ninguna parte enseña a desconfiar de los que sí llevan.
 */
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ETIQUETAS_ESTADO, type EstadoEmpleado } from '@/lib/calculo/estado'
import { cn } from '@/lib/utils'

const CLASES: Record<EstadoEmpleado, string> = {
  FALTA_PAGAR:
    'border-destructive/35 bg-destructive/10 text-destructive',
  FALTA_LIQUIDACION:
    'border-warn/35 bg-warn-soft text-warn-ink',
  BAJA: 'border-border bg-secondary text-muted-foreground',
  ACTIVO:
    'border-primary/30 bg-primary-soft text-primary-ink',
}

/** A dónde se va a resolver cada estado, o `null` si no hay nada que hacer. */
function destino(estado: EstadoEmpleado, empleadoId: string): string | null {
  const base = `/empleados/${empleadoId}`
  switch (estado) {
    // Las dos van a la liquidación: una a confirmarla y la otra a ver la que quedó impaga.
    case 'FALTA_LIQUIDACION':
    case 'FALTA_PAGAR':
      return `${base}/liquidacion`
    // La baja se pone y se saca desde la fecha de egreso, en los datos generales.
    case 'BAJA':
      return `${base}?seccion=datos`
    case 'ACTIVO':
      return null
  }
}

export function ChipEstado({
  estado,
  empleadoId,
}: {
  estado: EstadoEmpleado
  /** Sin él el chip no se puede enlazar y queda informativo. */
  empleadoId?: string
}) {
  const href = empleadoId ? destino(estado, empleadoId) : null
  const clases = cn('font-medium', CLASES[estado])

  if (!href) {
    return (
      <Badge variant="outline" className={clases}>
        {ETIQUETAS_ESTADO[estado]}
      </Badge>
    )
  }

  return (
    <Badge asChild variant="outline" className={cn(clases, 'transition-opacity hover:opacity-80')}>
      <Link href={href}>{ETIQUETAS_ESTADO[estado]}</Link>
    </Badge>
  )
}
