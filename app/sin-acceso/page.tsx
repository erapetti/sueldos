/**
 * §3.3 — un usuario que se autentica correctamente en Google pero no existe en la tabla
 * `usuarios`, o que existe pero está inactivo, ve esta pantalla y no puede operar.
 * No se auto-registra.
 */
import { ShieldAlert } from 'lucide-react'
import { identidadActual } from '@/lib/auth/currentUser'

const MENSAJES = {
  NO_REGISTRADO: 'Acceso no autorizado — solicitá a un administrador que te dé de alta.',
  INACTIVO: 'Tu usuario está desactivado. Pedile a un administrador que lo reactive.',
  SIN_IDENTIDAD: 'No se pudo determinar tu identidad. Volvé a iniciar sesión.',
} as const

export default async function SinAcceso() {
  const identidad = await identidadActual()
  const motivo = identidad.estado === 'SIN_ACCESO' ? identidad.motivo : 'NO_REGISTRADO'
  const email = identidad.estado === 'SIN_ACCESO' ? identidad.email : null

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShieldAlert className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-[28px] leading-tight">Acceso no autorizado</h1>
      <p className="text-muted-foreground">{MENSAJES[motivo]}</p>
      {email ? (
        <p className="text-sm text-muted-foreground">
          Ingresaste como <span className="font-medium">{email}</span>.
        </p>
      ) : null}
      <a href="/oauth2/sign_out" className="text-sm underline underline-offset-4">
        Salir
      </a>
    </div>
  )
}
