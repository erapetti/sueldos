'use server'

/**
 * §7.4 y §7.5 — préstamos con plan de devolución, pagos bancarios y ajustes.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db/prisma'
import { exigirEdicion } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import {
  ajusteCuentaCorriente,
  edicionConcepto,
  idUuid,
  pagoBancario,
  prestamo as esquemaPrestamo,
} from '@/lib/validacion/esquemas'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from '@/lib/liquidacion/pago'
import { aporteBpsALaFecha, libroALaFecha } from '@/lib/consultas/aporteBps'
import { hoy, parseFechaISO } from '@/lib/format/dates'

/**
 * Cómo queda el concepto de un asiento al que se lo dejaron vacío. Es obligatorio en la base
 * (§4.9), así que el vacío se rellena con el tipo en vez de rechazarse.
 */
const CONCEPTO_POR_DEFECTO: Record<string, string> = {
  PRESTAMO: 'Préstamo',
  PAGO: 'Pago bancario',
  AJUSTE: 'Ajuste',
}

/** El listado de cada tipo de asiento. El ajuste no tiene el suyo: se ve en la cuenta corriente. */
const LISTADO_POR_TIPO: Record<string, string> = {
  PRESTAMO: 'prestamos',
  PAGO: 'pagos-bancarios',
}

/** El listado del que vino el asiento, para revalidarlo junto con la ficha. */
function rutaDelListado(empleadoId: string, tipo: string): string {
  const hoja = LISTADO_POR_TIPO[tipo]
  return hoja ? `/empleados/${empleadoId}/${hoja}` : `/empleados/${empleadoId}`
}

/**
 * §7.4 — el movimiento `PRESTAMO` y las filas de `plan_pagos` se crean en una única
 * transacción (§11).
 */
export async function registrarPrestamo(entrada: unknown) {
  return ejecutar('prestamos.registrar', async (log) => {
    const datos = validar(esquemaPrestamo, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'cuenta_corriente', entidadId: empleado.id })

    const auditoria = { creadoPor: usuario.id, modificadoPor: usuario.id }
    const fecha = parseFechaISO(datos.fecha)

    /*
      §4.9 — el préstamo va al libro que le corresponde a la empleada **a la fecha del
      préstamo**: el formal si aporta BPS, el informal si no. El aporte es una serie (§4.4.1),
      así que se resuelve a esa fecha y no a la de hoy; uno cargado retroactivo tiene que caer
      en el libro que regía entonces.

      Queda grabado ahí y **no se recalcula**: sus cuotas van a descontar en ese libro aunque
      después cambie el aporte, que es lo que hace que el préstamo amortice donde nació.
    */
    const libro = await libroALaFecha(empleado.id, fecha)
    if (!libro) {
      throw new ErrorNegocio(
        'La empleada no tiene ningún aporte a BPS registrado: no se puede determinar el libro del préstamo.',
      )
    }

    const movimiento = await prisma.$transaction(async (tx) => {
      const creado = await tx.cuentaCorriente.create({
        data: {
          empleadoId: empleado.id,
          fecha,
          tipo: 'PRESTAMO',
          libro,
          // §4.9 — el préstamo va al debe: el empleado pasa a adeudar.
          debe: datos.monto,
          haber: '0',
          concepto: datos.concepto?.trim() || 'Préstamo',
          ...auditoria,
        },
      })

      if (datos.conPlan) {
        await tx.planPago.createMany({
          data: datos.cuotas.map((cuota) => ({
            empleadoId: empleado.id,
            prestamoId: creado.id,
            fecha: parseFechaISO(cuota.fecha),
            monto: cuota.monto,
            estado: 'PENDIENTE' as const,
            ...auditoria,
          })),
        })
      }

      return creado
    })

    log({ entidadId: movimiento.id })
    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(`/empleados/${empleado.id}/prestamos`)
    revalidatePath('/empleados')

    return exito(
      { id: movimiento.id },
      datos.conPlan
        ? `Préstamo registrado con ${datos.cuotas.length} cuotas previstas.`
        : 'Préstamo registrado sin plan de pagos.',
    )
  })
}

/**
 * §7.5 — pago bancario. Opcionalmente vinculado a una liquidación confirmada, que es lo que
 * la marca como pagada (§4.14).
 */
