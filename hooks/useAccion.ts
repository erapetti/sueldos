'use client'

/**
 * Envoltura de las Server Actions del lado del cliente: maneja el estado de envío, muestra
 * el toast de confirmación o de error (§8.5) y devuelve los errores por campo.
 */
import { useCallback, useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { Resultado, ErroresDeCampo } from '@/lib/acciones/resultado'

export type OpcionesAccion<T> = {
  /** Mensaje del toast cuando la acción sale bien y no devuelve aviso propio. */
  exito?: string
  onExito?: (datos: T) => void
  /** Milisegundos que dura el toast del aviso; los avisos suelen ser largos. */
  duracionAviso?: number
}

/** Los mensajes de falla piden que el usuario haga algo, así que duran más que un error común. */
const DURACION_FALLA = 20_000

/**
 * Una acción que **no llega a ejecutarse** no devuelve un `Resultado`: rechaza. El caso que
 * importa es que se haya vencido la sesión de oauth2-proxy (§3.1) — el proxy contesta el
 * redirect al login, el `fetch` interno de Next lo sigue hasta Google, y ahí muere por CORS.
 *
 * Sin atajarlo, ese rechazo escala y reemplaza la pantalla entera por el error genérico del
 * framework: se pierde todo lo cargado y el usuario nunca se entera de que fue la sesión.
 *
 * Para saber cuál de las dos fallas fue, se le pregunta al borde en vez de adivinar por la
 * forma del error. `/sesion/estado` lo sirve nginx: 204 con sesión, 401 sin ella, y nunca un
 * redirect. No se consulta `/oauth2/auth` directamente —que es lo que esa ruta consulta por
 * dentro— porque su respuesta lleva los encabezados `X-Auth-Request-*`, con el access token
 * de Google adentro, y un `fetch` mismo-origen puede leerlos.
 *
 * Se exige el **401 explícito**: en desarrollo no hay proxy delante y esa ruta da 404, que
 * no es una sesión vencida sino que no hay proxy.
 */
async function mensajeDeFalla(): Promise<string> {
  const respuesta = await fetch('/sesion/estado', { redirect: 'manual' }).catch(() => null)

  return respuesta?.status === 401
    ? 'Se venció la sesión. Entrá de nuevo desde otra pestaña y volvé a guardar: lo que cargaste sigue en esta pantalla.'
    : 'No se pudo completar la operación. Revisá la conexión y volvé a intentar: lo que cargaste sigue en esta pantalla.'
}

export function useAccion<T>() {
  const [enviando, iniciar] = useTransition()
  const [campos, setCampos] = useState<ErroresDeCampo>({})

  const ejecutar = useCallback(
    (accion: () => Promise<Resultado<T>>, opciones: OpcionesAccion<T> = {}) => {
      setCampos({})
      iniciar(async () => {
        let resultado: Resultado<T>
        try {
          resultado = await accion()
        } catch {
          toast.error(await mensajeDeFalla(), { duration: DURACION_FALLA })
          return
        }

        if (!resultado.ok) {
          setCampos(resultado.campos ?? {})
          toast.error(resultado.error)
          return
        }

        if (resultado.aviso) {
          toast.warning(resultado.aviso, { duration: opciones.duracionAviso ?? 10_000 })
        } else if (opciones.exito) {
          toast.success(opciones.exito)
        }

        opciones.onExito?.(resultado.datos)
      })
    },
    [],
  )

  return { ejecutar, enviando, campos, limpiarCampos: () => setCampos({}) }
}
