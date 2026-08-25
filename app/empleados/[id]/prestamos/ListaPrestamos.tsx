'use client'

/**
 * §7.4 — la tabla de préstamos, con el alta arriba y el detalle a un clic de la fecha.
 *
 * El diálogo de alta es el mismo de siempre: la pantalla no lo reemplaza, le da un lugar
 * donde volver a mirar lo que registró.
 */
import Link from 'next/link'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import { DialogoPrestamo } from '@/components/dominio/DialogoPrestamo'
import {
  ListadoDeMovimientos,
  type ColumnaListado,
} from '@/components/dominio/ListadoDeMovimientos'
import { formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import type { FilaPrestamo } from '@/lib/consultas/movimientos'

export function ListaPrestamos({
  empleadoId,
  alias,
  nombreCompleto,
  fechaIngreso,
  soloLectura,
  prestamos,
}: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  fechaIngreso: string
  soloLectura: boolean
  prestamos: FilaPrestamo[]
}) {
  // El refresh tras el alta lo hace el propio `DialogoPrestamo`, que ya llama a `router.refresh()`.
  const [alta, setAlta] = useState(false)

  // §1.3 de las notas — el `,00` sobra si no hay centavos en toda la columna.
  const importe = todosEnteros(prestamos.flatMap((p) => [p.monto, p.saldo]))
    ? formatearImporteEntero
    : formatearImporte

  const columnas: ColumnaListado<FilaPrestamo>[] = [
    {
      clave: 'fecha',
      etiqueta: 'Fecha',
      celda: (p) => (
        // La fecha es el enlace al detalle, como el período en la lista de liquidaciones.
        <Link
          href={`/empleados/${empleadoId}/prestamos/${p.id}`}
          className="tabular hover:underline"
        >
          {p.fecha}
        </Link>
      ),
    },
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
    <div>
      <EncabezadoEmpleada
        empleadoId={empleadoId}
        alias={alias}
        nombreCompleto={nombreCompleto}
        activa="movimientos"
      />

      <ListadoDeMovimientos
        titulo="Préstamos"
        accion={
          soloLectura ? null : (
            <Button onClick={() => setAlta(true)}>
              <Plus className="size-4" aria-hidden />
              Nuevo préstamo
            </Button>
          )
        }
        columnas={columnas}
        filas={prestamos}
        atenuada={(p) => p.anulado}
        vacio="Todavía no hay préstamos registrados."
      />

      <DialogoPrestamo
        abierto={alta}
        onCerrar={() => setAlta(false)}
        empleadoId={empleadoId}
        alias={alias}
        fechaIngreso={fechaIngreso}
      />
    </div>
  )
}
