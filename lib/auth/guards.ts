/**
 * §3.4 — control de acceso.
 *
 * Toda Server Action valida permisos en el servidor antes de operar. Ocultar un botón en la
 * UI no es control de acceso.
 */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { usuarioActual, type UsuarioActual } from './currentUser'
import { aISO } from '@/lib/format/dates'
import type { EmpleadaDelMarco } from '@/components/dominio/MarcoDeMovimientos'

/**
 * Nivel de acceso de un usuario sobre un empleado.
 *
 *  DUENO   permiso implícito y total; además puede compartir, cambiar el dueño y borrar
 *  EDITAR  registrar novedades y modificar los datos del empleado
 *  VER     ver ficha, cuenta corriente y liquidaciones; no modifica nada
 *  ADMIN   administrador sobre un empleado ajeno: ficha en modo lectura (§8.7). No puede
 *          registrar novedades, liquidar, borrar ni cambiar la visibilidad hasta
 *          compartírselo; sí puede cambiar el dueño y compartírselo a sí mismo
 *  NINGUNO sin acceso
 */
export type NivelAcceso = 'DUENO' | 'EDITAR' | 'VER' | 'ADMIN' | 'NINGUNO'

export class ErrorAutorizacion extends Error {
  constructor(mensaje = 'No tenés permiso para hacer esto.') {
    super(mensaje)
    this.name = 'ErrorAutorizacion'
  }
}

export class ErrorNoEncontrado extends Error {
  constructor(mensaje = 'No se encontró el registro.') {
    super(mensaje)
    this.name = 'ErrorNoEncontrado'
  }
}

/** El usuario de la request. Si no tiene acceso, redirige a la pantalla de §3.3. */
export async function exigirUsuario(): Promise<UsuarioActual> {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/sin-acceso')
  return usuario
}

/** Igual que `exigirUsuario` pero lanza en vez de redirigir; para Server Actions. */
export async function exigirUsuarioEnAccion(): Promise<UsuarioActual> {
  const usuario = await usuarioActual()
  if (!usuario) throw new ErrorAutorizacion('Tu usuario no tiene acceso a la aplicación.')
  return usuario
}

export async function exigirAdmin(): Promise<UsuarioActual> {
  const usuario = await exigirUsuarioEnAccion()
  if (!usuario.esAdmin) throw new ErrorAutorizacion('Esta opción es solo para administradores.')
  return usuario
}

export type EmpleadoConAcceso = {
  empleado: {
    id: string
    duenoId: string
    alias: string
    nombreCompleto: string
    cedula: string | null
    activo: boolean
    visible: boolean
    fechaIngreso: Date
    fechaEgreso: Date | null
    cobraBoletos: boolean
    aportaBps: boolean
    seguroSalud: string | null
  }
  nivel: NivelAcceso
}

/**
 * Lo que las pantallas de la rama «Movimientos» le pasan a su marco (`MarcoDeMovimientos`).
 * Sale del mismo `accesoAEmpleado` que ya resolvió el permiso, así que las seis páginas no lo
 * rearman una por una.
 */
export function empleadaDelMarco({ empleado, nivel }: EmpleadoConAcceso): EmpleadaDelMarco {
  return {
    id: empleado.id,
    alias: empleado.alias,
    nombreCompleto: empleado.nombreCompleto,
    fechaIngreso: aISO(empleado.fechaIngreso),
    soloLectura: !puedeEditar(nivel),
    dadoDeBaja: !empleado.activo,
    visible: empleado.visible,
  }
}

/** Resuelve el nivel de acceso de un usuario sobre un empleado, en una sola consulta. */
export async function accesoAEmpleado(
  empleadoId: string,
  usuario: UsuarioActual,
): Promise<EmpleadoConAcceso | null> {
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: {
      id: true,
      duenoId: true,
      alias: true,
      nombreCompleto: true,
      cedula: true,
      activo: true,
      visible: true,
      fechaIngreso: true,
      fechaEgreso: true,
      cobraBoletos: true,
      aportaBps: true,
      seguroSalud: true,
      permisos: { where: { usuarioId: usuario.id }, select: { permiso: true } },
    },
  })

  if (!empleado) return null

  const { permisos, ...datos } = empleado

  let nivel: NivelAcceso = 'NINGUNO'
  if (datos.duenoId === usuario.id) nivel = 'DUENO'
  else if (permisos[0]?.permiso === 'EDITAR') nivel = 'EDITAR'
  else if (permisos[0]?.permiso === 'VER') nivel = 'VER'
  else if (usuario.esAdmin) nivel = 'ADMIN'

  return { empleado: datos, nivel }
}

export function puedeVer(nivel: NivelAcceso): boolean {
  return nivel !== 'NINGUNO'
}

/** Registrar novedades, liquidar y modificar datos. El admin sobre un empleado ajeno no. */
export function puedeEditar(nivel: NivelAcceso): boolean {
  return nivel === 'DUENO' || nivel === 'EDITAR'
}

/** Compartir, cambiar el dueño y borrar: solo el dueño (§3.4). */
export function esDueno(nivel: NivelAcceso): boolean {
  return nivel === 'DUENO'
}

async function exigirAcceso(
  empleadoId: string,
  predicado: (nivel: NivelAcceso) => boolean,
  mensaje: string,
): Promise<{ usuario: UsuarioActual } & EmpleadoConAcceso> {
  const usuario = await exigirUsuarioEnAccion()
  const acceso = await accesoAEmpleado(empleadoId, usuario)
  if (!acceso) throw new ErrorNoEncontrado('No se encontró la empleada.')
  if (!predicado(acceso.nivel)) throw new ErrorAutorizacion(mensaje)
  return { usuario, ...acceso }
}

export function exigirLectura(empleadoId: string) {
  return exigirAcceso(empleadoId, puedeVer, 'No tenés acceso a esta empleada.')
}

export async function exigirEdicion(empleadoId: string) {
  const usuario = await exigirUsuarioEnAccion()
  const acceso = await accesoAEmpleado(empleadoId, usuario)
  if (!acceso) throw new ErrorNoEncontrado('No se encontró la empleada.')

  // Se distingue "no lo ves" de "lo ves pero no lo podés tocar": son dos situaciones
  // distintas para el usuario y el mensaje genérico confunde.
  if (!puedeVer(acceso.nivel)) {
    throw new ErrorAutorizacion('No tenés acceso a esta empleada.')
  }
  if (!puedeEditar(acceso.nivel)) {
    throw new ErrorAutorizacion(
      acceso.nivel === 'ADMIN'
        ? 'Como administradora podés ver a esta empleada, pero para operarla tenés que compartírtela primero.'
        : 'Solo podés consultar a esta empleada; no tenés permiso para modificarla.',
    )
  }

  return { usuario, ...acceso }
}

export function exigirDueno(empleadoId: string) {
  return exigirAcceso(
    empleadoId,
    esDueno,
    'Solo el dueño de la empleada puede hacer esto.',
  )
}

/**
 * §8.7 — cambiar el dueño y compartirse un empleado a sí mismo: el dueño, o cualquier
 * administrador aunque el empleado sea ajeno.
 */
export function exigirDuenoOAdmin(empleadoId: string) {
  return exigirAcceso(
    empleadoId,
    (nivel) => nivel === 'DUENO' || nivel === 'ADMIN',
    'Solo el dueño o un administrador pueden hacer esto.',
  )
}
