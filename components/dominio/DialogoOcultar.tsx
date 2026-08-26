'use client'

/**
 * §8.3 — ocultar del listado, y §8.7 — volver a mostrar.
 *
 * Se usa desde dos lados —la hoja «Movimientos» de la ficha y el menú de cada fila de «Todo el
 * Personal»— y es el mismo diálogo en los dos: la visibilidad es una sola propiedad de la
 * empleada, así que no tendría sentido preguntarla distinto según desde dónde se entre.
 *
 * Al ocultar, el toast de confirmación incluye Deshacer y aclara dónde volver a encontrarla.
 */
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAccion } from '@/hooks/useAccion'
import { cambiarVisibilidad } from '@/actions/empleados'
import { DialogoDeAccion } from './DialogoDeAccion'

export function DialogoOcultar({
  abierto,
  onCerrar,
  empleadoId,
  alias,
  visible,
}: {
  abierto: boolean
  onCerrar: () => void
  empleadoId: string
  alias: string
  visible: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<undefined>()

  function deshacer() {
    ejecutar(() => cambiarVisibilidad({ empleadoId, visible }), {
      onExito: () => router.refresh(),
    })
  }

  function confirmar() {
    ejecutar(() => cambiarVisibilidad({ empleadoId, visible: !visible }), {
      onExito: () => {
        onCerrar()
        router.refresh()

        if (visible) {
          toast.success(`${alias} ya no aparece en el listado. Está en «Todo el Personal».`, {
            action: { label: 'Deshacer', onClick: deshacer },
            duration: 12_000,
          })
        } else {
          toast.success(`${alias} vuelve a aparecer en el listado.`)
        }
      },
    })
  }

  return (
    <DialogoDeAccion
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={visible ? `¿Ocultar a ${alias} del listado?` : `¿Volver a mostrar a ${alias}?`}
      /*
        La visibilidad es una columna de la empleada, no una preferencia de quien la esconde:
        `listarEmpleadosVisibles` filtra por `visible` para cualquiera que la tenga a la vista.
        Decirlo importa, porque «ocultar del listado» se lee como algo propio.
      */
      descripcion={
        visible
          ? 'Deja de aparecer en «Mi Personal» para todos los usuarios de la aplicación, no solo para vos. Sigue disponible en «Todo el Personal», que es desde donde se la puede volver a mostrar. No se borra nada.'
          : 'Vuelve a aparecer en «Mi Personal» para todos los usuarios de la aplicación que tengan acceso a ella.'
      }
      etiquetaConfirmar={visible ? 'Ocultar' : 'Mostrar'}
      onConfirmar={confirmar}
      enviando={enviando}
      // Ocultar saca a la empleada del listado; mostrar la devuelve, así que ahí no hay peligro.
      peligrosa={visible}
    />
  )
}
