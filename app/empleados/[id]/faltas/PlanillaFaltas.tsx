'use client'

/**
 * §7.2 — planilla mensual de inasistencias.
 *
 * Misma base que §7.1. Cambia el popover del día: horas con el tope precargado y botón "día
 * completo", causal y el interruptor "Descontar horas", que se muestra siempre y solo se
 * puede mover en las causales que no lo fijan (§4.6.1). El calendario permite arrastrar o
 * hacer shift+clic para cargar un rango.
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
import {
  CampoDia,
  CampoLista,
  CampoNumero,
  COL_ANGOSTA,
  horasTipeadas,
  COL_HORAS,
  COL_INTERRUPTOR,
  COL_OPCION,
  PlanillaMensual,
  type DiaContexto, type Renglon
} from '@/components/dominio/PlanillaMensual'
import { useAccion } from '@/hooks/useAccion'
import { guardarFaltas } from '@/actions/novedades'
import {
  CAUSALES_FALTA,
  descuentaEsEditable,
  descuentaInicial,
  etiquetaCausal,
  normalizarDescuenta,
  type CausalFaltaValor,
} from '@/constants/causales'
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
      claveMenu="faltas"
      titulo="Inasistencias"
      dias={props.dias}
      guardados={props.guardados}
      estadoLiquidacion={props.estadoLiquidacion}
      enviando={enviando}
      soloLectura={props.soloLectura}
      onGuardar={alGuardar}
      encabezado={
        <span>
          Las inasistencias registradas pueden descontar horas no trabajadas del régimen base y
          pueden descontar boletos.
        </span>
      }
      signo="−"
      // §4.6.1 — la excepción es la falta que NO se descuenta del sueldo.
      esPlena={(renglon) => extra(renglon).descuenta}
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
          <CampoLista etiqueta="Día">
            <CampoDia valor={renglon.fecha} onChange={(iso) => actualizar({ fecha: iso })} />
          </CampoLista>
          <CampoLista etiqueta="Horas">
            <span className={cn('flex min-h-9 items-center text-sm tabular', COL_ANGOSTA)}>
              {contexto ? `${contexto.horasRegimen} h` : '—'}
            </span>
          </CampoLista>
          <CampoLista etiqueta="Horas falta">
            <CampoNumero
              valor={renglon.horas}
              onValor={(n) => actualizar({ horas: n })}
              // El tope contra el régimen no se exige acá: lo valida el servidor (§4.6), y
              // exigirlo mientras se tipea bloquearía el primer dígito de un valor de dos.
              aceptar={(n) => n > 0}
              step={0.5}
              min={0}
              max={contexto?.horasRegimen || undefined}
              className={cn('w-full', COL_HORAS)}
              aria-label="Horas"
            />
          </CampoLista>
          <CampoLista etiqueta="Causal">
            <select
              value={extra(renglon).causal}
              onChange={(e) => {
                const nueva = e.target.value as CausalFaltaValor
                // §7.1 — los opcionales son persistentes entre cargas: lo que se elige acá
                // es con lo que nace el próximo «Agregar renglón».
                setCausal(nueva)
                // Cambiar de causal reinicia el interruptor: cada causal tiene su valor de
                // arranque y se pierde el que hubiera puesto a mano.
                setDescuenta(descuentaInicial(nueva))
                actualizar({ extra: { causal: nueva, descuenta: descuentaInicial(nueva) } })
              }}
              aria-label="Causal"
              className={cn('h-9 w-full rounded-md border bg-transparent px-2 text-sm', COL_OPCION)}
            >
              {CAUSALES_FALTA.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </CampoLista>
          {/*
            El interruptor se muestra en todos los renglones, deshabilitado donde la causal
            fija el valor, para que el efecto de la causal se lea sin tener que recordarlo.
          */}
          <CampoLista etiqueta="Descontar horas">
            <div className={cn('flex min-h-9 items-center', COL_INTERRUPTOR)}>
              <Switch
                checked={extra(renglon).descuenta}
                disabled={!descuentaEsEditable(extra(renglon).causal)}
                onCheckedChange={(v) => {
                  setDescuenta(v)
                  actualizar({ extra: { ...extra(renglon), descuenta: v } })
                }}
                aria-label="Descontar horas del sueldo"
              />
            </div>
          </CampoLista>
          <Button
            variant="ghost"
            size="icon"
            onClick={quitar}
            aria-label="Quitar el renglón"
            className="w-full justify-start sm:w-9 sm:justify-center"
          >
            <Trash2 className="size-4" />
            <span className="sm:hidden">Quitar el renglón</span>
          </Button>
        </>
      )}
      etiquetaEntrada="Horas falta"
      etiquetaOpcion="Causal"
      etiquetaInterruptor="Descontar horas"
      extraNuevoRenglon={() => ({
        causal,
        // §4.6.1 — fuera de ENFERMEDAD lo fija la causal, no el cliente.
        descuenta: normalizarDescuenta(causal, descuenta),
      })}
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

  // Mientras no haya horas válidas el «Agregar» queda deshabilitado, en vez de habilitado
  // y sin efecto. Pasa con los días que no se trabajan, que arrancan con el campo vacío.
  const horasValidas = horasTipeadas(horas)

  function confirmar() {
    if (horasValidas === null) return
    agregar({
      horas: horasValidas,
      nota,
      // §4.6.1 — el servidor vuelve a forzarlo; acá se refleja para que la UI no mienta.
      extra: { causal, descuenta: normalizarDescuenta(causal, descuenta) },
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
          onChange={(e) => {
            const nueva = e.target.value as CausalFaltaValor
            setCausal(nueva)
            setDescuenta(descuentaInicial(nueva))
          }}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        >
          {CAUSALES_FALTA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {/* Igual que en la lista rápida: se muestra siempre, deshabilitado donde lo fija la causal. */}
      <div className="space-y-1.5 rounded-md border p-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="falta-descuenta">Descontar horas</Label>
          <Switch
            id="falta-descuenta"
            checked={descuenta}
            disabled={!descuentaEsEditable(causal)}
            onCheckedChange={setDescuenta}
          />
        </div>
        {causal === 'ENFERMEDAD' ? (
          <p className="text-xs text-muted-foreground">
            El subsidio de BPS cubre desde el 4° día. Desactivá esta opción si vas a pagar los
            días a tu cargo.
          </p>
        ) : null}
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
        <Button size="sm" onClick={confirmar} disabled={horasValidas === null}>
          Agregar
        </Button>
      </div>
    </div>
  )
}
