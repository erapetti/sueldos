'use server'

/**
 * §7.9 y §3.4 — parámetros de administrador y ABM de usuarios.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import { exigirAdmin } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import {
  altaUsuario,
  bajaUsuario,
  idUuid,
  modificarUsuario,
  nuevoConceptoBps,
  nuevoFeriado,
  nuevoValorBoleto,
} from '@/lib/validacion/esquemas'
import { aColumnaPorcentaje } from '@/lib/db/mapeo'
import { hoy, parseFechaISO, primerDiaDelMes } from '@/lib/format/dates'

/**
 * §5.3 — para los cambios paramétricos de administrador la advertencia enumera **cuántos
 * empleados** tienen liquidaciones confirmadas afectadas, sin listarlos.
 */
async function avisoDeEmpleadosAfectados(fechaVigencia: Date): Promise<string | undefined> {
  const afectados = await prisma.liquidacion.findMany({
    where: { periodo: { gte: fechaVigencia }, estado: 'CONFIRMADA' },
    select: { empleadoId: true },
    distinct: ['empleadoId'],
  })

  if (afectados.length === 0) return undefined
  return afectados.length === 1
    ? 'Hay 1 empleado con liquidaciones confirmadas afectadas. El cambio no las modifica; para aplicarlo hay que recalcular esos períodos.'
    : `Hay ${afectados.length} empleados con liquidaciones confirmadas afectadas. El cambio no las modifica; para aplicarlo hay que recalcular esos períodos.`
}

// ── §7.9 costo de boletos ────────────────────────────────────────────────────

export async function registrarValorBoleto(entrada: unknown) {
  return ejecutar('admin.valorBoleto', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(nuevoValorBoleto, entrada)
    log({ usuarioId: usuario.id, entidad: 'valor_boleto' })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const existente = await prisma.valorBoleto.findUnique({ where: { fechaVigencia } })
    if (existente && !datos.reemplazar) {
      throw new ErrorNegocio(
        'Ya hay un valor de boleto vigente desde ese mes. Confirmá el reemplazo para sobrescribirlo.',
      )
    }

    const fila = existente
      ? await prisma.valorBoleto.update({
          where: { id: existente.id },
          data: { monto: datos.monto, modificadoPor: usuario.id },
        })
      : await prisma.valorBoleto.create({
          data: {
            monto: datos.monto,
            fechaVigencia,
            creadoPor: usuario.id,
            modificadoPor: usuario.id,
          },
        })

    await auditar({
      usuarioId: usuario.id,
      entidad: 'valor_boleto',
      entidadId: fila.id,
      accion: existente ? 'REEMPLAZAR_VALOR_BOLETO' : 'NUEVO_VALOR_BOLETO',
      datosAntes: existente ? { monto: existente.monto.toString() } : undefined,
      datosDespues: { monto: datos.monto, fechaVigencia: datos.fechaVigencia },
    })

    revalidatePath('/admin/boletos')
    return exito(undefined, await avisoDeEmpleadosAfectados(fechaVigencia))
  })
}

export async function borrarValorBoleto(id: string) {
  return ejecutar('admin.borrarValorBoleto', async (log) => {
    const usuario = await exigirAdmin()
    log({ usuarioId: usuario.id, entidad: 'valor_boleto', entidadId: id })

    const fila = await prisma.valorBoleto.findUnique({ where: { id: validar(idUuid, id) } })
    if (!fila) throw new ErrorNegocio('No se encontró el registro.')

    // §5.4 — solo se borra si la vigencia es futura.
    if (fila.fechaVigencia.getTime() <= primerDiaDelMes(hoy()).getTime()) {
      throw new ErrorNegocio('Solo se pueden borrar valores con vigencia futura.')
    }

    await prisma.valorBoleto.delete({ where: { id: fila.id } })
    await auditar({
      usuarioId: usuario.id,
      entidad: 'valor_boleto',
      entidadId: fila.id,
      accion: 'BORRAR_VALOR_BOLETO',
      datosAntes: { monto: fila.monto.toString() },
    })

    revalidatePath('/admin/boletos')
    return exito(undefined, 'Se borró el valor.')
  })
}

