/**
 * §4.2.3 y §8.3 — chip de color del estado derivado del empleado.
 */
import { Badge } from '@/components/ui/badge'
import { ETIQUETAS_ESTADO, type EstadoEmpleado } from '@/lib/calculo/estado'
import { cn } from '@/lib/utils'

const CLASES: Record<EstadoEmpleado, string> = {
  FALTA_PAGAR:
    'border-red-300 bg-red-100 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  FALTA_LIQUIDACION:
    'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  BAJA: 'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  ACTIVO:
    'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
}

export function ChipEstado({ estado }: { estado: EstadoEmpleado }) {
  return (
    <Badge variant="outline" className={cn('font-medium', CLASES[estado])}>
      {ETIQUETAS_ESTADO[estado]}
    </Badge>
  )
}
