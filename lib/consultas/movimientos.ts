/**
 * §7.4 y §7.5 — los movimientos que se cargan de a uno, listados y en detalle.
 *
 * **No hay tabla de préstamos y no hace falta.** Un préstamo *es* el asiento `PRESTAMO` de
 * `cuenta_corriente` (§4.9), y sus cuotas ya cuelgan de él: `plan_pagos.prestamo_id` es FK a
 * `cuenta_corriente` y el §4.8 la describe como «préstamo que originó el plan». Darle tabla
 * propia duplicaría la identidad del movimiento y obligaría a migrar esa FK.
 *
 * Las otras tres acciones de a una —pago adicional, licencia y pago bancario— son el mismo
 * caso, así que este módulo está partido para que cada una entre al lado de la de acá: una
 * función de listado que devuelve filas ya formateadas y una de detalle.
 */
import 'server-only'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { aDecimal } from '@/lib/db/mapeo'
import { aISO, formatearFecha } from '@/lib/format/dates'

/** Fila del listado de préstamos. Los importes viajan como string, como en el resto. */
export type FilaPrestamo = {
  id: string
  fecha: string
  fechaISO: string
  concepto: string
  monto: string
  saldo: string
  conPlan: boolean
  anulado: boolean
}

/**
 * Lo que falta devolver de un préstamo: el monto menos las cuotas **aplicadas**, que son las
 * que una liquidación confirmada ya descontó del sueldo.
 *
 * Una cuota `CANCELADA` no baja el saldo: cancelarla significa que ese mes no se descuenta,
 * no que la plata se haya devuelto. Un préstamo sin plan de devolución queda con el monto
 * entero, que es lo correcto: no hay nada que lo descuente automáticamente.
 *
 * Un préstamo anulado tiene su contra-asiento en la cuenta corriente y sus cuotas pendientes
 * quedaron canceladas, así que su saldo se muestra en cero: ya no se debe.
 */
function saldoDePrestamo(
  monto: Decimal,
  cuotas: readonly { monto: Decimal; estado: string }[],
  anulado: boolean,
): Decimal {
  if (anulado) return new Decimal(0)
  const aplicadas = cuotas
    .filter((c) => c.estado === 'APLICADA')
    .reduce((acc, c) => acc.plus(c.monto), new Decimal(0))
  return monto.minus(aplicadas)
}

export async function listarPrestamos(empleadoId: string): Promise<FilaPrestamo[]> {
  const prestamos = await prisma.cuentaCorriente.findMany({
    where: { empleadoId, tipo: 'PRESTAMO', reversaDeId: null },
    include: {
      cuotas: { select: { monto: true, estado: true } },
      reversas: { select: { id: true } },
    },
    orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
  })

  return prestamos.map((p) => {
    const monto = aDecimal(p.debe)
    const cuotas = p.cuotas.map((c) => ({ monto: aDecimal(c.monto), estado: c.estado }))
    const anulado = p.reversas.length > 0

    return {
      id: p.id,
      fecha: formatearFecha(p.fecha),
      fechaISO: aISO(p.fecha),
      concepto: p.concepto,
      monto: monto.toFixed(2),
      saldo: saldoDePrestamo(monto, cuotas, anulado).toFixed(2),
      conPlan: cuotas.length > 0,
      anulado,
    }
  })
}

export type CuotaDetalle = {
  id: string
  fechaISO: string
  periodo: string
  monto: string
  estado: string
}

export type DetallePrestamo = {
  id: string
  empleadoId: string
  fecha: string
  fechaISO: string
  concepto: string
  monto: string
  saldo: string
  anulado: boolean
  cuotas: CuotaDetalle[]
}

/**
 * Un préstamo con sus cuotas. Devuelve `null` si el id no es de un préstamo de ese empleado:
 * la página lo traduce a 404 y así el id de otra empleada no filtra nada.
 */
export async function detalleDePrestamo(
  empleadoId: string,
  prestamoId: string,
): Promise<DetallePrestamo | null> {
  const prestamo = await prisma.cuentaCorriente.findFirst({
    where: { id: prestamoId, empleadoId, tipo: 'PRESTAMO', reversaDeId: null },
    include: {
      cuotas: { orderBy: { fecha: 'asc' } },
      reversas: { select: { id: true } },
    },
  })
  if (!prestamo) return null

  const monto = aDecimal(prestamo.debe)
  const cuotas = prestamo.cuotas.map((c) => ({ monto: aDecimal(c.monto), estado: c.estado }))
  const anulado = prestamo.reversas.length > 0

  return {
    id: prestamo.id,
    empleadoId: prestamo.empleadoId,
    fecha: formatearFecha(prestamo.fecha),
    fechaISO: aISO(prestamo.fecha),
    concepto: prestamo.concepto,
    monto: monto.toFixed(2),
    saldo: saldoDePrestamo(monto, cuotas, anulado).toFixed(2),
    anulado,
    cuotas: prestamo.cuotas.map((c) => ({
      id: c.id,
      fechaISO: aISO(c.fecha),
      periodo: aISO(c.fecha).slice(0, 7),
      monto: aDecimal(c.monto).toFixed(2),
      estado: c.estado,
    })),
  }
}
