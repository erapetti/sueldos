/**
 * §4.4.1 y §5.2 — resolución del aporte a BPS de una empleada a una fecha dada.
 *
 * La liquidación no pasa por acá: resuelve su serie junto con las otras en
 * `lib/liquidacion/datos.ts` y falla por §6.8 si no hay registro vigente para el período.
 *
 * Este módulo es para los otros lugares que necesitan el aporte —el libro de un préstamo, la
 * tabla del salario vacacional, el libro que el diálogo de pago propone—, donde cada uno
 * tiene **su** fecha y ninguno es «hoy» por defecto.
 */
import 'server-only'
import { prisma } from '@/lib/db/prisma'
import { primerDiaDelMes } from '@/lib/format/dates'

export type AporteBpsResuelto = {
  aportaBps: boolean
  seguroSalud: string | null
}

/**
 * El aporte vigente para el mes de `fecha` (§5.2). Devuelve `null` solo si la empleada no
 * tiene ningún registro de la serie: el alta crea el primero con vigencia el 1° del mes de
 * ingreso (§4.2.2) y la migración lo hizo para las que ya existían, así que toda fecha del
 * vínculo resuelve.
 *
 * Para una fecha anterior a toda la serie —un movimiento cargado antes del mes de ingreso—
 * se devuelve el registro más antiguo, que es con el que la empleada empezó.
 */
export async function aporteBpsALaFecha(
  empleadoId: string,
  fecha: Date,
): Promise<AporteBpsResuelto | null> {
  const mes = primerDiaDelMes(fecha)

  const vigente = await prisma.empleadoAporteBps.findFirst({
    where: { empleadoId, fechaVigencia: { lte: mes } },
    orderBy: { fechaVigencia: 'desc' },
  })
  if (vigente) return { aportaBps: vigente.aportaBps, seguroSalud: vigente.seguroSalud }

  const primero = await prisma.empleadoAporteBps.findFirst({
    where: { empleadoId },
    orderBy: { fechaVigencia: 'asc' },
  })
  return primero ? { aportaBps: primero.aportaBps, seguroSalud: primero.seguroSalud } : null
}

/**
 * El libro que le corresponde a la empleada a esa fecha (§4.9): el formal si aporta, el
 * informal si no. Es el libro con el que se **graba** un movimiento, así que sin registro no
 * se adivina: el que llama decide qué hacer con el `null`.
 */
export async function libroALaFecha(
  empleadoId: string,
  fecha: Date,
): Promise<'FORMAL' | 'INFORMAL' | null> {
  const aporte = await aporteBpsALaFecha(empleadoId, fecha)
  return aporte ? (aporte.aportaBps ? 'FORMAL' : 'INFORMAL') : null
}
