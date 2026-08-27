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
 * acento se queda en la acción. No tiene por qué ser fijo: en la planilla depende de si la
 * salida pierde el borrador o no.
 *
 * **Los botones no cierran solos.** Es a propósito, y es la diferencia con el `AlertDialog`
 * que estos diálogos usaban antes: si la acción falla, el diálogo queda abierto con lo que el
 * usuario había elegido, en vez de cerrarse y dejar solo un toast de error. Cerrar es tarea
 * del `onExito` de la acción.
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
  /** Reemplaza a `etiquetaConfirmar` mientras se envía. Sin esto, la etiqueta no cambia. */
  etiquetaEnviando?: string
  onConfirmar: () => void
  enviando?: boolean
  /**
   * «Cancelar» no siempre es la palabra: en la planilla es «Seguir editando» o «Descartar», y
   * en una pantalla donde la acción **es** cancelar algo, decir «Cancelar» a las dos cosas se
   * lee al revés.
   */
  etiquetaCancelar?: string
  /** Cuando falta elegir algo del cuerpo. */
  confirmarDeshabilitado?: boolean
  /** Saca algo de su lugar: el acento pasa a Cancelar y confirmar va en rojo. */
  peligrosa?: boolean
  /**
   * Para los formularios de alta, que no entran en el ancho de una pregunta: más ancho y con
   * el alto acotado al viewport, así el cuerpo largo scrollea adentro del diálogo en vez de
   * empujarlo fuera de la pantalla.
   */
  amplio?: boolean
  /** Lo que haya que elegir antes de confirmar. Sin esto, el diálogo es solo la pregunta. */
  children?: React.ReactNode
}

export function DialogoDeAccion({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  etiquetaConfirmar,
  etiquetaEnviando,
  onConfirmar,
  enviando,
  etiquetaCancelar = 'Cancelar',
  confirmarDeshabilitado,
  peligrosa,
  amplio,
  children,
}: PropsDialogoDeAccion) {
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent
        className={amplio ? 'max-h-[90vh] overflow-y-auto sm:max-w-lg' : 'sm:max-w-md'}
      >
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
            {etiquetaCancelar}
          </Button>
          <Button
            variant={peligrosa ? 'destructive' : 'default'}
            onClick={onConfirmar}
            disabled={enviando || confirmarDeshabilitado}
          >
            {enviando && etiquetaEnviando ? etiquetaEnviando : etiquetaConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
