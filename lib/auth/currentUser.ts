/**
 * §3 — identidad del usuario.
 *
 * **Este es el único módulo que lee los headers de identidad** (§3.2 punto 3). Ningún otro
 * archivo debe leer `X-Forwarded-User`, `X-Forwarded-Email` ni
 * `X-Forwarded-Preferred-Username`.
 *
 * La aplicación no implementa login: corre detrás de oauth2-proxy, que resuelve el flujo
 * OAuth2/OIDC de Google y reenvía la request con esos headers.
 */
import { cache } from 'react'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'

export type UsuarioActual = {
  id: string
  email: string
  nombre: string | null
  esAdmin: boolean
}

/** Motivo por el que un usuario autenticado en Google no puede operar (§3.3). */
export type MotivoSinAcceso = 'NO_REGISTRADO' | 'INACTIVO' | 'SIN_IDENTIDAD'

export type ResultadoIdentidad =
  | { estado: 'OK'; usuario: UsuarioActual }
  | { estado: 'SIN_ACCESO'; motivo: MotivoSinAcceso; email: string | null }

type IdentidadDelProxy = {
  sub: string | null
  email: string | null
  nombre: string | null
}

/**
 * §3.2 punto 4 — en desarrollo se puede simular identidad con `DEV_IMPERSONATE_USER`,
 * con el formato `email|nombre|admin`. Nunca se activa en producción.
 */
function identidadSimulada(): IdentidadDelProxy | null {
  if (process.env.NODE_ENV === 'production') return null
  const crudo = process.env.DEV_IMPERSONATE_USER
  if (!crudo) return null

  const [email, nombre] = crudo.split('|')
  if (!email) return null
  return { sub: `dev-${email.trim().toLowerCase()}`, email: email.trim(), nombre: nombre?.trim() ?? null }
}

async function leerIdentidadDelProxy(): Promise<IdentidadDelProxy> {
  const simulada = identidadSimulada()
  if (simulada) return simulada

  const h = await headers()
  return {
    sub: h.get('x-forwarded-user'),
    email: h.get('x-forwarded-email'),
    nombre: h.get('x-forwarded-preferred-username'),
  }
}

/**
 * §3.3 — bootstrap: si la tabla `usuarios` está vacía, `BOOTSTRAP_ADMIN_EMAIL` define el
 * primer administrador. Si la tabla no está vacía, la variable se ignora.
 */
async function ejecutarBootstrap(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) return

  const cantidad = await prisma.usuario.count()
  if (cantidad > 0) return

  await prisma.usuario.create({
    data: { email, esAdmin: true, activo: true, nombre: 'Administrador inicial' },
  })
}

/**
 * Resuelve la identidad de la request contra la tabla `usuarios`.
 *
 * §3.3 — el match es por `google_sub`. Si no hay ninguno con ese sub pero sí un usuario
 * pre-creado con ese email y sin sub, se le asigna el sub recibido (*claim* del registro);
 * a partir de ahí el match es siempre por sub. Un usuario que no existe, o que existe pero
 * está inactivo, no se auto-registra: recibe la pantalla de acceso no autorizado.
 */
async function resolverIdentidad(): Promise<ResultadoIdentidad> {
  const identidad = await leerIdentidadDelProxy()

  if (!identidad.sub && !identidad.email) {
    return { estado: 'SIN_ACCESO', motivo: 'SIN_IDENTIDAD', email: null }
  }

  const emailNormalizado = identidad.email?.trim().toLowerCase() ?? null

  await ejecutarBootstrap()

  let usuario = identidad.sub
    ? await prisma.usuario.findUnique({ where: { googleSub: identidad.sub } })
    : null

  // Claim: usuario pre-creado por un administrador, sin sub todavía.
  if (!usuario && emailNormalizado) {
    const preCreado = await prisma.usuario.findUnique({ where: { email: emailNormalizado } })
    if (preCreado && preCreado.googleSub === null && identidad.sub) {
      usuario = await prisma.usuario.update({
        where: { id: preCreado.id },
        data: { googleSub: identidad.sub },
      })
    } else if (preCreado && preCreado.googleSub === null && !identidad.sub) {
      usuario = preCreado
    }
  }

  if (!usuario) {
    return { estado: 'SIN_ACCESO', motivo: 'NO_REGISTRADO', email: emailNormalizado }
  }
  if (!usuario.activo) {
    return { estado: 'SIN_ACCESO', motivo: 'INACTIVO', email: usuario.email }
  }

  // El nombre y el email se refrescan en cada login desde los headers (§4.1).
  const nombreNuevo = identidad.nombre?.trim() || usuario.nombre
  const emailNuevo = emailNormalizado ?? usuario.email
  const hayCambios = nombreNuevo !== usuario.nombre || emailNuevo !== usuario.email

  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      ultimoAcceso: new Date(),
      ...(hayCambios ? { nombre: nombreNuevo, email: emailNuevo } : {}),
    },
  })

  return {
    estado: 'OK',
    usuario: {
      id: actualizado.id,
      email: actualizado.email,
      nombre: actualizado.nombre,
      esAdmin: actualizado.esAdmin,
    },
  }
}

/** Cacheado por request: varias llamadas dentro del mismo render no repiten la consulta. */
export const identidadActual = cache(resolverIdentidad)

/** El usuario actual, o `null` si no tiene acceso. */
export async function usuarioActual(): Promise<UsuarioActual | null> {
  const resultado = await identidadActual()
  return resultado.estado === 'OK' ? resultado.usuario : null
}
