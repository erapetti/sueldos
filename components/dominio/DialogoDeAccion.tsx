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
 * Es siempre un `Dialog`, con o sin cuerpo: se cierra tocando afuera y tiene su X. Se probó
 * distinguir las confirmaciones con `AlertDialog` —que atrapa el foco hasta que elegís— y no
 * vale la pena: se ven igual, y trabar la salida de una pregunta que ya es reversible molesta
 * más de lo que protege.
 *
 * `peligrosa` mueve el acento: en una acción que saca algo de su lugar, el botón lleno es
 * **Cancelar** y el de confirmar va en rojo. En una que devuelve las cosas a donde estaban, el
 * acento se queda en la acción.
 */
import { Button } from '@/components/ui/button'
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
  children,
}: PropsDialogoDeAccion) {
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter>
          <Button
            variant={peligrosa ? 'default' : 'outline'}
            onClick={onCerrar}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            variant={peligrosa ? 'destructive' : 'default'}
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
