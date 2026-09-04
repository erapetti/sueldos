'use client'

/**
 * §7.6 — vista «Lista» del cálculo de sueldo: el histórico de liquidaciones de la empleada.
 *
 * Estaba como pestaña de la ficha. Se movió acá porque es la otra cara de la misma pantalla:
 * la lista dice qué meses están cerrados y el detalle muestra uno. Desde una fila se salta al
 * detalle de ese período.
 */
import { EstadoLiquidacion } from '@/components/dominio/EstadoLiquidacion'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { estadoVisible } from '@/lib/liquidacion/estadoVisible'
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
  /** `dd/mm/aaaa` del día en que se creó, que es el día en que se confirmó. */
  creadaEn: string
  /** `dd/mm/aaaa` del día desde el que está en el estado en que está. */
  fechaDelEstado: string
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
  /**
   * A dónde lleva cada fila. Van tres cosas en el enlace, y cada una arregla algo distinto:
   *
   *  - `vista=detalle`, porque la Lista y el Detalle son la misma pantalla y el conmutador es
   *    estado del componente: sin decirlo, el clic cambiaba el mes y dejaba la Lista puesta.
   *  - `liquidacion`, el id de **esta** fila, porque un mes puede tener varias (§7.6.1) y la
   *    fila es una de ellas y no el mes entero. Va el id y no el número de secuencia porque
   *    la secuencia no identifica una fila: al anular la #1 y volver a confirmar quedan dos
   *    filas #1, y las dos están en la Lista.
   *  - `tipo`, para que el aguinaldo abra su pantalla y no el mensual del mismo mes.
   *
   * El salario vacacional (§7.11) no tiene pantalla de detalle ni lugar en la secuencia de
   * períodos, así que su fila lleva al mensual de ese mes, que es a donde llevaban todas
   * antes de esto.
   */
  const detalleDe = (l: FilaLiquidacion) => {
    const partes = [`periodo=${l.periodoISO.slice(0, 7)}`]
    if (l.tipo === 'AGUINALDO') partes.push('tipo=aguinaldo')
    if (l.tipo === 'MENSUAL') partes.push(`liquidacion=${l.id}`)
    partes.push('vista=detalle')
    return `/empleados/${empleadoId}/liquidacion?${partes.join('&')}`
  }

  const columnas: Columna<FilaLiquidacion>[] = [
    // El período es la puerta al detalle de ese mes, y con él toda la fila.
    { clave: 'periodo', etiqueta: 'Período', className: 'capitalize', celda: (l) => l.periodo },
    { clave: 'tipo', etiqueta: 'Tipo', celda: (l) => ETIQUETA_TIPO_LIQUIDACION[l.tipo] ?? l.tipo },
    { clave: 'secuencia', etiqueta: 'Secuencia', numerica: true, celda: (l) => `#${l.secuencia}` },
    { clave: 'creada', etiqueta: 'Creada', className: 'tabular', celda: (l) => l.creadaEn },
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
      celda: (l) => <EstadoLiquidacion estado={estadoVisible(l)} />,
    },
    /*
      La fecha del estado que muestra la columna de al lado: cuándo se anuló, cuándo se
      terminó de cobrar, o cuándo se confirmó si todavía no cobró nada. Va pegada al estado
      porque sola no significa nada: es la respuesta a «¿desde cuándo?».
    */
    { clave: 'fecha', etiqueta: 'Fecha', className: 'tabular', celda: (l) => l.fechaDelEstado },
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
