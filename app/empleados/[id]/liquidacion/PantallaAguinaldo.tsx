'use client'

/**
 * §7.7 — el ½ aguinaldo de un semestre, dentro de la pantalla de Liquidaciones.
 *
 * Es un período más de la secuencia, así que lleva el mismo encabezado y el mismo navegador
 * que la liquidación mensual, y el conmutador Lista / Detalle funciona igual. Lo que cambia es
 * el cuerpo: la fórmula está **pendiente de definición** (§13.3), así que por ahora informa
 * qué falta decidir en vez de mostrar números.
 */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import type { ListadoDePersonal } from '@/constants/listados'
import { MOTIVO_NO_IMPLEMENTADO } from '@/lib/calculo/aguinaldo'
import { etiquetaPeriodo } from '@/lib/calculo/periodos'
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
}) {
  const [modoLista, setModoLista] = useState(false)
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
        />

        <NavegadorDePeriodo
          empleadoId={props.empleadoId}
          actual={actual}
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
