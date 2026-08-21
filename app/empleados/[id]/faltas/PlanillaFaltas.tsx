'use client'

/**
 * §7.2 — planilla mensual de inasistencias.
 *
 * Misma base que §7.1. Cambia el popover del día: horas con el tope precargado y botón "día
 * completo", causal, y —solo con causal Enfermedad— el switch "Se descuenta del sueldo"
 * (§4.6.1). El calendario permite arrastrar o hacer shift+clic para cargar un rango.
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
import { guardarFaltas } from '@/actions/novedades'
import { CAUSALES_FALTA, descuentaEsEditable, etiquetaCausal, type CausalFaltaValor } from '@/constants/causales'
import { formatearHoras } from '@/lib/format/money'
import { formatearFecha, parseFechaISO } from '@/lib/format/dates'

type Extra = { causal: CausalFaltaValor; descuenta: boolean }

function extra(renglon: Renglon): Extra {
  return renglon.extra as Extra
}

export function PlanillaFaltas(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  periodo: string
  dias: DiaContexto[]
  guardados: Renglon[]
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  soloLectura: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<{ guardados: number; borrados: number }>()

  // Persistentes entre cargas, igual que en §7.1.
  const [causal, setCausal] = useState<CausalFaltaValor>('CON_AVISO')
  const [descuenta, setDescuenta] = useState(true)

  function alGuardar(renglones: Renglon[], borrar: string[]) {
    ejecutar(
      () =>
        guardarFaltas({
          empleadoId: props.empleadoId,
          periodo: props.periodo,
          renglones: renglones.map((r) => ({
            id: r.id,
            fecha: r.fecha,
            horas: r.horas,
            causal: extra(r).causal,
            descuenta: extra(r).descuenta,
            nota: r.nota ?? '',
          })),
          borrar,
        }),
      {
        exito: 'Inasistencias guardadas.',
        duracionAviso: 14_000,
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
      ruta={`/empleados/${props.empleadoId}/faltas`}
      titulo="Inasistencias"
      dias={props.dias}
      guardados={props.guardados}
      estadoLiquidacion={props.estadoLiquidacion}
      enviando={enviando}
      soloLectura={props.soloLectura}
      onGuardar={alGuardar}
      encabezado={
        <span>
          La celda muestra las horas que corresponden a cada día según el régimen, para
          distinguir a simple vista si la falta es total o parcial.
        </span>
      }
      renderEtiqueta={(renglon) => {
        const contexto = props.dias.find((d) => d.fecha === renglon.fecha)
        const completa = contexto ? renglon.horas >= contexto.horasRegimen : false
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px]',
              renglon.id ? 'bg-primary/10 text-primary' : 'bg-emerald-100 text-emerald-900',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                extra(renglon).descuenta ? 'bg-red-500' : 'bg-sky-500',
              )}
              aria-hidden
            />
            {renglon.horas} h {completa ? '· completa' : '· parcial'}
          </span>
        )
      }}
      renderPopover={({ fecha, contexto, renglones, agregar, quitar, cerrar }) => (
        <PopoverFalta
          fecha={fecha}
          contexto={contexto}
          renglones={renglones}
          causal={causal}
          descuenta={descuenta}
          setCausal={setCausal}
          setDescuenta={setDescuenta}
          agregar={agregar}
          quitar={quitar}
          cerrar={cerrar}
        />
      )}
      renderFilaLista={({ renglon, contexto, actualizar, quitar }) => (
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
            min={0.5}
            max={contexto?.horasRegimen || undefined}
            value={renglon.horas || ''}
            onChange={(e) => actualizar({ horas: Number(e.target.value) })}
            className="w-24 tabular"
            aria-label="Horas"
          />
          <select
            value={extra(renglon).causal}
            onChange={(e) => {
              const nueva = e.target.value as CausalFaltaValor
              actualizar({
                extra: {
                  causal: nueva,
                  // §4.6.1 — fuera de ENFERMEDAD el campo se fuerza a true.
                  descuenta: descuentaEsEditable(nueva) ? extra(renglon).descuenta : true,
                },
              })
            }}
            aria-label="Causal"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {CAUSALES_FALTA.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
          {descuentaEsEditable(extra(renglon).causal) ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={extra(renglon).descuenta}
                onCheckedChange={(v) => actualizar({ extra: { ...extra(renglon), descuenta: v } })}
                aria-label="Se descuenta del sueldo"
              />
              Descuenta
            </label>
          ) : null}
          <Button variant="ghost" size="icon" onClick={quitar} aria-label="Quitar el renglón">
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
      renderResumen={(renglones) => {
        const total = renglones.reduce((a, r) => a.plus(r.horas), new Decimal(0))
        const queDescuentan = renglones
          .filter((r) => extra(r).descuenta)
          .reduce((a, r) => a.plus(r.horas), new Decimal(0))

        const porFecha = new Map(props.dias.map((d) => [d.fecha, d.horasRegimen]))
        const acumulado = new Map<string, number>()
        for (const r of renglones) {
          acumulado.set(r.fecha, (acumulado.get(r.fecha) ?? 0) + r.horas)
        }
        // §6.4 — solo la falta de jornada completa descuenta el boleto.
        const diasCompletos = [...acumulado.entries()].filter(
          ([fecha, horas]) => (porFecha.get(fecha) ?? 0) > 0 && horas >= (porFecha.get(fecha) ?? 0),
        ).length

        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {renglones.length} renglones · {formatearHoras(total)}
            </span>
            <span className="text-muted-foreground">
              Descuentan sueldo: {formatearHoras(queDescuentan)}
            </span>
            {diasCompletos > 0 ? (
              <span className="text-muted-foreground">
                −{diasCompletos * 2} boletos por {diasCompletos} jornadas completas
              </span>
            ) : null}
          </span>
        )
      }}
    />
  )
}

function PopoverFalta({
  fecha,
  contexto,
  renglones,
  causal,
  descuenta,
  setCausal,
  setDescuenta,
  agregar,
  quitar,
  cerrar,
}: {
  fecha: string
  contexto: DiaContexto
  renglones: Renglon[]
  causal: CausalFaltaValor
  descuenta: boolean
  setCausal: (v: CausalFaltaValor) => void
  setDescuenta: (v: boolean) => void
  agregar: (r: Omit<Renglon, 'clave' | 'fecha'>) => void
  quitar: (clave: string) => void
  cerrar: () => void
}) {
  // §7.2 — el tope del día viene precargado.
  const [horas, setHoras] = useState(
    contexto.horasRegimen > 0 ? String(contexto.horasRegimen) : '',
  )
  const [nota, setNota] = useState('')

  const yaCargadas = renglones.reduce((a, r) => a + r.horas, 0)
  const disponible = Math.max(0, contexto.horasRegimen - yaCargadas)

  function confirmar() {
    const valor = Number(horas.replace(',', '.'))
    if (!valor || valor <= 0) return
    agregar({
      horas: valor,
      nota,
      // §4.6.1 — el servidor vuelve a forzarlo; acá se refleja para que la UI no mienta.
      extra: { causal, descuenta: descuentaEsEditable(causal) ? descuenta : true },
    })
    setHoras('')
    setNota('')
    cerrar()
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium">{formatearFecha(parseFechaISO(fecha))}</p>
        <p className="text-xs text-muted-foreground">
          Corresponden {contexto.horasRegimen} horas ese día
          {yaCargadas > 0 ? ` · ya cargadas ${yaCargadas} h` : ''}
          {contexto.feriado ? ` · ${contexto.feriado}` : ''}
        </p>
      </div>

      {renglones.length > 0 ? (
        <ul className="space-y-1 border-y py-2 text-sm">
          {renglones.map((r) => (
            <li key={r.clave} className="flex items-center justify-between gap-2">
              <span>
                {r.horas} h · {etiquetaCausal(extra(r).causal)}
                {!extra(r).descuenta ? ' · no descuenta' : ''}
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
        <Label htmlFor="falta-horas">Horas</Label>
        <div className="flex gap-1">
          <Input
            id="falta-horas"
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHoras(String(disponible || contexto.horasRegimen))}
            disabled={contexto.horasRegimen <= 0}
          >
            Día completo
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="falta-causal">Causal</Label>
        <select
          id="falta-causal"
          value={causal}
          onChange={(e) => setCausal(e.target.value as CausalFaltaValor)}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        >
          {CAUSALES_FALTA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {/* §4.6.1 — el switch solo aparece con causal Enfermedad. */}
      {descuentaEsEditable(causal) ? (
        <div className="space-y-1.5 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="falta-descuenta">Se descuenta del sueldo</Label>
            <Switch id="falta-descuenta" checked={descuenta} onCheckedChange={setDescuenta} />
          </div>
          <p className="text-xs text-muted-foreground">
            El subsidio de BPS cubre desde el 4° día. Desactivá esta opción si vas a pagar los
            días a tu cargo.
          </p>
        </div>
      ) : null}

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
