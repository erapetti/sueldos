'use client'

/**
 * §8.3 — ocultar del listado, y §8.7 — volver a mostrar.
 *
 * Al ocultar, el toast de confirmación incluye Deshacer y aclara dónde volver a encontrarlo.
 */
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAccion } from '@/hooks/useAccion'
import { cambiarVisibilidad } from '@/actions/empleados'

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
          toast.success(`${alias} ya no aparece en el listado. Está en «Todos los empleados».`, {
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
    <AlertDialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {visible ? `¿Ocultar a ${alias} del listado?` : `¿Volver a mostrar a ${alias}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {visible
              ? 'Deja de aparecer en «Empleados». Sigue disponible en «Todos los empleados», que es desde donde se lo puede volver a mostrar. No se borra nada.'
              : 'Vuelve a aparecer en la pantalla «Empleados».'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/*
          El acento va en la opción que no cambia nada. Ocultar saca al empleado del listado
          —es reversible, pero es el lado que hay que confirmar—; mostrar lo devuelve, así que
          ahí el acento se queda en la acción.
        */}
        <AlertDialogFooter>
          <AlertDialogCancel variant={visible ? 'default' : 'outline'} disabled={enviando}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            variant={visible ? 'destructive' : 'default'}
            onClick={confirmar}
            disabled={enviando}
          >
            {visible ? 'Ocultar' : 'Mostrar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
