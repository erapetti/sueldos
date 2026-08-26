'use client'

/**
 * §7.5 — la tabla de pagos bancarios, con el alta arriba y el detalle a un clic de la fecha.
 *
 * La columna de la **liquidación** es la que hace falta para leer el listado: vincular el pago
 * es lo que la marca como pagada (§4.14), y un pago sin vínculo —un adelanto, una devolución—
 * es igual de válido pero no cancela nada. La del **libro** dice de cuál de las dos cuentas
 * sale (§4.9): una liquidación con las dos tablas se paga con dos transferencias.
 */
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { BotonAgregar } from '@/components/dominio/BotonAgregar'
import { DialogoPagoBancario } from '@/components/dominio/DialogoPagoBancario'
import {
  MarcoDeMovimientos,
  type EmpleadaDelMarco,
} from '@/components/dominio/MarcoDeMovimientos'
import {
  ListadoDeMovimientos,
  type ColumnaListado,
} from '@/components/dominio/ListadoDeMovimientos'
import { ETIQUETA_LIBRO, nombreDeLiquidacion } from '@/constants/etiquetas'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { FilaPagoBancario } from '@/lib/consultas/movimientos'

export function ListaPagosBancarios({
  empleada,
  pagos,
}: {
  empleada: EmpleadaDelMarco
  pagos: FilaPagoBancario[]
}) {
  // El refresh tras el alta lo hace el propio diálogo, que ya llama a `router.refresh()`.
  const [alta, setAlta] = useState(false)

  // §1.3 de las notas — el `,00` sobra si no hay centavos en toda la columna.
  const importe = todosEnteros(pagos.map((p) => p.monto))
    ? formatearImporteEntero
    : formatearImporte

  const columnas: ColumnaListado<FilaPagoBancario>[] = [
    // La fecha es la puerta de entrada al detalle: por ser la primera, `Tabla` la hace enlace.
    { clave: 'fecha', etiqueta: 'Fecha', celda: (p) => p.fecha },
    {
      clave: 'concepto',
      etiqueta: 'Concepto',
      celda: (p) => (
        <span className="flex flex-wrap items-center gap-2">
          {p.concepto}
          {p.anulado ? <Badge variant="outline">Anulado</Badge> : null}
        </span>
      ),
    },
    {
      clave: 'libro',
      etiqueta: 'Libro',
      desde: 'sm',
      celda: (p) => ETIQUETA_LIBRO[p.libro],
    },
    {
      clave: 'liquidacion',
      etiqueta: 'Cancela',
      celda: (p) =>
        p.liquidacion ? (
          <span className="capitalize">{nombreDeLiquidacion(p.liquidacion)}</span>
        ) : (
          <span className="text-muted-foreground">Sin vincular</span>
        ),
    },
    { clave: 'monto', etiqueta: 'Monto', numerica: true, celda: (p) => importe(p.monto) },
  ]

  return (
    <MarcoDeMovimientos empleada={empleada} activo="pago-bancario">
      <ListadoDeMovimientos
        titulo="Pagos bancarios"
        accion={
          empleada.soloLectura ? null : (
            <BotonAgregar onClick={() => setAlta(true)}>Nuevo pago bancario</BotonAgregar>
          )
        }
        columnas={columnas}
        filas={pagos}
        hrefDetalle={(p) => `/empleados/${empleada.id}/pagos-bancarios/${p.id}`}
        atenuada={(p) => p.anulado}
        vacio="Todavía no hay pagos bancarios registrados."
      />

      <DialogoPagoBancario
        abierto={alta}
        onCerrar={() => setAlta(false)}
        empleadoId={empleada.id}
        alias={empleada.alias}
        fechaIngreso={empleada.fechaIngreso}
      />
    </MarcoDeMovimientos>
  )
}
