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
  /** Los movimientos `PAGO` vinculados, con su libro y su fecha, de la más vieja a la más nueva. */
  movimientos: readonly { libro: Libro; fecha: Date }[]
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

/**
 * Cuándo se terminó de cobrar: la fecha del **último** pago vinculado, o `null` si todavía no
 * cobró ninguno.
 *
 * Puede haber uno por libro (§4.9), así que la fecha que importa es la del último: es el día
 * en que la liquidación dejó de tener algo pendiente. Y puede no haber ninguno aun estando
 * «pagada»: una complementaria de cero o negativa no tiene ningún libro que cobrar, así que
 * `estadoDePago` la da por pagada sin que nadie haya pagado nada.
 */
export function ultimoPago(liquidacion: FilaConPagos): Date | null {
  return liquidacion.movimientos.at(-1)?.fecha ?? null
}

/** Lo que necesita el `include` de Prisma para que `pagoDeLiquidacion` pueda leer la fila. */
export const INCLUIR_PAGOS = {
  movimientos: {
    where: { tipo: 'PAGO' as const },
    select: { libro: true, fecha: true },
    orderBy: { fecha: 'asc' as const },
  },
} as const