export async function registrarPagoBancario(entrada: unknown) {
  return ejecutar('prestamos.pagoBancario', async (log) => {
    const datos = validar(pagoBancario, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'cuenta_corriente', entidadId: empleado.id })

    if (datos.liquidacionId) {
      const liquidacion = await prisma.liquidacion.findUnique({
        where: { id: datos.liquidacionId },
        select: { empleadoId: true, estado: true },
      })
      if (!liquidacion || liquidacion.empleadoId !== empleado.id) {
        throw new ErrorNegocio('La liquidación no corresponde a este empleado.')
      }
      if (liquidacion.estado !== 'CONFIRMADA') {
        throw new ErrorNegocio('Solo se puede vincular el pago a una liquidación confirmada.')
      }
    }

    const movimiento = await prisma.cuentaCorriente.create({
      data: {
        empleadoId: empleado.id,
        fecha: parseFechaISO(datos.fecha),
        tipo: 'PAGO',
        // §4.9 — cada pago es de un libro: es el que decide qué queda por pagar (§4.14).
        libro: datos.libro,
        // §4.9 — el pago va al debe: cancela lo devengado.
        debe: datos.monto,
        haber: '0',
        concepto: datos.concepto.trim(),
        liquidacionId: datos.liquidacionId ?? null,
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
    })

    log({ entidadId: movimiento.id })
    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(`/empleados/${empleado.id}/pagos-bancarios`)
    revalidatePath('/empleados')
    return exito({ id: movimiento.id }, 'Pago registrado.')
  })
}

/** §4.9 — ajuste manual, con concepto obligatorio. */
export async function registrarAjuste(entrada: unknown) {
  return ejecutar('prestamos.ajuste', async (log) => {
    const datos = validar(ajusteCuentaCorriente, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'cuenta_corriente', entidadId: empleado.id })

    const movimiento = await prisma.cuentaCorriente.create({
      data: {
        empleadoId: empleado.id,
        fecha: parseFechaISO(datos.fecha),
        tipo: 'AJUSTE',
        libro: datos.libro,
        debe: datos.lado === 'DEBE' ? datos.monto : '0',
        haber: datos.lado === 'HABER' ? datos.monto : '0',
        concepto: datos.concepto.trim(),
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
    })

    log({ entidadId: movimiento.id })
    revalidatePath(`/empleados/${empleado.id}`)
    return exito({ id: movimiento.id }, 'Ajuste registrado.')
  })
}

/**
 * §4.9 — anulación de un movimiento: nunca se borra, se inserta un contra-asiento con
 * `reversaDeId` apuntando al original.
 */
export async function anularMovimiento(movimientoId: string) {
  return ejecutar('prestamos.anularMovimiento', async (log) => {
    const id = validar(idUuid, movimientoId)

    const original = await prisma.cuentaCorriente.findUnique({
      where: { id },
      include: { reversas: { select: { id: true } }, cuotas: { select: { id: true, estado: true } } },
    })
    if (!original) throw new ErrorNegocio('No se encontró el movimiento.')

    const { usuario, empleado } = await exigirEdicion(original.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'cuenta_corriente', entidadId: id })

    if (original.reversas.length > 0) throw new ErrorNegocio('El movimiento ya está anulado.')
    if (original.reversaDeId) throw new ErrorNegocio('Un contra-asiento no se anula.')
    if (original.tipo === 'LIQUIDACION') {
      throw new ErrorNegocio(
        'Este movimiento nació de una liquidación: anulá la liquidación desde su pantalla.',
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.cuentaCorriente.create({
        data: {
          empleadoId: empleado.id,
          fecha: original.fecha,
          tipo: original.tipo,
          // El contra-asiento vive en el mismo libro que el movimiento que anula.
          libro: original.libro,
          // Contra-asiento: mismo monto al lado opuesto.
          debe: original.haber,
          haber: original.debe,
          concepto: `Anulación: ${original.concepto}`,
          liquidacionId: original.liquidacionId,
          reversaDeId: original.id,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })

      // Anular un préstamo cancela las cuotas previstas que todavía no se aplicaron.
      if (original.tipo === 'PRESTAMO') {
        await tx.planPago.updateMany({
          where: { prestamoId: original.id, estado: 'PENDIENTE' },
          data: { estado: 'CANCELADA', modificadoPor: usuario.id },
        })
      }
    })

    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(rutaDelListado(empleado.id, original.tipo))
    revalidatePath('/empleados')
    return exito(undefined, 'Movimiento anulado con un contra-asiento.')
  })
}

/**
 * §7.4 y §7.5 — edita un asiento ya registrado desde su pantalla de detalle: un préstamo o un
 * pago bancario.
 *
 * Solo el concepto. El monto y la fecha quedan fijos: el asiento ya está en su libro de la
 * cuenta corriente (§4.9) y cambiarlo movería un saldo que puede tener liquidaciones
 * confirmadas encima. El camino para corregirlos es anular el movimiento —que deja su
 * contra-asiento— y volver a registrarlo.
 *
 * Los que **nacen de una liquidación** no se editan acá, igual que no se anulan acá: su
 * concepto lo escribió el confirmar, y el camino es la liquidación.
 */
