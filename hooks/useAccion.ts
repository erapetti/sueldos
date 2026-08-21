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

export function useAccion<T>() {
  const [enviando, iniciar] = useTransition()
  const [campos, setCampos] = useState<ErroresDeCampo>({})

  const ejecutar = useCallback(
    (accion: () => Promise<Resultado<T>>, opciones: OpcionesAccion<T> = {}) => {
      setCampos({})
      iniciar(async () => {
        const resultado = await accion()

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
