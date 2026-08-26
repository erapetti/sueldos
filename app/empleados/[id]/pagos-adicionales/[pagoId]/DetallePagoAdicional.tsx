'use client'

/**
 * §7.3 — detalle de un pago adicional registrado.
 *
 * Dos diferencias con el detalle de un préstamo, y las dos salen de que **no es un asiento**
 * sino una novedad de la liquidación (§4.7):
 *
 * - **Se borra, no se anula.** No hay nada que contra-asentar: mientras el período no esté
 *   liquidado, borrarlo lo saca del cálculo y no queda rastro que corregir. Si ya está
 *   liquidado, el rastro está en la liquidación confirmada, que no se toca sola: hay que
 *   recalcular el período (§6.11), y de eso avisa la pantalla antes y el toast después.
 * - **Muestra el período.** La fecha decide en qué mes se paga, así que el dato que importa
 *   —y el que dice si tocarlo tiene consecuencias— es el mes, no el día.
 */
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogoDeAccion } from '@/components/dominio/DialogoDeAccion'
import { DetalleDeMovimiento } from '@/components/dominio/DetalleDeMovimiento'
import type { EmpleadaDelMarco } from '@/components/dominio/MarcoDeMovimientos'
import { useAccion } from '@/hooks/useAccion'
import { actualizarPagoAdicional, borrarNovedad } from '@/actions/novedades'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { DetallePagoAdicional as Pago } from '@/lib/consultas/movimientos'

export function DetallePagoAdicional({
  empleada,
  pago,
}: {
  empleada: EmpleadaDelMarco
  pago: Pago
}) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [concepto, setConcepto] = useState(pago.concepto ?? '')
  const [aBorrar, setABorrar] = useState(false)

  // §1.3 de las notas — el `,00` sobra si el importe no tiene centavos.
  const importe = todosEnteros([pago.monto]) ? formatearImporteEntero : formatearImporte

  const listado = `/empleados/${empleada.id}/pagos-adicionales`
  const liquidacion = `/empleados/${empleada.id}/liquidacion?periodo=${pago.periodoISO.slice(0, 7)}`

  const editable = !empleada.soloLectura
  const hayCambios = concepto !== (pago.concepto ?? '')

  function guardar() {
    ejecutar(() => actualizarPagoAdicional({ id: pago.id, concepto }), {
      exito: 'Pago adicional actualizado.',
      onExito: () => router.refresh(),
    })
  }

  function confirmarBorrado() {
    ejecutar(() => borrarNovedad('PAGO_ADICIONAL', pago.id), {
      exito: 'Se borró el pago adicional.',
      onExito: () => {
        setABorrar(false)
        router.push(listado)
      },
    })
  }

  return (
    <>
      <DetalleDeMovimiento
        empleada={empleada}
        activo="pago-adicional"
        titulo="Pago adicional"
        volverA="Pagos adicionales"
        volverHref={listado}
        etiquetas={
          pago.periodoLiquidado ? <Badge variant="outline">Período liquidado</Badge> : null
        }
        aviso={
          pago.periodoLiquidado ? (
            <>
              Este pago corresponde a {pago.periodo}, que ya tiene una liquidación confirmada.
              Para que un cambio se refleje hay que{' '}
              <Link href={liquidacion} className="underline">
                recalcular el período
              </Link>
              .
            </>
          ) : null
        }
        datos={[
          { etiqueta: 'Fecha', valor: pago.fecha },
          { etiqueta: 'Monto', valor: importe(pago.monto) },
          { etiqueta: 'Se liquida en', valor: <span className="capitalize">{pago.periodo}</span> },
        ]}
        nota="La fecha y el monto no se modifican: la fecha decide en qué mes se paga y el monto puede estar dentro de una liquidación confirmada. Para corregirlos hay que borrar el pago y registrarlo de nuevo."
        concepto={{
          etiqueta: 'Concepto',
          valor: concepto,
          onChange: setConcepto,
          error: campos.concepto,
          disabled: !editable || enviando,
          placeholder: 'Premio, viático, reintegro…',
        }}
        pie={
          editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={guardar} disabled={enviando || !hayCambios}>
                {enviando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              <Button variant="ghost" onClick={() => setABorrar(true)} disabled={enviando}>
                Borrar
              </Button>
            </div>
          ) : null
        }
      />

      <DialogoDeAccion
        abierto={aBorrar}
        onCerrar={() => setABorrar(false)}
        titulo="¿Borrar este pago adicional?"
        descripcion={
          pago.periodoLiquidado
            ? `El pago de ${importe(pago.monto)} deja de existir. El período ${pago.periodo} ya
               tiene una liquidación confirmada, así que para que el sueldo deje de incluirlo hay
               que recalcular el período. No se puede deshacer.`
            : `El pago de ${importe(pago.monto)} deja de existir y no se va a liquidar.
               No se puede deshacer.`
        }
        etiquetaConfirmar="Borrar el pago"
        onConfirmar={confirmarBorrado}
        enviando={enviando}
        peligrosa
      />
    </>
  )
}
