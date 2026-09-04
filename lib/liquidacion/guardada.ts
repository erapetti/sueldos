/**
 * §7.6.1 — una liquidación **guardada**, leída para mostrarla tal como quedó.
 *
 * La pantalla de liquidación normalmente recalcula el período y muestra el resultado; esto es
 * lo otro: la URL pide una liquidación concreta —`?liquidacion=<id>`, que es a donde llevan
 * las filas de la Lista— y hay que dibujar esa fila, no un cálculo de hoy. Por eso acá no se
 * llama al motor: todo sale de la fila, de sus líneas y de su snapshot (§4.14), que es
 * justamente lo que garantiza que reimprimir una liquidación vieja dé lo mismo que el día que
 * se confirmó.
 */
import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { aDecimal } from '@/lib/db/mapeo'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from './pago'
import { estadoVisible, type EstadoVisible } from './estadoVisible'
import type { TipoPeriodo } from '@/lib/calculo/periodos'

/** Una línea del desglose, en el formato que dibuja la pantalla. */
export type LineaGuardada = {
  orden: number
  tabla: 'FORMAL' | 'INFORMAL'
  codigo: string
  descripcion: string
  cantidad: string | null
  valorUnitario: string | null
  importe: string
  signo: number
  destacada: boolean
}

export type LiquidacionGuardada = {
  id: string
  secuencia: number
  /** Cuántas secuencias vigentes la preceden: lo que el cierre ya tenía liquidado. */
  previas: number
  estado: EstadoVisible
  confirmadaEn: string | null
  /** §7.6 — solo la última confirmada y sin pagar se puede anular. */
  anulable: boolean
  /** Por qué no, para el tooltip del botón apagado. `null` cuando sí se puede. */
  motivoNoAnulable: string | null
  lineas: LineaGuardada[]
  valorHoraCalculado: string
  horasSemanales: string | null
  totalRecalculado: string
  totalYaLiquidado: string
  totalAPagar: string
  porLibro: Record<
    'FORMAL' | 'INFORMAL',
    { recalculado: string; yaLiquidado: string; aPagar: string }
  >
  avisos: string[]
}

/**
 * Lo poco que se le pide al snapshot. Es JSON sin tipo en la base, así que se lee a la
 * defensiva: lo que no esté queda en `null` y la pantalla muestra el renglón vacío en vez de
 * romperse con una liquidación vieja de otra versión.
 */
type Snapshot = {
  resultado?: { valorHoraCalculado?: string; avisos?: string[] }
  entrada?: { salario?: { horasSemanales?: string } | null }
}

/**
 * La liquidación de ese `id`, o `null` si no existe o no es de ese período.
 *
 * Se busca por `id` y no por número de secuencia porque la secuencia no identifica una fila:
 * al anular la #1 y volver a confirmar quedan dos filas #1, la anulada y la vigente (§4.14 —
 * el índice único deja convivir a las anuladas), y las dos se tienen que poder abrir.
 */
export async function liquidacionGuardada(
  empleadoId: string,
  periodo: Date,
  tipo: TipoPeriodo,
  liquidacionId: string,
): Promise<LiquidacionGuardada | null> {
  const [fila, delPeriodo] = await Promise.all([
    prisma.liquidacion.findFirst({
      /*
        El empleado, el período y el tipo se piden **además** del id: el id solo ya alcanzaría
        para encontrar la fila, pero encontraría también la de otra empleada o la de otro mes,
        y la pantalla la dibujaría bajo el encabezado y el navegador de esta. Con los cuatro,
        un enlace armado a mano que no cierra cae al listado en vez de mentir.
      */
      where: { id: liquidacionId, empleadoId, periodo, tipo },
      include: { lineas: { orderBy: { orden: 'asc' } }, ...INCLUIR_PAGOS },
    }),
    prisma.liquidacion.findMany({
      where: { empleadoId, periodo, tipo, estado: { not: 'ANULADA' } },
      select: { secuencia: true, estado: true },
      orderBy: { secuencia: 'asc' },
    }),
  ])

  if (!fila) return null

  const pago = pagoDeLiquidacion(fila)
  const anulada = fila.estado === 'ANULADA'
  const hayPosterior = delPeriodo.some((l) => l.secuencia > fila.secuencia)

  const importe = (valor: (typeof fila)['totalAPagar']) => aDecimal(valor).toFixed(2)
  const porLibro = (['FORMAL', 'INFORMAL'] as const).reduce(
    (acc, libro) => {
      const recalculado = aDecimal(
        libro === 'FORMAL' ? fila.totalRecalculadoFormal : fila.totalRecalculadoInformal,
      )
      const aPagar = aDecimal(
        libro === 'FORMAL' ? fila.totalAPagarFormal : fila.totalAPagarInformal,
      )
      // La columna no se guarda: es lo que el período ya tenía liquidado en ese libro cuando
      // se confirmó esta, o sea el recalculado menos lo que esta pagó.
      acc[libro] = {
        recalculado: recalculado.toFixed(2),
        yaLiquidado: recalculado.minus(aPagar).toFixed(2),
        aPagar: aPagar.toFixed(2),
      }
      return acc
    },
    {} as LiquidacionGuardada['porLibro'],
  )

  const snapshot = (fila.snapshot ?? {}) as Snapshot

  return {
    id: fila.id,
    secuencia: fila.secuencia,
    // Las previas son las vigentes con secuencia menor; una anulada no liquidó nada.
    previas: delPeriodo.filter((l) => l.secuencia < fila.secuencia).length,
    estado: estadoVisible({ estado: fila.estado, pago: pago.estado }),
    confirmadaEn: fila.confirmadaEn ? fila.confirmadaEn.toISOString() : null,
    anulable: !anulada && !hayPosterior && pago.estado === 'SIN_PAGAR',
    motivoNoAnulable: anulada
      ? 'Ya está anulada'
      : hayPosterior
        ? 'Hay una liquidación posterior'
        : pago.estado !== 'SIN_PAGAR'
          ? 'Ya está pagada'
          : null,
    lineas: fila.lineas.map((l) => ({
      orden: l.orden,
      tabla: l.tabla,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad ? l.cantidad.toString() : null,
      valorUnitario: l.valorUnitario ? l.valorUnitario.toString() : null,
      importe: l.importe.toString(),
      destacada: l.codigo === 'SUBTOTAL' || l.codigo === 'TOTAL',
      signo: l.signo,
    })),
    valorHoraCalculado: snapshot.resultado?.valorHoraCalculado ?? '0',
    horasSemanales: snapshot.entrada?.salario?.horasSemanales ?? null,
    totalRecalculado: importe(fila.totalRecalculado),
    totalYaLiquidado: importe(fila.totalYaLiquidado),
    totalAPagar: importe(fila.totalAPagar),
    porLibro,
    avisos: snapshot.resultado?.avisos ?? [],
  }
}
