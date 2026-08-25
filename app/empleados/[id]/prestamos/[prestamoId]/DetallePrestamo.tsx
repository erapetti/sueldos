'use client'

/**
 * §7.4 — detalle de un préstamo registrado.
 *
 * Se parece al formulario de alta, con dos diferencias que son de negocio y no de diseño:
 *
 * - **La fecha y el monto no se editan.** El asiento `PRESTAMO` ya está en la cuenta corriente
 *   (§4.9) y puede tener liquidaciones confirmadas encima; corregirlo sería mover un saldo
 *   hacia atrás. El camino es anular el movimiento, que deja su contra-asiento, y registrarlo
 *   de nuevo.
 * - **Las cuotas de meses pasados tampoco.** Una cuota se bloquea si su mes ya pasó o si dejó
 *   de estar `PENDIENTE`. Las dos reglas suman: la del mes es la que se pidió, y la del estado
 *   es la única que valida el servidor (§4.8), así que si la pantalla ofreciera editar una
 *   cuota aplicada la acción la rechazaría igual.
 */
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import { useAccion } from '@/hooks/useAccion'
import { actualizarCuota, actualizarPrestamo, cancelarCuota } from '@/actions/prestamos'
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
  empleadoId,
  alias,
  nombreCompleto,
  soloLectura,
  prestamo,
  mesActual,
}: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  soloLectura: boolean
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

  const editable = !soloLectura && !prestamo.anulado
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
          const r = await actualizarPrestamo({ id: prestamo.id, concepto })
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

  return (
    <div>
      <EncabezadoEmpleada
        empleadoId={empleadoId}
        alias={alias}
        nombreCompleto={nombreCompleto}
        activa="movimientos"
      />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Volver a Préstamos">
              <Link href={`/empleados/${empleadoId}/prestamos`}>
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
            </Button>
            <h2 className="text-[28px] leading-tight">Préstamo</h2>
            {prestamo.anulado ? <Badge variant="outline">Anulado</Badge> : null}
          </div>
        </div>

        {prestamo.anulado ? (
          <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
            Este préstamo se anuló con un contra-asiento y sus cuotas pendientes quedaron
            canceladas. Se muestra para consulta y no se puede modificar.
          </p>
        ) : null}

        <div className="space-y-4 rounded-card border bg-card px-[22px] py-5 shadow-soft">
          {/*
            La fecha y el monto se muestran como dato, no como campo deshabilitado: un input
            en gris invita a intentar escribirlo y después no explica por qué no se puede.
          */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p className="tabular text-lg">{prestamo.fecha}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monto</p>
              <p className="tabular text-lg">{importe(prestamo.monto)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo</p>
              <p className="tabular text-lg">{importe(prestamo.saldo)}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            La fecha y el monto no se modifican: el asiento ya está en la cuenta corriente. Para
            corregirlos hay que anular el préstamo y registrarlo de nuevo.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="prestamo-concepto">Comentario</Label>
            <Input
              id="prestamo-concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              disabled={!editable || enviando}
              maxLength={255}
              placeholder="Adelanto, préstamo…"
            />
            {campos.concepto ? (
              <p className="text-sm text-destructive">{campos.concepto}</p>
            ) : null}
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-[20px]">Plan de devolución</h3>

          {prestamo.cuotas.length === 0 ? (
            <div className="rounded-card border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este préstamo se registró sin cuotas previstas.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border bg-card shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prestamo.cuotas.map((cuota, i) => {
                    const bloqueo = bloqueos.get(cuota.id) ?? null
                    const sePuede = editable && !bloqueo

                    return (
                      <TableRow
                        key={cuota.id}
                        className={cuota.estado === 'CANCELADA' ? 'opacity-60' : undefined}
                      >
                        <TableCell>
                          {formatearPeriodoCapitalizado(parseFechaISO(cuota.fechaISO))}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {sePuede ? (
                            <Input
                              value={montos[cuota.id] ?? ''}
                              onChange={(e) =>
                                setMontos((m) => ({ ...m, [cuota.id]: e.target.value }))
                              }
                              disabled={enviando}
                              inputMode="decimal"
                              aria-label={`Monto de la cuota ${i + 1}`}
                              className="ml-auto max-w-40 text-right tabular"
                            />
                          ) : (
                            importe(cuota.monto)
                          )}
                        </TableCell>
                        <TableCell>
                          {bloqueo ? (
                            <Badge variant="outline">{bloqueo}</Badge>
                          ) : (
                            <Badge variant="secondary">Pendiente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {sePuede ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={enviando}
                              onClick={() => setACancelar(cuota)}
                            >
                              Cancelar cuota
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {campos.cuotas ? <p className="text-sm text-destructive">{campos.cuotas}</p> : null}
        </section>

        {editable ? (
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
        ) : null}
      </div>

      <AlertDialog open={!!aCancelar} onOpenChange={(v) => !v && setACancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta cuota?</AlertDialogTitle>
            <AlertDialogDescription>
              {aCancelar
                ? `La cuota de ${formatearPeriodoCapitalizado(
                    parseFechaISO(aCancelar.fechaISO),
                  )} deja de descontarse del sueldo. El préstamo se sigue debiendo: el saldo no
                     baja, solo desaparece la cuota prevista. No se puede deshacer.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarCancelacion} disabled={enviando}>
              Cancelar la cuota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