export async function actualizarMovimiento(entrada: unknown) {
  return ejecutar('prestamos.actualizarMovimiento', async (log) => {
    const datos = validar(edicionConcepto, entrada)

    const movimiento = await prisma.cuentaCorriente.findUnique({ where: { id: datos.id } })
    if (!movimiento) throw new ErrorNegocio('No se encontró el movimiento.')
    if (movimiento.tipo === 'LIQUIDACION') {
      throw new ErrorNegocio('Este movimiento nació de una liquidación y no se edita.')
    }

    const { usuario, empleado } = await exigirEdicion(movimiento.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'cuenta_corriente', entidadId: movimiento.id })

    await prisma.cuentaCorriente.update({
      where: { id: movimiento.id },
      data: {
        concepto: datos.concepto?.trim() || CONCEPTO_POR_DEFECTO[movimiento.tipo],
        modificadoPor: usuario.id,
      },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(rutaDelListado(empleado.id, movimiento.tipo))
    return exito(undefined, 'Movimiento actualizado.')
  })
}

/** §4.8 — las cuotas pendientes se editan o cancelan mientras no estén aplicadas. */
export async function actualizarCuota(cuotaId: string, monto: string, fechaISO: string) {
  return ejecutar('prestamos.actualizarCuota', async (log) => {
    const cuota = await prisma.planPago.findUnique({ where: { id: validar(idUuid, cuotaId) } })
    if (!cuota) throw new ErrorNegocio('No se encontró la cuota.')

    const { usuario, empleado } = await exigirEdicion(cuota.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'plan_pagos', entidadId: cuota.id })

    if (cuota.estado !== 'PENDIENTE') {
      throw new ErrorNegocio('Solo se pueden modificar las cuotas pendientes.')
    }

    await prisma.planPago.update({
      where: { id: cuota.id },
      data: { monto, fecha: parseFechaISO(fechaISO), modificadoPor: usuario.id },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(`/empleados/${empleado.id}/prestamos`)
    return exito(undefined, 'Cuota actualizada.')
  })
}

export async function cancelarCuota(cuotaId: string) {
  return ejecutar('prestamos.cancelarCuota', async (log) => {
    const cuota = await prisma.planPago.findUnique({ where: { id: validar(idUuid, cuotaId) } })
    if (!cuota) throw new ErrorNegocio('No se encontró la cuota.')

    const { usuario, empleado } = await exigirEdicion(cuota.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'plan_pagos', entidadId: cuota.id })

    if (cuota.estado !== 'PENDIENTE') {
      throw new ErrorNegocio('Solo se pueden cancelar las cuotas pendientes.')
    }

    await prisma.planPago.update({
      where: { id: cuota.id },
      data: { estado: 'CANCELADA', modificadoPor: usuario.id },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    revalidatePath(`/empleados/${empleado.id}/prestamos`)
    return exito(undefined, 'Cuota cancelada.')
  })
}

/**
 * §7.5 — liquidaciones confirmadas del empleado, para poder vincular el pago.
 *
 * Cada una viaja con lo que paga en cada libro y con los libros que le faltan (§4.14): es lo
 * que le permite al diálogo ofrecer el libro pendiente y precargar su monto.
 */
export async function liquidacionesParaPago(empleadoId: string) {
  return ejecutar('prestamos.liquidacionesParaPago', async (log) => {
    const { usuario, empleado } = await exigirEdicion(empleadoId)
    log({ usuarioId: usuario.id, entidad: 'liquidacion', entidadId: empleado.id })

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: empleado.id, estado: 'CONFIRMADA' },
      include: INCLUIR_PAGOS,
      orderBy: [{ periodo: 'desc' }, { secuencia: 'desc' }],
      take: 24,
    })

    // El libro que el diálogo propone por defecto es el que le toca **hoy**: es una sugerencia
    // para una transferencia que se está haciendo ahora, no el libro de un asiento pasado.
    const aporte = await aporteBpsALaFecha(empleado.id, hoy())

    return exito({
      aportaBps: aporte?.aportaBps ?? true,
      liquidaciones: liquidaciones.map((l) => {
        const pago = pagoDeLiquidacion(l)
        return {
          id: l.id,
          periodo: l.periodo.toISOString().slice(0, 10),
          tipo: l.tipo,
          secuencia: l.secuencia,
          totalAPagar: l.totalAPagar.toString(),
          totalAPagarFormal: l.totalAPagarFormal.toString(),
          totalAPagarInformal: l.totalAPagarInformal.toString(),
          libros: pago.libros,
          faltan: pago.faltan,
          pago: pago.estado,
        }
      }),
    })
  })
}
