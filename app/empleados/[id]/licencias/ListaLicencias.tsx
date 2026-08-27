'use client'

/**
 * §7.11 — el estado de cuenta de días de licencia, con el alta arriba.
 *
 * **Es una sola tabla y no dos.** Lo que la ficha mostraba como el libro de días y «Períodos
 * gozados» por separado es la misma información: cada asiento `GOCE` *es* una licencia gozada,
 * así que el período y el salario vacacional que generó (§7.11) van en su propia fila.
 *
 * **Ordenada por fecha**, como cualquier libro, con el saldo corriendo en ese orden: el año de
 * aniversario solo existe en el haber —lo acredita la generación anual (§4.15.4)— y el consumo no
 * se imputa a ninguno, porque el §4.15.1 define un saldo único. El año va dicho en el concepto de
 * la generación, que es donde significa algo.
 *
 * **Ninguna fila lleva a un detalle**, por decisión del dueño del proyecto: la pantalla es el
 * saldo, la tabla y el alta. Editar la nota y borrar una licencia quedan para más adelante.
 */
import { useState } from 'react'
import { BotonAgregar } from '@/components/dominio/BotonAgregar'
import { DialogoLicencia } from '@/components/dominio/DialogoLicencia'
import {
  MarcoDeMovimientos,
  type EmpleadaDelMarco,
} from '@/components/dominio/MarcoDeMovimientos'
import {
  ListadoDeMovimientos,
  type ColumnaListado,
} from '@/components/dominio/ListadoDeMovimientos'
import { cn } from '@/lib/utils'
import { formatearDias, formatearImporte } from '@/lib/format/money'
import type { FilaLicencia, LibroDeLicencia } from '@/lib/consultas/movimientos'

/** Los días de una columna del libro: en blanco cuando ese asiento no mueve ese lado. */
function dias(valor: string): string {
  return Number(valor) > 0 ? formatearDias(valor) : ''
}

export function ListaLicencias({
  empleada,
  libro,
}: {
  empleada: EmpleadaDelMarco
  libro: LibroDeLicencia
}) {
  // El refresh tras el alta lo hace el propio diálogo, que ya llama a `router.refresh()`.
  const [alta, setAlta] = useState(false)

  const columnas: ColumnaListado<FilaLicencia>[] = [
    { clave: 'fecha', etiqueta: 'Fecha', className: 'tabular', celda: (f) => f.fecha },
    { clave: 'concepto', etiqueta: 'Concepto', celda: (f) => f.concepto },
    {
      clave: 'consumidos',
      etiqueta: 'Consumidos',
      numerica: true,
      celda: (f) => dias(f.debe),
    },
    { clave: 'generados', etiqueta: 'Generados', numerica: true, celda: (f) => dias(f.haber) },
    {
      clave: 'saldo',
      etiqueta: 'Saldo',
      numerica: true,
      celda: (f) => (
        <span className={Number(f.saldoAcumulado) < 0 ? 'text-destructive' : undefined}>
          {formatearDias(f.saldoAcumulado)}
        </span>
      ),
    },
    {
      clave: 'vacacional',
      etiqueta: 'Salario vacacional',
      numerica: true,
      desde: 'sm',
      celda: (f) =>
        f.periodo?.salarioVacacional ? (
          <>
            {formatearImporte(f.periodo.salarioVacacional)}
            {f.periodo.liquidacionAnulada ? (
              <span className="ml-1 text-muted-foreground">(anulada)</span>
            ) : null}
          </>
        ) : null,
    },
  ]

  return (
    <MarcoDeMovimientos empleada={empleada} activo="licencia">
      <ListadoDeMovimientos
        titulo="Licencias"
        accion={
          empleada.soloLectura ? null : (
            <BotonAgregar onClick={() => setAlta(true)}>Nueva licencia</BotonAgregar>
          )
        }
        resumen={
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-sm text-muted-foreground">Saldo de días</span>
            <span
              className={cn(
                'text-2xl font-semibold tabular',
                Number(libro.saldoDias) < 0 && 'text-destructive',
              )}
            >
              {formatearDias(libro.saldoDias)}
            </span>
          </div>
        }
        columnas={columnas}
        filas={libro.filas}
        vacio="Todavía no hay movimientos de licencia."
      />

      <DialogoLicencia
        abierto={alta}
        onCerrar={() => setAlta(false)}
        empleadoId={empleada.id}
        alias={empleada.alias}
        fechaIngreso={empleada.fechaIngreso}
      />
    </MarcoDeMovimientos>
  )
}
