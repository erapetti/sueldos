/**
 * §7.5 — los pagos bancarios que cancelan las liquidaciones de un período, para el pie de la
 * pantalla de liquidación.
 *
 * Es una consulta aparte y no un `include` más rico sobre la liquidación: `INCLUIR_PAGOS` es lo
 * que **decide el estado** y lo comparten seis lugares, y acá hacen falta el importe y el
 * concepto, que a esos seis no les sirven de nada.
 */
import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { aDecimal } from '@/lib/db/mapeo'
import { aISO } from '@/lib/format/dates'
import type { TipoPeriodo } from '@/lib/calculo/periodos'

export type PagoDeLiquidacion = {
  id: string
  /** De qué liquidación del período es: el período puede tener varias (§7.6.1). */
  secuencia: number
  libro: 'FORMAL' | 'INFORMAL'
  /** ISO `AAAA-MM-DD`. */
  fecha: string
  monto: string
  concepto: string
  /** §4.9 — se anuló con un contra-asiento; queda a la vista, tachado. */
  anulado: boolean
}

/**
 * Los pagos del período, del más viejo al más nuevo, que es el orden en que se fue cobrando.
 * Con `liquidacionId` se acotan a **una** liquidación, que es lo que muestra su pantalla.
 *
 * Los contra-asientos no son filas: no son pagos, son la anulación de uno. El pago anulado sí
 * queda, marcado por sus `reversas`.
 */
export async function pagosDelPeriodo(
  empleadoId: string,
  periodo: Date,
  tipo: TipoPeriodo,
  liquidacionId?: string,
): Promise<PagoDeLiquidacion[]> {
  const pagos = await prisma.cuentaCorriente.findMany({
    where: {
      empleadoId,
      tipo: 'PAGO',
      reversaDeId: null,
      liquidacionId,
      liquidacion: { is: { periodo, tipo } },
    },
    select: {
      id: true,
      libro: true,
      fecha: true,
      debe: true,
      concepto: true,
      reversas: { select: { id: true } },
      liquidacion: { select: { secuencia: true } },
    },
    orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
  })

  return pagos.map((p) => ({
    id: p.id,
    // El `where` ya exigió que la liquidación exista y sea de este período.
    secuencia: p.liquidacion!.secuencia,
    libro: p.libro,
    fecha: aISO(p.fecha),
    // §4.9 — el pago va al debe: cancela lo devengado.
    monto: aDecimal(p.debe).toFixed(2),
    concepto: p.concepto,
    anulado: p.reversas.length > 0,
  }))
}
