'use client'

/**
 * §7.3 — la tabla de pagos adicionales, con el alta arriba y el detalle a un clic de la fecha.
 *
 * La columna del **período** es propia de este movimiento: el pago adicional no se paga el día
 * de su fecha sino en la liquidación del mes de esa fecha (§4.7). Si ese mes ya está liquidado
 * se avisa acá mismo, que es antes de entrar a tocarlo (§6.11).
 */
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { BotonAgregar } from '@/components/dominio/BotonAgregar'
import { DialogoPagoAdicional } from '@/components/dominio/DialogoPagoAdicional'
import {
  MarcoDeMovimientos,
  type EmpleadaDelMarco,
} from '@/components/dominio/MarcoDeMovimientos'
import {
  ListadoDeMovimientos,
  type ColumnaListado,
} from '@/components/dominio/ListadoDeMovimientos'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { FilaPagoAdicional } from '@/lib/consultas/movimientos'

export function ListaPagosAdicionales({
  empleada,
  pagos,
}: {
  empleada: EmpleadaDelMarco
  pagos: FilaPagoAdicional[]
}) {
  // El refresh tras el alta lo hace el propio diálogo, que ya llama a `router.refresh()`.
  const [alta, setAlta] = useState(false)

  // §1.3 de las notas — el `,00` sobra si no hay centavos en toda la columna.
  const importe = todosEnteros(pagos.map((p) => p.monto))
    ? formatearImporteEntero
    : formatearImporte

  const columnas: ColumnaListado<FilaPagoAdicional>[] = [
    // La fecha es la puerta de entrada al detalle: por ser la primera, `Tabla` la hace enlace.
    { clave: 'fecha', etiqueta: 'Fecha', celda: (p) => p.fecha },
    {
      clave: 'concepto',
      etiqueta: 'Concepto',
      celda: (p) => p.concepto ?? <span className="text-muted-foreground">Sin concepto</span>,
    },
    {
      clave: 'periodo',
      etiqueta: 'Se liquida en',
      className: 'capitalize',
      celda: (p) => (
        <span className="flex flex-wrap items-center gap-2">
          {p.periodo}
          {p.periodoLiquidado ? (
            <Badge variant="outline" className="normal-case">
              Ya liquidado
            </Badge>
          ) : null}
        </span>
      ),
    },
    { clave: 'monto', etiqueta: 'Monto', numerica: true, celda: (p) => importe(p.monto) },
  ]

  return (
    <MarcoDeMovimientos empleada={empleada} activo="pago-adicional">
      <ListadoDeMovimientos
        titulo="Pagos adicionales"
        accion={
          empleada.soloLectura ? null : (
            <BotonAgregar onClick={() => setAlta(true)}>Nuevo pago adicional</BotonAgregar>
          )
        }
        columnas={columnas}
        filas={pagos}
        hrefDetalle={(p) => `/empleados/${empleada.id}/pagos-adicionales/${p.id}`}
        vacio="Todavía no hay pagos adicionales registrados."
      />

      <DialogoPagoAdicional
        abierto={alta}
        onCerrar={() => setAlta(false)}
        empleadoId={empleada.id}
        alias={empleada.alias}
        fechaIngreso={empleada.fechaIngreso}
      />
    </MarcoDeMovimientos>
  )
}
