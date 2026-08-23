/**
 * §4.2.3 y §8.3 — chip de color del estado derivado del empleado.
 */
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

export function ChipEstado({ estado }: { estado: EstadoEmpleado }) {
  return (
    <Badge variant="outline" className={cn('font-medium', CLASES[estado])}>
      {ETIQUETAS_ESTADO[estado]}
    </Badge>
  )
}
