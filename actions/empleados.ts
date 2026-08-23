'use server'

/**
 * §4.2, §7.10, §8.3 y §8.7 — alta, modificación, baja, visibilidad y compartir empleados.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import {
  accesoAEmpleado,
  exigirDueno,
  exigirDuenoOAdmin,
  exigirEdicion,
  exigirUsuarioEnAccion,
} from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import {
  altaEmpleado,
  bajaEmpleado,
  cambiarDueno as esquemaCambiarDueno,
  cambiarVisibilidad as esquemaCambiarVisibilidad,
  compartirEmpleado as esquemaCompartir,
  datosEmpleado,
  dejarDeCompartir as esquemaDejarDeCompartir,
  idUuid,
} from '@/lib/validacion/esquemas'
import { parseFechaISO, primerDiaDelMes } from '@/lib/format/dates'
import { aColumnaCantidad } from '@/lib/db/mapeo'

function limpiar(valor: string | undefined | null): string | null {
  const v = valor?.trim()
  return v ? v : null
}

/**
 * §4.2.2 — el alta es un único formulario que crea, en una transacción, el empleado y el
 * primer registro de cada una de las tres series, todos con vigencia el 1° del mes de
 * `fechaIngreso`.
 */
export async function crearEmpleado(entrada: unknown) {
  return ejecutar('empleados.crear', async (log) => {
    const usuario = await exigirUsuarioEnAccion()
    log({ usuarioId: usuario.id, entidad: 'empleado' })

    const datos = validar(altaEmpleado, entrada)

    const sumaRegimen = Object.values(datos.regimen).reduce((a, b) => a + b, 0)
    if (Math.abs(sumaRegimen - datos.horasSemanales) > 1e-9) {
      throw new ErrorNegocio(
        `El régimen suma ${sumaRegimen} h y las horas semanales son ${datos.horasSemanales} h.`,
        { regimen: 'La suma de los días tiene que coincidir con las horas semanales' },
      )
    }

    const yaExiste = await prisma.empleado.findFirst({
      where: { duenoId: usuario.id, alias: datos.alias },
      select: { id: true },
    })
    if (yaExiste) {
      throw new ErrorNegocio('Ya tenés un empleado con ese alias.', {
        alias: 'Ya usaste este alias',
      })
    }

    const fechaIngreso = parseFechaISO(datos.fechaIngreso)
    const vigencia = primerDiaDelMes(fechaIngreso)
    const auditoria = { creadoPor: usuario.id, modificadoPor: usuario.id }

    const empleado = await prisma.$transaction(async (tx) => {
      const creado = await tx.empleado.create({
        data: {
          duenoId: usuario.id,
          alias: datos.alias,
          nombreCompleto: datos.nombreCompleto,
          banco: limpiar(datos.banco),
          cuenta: limpiar(datos.cuenta),
          fechaIngreso,
          cobraBoletos: datos.cobraBoletos,
          aportaBps: datos.aportaBps,
          celular: limpiar(datos.celular),
          direccion: limpiar(datos.direccion),
          cedula: limpiar(datos.cedula),
          // §4.2 — el seguro de salud solo tiene efecto si aporta BPS.
          seguroSalud: datos.aportaBps ? (datos.seguroSalud ?? null) : null,
          ...auditoria,
        },
      })

      await tx.empleadoSalario.create({
        data: {
          empleadoId: creado.id,
          salario: datos.salario,
          horasSemanales: aColumnaCantidad(new Decimal(datos.horasSemanales)),
          fechaVigencia: vigencia,
          origen: 'MANUAL',
          ...auditoria,
        },
      })

      await tx.empleadoValorHoraNegro.create({
        data: {
          empleadoId: creado.id,
          valor: datos.valorHoraNegro,
          fechaVigencia: vigencia,
          origen: 'MANUAL',
          ...auditoria,
        },
      })

      await tx.empleadoRegimen.create({
        data: {
          empleadoId: creado.id,
          fechaVigencia: vigencia,
          horasLunes: aColumnaCantidad(new Decimal(datos.regimen.lunes)),
          horasMartes: aColumnaCantidad(new Decimal(datos.regimen.martes)),
          horasMiercoles: aColumnaCantidad(new Decimal(datos.regimen.miercoles)),
          horasJueves: aColumnaCantidad(new Decimal(datos.regimen.jueves)),
          horasViernes: aColumnaCantidad(new Decimal(datos.regimen.viernes)),
          horasSabado: aColumnaCantidad(new Decimal(datos.regimen.sabado)),
          horasDomingo: aColumnaCantidad(new Decimal(datos.regimen.domingo)),
          ...auditoria,
        },
      })

      return creado
    })

    log({ entidadId: empleado.id })
    revalidatePath('/empleados')
    return exito({ id: empleado.id })
  })
}

