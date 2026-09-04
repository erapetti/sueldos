'use client'

/**
 * §7.6 y §7.7 — la fila de controles de la pantalla de liquidación: las flechas que recorren
 * los períodos, la etiqueta del período actual, el estado de la liquidación que se está
 * mirando y el conmutador Lista / Detalle.
 *
 * Vive aparte porque la usan dos pantallas —la liquidación mensual y el aguinaldo, que tiene
 * otro formato— y la idea es justamente que se muevan igual. Si estuviera duplicada, la
 * primera corrección en una de las dos las separaría.
 *
 * **En Lista queda solo el conmutador.** La lista es de todas las liquidaciones de la
 * empleada y no mira el mes del navegador, así que las flechas no tienen qué mover; y el chip
 * dice el estado del período que está en pantalla, que en Lista no es uno solo —cada fila trae
 * el suyo en su columna «Estado»—. Los dos son del período, así que se van juntos. Como el
 * conmutador y el botón de imprimir van pegados a la derecha, al cambiar de vista no se
 * mueven de lugar: lo que hay a la izquierda aparece y desaparece, pero nada se corre.
 *
 * Las medidas son las mismas que las del navegador de las planillas (`PlanillaMensual`): el
 * mismo `gap`, el mismo ancho mínimo de la etiqueta y el mismo chip, en el mismo lugar. Eran
 * distintas y las dos filas de controles no se veían como la misma cosa. El único período que
 * pasa el ancho mínimo es el aguinaldo —«½ Aguinaldo Diciembre 2026» no entra en 10rem—, y
 * ahí la flecha de la derecha se corre.
 */
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, FileText, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChipDeEstado } from '@/components/dominio/EstadoLiquidacion'
import type { EstadoVisible } from '@/lib/liquidacion/estadoVisible'
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
  estado,
  puedeRetroceder,
  puedeAvanzar,
  modoLista,
  onModoLista,
  acciones,
}: {
  empleadoId: string
  actual: PeriodoLiquidable
  /** El estado de la liquidación que muestra el detalle, o «sin confirmar» si no hay. */
  estado: EstadoVisible
  puedeRetroceder: boolean
  puedeAvanzar: boolean
  modoLista: boolean
  onModoLista: (v: boolean) => void
  /** Lo que va al final de la fila: el botón de imprimir, cuando hay algo que imprimir. */
  acciones?: React.ReactNode
}) {
  const router = useRouter()

  /**
   * Las flechas dejan atrás la secuencia y la vista pedidas: la #2 de setiembre no dice nada
   * de octubre, y la vista es del que la está mirando, no del mes.
   */
  function ir(destino: PeriodoLiquidable) {
    router.push(`/empleados/${empleadoId}/liquidacion?${consultaDePeriodo(destino)}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {modoLista ? null : (
        <>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => ir(anteriorPeriodo(actual))}
              disabled={!puedeRetroceder}
              aria-label="Período anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <span className="min-w-40 text-center font-medium">{etiquetaPeriodo(actual)}</span>

            <Button
              variant="outline"
              size="icon"
              onClick={() => ir(siguientePeriodo(actual))}
              disabled={!puedeAvanzar}
              aria-label="Período siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <ChipDeEstado estado={estado} />
        </>
      )}

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