// ── §7.9 feriados ────────────────────────────────────────────────────────────

export async function guardarFeriado(entrada: unknown) {
  return ejecutar('admin.feriado', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(nuevoFeriado, entrada)
    log({ usuarioId: usuario.id, entidad: 'feriado' })

    const fecha = parseFechaISO(datos.fecha)

    await prisma.feriado.upsert({
      where: { fecha },
      create: {
        fecha,
        descripcion: datos.descripcion,
        noLaborable: datos.noLaborable,
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
      update: {
        descripcion: datos.descripcion,
        noLaborable: datos.noLaborable,
        modificadoPor: usuario.id,
      },
    })

    await auditar({
      usuarioId: usuario.id,
      entidad: 'feriado',
      accion: 'GUARDAR_FERIADO',
      datosDespues: { fecha: datos.fecha, descripcion: datos.descripcion, noLaborable: datos.noLaborable },
    })

    revalidatePath('/admin/feriados')
    return exito(undefined, 'Feriado guardado.')
  })
}

/** §7.9 — solo se dan de baja feriados futuros; los de fechas ya liquidadas no se borran. */
export async function borrarFeriado(fechaISO: string) {
  return ejecutar('admin.borrarFeriado', async (log) => {
    const usuario = await exigirAdmin()
    log({ usuarioId: usuario.id, entidad: 'feriado' })

    const fecha = parseFechaISO(fechaISO)
    const feriado = await prisma.feriado.findUnique({ where: { fecha } })
    if (!feriado) throw new ErrorNegocio('No se encontró el feriado.')

    if (fecha.getTime() <= hoy().getTime()) {
      throw new ErrorNegocio('Solo se pueden borrar feriados futuros.')
    }

    const liquidado = await prisma.liquidacion.findFirst({
      where: { periodo: primerDiaDelMes(fecha), estado: 'CONFIRMADA' },
      select: { id: true },
    })
    if (liquidado) {
      throw new ErrorNegocio('El mes de ese feriado ya tiene liquidaciones confirmadas.')
    }

    await prisma.feriado.delete({ where: { fecha } })
    await auditar({
      usuarioId: usuario.id,
      entidad: 'feriado',
      accion: 'BORRAR_FERIADO',
      datosAntes: { fecha: fechaISO, descripcion: feriado.descripcion },
    })

    revalidatePath('/admin/feriados')
    return exito(undefined, 'Se borró el feriado.')
  })
}

// ── §7.9 descuentos de BPS ───────────────────────────────────────────────────

/**
 * §7.9 — "Nuevo concepto", "Cambiar porcentaje" y "Dar de baja el concepto" son la misma
 * operación: insertar un registro con la vigencia elegida. La baja es un registro con
 * `porcentaje = NULL` (§4.11).
 */
export async function guardarConceptoBps(entrada: unknown) {
  return ejecutar('admin.conceptoBps', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(nuevoConceptoBps, entrada)
    log({ usuarioId: usuario.id, entidad: 'bps_concepto' })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)
    // El esquema ya normalizó la coma decimal.
    const porcentaje =
      datos.porcentaje === null ? null : aColumnaPorcentaje(new Decimal(datos.porcentaje))

    const seguroSaludClave = datos.seguroSalud ?? '*'

    const existente = await prisma.bpsConcepto.findUnique({
      where: {
        concepto_seguroSaludClave_fechaVigencia: {
          concepto: datos.concepto,
          seguroSaludClave,
          fechaVigencia,
        },
      },
    })
    if (existente && !datos.reemplazar) {
      throw new ErrorNegocio(
        'Ya hay un registro de ese concepto con esa misma vigencia. Confirmá el reemplazo para sobrescribirlo.',
      )
    }

    if (existente) {
      await prisma.bpsConcepto.update({
        where: { id: existente.id },
        data: { porcentaje, modificadoPor: usuario.id },
      })
    } else {
      await prisma.bpsConcepto.create({
        data: {
          concepto: datos.concepto,
          porcentaje,
          seguroSalud: datos.seguroSalud,
          seguroSaludClave,
          fechaVigencia,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })
    }

    await auditar({
      usuarioId: usuario.id,
      entidad: 'bps_concepto',
      accion: porcentaje === null ? 'BAJA_CONCEPTO_BPS' : 'GUARDAR_CONCEPTO_BPS',
      datosDespues: {
        concepto: datos.concepto,
        seguroSalud: datos.seguroSalud,
        porcentaje,
        fechaVigencia: datos.fechaVigencia,
      },
    })

    revalidatePath('/admin/bps')
    return exito(undefined, await avisoDeEmpleadosAfectados(fechaVigencia))
  })
}

