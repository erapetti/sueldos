/**
 * §7.6 — vista «Lista» del cálculo de sueldo: el histórico de liquidaciones de la empleada.
 *
 * Estaba como pestaña de la ficha. Se movió acá porque es la otra cara de la misma pantalla:
 * la lista dice qué meses están cerrados y el detalle muestra uno. Desde una fila se salta al
 * detalle de ese período.
 */
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
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
  return (
    <div className="overflow-x-auto rounded-card border bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Secuencia</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Total del período</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {liquidaciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Todavía no hay liquidaciones confirmadas.
              </TableCell>
            </TableRow>
          ) : (
            liquidaciones.map((l) => (
              <TableRow key={l.id} className={cn(l.estado === 'ANULADA' && 'opacity-60')}>
                <TableCell>
                  {/* El período es el enlace al detalle de ese mes. */}
                  <Link
                    href={`/empleados/${empleadoId}/liquidacion?periodo=${l.periodoISO.slice(0, 7)}`}
                    className="capitalize hover:underline"
                  >
                    {l.periodo}
                  </Link>
                </TableCell>
                <TableCell>{ETIQUETA_TIPO[l.tipo] ?? l.tipo}</TableCell>
                <TableCell className="text-right tabular">#{l.secuencia}</TableCell>
                <TableCell className="text-right tabular">
                  {formatearImporte(l.totalAPagar)}
                </TableCell>
                <TableCell className="text-right tabular text-muted-foreground">
                  {formatearImporte(totalesPorPeriodo[`${l.periodoISO}|${l.tipo}`] ?? '0')}
                </TableCell>
                <TableCell>
                  {l.estado === 'ANULADA' ? (
                    <Badge variant="outline">Anulada</Badge>
                  ) : l.pagada ? (
                    <Badge variant="secondary">Pagada</Badge>
                  ) : (
                    <Badge variant="outline">Sin pagar</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
