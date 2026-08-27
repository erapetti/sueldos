'use client'

/**
 * §7.4 — detalle de un préstamo registrado.
 *
 * Se parece al formulario de alta, con dos diferencias que son de negocio y no de diseño. La
 * primera la fija `DetalleDeMovimiento` y vale para los cuatro movimientos: **la fecha y el
 * monto no se editan**, porque el asiento ya está en la cuenta corriente (§4.9). La otra es
 * propia del préstamo:
 *
 * - **Las cuotas de meses pasados tampoco.** Una cuota se bloquea si su mes ya pasó o si dejó
 *   de estar `PENDIENTE`. Las dos reglas suman: la del mes es la que se pidió, y la del estado
 *   es la única que valida el servidor (§4.8), así que si la pantalla ofreciera editar una
 *   cuota aplicada la acción la rechazaría igual.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { DialogoDeAccion } from '@/components/dominio/DialogoDeAccion'
import { DetalleDeMovimiento } from '@/components/dominio/DetalleDeMovimiento'
import type { EmpleadaDelMarco } from '@/components/dominio/MarcoDeMovimientos'
import { useAccion } from '@/hooks/useAccion'
import { actualizarCuota, actualizarMovimiento, cancelarCuota } from '@/actions/prestamos'
import { formatearPeriodoCapitalizado, parseFechaISO } from '@/lib/format/dates'
import {
  formatearImporte,
  formatearImporteEntero,
  formatoDeCampo,
  parsearNumero,
  todosEnteros,
} from '@/lib/format/money'
import type { Resultado } from '@/lib/acciones/resultado'
import type { CuotaDetalle, DetallePrestamo as Prestamo } from '@/lib/consultas/movimientos'

/** Por qué una cuota no se puede tocar, o `null` si sí se puede. */
function motivoDeBloqueo(cuota: CuotaDetalle, mesActual: string): string | null {
  if (cuota.estado === 'APLICADA') return 'Aplicada'
  if (cuota.estado === 'CANCELADA') return 'Cancelada'
  if (cuota.periodo < mesActual) return 'Mes pasado'
  return null
}