export async function borrarConceptoBps(id: string) {
  return ejecutar('admin.borrarConceptoBps', async (log) => {
    const usuario = await exigirAdmin()
    log({ usuarioId: usuario.id, entidad: 'bps_concepto', entidadId: id })

    const fila = await prisma.bpsConcepto.findUnique({ where: { id: validar(idUuid, id) } })
    if (!fila) throw new ErrorNegocio('No se encontró el registro.')

    if (fila.fechaVigencia.getTime() <= primerDiaDelMes(hoy()).getTime()) {
      throw new ErrorNegocio(
        'Solo se pueden borrar registros con vigencia futura. Para dejar de aplicar un concepto, dalo de baja.',
      )
    }

    await prisma.bpsConcepto.delete({ where: { id: fila.id } })
    revalidatePath('/admin/bps')
    return exito(undefined, 'Se borró el registro.')
  })
}

// ── §3.4 usuarios ────────────────────────────────────────────────────────────

export async function crearUsuario(entrada: unknown) {
  return ejecutar('admin.crearUsuario', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(altaUsuario, entrada)
    log({ usuarioId: usuario.id, entidad: 'usuario' })

    const existente = await prisma.usuario.findUnique({ where: { email: datos.email } })
    if (existente) {
      throw new ErrorNegocio('Ya hay un usuario con ese email.', { email: 'Email repetido' })
    }

    // §3.3 — el id de Google queda NULL hasta el primer ingreso.
    const creado = await prisma.usuario.create({
      data: {
        email: datos.email,
        nombre: datos.nombre?.trim() || null,
        esAdmin: datos.esAdmin,
        activo: true,
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
    })

    await auditar({
      usuarioId: usuario.id,
      entidad: 'usuario',
      entidadId: creado.id,
      accion: 'ALTA_USUARIO',
      datosDespues: { email: datos.email, esAdmin: datos.esAdmin },
    })

    log({ entidadId: creado.id })
    revalidatePath('/admin/usuarios')
    return exito({ id: creado.id }, 'Usuario dado de alta.')
  })
}

export async function actualizarUsuario(entrada: unknown) {
  return ejecutar('admin.actualizarUsuario', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(modificarUsuario, entrada)
    log({ usuarioId: usuario.id, entidad: 'usuario', entidadId: datos.usuarioId })

    const destino = await prisma.usuario.findUnique({ where: { id: datos.usuarioId } })
    if (!destino) throw new ErrorNegocio('No se encontró el usuario.')

    // §3.4 — un administrador no puede quitarse a sí mismo el flag de administrador.
    if (destino.id === usuario.id && !datos.esAdmin) {
      throw new ErrorNegocio('No podés quitarte a vos mismo el flag de administrador.')
    }
    if (destino.id === usuario.id && !datos.activo) {
      throw new ErrorNegocio('No podés desactivarte a vos mismo.')
    }

    // §3.4 — no se puede dejar al sistema sin administradores.
    if (destino.esAdmin && (!datos.esAdmin || !datos.activo)) {
      const otros = await prisma.usuario.count({
        where: { esAdmin: true, activo: true, id: { not: destino.id } },
      })
      if (otros === 0) throw new ErrorNegocio('Es el último administrador activo del sistema.')
    }

    await prisma.usuario.update({
      where: { id: destino.id },
      data: {
        nombre: datos.nombre?.trim() || null,
        esAdmin: datos.esAdmin,
        activo: datos.activo,
        modificadoPor: usuario.id,
      },
    })

    await auditar({
      usuarioId: usuario.id,
      entidad: 'usuario',
      entidadId: destino.id,
      accion: 'MODIFICAR_USUARIO',
      datosAntes: { esAdmin: destino.esAdmin, activo: destino.activo },
      datosDespues: { esAdmin: datos.esAdmin, activo: datos.activo },
    })

    revalidatePath('/admin/usuarios')
    return exito(undefined, 'Usuario actualizado.')
  })
}

