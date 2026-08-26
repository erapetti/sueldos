/**
 * §4.14 — el estado de pago de una liquidación leído de la base.
 *
 * Está acá y no en cada consulta porque lo miran seis lugares —la ficha, el listado de
 * liquidaciones, la planilla, el aviso de novedades, el diálogo de pago y la pantalla de
 * cálculo— y todos tienen que responder lo mismo. La regla vive en `estadoDePago`
 * (`lib/calculo/cuentaCorriente`); esto solo traduce la fila de Prisma.
 */
import { aDecimal, type DecimalPrisma } from '@/lib/db/mapeo'
import { estadoDePago, type EstadoDePago } from '@/lib/calculo/cuentaCorriente'
import type { Libro } from '@/lib/calculo/tipos'

export type FilaConPagos = {
  totalAPagarFormal: DecimalPrisma
  totalAPagarInformal: DecimalPrisma
  /** Los movimientos `PAGO` vinculados, con su libro. */
  movimientos: readonly { libro: Libro }[]
}

export function pagoDeLiquidacion(liquidacion: FilaConPagos): EstadoDePago {
  return estadoDePago(
    {
      formal: aDecimal(liquidacion.totalAPagarFormal),
      informal: aDecimal(liquidacion.totalAPagarInformal),
    },
    liquidacion.movimientos,
  )
}

/** Lo que necesita el `include` de Prisma para que `pagoDeLiquidacion` pueda leer la fila. */
export const INCLUIR_PAGOS = {
  movimientos: { where: { tipo: 'PAGO' as const }, select: { libro: true } },
} as const
