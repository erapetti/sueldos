'use client'

/**
 * §7.1 — planilla mensual de horas extras.
 *
 * El recargo y el switch de BPS son persistentes entre cargas: el día siguiente arranca con
 * los mismos valores que el anterior.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import Decimal from 'decimal.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PlanillaMensual, type DiaContexto, type Renglon } from '@/components/dominio/PlanillaMensual'
import { useAccion } from '@/hooks/useAccion'
import { guardarHorasExtras } from '@/actions/novedades'
import { RECARGOS } from '@/constants/recargos'
import { formatearHoras, formatearImporte } from '@/lib/format/money'
import { formatearFecha, parseFechaISO } from '@/lib/format/dates'

type Extra = { conBps: boolean; recargoPct: number }

function extra(renglon: Renglon): Extra {
  return renglon.extra as Extra
}

export function PlanillaHorasExtras(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  periodo: string
  dias: DiaContexto[]
  guardados: Renglon[]
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  valorHoraCalculado: string | null
  valorHoraNegro: string | null
  soloLectura: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<{ guardados: number; borrados: number }>()

  // Persistentes entre cargas (§7.1).
  const [recargo, setRecargo] = useState(100)
  const [conBps, setConBps] = useState(true)

  function alGuardar(renglones: Renglon[], borrar: string[]) {
    ejecutar(
      () =>
        guardarHorasExtras({
          empleadoId: props.empleadoId,
          periodo: props.periodo,
          renglones: renglones.map((r) => ({
            id: r.id,
            fecha: r.fecha,
            horas: r.horas,
            conBps: extra(r).conBps,
            recargoPct: extra(r).recargoPct,
            nota: r.nota ?? '',
          })),
          borrar,
        }),
      {
        exito: 'Horas extras guardadas.',
        duracionAviso: 14_000,
        // La página no navega sola: queda en el mismo mes con lo guardado ya reflejado.
        onExito: () => router.refresh(),
      },
    )
  }

  return (
    <PlanillaMensual
      empleadoId={props.empleadoId}
      alias={props.alias}
      nombreCompleto={props.nombreCompleto}
      periodo={props.periodo}
      ruta={`/empleados/${props.empleadoId}/horas-extras`}
      titulo="Horas extras"
      dias={props.dias}
      guardados={props.guardados}
      estadoLiquidacion={props.estadoLiquidacion}
      enviando={enviando}
      soloLectura={props.soloLectura}
      onGuardar={alGuardar}
      encabezado={
        <span>
          Valor hora calculado:{' '}
          <strong>{props.valorHoraCalculado ? formatearImporte(props.valorHoraCalculado) : '—'}</strong>
          {' · '}
          Valor hora sin aportes:{' '}
          <strong>{props.valorHoraNegro ? formatearImporte(props.valorHoraNegro) : '—'}</strong>
        </span>
      }
      renderEtiqueta={(renglon) => (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px]',
            renglon.id ? 'bg-primary/10 text-primary' : 'bg-warn-soft text-warn-ink',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              extra(renglon).conBps ? 'bg-primary' : 'bg-warn',
            )}
            aria-hidden
          />
          {renglon.horas} h · {extra(renglon).recargoPct} %
        </span>
      )}
      renderPopover={({ fecha, contexto, renglones, agregar, quitar, cerrar }) => (
        <PopoverHoras
          fecha={fecha}
          contexto={contexto}
          renglones={renglones}
          recargo={recargo}
          conBps={conBps}
          setRecargo={setRecargo}
          setConBps={setConBps}
          agregar={agregar}
          quitar={quitar}
          cerrar={cerrar}
        />
      )}
      renderFilaLista={({ renglon, actualizar, quitar }) => (
        <>
          <Input
            type="date"
            value={renglon.fecha}
            onChange={(e) => actualizar({ fecha: e.target.value })}
            className="w-40"
            aria-label="Fecha"
          />
          <Input
            type="number"
            step={0.5}
            min={0}
            value={renglon.horas}
            onChange={(e) => {
              // No se aceptan negativos ni vacío: el campo cae a 0, que es el valor inicial.
              const valor = Number(e.target.value)
              actualizar({ horas: Number.isFinite(valor) && valor > 0 ? valor : 0 })
            }}
            className="w-24 tabular"
            aria-label="Horas"
          />
          <select
            value={extra(renglon).recargoPct}
            onChange={(e) =>
              actualizar({ extra: { ...extra(renglon), recargoPct: Number(e.target.value) } })
            }
            aria-label="Recargo"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {RECARGOS.map((r) => (
              <option key={r} value={r}>
                {r} %
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={extra(renglon).conBps}
              onCheckedChange={(v) => actualizar({ extra: { ...extra(renglon), conBps: v } })}
              aria-label="Lleva descuento BPS"
            />
            BPS
          </label>
          <Button variant="ghost" size="icon" onClick={quitar} aria-label="Quitar el renglón">
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
      renderResumen={(renglones) => {
        const conBpsHoras = renglones
          .filter((r) => extra(r).conBps)
          .reduce((a, r) => a.plus(r.horas), new Decimal(0))
        const sinBpsHoras = renglones
          .filter((r) => !extra(r).conBps)
          .reduce((a, r) => a.plus(r.horas), new Decimal(0))

        const vhc = props.valorHoraCalculado ? new Decimal(props.valorHoraCalculado) : null
        const vhn = props.valorHoraNegro ? new Decimal(props.valorHoraNegro) : null

        const importe = (soloConBps: boolean, valorHora: Decimal | null) =>
          valorHora === null
            ? null
            : renglones
                .filter((r) => extra(r).conBps === soloConBps)
                .reduce(
                  (a, r) =>
                    a.plus(
                      new Decimal(r.horas)
                        .times(valorHora)
                        .times(1 + extra(r).recargoPct / 100),
                    ),
                  new Decimal(0),
                )

        const conBpsImporte = importe(true, vhc)
        const sinBpsImporte = importe(false, vhn)

        // §6.5 — días con horas extras en un día sin horas en el régimen.
        const sinRegimen = new Set(
          props.dias.filter((d) => d.horasRegimen <= 0).map((d) => d.fecha),
        )
        const boletosExtra = new Set(
          renglones.filter((r) => sinRegimen.has(r.fecha)).map((r) => r.fecha),
        ).size

        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {renglones.length} renglones · {formatearHoras(conBpsHoras.plus(sinBpsHoras))}
            </span>
            <span className="text-muted-foreground">
              Con BPS {formatearHoras(conBpsHoras)}
              {conBpsImporte ? ` (${formatearImporte(conBpsImporte)})` : ''}
            </span>
            <span className="text-muted-foreground">
              Sin BPS {formatearHoras(sinBpsHoras)}
              {sinBpsImporte ? ` (${formatearImporte(sinBpsImporte)})` : ''}
            </span>
            {boletosExtra > 0 ? (
              <span className="text-muted-foreground">
                +{boletosExtra * 2} boletos adicionales
              </span>
            ) : null}
          </span>
        )
      }}
    />
  )
}

function PopoverHoras({
  fecha,
  contexto,
  renglones,
  recargo,
  conBps,
  setRecargo,
  setConBps,
  agregar,
  quitar,
  cerrar,
}: {
  fecha: string
  contexto: DiaContexto
  renglones: Renglon[]
  recargo: number
  conBps: boolean
  setRecargo: (v: number) => void
  setConBps: (v: boolean) => void
  agregar: (r: Omit<Renglon, 'clave' | 'fecha'>) => void
  quitar: (clave: string) => void
  cerrar: () => void
}) {
  const [horas, setHoras] = useState('')
  const [nota, setNota] = useState('')

  function confirmar() {
    const valor = Number(horas.replace(',', '.'))
    if (!valor || valor <= 0) return
    agregar({ horas: valor, nota, extra: { conBps, recargoPct: recargo } })
    setHoras('')
    setNota('')
    cerrar()
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">{formatearFecha(parseFechaISO(fecha))}</p>
        <p className="text-xs text-muted-foreground">
          {contexto.horasRegimen > 0
            ? `${contexto.horasRegimen} h según el régimen`
            : 'Día sin horas en el régimen: genera boletos adicionales'}
          {contexto.feriado ? ` · ${contexto.feriado}` : ''}
        </p>
      </div>

      {renglones.length > 0 ? (
        <ul className="space-y-1 border-y py-2 text-sm">
          {renglones.map((r) => (
            <li key={r.clave} className="flex items-center justify-between gap-2">
              <span>
                {r.horas} h · {extra(r).recargoPct} % · {extra(r).conBps ? 'con BPS' : 'sin BPS'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => quitar(r.clave)}
                aria-label="Quitar este renglón"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="he-horas">Horas</Label>
        <div className="flex gap-1">
          <Input
            id="he-horas"
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmar()
              }
            }}
            inputMode="decimal"
            autoFocus
            className="tabular"
          />
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {['0.5', '1', '2', '4'].map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHoras(v)}
            >
              {v === '0.5' ? '+0,5' : v}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Recargo</Label>
        <div className="flex flex-wrap gap-1">
          {RECARGOS.map((r) => (
            <Button
              key={r}
              type="button"
              variant={r === recargo ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRecargo(r)}
              aria-pressed={r === recargo}
            >
              {r} %
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="he-bps">¿Lleva descuento BPS?</Label>
        <Switch id="he-bps" checked={conBps} onCheckedChange={setConBps} />
      </div>

      <Textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        rows={2}
        aria-label="Nota"
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cerrar}>
          Cerrar
        </Button>
        <Button size="sm" onClick={confirmar}>
          Agregar
        </Button>
      </div>
    </div>
  )
}
