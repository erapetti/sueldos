/**
 * §3 — identidad del usuario.
 *
 * **Este es el único módulo que lee los headers de identidad** (§3.2 punto 3). Ningún otro
 * archivo debe leer `X-Forwarded-Email`, `X-Forwarded-Name` ni `X-Forwarded-Picture`.
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
  /**
   * Foto de perfil de Google. No sale de la base: llega en un header en cada request, así que
   * siempre está fresca y no hay una URL de Google guardada que se venza (README §5.7).
   */
  avatar: string | null
}

/** Motivo por el que un usuario autenticado en Google no puede operar (§3.3). */
export type MotivoSinAcceso = 'NO_REGISTRADO' | 'INACTIVO' | 'SIN_IDENTIDAD'

export type ResultadoIdentidad =
  | { estado: 'OK'; usuario: UsuarioActual }
  | { estado: 'SIN_ACCESO'; motivo: MotivoSinAcceso; email: string | null }

type IdentidadDelProxy = {
  email: string | null
  nombre: string | null
  avatar: string | null
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
  return { email: email.trim(), nombre: nombre?.trim() ?? null, avatar: null }
}

/** Un string no vacío, o `null`. */
function texto(valor: string | null): string | null {
  if (valor === null) return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}

/**
 * Foto de perfil, acotada a lo que sirve Google.
 *
 * El valor termina en el `src` de una imagen que se renderiza en todas las páginas, así que
 * una URL arbitraria acá sería un pixel de rastreo. Se exige `https` y un host de
 * `googleusercontent.com`; cualquier otra cosa se descarta.
 */
function avatarValido(crudo: string | null): string | null {
  const valor = texto(crudo)
  if (!valor) return null

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  const host = url.hostname
  if (host !== 'googleusercontent.com' && !host.endsWith('.googleusercontent.com')) return null

  return url.toString()
}

async function leerIdentidadDelProxy(): Promise<IdentidadDelProxy> {
  const simulada = identidadSimulada()
  if (simulada) return simulada

  const h = await headers()
  return {
    email: h.get('x-forwarded-email'),
    // El §3.1 del SPECS nombra `X-Forwarded-Preferred-Username`, pero Google no emite ese
    // claim y ese header llega siempre vacío. El nombre viene del claim `name`, que
    // oauth2-proxy extrae con `additionalClaims`. Ver README §5.7.
    nombre: texto(h.get('x-forwarded-name')),
    avatar: avatarValido(h.get('x-forwarded-picture')),
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
    // Sin `nombre`: el primero que llega es el del claim `name`, en el primer ingreso.
    // Inventar uno acá lo dejaba fijo para siempre, porque el refresco de §4.1 no pisa con
    // un valor vacío.
    data: { email, esAdmin: true, activo: true },
  })
}

/**
 * Resuelve la identidad de la request contra la tabla `usuarios`.
 *
 * **El match es por email**, y eso es una divergencia deliberada del §3.3, que lo pide por
 * `google_sub`. El motivo está en README §5.8: contra cuentas `@gmail.com` los dos peligros
 * que el `sub` evita —que el email cambie, o que se reasigne a otra persona— no existen, y
 * sacarlo se lleva puesta una columna, un índice, la lógica de *claim* del registro y la
 * dependencia de `userIDClaim`.
 *
 * Un usuario que no existe, o que existe pero está inactivo, no se auto-registra: recibe la
 * pantalla de acceso no autorizado.
 */
async function resolverIdentidad(): Promise<ResultadoIdentidad> {
  const identidad = await leerIdentidadDelProxy()

  const email = identidad.email?.trim().toLowerCase() ?? null
  if (!email) {
    return { estado: 'SIN_ACCESO', motivo: 'SIN_IDENTIDAD', email: null }
  }

  await ejecutarBootstrap()

  const usuario = await prisma.usuario.findUnique({ where: { email } })

  if (!usuario) {
    return { estado: 'SIN_ACCESO', motivo: 'NO_REGISTRADO', email }
  }
  if (!usuario.activo) {
    return { estado: 'SIN_ACCESO', motivo: 'INACTIVO', email: usuario.email }
  }

  // El nombre se refresca en cada ingreso desde el claim de Google (§4.1). El email no: es
  // la clave con la que se llegó hasta acá.
  const nombreNuevo = identidad.nombre ?? usuario.nombre

  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      ultimoAcceso: new Date(),
      ...(nombreNuevo !== usuario.nombre ? { nombre: nombreNuevo } : {}),
    },
  })

  return {
    estado: 'OK',
    usuario: {
      id: actualizado.id,
      email: actualizado.email,
      nombre: actualizado.nombre,
      esAdmin: actualizado.esAdmin,
      avatar: identidad.avatar,
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
