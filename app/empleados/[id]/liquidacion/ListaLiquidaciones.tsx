'use client'

/**
 * §7.6 — vista «Lista» del cálculo de sueldo: el histórico de liquidaciones de la empleada.
 *
 * Estaba como pestaña de la ficha. Se movió acá porque es la otra cara de la misma pantalla:
 * la lista dice qué meses están cerrados y el detalle muestra uno. Desde una fila se salta al
 * detalle de ese período.
 */
import { Badge } from '@/components/ui/badge'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { formatearImporte } from '@/lib/format/money'
import { ETIQUETA_TIPO_LIQUIDACION } from '@/constants/etiquetas'

export type FilaLiquidacion = {
  id: string
  periodo: string
  periodoISO: string
  tipo: string
  secuencia: number
  estado: string
  totalAPagar: string
  /** §4.14 — el pago se mira libro por libro: puede faltar solo uno de los dos. */
  pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA'
}

export function ListaLiquidaciones({
  empleadoId,
  liquidaciones,
  totalesPorPeriodo,
}: {
  empleadoId: string
  liquidaciones: FilaLiquidacion[]
  /** Total del período agrupando secuencias (§7.6.1), por `periodoISO|tipo`. */
  totalesPorPeriodo: Record<string, string>
}) {
  const detalleDe = (l: FilaLiquidacion) =>
    `/empleados/${empleadoId}/liquidacion?periodo=${l.periodoISO.slice(0, 7)}`

  const columnas: Columna<FilaLiquidacion>[] = [
    // El período es la puerta al detalle de ese mes, y con él toda la fila.
    { clave: 'periodo', etiqueta: 'Período', className: 'capitalize', celda: (l) => l.periodo },
    { clave: 'tipo', etiqueta: 'Tipo', celda: (l) => ETIQUETA_TIPO_LIQUIDACION[l.tipo] ?? l.tipo },
    { clave: 'secuencia', etiqueta: 'Secuencia', numerica: true, celda: (l) => `#${l.secuencia}` },
    {
      clave: 'total',
      etiqueta: 'Total',
      numerica: true,
      celda: (l) => formatearImporte(l.totalAPagar),
    },
    {
      clave: 'total-periodo',
      etiqueta: 'Total del período',
      numerica: true,
      className: 'text-muted-foreground',
      celda: (l) => formatearImporte(totalesPorPeriodo[`${l.periodoISO}|${l.tipo}`] ?? '0'),
    },
    {
      clave: 'estado',
      etiqueta: 'Estado',
      celda: (l) =>
        l.estado === 'ANULADA' ? (
          <Badge variant="outline">Anulada</Badge>
        ) : l.pago === 'PAGADA' ? (
          <Badge variant="secondary">Pagada</Badge>
        ) : l.pago === 'PARCIAL' ? (
          <Badge variant="outline">Pago parcial</Badge>
        ) : (
          <Badge variant="outline">Sin pagar</Badge>
        ),
    },
  ]

  return (
    <Tabla
      columnas={columnas}
      filas={liquidaciones}
      hrefDetalle={detalleDe}
      claseDeFila={(l) => (l.estado === 'ANULADA' ? 'opacity-60' : undefined)}
      vacio="Todavía no hay liquidaciones confirmadas."
    />
  )
}
