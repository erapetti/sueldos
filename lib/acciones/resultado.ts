/**
 * Envoltura común de las Server Actions.
 *
 * §11 — cada Server Action loguea `usuario, acción, entidad, resultado`. No se loguean datos
 * personales ni números de cuenta: solo identificadores.
 */
import 'server-only'
import { ZodError, type ZodType } from 'zod'
import { ErrorAutorizacion, ErrorNoEncontrado } from '@/lib/auth/guards'
import { ErrorDatosFaltantes, ErrorCalculo, ErrorNoImplementado } from '@/lib/calculo/errores'

export type ErroresDeCampo = Record<string, string>

export type Resultado<T = undefined> =
  | { ok: true; datos: T; aviso?: string }
  | { ok: false; error: string; campos?: ErroresDeCampo }

export function exito<T>(datos: T, aviso?: string): Resultado<T> {
  return aviso ? { ok: true, datos, aviso } : { ok: true, datos }
}

export function fallo<T = undefined>(error: string, campos?: ErroresDeCampo): Resultado<T> {
  return campos ? { ok: false, error, campos } : { ok: false, error }
}

/** Regla de negocio violada; se muestra al usuario tal cual. */
export class ErrorNegocio extends Error {
  readonly campos?: ErroresDeCampo

  constructor(mensaje: string, campos?: ErroresDeCampo) {
    super(mensaje)
    this.name = 'ErrorNegocio'
    this.campos = campos
  }
}

function erroresDeZod(error: ZodError): ErroresDeCampo {
  const campos: ErroresDeCampo = {}
  for (const issue of error.issues) {
    const clave = issue.path.join('.') || '_'
    if (!campos[clave]) campos[clave] = issue.message
  }
  return campos
}

type ContextoLog = {
  usuarioId?: string
  entidad?: string
  entidadId?: string
}

/**
 * Ejecuta el cuerpo de una acción traduciendo las excepciones conocidas a un `Resultado`.
 * Las excepciones inesperadas se loguean con su stack y se devuelven como un mensaje
 * genérico: no se filtran detalles internos a la UI.
 */
export async function ejecutar<T>(
  accion: string,
  cuerpo: (log: (ctx: ContextoLog) => void) => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  let contexto: ContextoLog = {}
  const log = (ctx: ContextoLog) => {
    contexto = { ...contexto, ...ctx }
  }

  try {
    const resultado = await cuerpo(log)
    console.info(
      `[accion] ${accion} usuario=${contexto.usuarioId ?? '-'} entidad=${contexto.entidad ?? '-'}:${contexto.entidadId ?? '-'} resultado=${resultado.ok ? 'ok' : 'rechazada'}`,
    )
    return resultado
  } catch (e) {
    const etiqueta = `[accion] ${accion} usuario=${contexto.usuarioId ?? '-'} entidad=${contexto.entidad ?? '-'}:${contexto.entidadId ?? '-'}`

    if (e instanceof ZodError) {
      console.info(`${etiqueta} resultado=invalida`)
      return fallo('Revisá los datos del formulario.', erroresDeZod(e))
    }
    if (e instanceof ErrorNegocio) {
      console.info(`${etiqueta} resultado=rechazada (${e.message})`)
      return fallo(e.message, e.campos)
    }
    if (e instanceof ErrorAutorizacion) {
      console.warn(`${etiqueta} resultado=denegada`)
      return fallo(e.message)
    }
    if (e instanceof ErrorNoEncontrado) {
      console.info(`${etiqueta} resultado=no-encontrado`)
      return fallo(e.message)
    }
    if (e instanceof ErrorDatosFaltantes) {
      console.info(`${etiqueta} resultado=datos-faltantes`)
      return fallo(e.message)
    }
    if (e instanceof ErrorCalculo || e instanceof ErrorNoImplementado) {
      console.info(`${etiqueta} resultado=rechazada (${e.message})`)
      return fallo(e.message)
    }

    console.error(`${etiqueta} resultado=error`, e)
    return fallo('Ocurrió un error inesperado. Volvé a intentar.')
  }
}

/** Valida con zod dejando que `ejecutar` traduzca el `ZodError`. */
export function validar<T>(esquema: ZodType<T>, datos: unknown): T {
  return esquema.parse(datos)
}
