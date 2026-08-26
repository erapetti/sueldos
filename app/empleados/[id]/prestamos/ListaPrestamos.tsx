'use client'

/**
 * §7.4 — la tabla de préstamos, con el alta arriba y el detalle a un clic de la fecha.
 *
 * El diálogo de alta es el mismo de siempre: la pantalla no lo reemplaza, le da un lugar
 * donde volver a mirar lo que registró.
 */
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { BotonAgregar } from '@/components/dominio/BotonAgregar'
import { DialogoPrestamo } from '@/components/dominio/DialogoPrestamo'
import {
  MarcoDeMovimientos,
  type EmpleadaDelMarco,
} from '@/components/dominio/MarcoDeMovimientos'
import {
  ListadoDeMovimientos,
  type ColumnaListado,
} from '@/components/dominio/ListadoDeMovimientos'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { FilaPrestamo } from '@/lib/consultas/movimientos'

export function ListaPrestamos({
  empleada,
  prestamos,
}: {
  empleada: EmpleadaDelMarco
  prestamos: FilaPrestamo[]
}) {
  // El refresh tras el alta lo hace el propio `DialogoPrestamo`, que ya llama a `router.refresh()`.
  const [alta, setAlta] = useState(false)

  // §1.3 de las notas — el `,00` sobra si no hay centavos en toda la columna.
  const importe = todosEnteros(prestamos.flatMap((p) => [p.monto, p.saldo]))
    ? formatearImporteEntero
    : formatearImporte

  const columnas: ColumnaListado<FilaPrestamo>[] = [
    // La fecha es la puerta de entrada al detalle: por ser la primera, `Tabla` la hace enlace.
    { clave: 'fecha', etiqueta: 'Fecha', celda: (p) => p.fecha },
    {
      clave: 'concepto',
      etiqueta: 'Comentario',
      celda: (p) => (
        <span className="flex flex-wrap items-center gap-2">
          {p.concepto}
          {p.anulado ? <Badge variant="outline">Anulado</Badge> : null}
          {!p.conPlan && !p.anulado ? (
            <Badge variant="outline">Sin plan de devolución</Badge>
          ) : null}
        </span>
      ),
    },
    { clave: 'monto', etiqueta: 'Monto', numerica: true, celda: (p) => importe(p.monto) },
    { clave: 'saldo', etiqueta: 'Saldo', numerica: true, celda: (p) => importe(p.saldo) },
  ]

  return (
    <MarcoDeMovimientos empleada={empleada} activo="prestamo">
      <ListadoDeMovimientos
        titulo="Préstamos"
        accion={
          empleada.soloLectura ? null : (
            <BotonAgregar onClick={() => setAlta(true)}>Nuevo préstamo</BotonAgregar>
          )
        }
        columnas={columnas}
        filas={prestamos}
        hrefDetalle={(p) => `/empleados/${empleada.id}/prestamos/${p.id}`}
        atenuada={(p) => p.anulado}
        vacio="Todavía no hay préstamos registrados."
      />

      <DialogoPrestamo
        abierto={alta}
        onCerrar={() => setAlta(false)}
        empleadoId={empleada.id}
        alias={empleada.alias}
        fechaIngreso={empleada.fechaIngreso}
      />
    </MarcoDeMovimientos>
  )
}