export async function actualizarEmpleado(empleadoId: string, entrada: unknown) {
  return ejecutar('empleados.actualizar', async (log) => {
    const { usuario, empleado } = await exigirEdicion(empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleadoId })

    const datos = validar(datosEmpleado, entrada)

    // El alias es único por dueño (§4.2).
    const duplicado = await prisma.empleado.findFirst({
      where: { duenoId: empleado.duenoId, alias: datos.alias, id: { not: empleadoId } },
      select: { id: true },
    })
    if (duplicado) {
      throw new ErrorNegocio('El dueño ya tiene otro empleado con ese alias.', {
        alias: 'Ya usaste este alias',
      })
    }

    await prisma.empleado.update({
      where: { id: empleadoId },
      data: {
        alias: datos.alias,
        nombreCompleto: datos.nombreCompleto,
        banco: limpiar(datos.banco),
        cuenta: limpiar(datos.cuenta),
        fechaIngreso: parseFechaISO(datos.fechaIngreso),
        cobraBoletos: datos.cobraBoletos,
        aportaBps: datos.aportaBps,
        celular: limpiar(datos.celular),
        direccion: limpiar(datos.direccion),
        cedula: limpiar(datos.cedula),
        seguroSalud: datos.aportaBps ? (datos.seguroSalud ?? null) : null,
        modificadoPor: usuario.id,
      },
    })

    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleadoId}`)
    return exito(undefined)
  })
}

/**
 * §4.2.1 — un empleado con liquidaciones o movimientos no se borra: se marca `activo = false`
 * y se le pide la fecha de egreso. Uno sin ningún movimiento sí se borra físicamente.
 */
export async function darDeBajaEmpleado(entrada: unknown) {
  return ejecutar('empleados.baja', async (log) => {
    const datos = validar(bajaEmpleado, entrada)
    const { usuario, empleado } = await exigirDueno(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    const fechaEgreso = parseFechaISO(datos.fechaEgreso)
    if (fechaEgreso.getTime() < empleado.fechaIngreso.getTime()) {
      throw new ErrorNegocio('La fecha de egreso no puede ser anterior a la de ingreso.', {
        fechaEgreso: 'Anterior a la fecha de ingreso',
      })
    }

    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: false, fechaEgreso, modificadoPor: usuario.id },
    })

    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, `${empleado.alias} quedó dado de baja.`)
  })
}

/** Reactiva un empleado dado de baja por error. */
export async function reactivarEmpleado(empleadoId: string) {
  return ejecutar('empleados.reactivar', async (log) => {
    const { usuario, empleado } = await exigirDueno(empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: true, fechaEgreso: null, modificadoPor: usuario.id },
    })

    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, `${empleado.alias} volvió a estar activo.`)
  })
}

/** §4.2.1 — borrado físico, solo si el empleado no participó de ningún movimiento. */
export async function borrarEmpleado(empleadoId: string) {
  return ejecutar('empleados.borrar', async (log) => {
    const { usuario, empleado } = await exigirDueno(validar(idUuid, empleadoId))
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    const [liquidaciones, movimientos] = await Promise.all([
      prisma.liquidacion.count({ where: { empleadoId } }),
      prisma.cuentaCorriente.count({ where: { empleadoId } }),
    ])

    if (liquidaciones > 0 || movimientos > 0) {
      throw new ErrorNegocio(
        'El empleado tiene liquidaciones o movimientos registrados: en vez de borrarlo, dalo de baja.',
      )
    }

    await prisma.empleado.delete({ where: { id: empleadoId } })

    revalidatePath('/empleados')
    return exito(undefined, `Se borró a ${empleado.alias}.`)
  })
}

/**
 * §8.3 / §8.7 — ocultar del listado o volver a mostrar. Ocultar requiere que el empleado
 * esté dado de baja; volver a mostrarlo se puede siempre, desde "Todos los empleados".
 */
export async function cambiarVisibilidad(entrada: unknown) {
  return ejecutar('empleados.visibilidad', async (log) => {
    const datos = validar(esquemaCambiarVisibilidad, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    if (!datos.visible && empleado.activo) {
      throw new ErrorNegocio('Solo se puede ocultar del listado a un empleado dado de baja.')
    }

    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { visible: datos.visible, modificadoPor: usuario.id },
    })

    revalidatePath('/empleados')
    revalidatePath('/empleados/todos')

    return exito(
      undefined,
      datos.visible
        ? `${empleado.alias} vuelve a aparecer en el listado.`
        : `${empleado.alias} ya no aparece en el listado. Está en «Todos los empleados».`,
    )
  })
}

/** §7.10 — compartir. Solo el dueño. */
export async function compartirEmpleado(entrada: unknown) {
  return ejecutar('empleados.compartir', async (log) => {
    const datos = validar(esquemaCompartir, entrada)
    const { usuario, empleado, nivel } = await exigirDuenoOAdmin(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    // §8.7 — un administrador sobre un empleado ajeno solo puede compartírselo a sí mismo.
    if (nivel === 'ADMIN' && datos.usuarioId !== usuario.id) {
      throw new ErrorNegocio(
        'Como administrador solo podés compartirte el empleado a vos mismo; el resto lo decide el dueño.',
      )
    }
    if (datos.usuarioId === empleado.duenoId) {
      throw new ErrorNegocio('El dueño ya tiene acceso total al empleado.')
    }

    const destino = await prisma.usuario.findUnique({ where: { id: datos.usuarioId } })
    if (!destino) throw new ErrorNegocio('No se encontró el usuario.')

    await prisma.empleadoPermiso.upsert({
      where: { empleadoId_usuarioId: { empleadoId: empleado.id, usuarioId: datos.usuarioId } },
      create: {
        empleadoId: empleado.id,
        usuarioId: datos.usuarioId,
        permiso: datos.permiso,
        creadoPor: usuario.id,
        modificadoPor: usuario.id,
      },
      update: { permiso: datos.permiso, modificadoPor: usuario.id },
    })

    if (nivel === 'ADMIN') {
      await auditar({
        usuarioId: usuario.id,
        entidad: 'empleado',
        entidadId: empleado.id,
        accion: 'ADMIN_AUTOCOMPARTIR',
        datosDespues: { permiso: datos.permiso },
      })
    }

    revalidatePath('/empleados')
    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, `Compartido con ${destino.nombre ?? destino.email}.`)
  })
}

export async function dejarDeCompartirEmpleado(entrada: unknown) {
  return ejecutar('empleados.descompartir', async (log) => {
    const datos = validar(esquemaDejarDeCompartir, entrada)
    const { usuario, empleado } = await exigirDueno(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    await prisma.empleadoPermiso.deleteMany({
      where: { empleadoId: empleado.id, usuarioId: datos.usuarioId },
    })

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, 'Se quitó el acceso.')
  })
}

/** §8.7 — cambiar el dueño. El dueño actual, o cualquier administrador. */
export async function cambiarDuenoEmpleado(entrada: unknown) {
  return ejecutar('empleados.cambiarDueno', async (log) => {
    const datos = validar(esquemaCambiarDueno, entrada)
    const { usuario, empleado, nivel } = await exigirDuenoOAdmin(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleado.id })

    if (datos.nuevoDuenoId === empleado.duenoId) {
      throw new ErrorNegocio('Ese usuario ya es el dueño.')
    }

    const nuevoDueno = await prisma.usuario.findUnique({ where: { id: datos.nuevoDuenoId } })
    if (!nuevoDueno) throw new ErrorNegocio('No se encontró el usuario.')

    const choque = await prisma.empleado.findFirst({
      where: { duenoId: datos.nuevoDuenoId, alias: empleado.alias },
      select: { id: true },
    })
    if (choque) {
      throw new ErrorNegocio(
        `${nuevoDueno.nombre ?? nuevoDueno.email} ya tiene un empleado con el alias "${empleado.alias}". Cambiá el alias antes de transferirlo.`,
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.empleado.update({
        where: { id: empleado.id },
        data: { duenoId: datos.nuevoDuenoId, modificadoPor: usuario.id },
      })
      // El dueño no figura en la tabla de permisos: su permiso es implícito y total.
      await tx.empleadoPermiso.deleteMany({
        where: { empleadoId: empleado.id, usuarioId: datos.nuevoDuenoId },
      })
      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'empleado',
          entidadId: empleado.id,
          accion: nivel === 'ADMIN' ? 'ADMIN_CAMBIO_DUENO' : 'CAMBIO_DUENO',
          datosAntes: { duenoId: empleado.duenoId },
          datosDespues: { duenoId: datos.nuevoDuenoId },
        },
        tx,
      )
    })

    revalidatePath('/empleados')
    revalidatePath('/empleados/todos')
    return exito(undefined, `Ahora el dueño es ${nuevoDueno.nombre ?? nuevoDueno.email}.`)
  })
}

/** Usuarios candidatos para compartir: todos los activos menos el dueño. */
export async function buscarUsuariosParaCompartir(empleadoId: string, texto: string) {
  return ejecutar('empleados.buscarUsuarios', async (log) => {
    const usuario = await exigirUsuarioEnAccion()
    log({ usuarioId: usuario.id, entidad: 'empleado', entidadId: empleadoId })

    const acceso = await accesoAEmpleado(empleadoId, usuario)
    if (!acceso) throw new ErrorNegocio('No se encontró el empleado.')

    const busqueda = texto.trim()
    const usuarios = await prisma.usuario.findMany({
      where: {
        activo: true,
        id: { not: acceso.empleado.duenoId },
        ...(busqueda
          ? { OR: [{ email: { contains: busqueda } }, { nombre: { contains: busqueda } }] }
          : {}),
      },
      select: { id: true, email: true, nombre: true },
      orderBy: { email: 'asc' },
      take: 20,
    })

    return exito(usuarios)
  })
}

/**
 * §8.7 — un administrador se comparte a sí mismo un empleado ajeno. Es la única forma de que
 * pueda operarlo: sobre un empleado ajeno no puede registrar novedades, liquidar, borrar ni
 * cambiar la visibilidad.
 */
export async function compartirmeEmpleado(empleadoId: string, permiso: 'VER' | 'EDITAR') {
  const usuario = await exigirUsuarioEnAccion()
  return compartirEmpleado({ empleadoId, usuarioId: usuario.id, permiso })
}
