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

export type FilaLiquidacion = {
  id: string
  periodo: string
  periodoISO: string
  tipo: string
  secuencia: number
  estado: string
  totalAPagar: string
  pagada: boolean
}

const ETIQUETA_TIPO: Record<string, string> = {
  MENSUAL: 'Mensual',
  AGUINALDO: 'Aguinaldo',
  SALARIO_VACACIONAL: 'Salario vacacional',
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
    { clave: 'tipo', etiqueta: 'Tipo', celda: (l) => ETIQUETA_TIPO[l.tipo] ?? l.tipo },
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
        ) : l.pagada ? (
          <Badge variant="secondary">Pagada</Badge>
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
