/**
 * §4.2.3 y §8.3 — chip de color del estado derivado del empleado.
 *
 * Cuando el estado tiene algo que resolver, el chip es un **link a la pantalla donde se
 * resuelve**: decir «Falta pagar» y obligar a buscar dónde pagarlo es media respuesta. Los
 * estados que no piden acción —Activo— quedan como chip a secas, porque un link que no lleva
 * a ninguna parte enseña a desconfiar de los que sí llevan.
 */
import Link from 'next/link'
import { CircleCheck, CircleSlash, Coins, Receipt, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ETIQUETAS_ESTADO, type EstadoEmpleado } from '@/lib/calculo/estado'
import { cn } from '@/lib/utils'
import { TextoDeChip } from './TextoDeChip'

/**
 * El icono de cada estado. En pantallas angostas es lo único que se ve, así que tiene que
 * distinguirse solo: la plata que falta pagar, el comprobante que falta emitir.
 *
 * `BAJA` y `ACTIVO` llevan el suyo aunque sean de una palabra y entren igual. Si la mitad de
 * la columna fueran iconos y la otra mitad palabras sueltas, no se leería como una columna.
 */
const ICONOS: Record<EstadoEmpleado, LucideIcon> = {
  FALTA_PAGAR: Coins,
  FALTA_LIQUIDACION: Receipt,
  BAJA: CircleSlash,
  ACTIVO: CircleCheck,
}

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
function destino(
  estado: EstadoEmpleado,
  empleadoId: string,
  periodo: string | null,
): string | null {
  const base = `/empleados/${empleadoId}`
  switch (estado) {
    /*
      Las dos van a la liquidación: una a confirmarla y la otra a ver la que quedó impaga, y
      las dos **con el mes puesto**. Sin el `?periodo=`, esa pantalla abre en el mes que tenga
      en memoria (§1.15) —el que se venía mirando en otra empleada, por ejemplo—, así que el
      chip decía «Falta pagar» y llevaba a un mes que no debía nada.
    */
    case 'FALTA_LIQUIDACION':
    case 'FALTA_PAGAR':
      return `${base}/liquidacion${periodo ? `?periodo=${periodo}` : ''}`
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
  periodo,
}: {
  estado: EstadoEmpleado
  /** Sin él el chip no se puede enlazar y queda informativo. */
  empleadoId?: string
  /** `AAAA-MM` del mes que el estado reclama, cuando reclama alguno. */
  periodo?: string | null
}) {
  const href = empleadoId ? destino(estado, empleadoId, periodo ?? null) : null
  const clases = cn('font-medium', CLASES[estado])

  if (!href) {
    return (
      <Badge variant="outline" className={clases}>
        <TextoDeChip icono={ICONOS[estado]}>{ETIQUETAS_ESTADO[estado]}</TextoDeChip>
      </Badge>
    )
  }

  return (
    <Badge asChild variant="outline" className={cn(clases, 'transition-opacity hover:opacity-80')}>
      <Link href={href}>
        <TextoDeChip icono={ICONOS[estado]}>{ETIQUETAS_ESTADO[estado]}</TextoDeChip>
      </Link>
    </Badge>
  )
}
