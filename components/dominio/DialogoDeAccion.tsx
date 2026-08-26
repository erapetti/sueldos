'use client'

/**
 * El diálogo de confirmar una acción: título, una explicación de qué va a pasar, un cuerpo
 * opcional para lo que haya que elegir, y el par Cancelar / confirmar.
 *
 * Los del menú de «Todo el Personal» —cambiar el dueño, compartírmelo, ocultar— eran copias
 * del mismo andamio con distinto contenido. Con el andamio suelto, cada uno decidía por su
 * cuenta el ancho, dónde iba el acento y si el botón de confirmar se deshabilitaba mientras
 * se envía.
 *
 * **Hay dos familias y las dos viven acá**, porque se ven igual pero no significan lo mismo:
 *
 * - `modo="formulario"` (el default) → un `Dialog`. Es el que tiene algo que elegir antes de
 *   confirmar, y se puede abandonar tocando afuera.
 * - `modo="confirmacion"` → un `AlertDialog`. Es una pregunta que interrumpe: va como
 *   `role="alertdialog"`, que el lector de pantalla anuncia con más énfasis, y **no** se cierra
 *   tocando afuera —hay que elegir—. Es lo correcto para lo que saca algo de su lugar.
 *
 * `peligrosa` mueve el acento: en una acción que saca algo de su lugar, el botón lleno es
 * **Cancelar** y el de confirmar va en rojo. En una que devuelve las cosas a donde estaban, el
 * acento se queda en la acción.
 */
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type PropsDialogoDeAccion = {
  abierto: boolean
  onCerrar: () => void
  titulo: React.ReactNode
  /** Qué va a pasar al confirmar. Lo que el usuario necesita para decidir. */
  descripcion: React.ReactNode
  etiquetaConfirmar: string
  onConfirmar: () => void
  enviando?: boolean
  /** Cuando falta elegir algo del cuerpo. */
  confirmarDeshabilitado?: boolean
  /** Saca algo de su lugar: el acento pasa a Cancelar y confirmar va en rojo. */
  peligrosa?: boolean
  /** Ver el comentario de arriba. Con cuerpo, `formulario`; sin cuerpo, casi siempre el otro. */
  modo?: 'formulario' | 'confirmacion'
  /** Lo que haya que elegir antes de confirmar. Sin esto, el diálogo es solo la pregunta. */
  children?: React.ReactNode
}

export function DialogoDeAccion({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  etiquetaConfirmar,
  onConfirmar,
  enviando,
  confirmarDeshabilitado,
  peligrosa,
  modo = 'formulario',
  children,
}: PropsDialogoDeAccion) {
  const varianteCancelar = peligrosa ? 'default' : 'outline'
  const varianteConfirmar = peligrosa ? 'destructive' : 'default'

  if (modo === 'confirmacion') {
    return (
      <AlertDialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titulo}</AlertDialogTitle>
            <AlertDialogDescription>{descripcion}</AlertDialogDescription>
          </AlertDialogHeader>

          {children}

          <AlertDialogFooter>
            <AlertDialogCancel variant={varianteCancelar} disabled={enviando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant={varianteConfirmar}
              onClick={onConfirmar}
              disabled={enviando || confirmarDeshabilitado}
            >
              {etiquetaConfirmar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter>
          <Button variant={varianteCancelar} onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            variant={varianteConfirmar}
            onClick={onConfirmar}
            disabled={enviando || confirmarDeshabilitado}
          >
            {etiquetaConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
