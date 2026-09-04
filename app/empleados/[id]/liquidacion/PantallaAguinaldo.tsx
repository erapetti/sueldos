'use client'

/**
 * §7.7 — el ½ aguinaldo de un semestre, dentro de la pantalla de Liquidaciones.
 *
 * Es un período más de la secuencia, así que lleva el mismo encabezado y el mismo navegador
 * que la liquidación mensual, y el conmutador Lista / Detalle funciona igual. Lo que cambia es
 * el cuerpo: la fórmula está **pendiente de definición** (§13.3), así que por ahora informa
 * qué falta decidir en vez de mostrar números.
 */
import { AlertTriangle } from 'lucide-react'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import type { ListadoDePersonal } from '@/constants/listados'
import { useModoLista } from '@/hooks/useModoLista'
import { MOTIVO_NO_IMPLEMENTADO } from '@/lib/calculo/aguinaldo'
import { etiquetaPeriodo, type VistaDeLiquidacion } from '@/lib/calculo/periodos'
import type { EstadoVisible } from '@/lib/liquidacion/estadoVisible'
import { parsePeriodo } from '@/lib/format/dates'
import { ListaLiquidaciones, type FilaLiquidacion } from './ListaLiquidaciones'
import { NavegadorDePeriodo } from './NavegadorDePeriodo'

export function PantallaAguinaldo(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  listadoDeOrigen: ListadoDePersonal
  /** `AAAA-MM` de junio o de diciembre. */
  periodo: string
  puedeRetroceder: boolean
  puedeAvanzar: boolean
  liquidaciones: FilaLiquidacion[]
  totalesPorPeriodo: Record<string, string>
  /** Lo que dice el chip del navegador. El aguinaldo todavía no se liquida (§13.3). */
  estado: EstadoVisible
  /** Con cuál de las dos caras abre la pantalla, cuando la URL lo dice. */
  vista: VistaDeLiquidacion | null
  /** Firma de lo que pide la URL: cambia cuando se pide otro período u otra secuencia. */
  pedido: string
}) {
  const [modoLista, setModoLista] = useModoLista(props.vista, props.pedido)
  const actual = { periodo: parsePeriodo(props.periodo), tipo: 'AGUINALDO' as const }

  return (
    <div className="space-y-5">
      <div className="no-print space-y-3">
        <EncabezadoEmpleada
          empleadoId={props.empleadoId}
          alias={props.alias}
          nombreCompleto={props.nombreCompleto}
          activa="liquidaciones"
          listadoDeOrigen={props.listadoDeOrigen}
          periodo={props.periodo}
        />

        <NavegadorDePeriodo
          empleadoId={props.empleadoId}
          actual={actual}
          estado={props.estado}
          puedeRetroceder={props.puedeRetroceder}
          puedeAvanzar={props.puedeAvanzar}
          modoLista={modoLista}
          onModoLista={setModoLista}
        />
      </div>

      {modoLista ? (
        <ListaLiquidaciones
          empleadoId={props.empleadoId}
          liquidaciones={props.liquidaciones}
          totalesPorPeriodo={props.totalesPorPeriodo}
        />
      ) : (
        <div className="rounded-card border border-warn/35 bg-warn-soft px-[22px] py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn-ink" aria-hidden />
            <div className="space-y-2">
              <h2 className="text-[20px] text-warn-ink">{etiquetaPeriodo(actual)}</h2>
              <p className="max-w-[60ch] text-sm text-warn-ink">
                {MOTIVO_NO_IMPLEMENTADO} Falta definir si la base es el promedio del semestre,
                qué conceptos la integran y si lleva descuentos de BPS. Lo único resuelto es
                que los pagos adicionales y los boletos no integran la base.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