/**
 * §3.4 — no se puede borrar un usuario que sea dueño de empleados: primero hay que
 * transferir la propiedad. El diálogo ofrece elegir el nuevo dueño de todos sus empleados.
 */
export async function borrarUsuario(entrada: unknown) {
  return ejecutar('admin.borrarUsuario', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(bajaUsuario, entrada)
    log({ usuarioId: usuario.id, entidad: 'usuario', entidadId: datos.usuarioId })

    const destino = await prisma.usuario.findUnique({
      where: { id: datos.usuarioId },
      include: { empleados: { select: { id: true, alias: true } } },
    })
    if (!destino) throw new ErrorNegocio('No se encontró el usuario.')

    if (destino.id === usuario.id) throw new ErrorNegocio('No podés borrarte a vos mismo.')

    if (destino.esAdmin) {
      const otros = await prisma.usuario.count({
        where: { esAdmin: true, activo: true, id: { not: destino.id } },
      })
      if (otros === 0) throw new ErrorNegocio('Es el último administrador del sistema.')
    }

    if (destino.empleados.length > 0) {
      if (!datos.nuevoDuenoId) {
        throw new ErrorNegocio(
          `El usuario es dueño de ${destino.empleados.length} empleado(s). Elegí a quién transferirlos antes de borrarlo.`,
          { nuevoDuenoId: 'Elegí el nuevo dueño' },
        )
      }

      const nuevoDueno = await prisma.usuario.findUnique({
        where: { id: datos.nuevoDuenoId },
        include: { empleados: { select: { alias: true } } },
      })
      if (!nuevoDueno) throw new ErrorNegocio('No se encontró el usuario destino.')

      // El alias es único por dueño: hay que verificar que no choquen.
      const aliasDelDestino = new Set(nuevoDueno.empleados.map((e) => e.alias))
      const choques = destino.empleados.filter((e) => aliasDelDestino.has(e.alias))
      if (choques.length > 0) {
        throw new ErrorNegocio(
          `El nuevo dueño ya tiene empleados con estos alias: ${choques.map((c) => c.alias).join(', ')}. Cambialos antes de transferir.`,
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      if (destino.empleados.length > 0 && datos.nuevoDuenoId) {
        const ids = destino.empleados.map((e) => e.id)
        await tx.empleado.updateMany({
          where: { id: { in: ids } },
          data: { duenoId: datos.nuevoDuenoId, modificadoPor: usuario.id },
        })
        // El dueño no figura en la tabla de permisos: su permiso es implícito y total.
        await tx.empleadoPermiso.deleteMany({
          where: { usuarioId: datos.nuevoDuenoId, empleadoId: { in: ids } },
        })
      }

      await tx.empleadoPermiso.deleteMany({ where: { usuarioId: destino.id } })
      await tx.auditoria.updateMany({
        where: { usuarioId: destino.id },
        data: { usuarioId: null },
      })
      await tx.usuario.delete({ where: { id: destino.id } })

      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'usuario',
          entidadId: destino.id,
          accion: 'BAJA_USUARIO',
          datosAntes: { email: destino.email, empleados: destino.empleados.length },
          datosDespues: { nuevoDuenoId: datos.nuevoDuenoId ?? null },
        },
        tx,
      )
    })

    revalidatePath('/admin/usuarios')
    revalidatePath('/empleados/todos')
    return exito(undefined, 'Usuario borrado.')
  })
}