export function DetallePrestamo({
  empleada,
  prestamo,
  mesActual,
}: {
  empleada: EmpleadaDelMarco
  prestamo: Prestamo
  mesActual: string
}) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [concepto, setConcepto] = useState(prestamo.concepto)
  const escribir = useMemo(
    () => formatoDeCampo(prestamo.cuotas.map((c) => c.monto)),
    [prestamo.cuotas],
  )
  /** Monto de cada cuota tal como está en el campo, por id. */
  const [montos, setMontos] = useState<Record<string, string>>(() =>
    Object.fromEntries(prestamo.cuotas.map((c) => [c.id, escribir(c.monto)])),
  )
  const [aCancelar, setACancelar] = useState<CuotaDetalle | null>(null)

  const importe = todosEnteros([prestamo.monto, prestamo.saldo])
    ? formatearImporteEntero
    : formatearImporte

  const editable = !empleada.soloLectura && !prestamo.anulado
  const bloqueos = new Map(prestamo.cuotas.map((c) => [c.id, motivoDeBloqueo(c, mesActual)]))

  /** Lo que cambió respecto de lo guardado, entre lo que se puede tocar. */
  const cuotasCambiadas = prestamo.cuotas.filter(
    (c) => !bloqueos.get(c.id) && montos[c.id] !== escribir(c.monto),
  )
  const hayCambios = concepto !== prestamo.concepto || cuotasCambiadas.length > 0

  const cuotaInvalida = cuotasCambiadas.find((c) => {
    const n = parsearNumero(montos[c.id] ?? '')
    return !n || n.lessThanOrEqualTo(0)
  })

  function guardar() {
    ejecutar(
      async (): Promise<Resultado<undefined>> => {
        if (concepto !== prestamo.concepto) {
          const r = await actualizarMovimiento({ id: prestamo.id, concepto })
          if (!r.ok) return r
        }
        // Las cuotas se guardan de a una porque cada una tiene su propia validación de estado
        // en el servidor (§4.8). Si una falla se corta ahí y se informa: las anteriores ya
        // quedaron guardadas y el refresh las va a mostrar.
        for (const cuota of cuotasCambiadas) {
          const r = await actualizarCuota(cuota.id, montos[cuota.id], cuota.fechaISO)
          if (!r.ok) return r
        }
        return { ok: true, datos: undefined }
      },
      {
        exito: 'Préstamo actualizado.',
        onExito: () => router.refresh(),
      },
    )
  }

  function confirmarCancelacion() {
    if (!aCancelar) return
    ejecutar(() => cancelarCuota(aCancelar.id), {
      onExito: () => {
        setACancelar(null)
        router.refresh()
      },
    })
  }

  const columnasDeCuotas: Columna<CuotaDetalle>[] = [
    {
      clave: 'mes',
      etiqueta: 'Mes',
      celda: (c) => formatearPeriodoCapitalizado(parseFechaISO(c.fechaISO)),
    },
    {
      clave: 'monto',
      etiqueta: 'Monto',
      numerica: true,
      celda: (cuota) => {
        const i = prestamo.cuotas.indexOf(cuota)
        return editable && !bloqueos.get(cuota.id) ? (
          <Input
            value={montos[cuota.id] ?? ''}
            onChange={(e) => setMontos((m) => ({ ...m, [cuota.id]: e.target.value }))}
            disabled={enviando}
            inputMode="decimal"
            aria-label={`Monto de la cuota ${i + 1}`}
            className="ml-auto max-w-40 text-right tabular"
          />
        ) : (
          importe(cuota.monto)
        )
      },
    },
    {
      clave: 'estado',
      etiqueta: 'Estado',
      celda: (cuota) => {
        const bloqueo = bloqueos.get(cuota.id) ?? null
        return bloqueo ? (
          <Badge variant="outline">{bloqueo}</Badge>
        ) : (
          <Badge variant="secondary">Pendiente</Badge>
        )
      },
    },
    {
      clave: 'acciones',
      etiqueta: 'Acciones',
      derecha: true,
      celda: (cuota) =>
        editable && !bloqueos.get(cuota.id) ? (
          <Button variant="ghost" size="sm" disabled={enviando} onClick={() => setACancelar(cuota)}>
            Cancelar cuota
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <DetalleDeMovimiento
        empleada={empleada}
        activo="prestamo"
        titulo="Préstamo"
        volverA="Préstamos"
        volverHref={`/empleados/${empleada.id}/prestamos`}
        etiquetas={prestamo.anulado ? <Badge variant="outline">Anulado</Badge> : null}
        aviso={
          prestamo.anulado
            ? `Este préstamo se anuló con un contra-asiento y sus cuotas pendientes quedaron
               canceladas. Se muestra para consulta y no se puede modificar.`
            : null
        }
        datos={[
          { etiqueta: 'Fecha', valor: prestamo.fecha },
          { etiqueta: 'Monto', valor: importe(prestamo.monto) },
          { etiqueta: 'Saldo', valor: importe(prestamo.saldo) },
        ]}
        nota="La fecha y el monto no se modifican: el asiento ya está en la cuenta corriente. Para corregirlos hay que anular el préstamo y registrarlo de nuevo."
        concepto={{
          etiqueta: 'Comentario',
          valor: concepto,
          onChange: setConcepto,
          error: campos.concepto,
          disabled: !editable || enviando,
          placeholder: 'Adelanto, préstamo…',
        }}
        pie={
          editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={guardar} disabled={enviando || !hayCambios || !!cuotaInvalida}>
                {enviando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              {cuotaInvalida ? (
                <span className="text-sm text-destructive">
                  Hay una cuota con un monto que no es válido.
                </span>
              ) : null}
            </div>
          ) : null
        }
      >
        <section className="space-y-2">
          <h3 className="text-[20px]">Plan de devolución</h3>

          {prestamo.cuotas.length === 0 ? (
            <div className="rounded-card border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este préstamo se registró sin cuotas previstas.
            </div>
          ) : (
            <Tabla
              columnas={columnasDeCuotas}
              filas={prestamo.cuotas}
              claseDeFila={(c) => (c.estado === 'CANCELADA' ? 'opacity-60' : undefined)}
            />
          )}

          {campos.cuotas ? <p className="text-sm text-destructive">{campos.cuotas}</p> : null}
        </section>
      </DetalleDeMovimiento>

      {/* «Cancelar» acá es la acción, así que el botón de salir dice «Volver». */}
      <DialogoDeAccion
        abierto={!!aCancelar}
        onCerrar={() => setACancelar(null)}
        titulo="¿Cancelar esta cuota?"
        descripcion={
          aCancelar
            ? `La cuota de ${formatearPeriodoCapitalizado(
                parseFechaISO(aCancelar.fechaISO),
              )} deja de descontarse del sueldo. El préstamo se sigue debiendo: el saldo no
                 baja, solo desaparece la cuota prevista. No se puede deshacer.`
            : null
        }
        etiquetaCancelar="Volver"
        etiquetaConfirmar="Cancelar la cuota"
        onConfirmar={confirmarCancelacion}
        enviando={enviando}
      />
    </>
  )
}
