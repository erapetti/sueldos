/**
 * Datos de encabezado y de calendario que comparten las dos planillas mensuales
 * (§7.1 y §7.2).
 */
import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { horasDelDia } from '@/lib/calculo/boletos'
import { valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { aISO, diasDelPeriodo, primerDiaDelMes, ultimoDiaDelMes } from '@/lib/format/dates'
import type { DiaContexto } from '@/components/dominio/PlanillaMensual'

export type ContextoPlanilla = {
  dias: DiaContexto[]
  /** §7.1 — valores hora vigentes en ese mes, para el encabezado. */
  valorHoraCalculado: string | null
  valorHoraNegro: string | null
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  hayRegimen: boolean
}

export async function contextoDePlanilla(
  empleadoId: string,
  periodo: Date,
): Promise<ContextoPlanilla> {
  const desde = primerDiaDelMes(periodo)
  const hasta = ultimoDiaDelMes(periodo)

  const [regimenFila, salario, valorHoraNegro, feriados, liquidacion] = await Promise.all([
    prisma.empleadoRegimen.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoSalario.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoValorHoraNegro.findFirst({
      where: { empleadoId, fechaVigencia: { lte: desde } },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.feriado.findMany({ where: { fecha: { gte: desde, lte: hasta } } }),
    prisma.liquidacion.findFirst({
      where: { empleadoId, periodo: desde, tipo: 'MENSUAL', estado: 'CONFIRMADA' },
      include: { movimientos: { where: { tipo: 'PAGO' }, select: { id: true } } },
      orderBy: { secuencia: 'desc' },
    }),
  ])

  const regimen = regimenFila ? aRegimenHoras(regimenFila) : null
  const porFecha = new Map(feriados.map((f) => [aISO(f.fecha), f]))

  const dias: DiaContexto[] = diasDelPeriodo(periodo).map((f) => {
    const clave = aISO(f)
    const feriado = porFecha.get(clave)
    return {
      fecha: clave,
      horasRegimen: regimen ? aDecimal(horasDelDia(regimen, f)).toNumber() : 0,
      feriado: feriado?.descripcion ?? null,
      feriadoNoLaborable: feriado?.noLaborable ?? false,
    }
  })

  return {
    dias,
    valorHoraCalculado: salario
      ? valorHoraCalculado({
          salario: aDecimal(salario.salario),
          horasSemanales: aDecimal(salario.horasSemanales),
        }).toFixed(2)
      : null,
    valorHoraNegro: valorHoraNegro ? aDecimal(valorHoraNegro.valor).toFixed(2) : null,
    estadoLiquidacion: !liquidacion
      ? 'SIN_LIQUIDAR'
      : liquidacion.movimientos.length > 0
        ? 'LIQUIDADA_Y_PAGADA'
        : 'LIQUIDADA',
    hayRegimen: regimen !== null,
  }
}
