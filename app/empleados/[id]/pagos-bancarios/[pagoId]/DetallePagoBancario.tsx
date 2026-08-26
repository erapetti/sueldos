'use client'

/**
 * §7.5 — detalle de un pago bancario registrado.
 *
 * Muestra las dos cosas que el pago tiene además del monto, y que son las que hay que poder
 * mirar después: el **libro** del que salió (§4.9) y la **liquidación** que cancela (§4.14), con
 * enlace a su pantalla. Ninguna de las dos se edita: el vínculo es lo que marca la liquidación
 * como pagada, así que cambiarlo movería el estado de otra pantalla sin decirlo. Para eso está
 * anular y registrar de nuevo, que además deja el rastro.
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
import { actualizarMovimiento, anularMovimiento } from '@/actions/prestamos'
import { ETIQUETA_LIBRO, nombreDeLiquidacion } from '@/constants/etiquetas'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { DetallePagoBancario as Pago } from '@/lib/consultas/movimientos'

export function DetallePagoBancario({
  empleada,
  pago,
}: {
  empleada: EmpleadaDelMarco
  pago: Pago
}) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [concepto, setConcepto] = useState(pago.concepto)
  const [aAnular, setAAnular] = useState(false)

  // §1.3 de las notas — el `,00` sobra si el importe no tiene centavos.
  const importe = todosEnteros([pago.monto]) ? formatearImporteEntero : formatearImporte

  const listado = `/empleados/${empleada.id}/pagos-bancarios`
  const editable = !empleada.soloLectura && !pago.anulado

  function guardar() {
    ejecutar(() => actualizarMovimiento({ id: pago.id, concepto }), {
      exito: 'Pago actualizado.',
      onExito: () => router.refresh(),
    })
  }

  function confirmarAnulacion() {
    ejecutar(() => anularMovimiento(pago.id), {
      onExito: () => {
        setAAnular(false)
        router.refresh()
      },
    })
  }

  return (
    <>
      <DetalleDeMovimiento
        empleada={empleada}
        activo="pago-bancario"
        titulo="Pago bancario"
        volverA="Pagos bancarios"
        volverHref={listado}
        etiquetas={pago.anulado ? <Badge variant="outline">Anulado</Badge> : null}
        aviso={
          pago.anulado ? (
            <>
              Este pago se anuló con un contra-asiento del mismo monto en el mismo libro. Se
              muestra para consulta y no se puede modificar.
              {pago.liquidacion
                ? ' La liquidación que cancelaba vuelve a contar como no pagada en ese libro.'
                : ''}
            </>
          ) : null
        }
        datos={[
          { etiqueta: 'Fecha', valor: pago.fecha },
          { etiqueta: 'Monto', valor: importe(pago.monto) },
          { etiqueta: 'Libro', valor: ETIQUETA_LIBRO[pago.libro] },
          {
            etiqueta: 'Liquidación que cancela',
            valor: pago.liquidacion ? (
              <Link
                href={`/empleados/${empleada.id}/liquidacion?periodo=${pago.liquidacion.periodoISO.slice(0, 7)}`}
                className="capitalize underline"
              >
                {nombreDeLiquidacion(pago.liquidacion)}
              </Link>
            ) : (
              <span className="text-muted-foreground">Sin vincular</span>
            ),
          },
        ]}
        nota="La fecha, el monto, el libro y la liquidación vinculada no se modifican: el asiento ya está en la cuenta corriente y el vínculo es lo que marca la liquidación como pagada. Para corregirlos hay que anular el pago y registrarlo de nuevo."
        concepto={{
          etiqueta: 'Concepto',
          valor: concepto,
          onChange: setConcepto,
          error: campos.concepto,
          disabled: !editable || enviando,
          placeholder: 'Sueldo marzo 2026…',
        }}
        pie={
          editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={guardar} disabled={enviando || concepto === pago.concepto}>
                {enviando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              <Button variant="ghost" onClick={() => setAAnular(true)} disabled={enviando}>
                Anular el pago
              </Button>
            </div>
          ) : null
        }
      />

      <DialogoDeAccion
        abierto={aAnular}
        onCerrar={() => setAAnular(false)}
        titulo="¿Anular este pago?"
        descripcion={
          <>
            {/* El rótulo del libro va tal cual: en minúscula, «con BPS» quedaba «con bps». */}
            Se inserta un contra-asiento de {importe(pago.monto)} en el libro «
            {ETIQUETA_LIBRO[pago.libro]}», así que el saldo vuelve a como estaba y el pago queda
            a la vista, anulado.
            {pago.liquidacion
              ? ` ${nombreDeLiquidacion(pago.liquidacion)} vuelve a contar como no pagada en ese libro.`
              : ''}{' '}
            No se puede deshacer.
          </>
        }
        etiquetaConfirmar="Anular el pago"
        onConfirmar={confirmarAnulacion}
        enviando={enviando}
        peligrosa
      />
    </>
  )
}
