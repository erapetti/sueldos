'use client'

/**
 * §7.6 y §7.7 — la fila de controles de la pantalla de liquidación: las flechas que recorren
 * los períodos, la etiqueta del período actual y el conmutador Lista / Detalle.
 *
 * Vive aparte porque la usan dos pantallas —la liquidación mensual y el aguinaldo, que tiene
 * otro formato— y la idea es justamente que se muevan igual. Si estuviera duplicada, la
 * primera corrección en una de las dos las separaría.
 */
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, FileText, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  anteriorPeriodo,
  consultaDePeriodo,
  etiquetaPeriodo,
  siguientePeriodo,
  type PeriodoLiquidable,
} from '@/lib/calculo/periodos'

export function NavegadorDePeriodo({
  empleadoId,
  actual,
  puedeRetroceder,
  puedeAvanzar,
  modoLista,
  onModoLista,
  acciones,
}: {
  empleadoId: string
  actual: PeriodoLiquidable
  puedeRetroceder: boolean
  puedeAvanzar: boolean
  modoLista: boolean
  onModoLista: (v: boolean) => void
  /** Lo que va al final de la fila: el botón de imprimir, cuando hay algo que imprimir. */
  acciones?: React.ReactNode
}) {
  const router = useRouter()

  function ir(destino: PeriodoLiquidable) {
    router.push(`/empleados/${empleadoId}/liquidacion?${consultaDePeriodo(destino)}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => ir(anteriorPeriodo(actual))}
        disabled={!puedeRetroceder}
        aria-label="Período anterior"
      >
        <ChevronLeft className="size-4" />
      </Button>

      {/* `min-w-56` para que «½ Aguinaldo Diciembre 2026» no corra las flechas de lugar. */}
      <span className="min-w-56 text-center font-medium">{etiquetaPeriodo(actual)}</span>

      <Button
        variant="outline"
        size="icon"
        onClick={() => ir(siguientePeriodo(actual))}
        disabled={!puedeAvanzar}
        aria-label="Período siguiente"
      >
        <ChevronRight className="size-4" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onModoLista(!modoLista)}
        className="ml-auto"
      >
        {modoLista ? (
          <>
            <FileText className="size-4" aria-hidden /> Detalle
          </>
        ) : (
          <>
            <List className="size-4" aria-hidden /> Lista
          </>
        )}
      </Button>

      {acciones}
    </div>
  )
}
