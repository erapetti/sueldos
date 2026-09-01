'use client'

/**
 * §7.1 — planilla mensual de horas extras.
 *
 * El recargo y el switch de BPS son persistentes entre cargas: el día siguiente arranca con
 * los mismos valores que el anterior.
 *
 * §6.6 — la marca «con BPS» tiene sentido propio (decide el valor hora y en qué paso del
 * cálculo entra), pero para una empleada que **no aporta** ese mes es un dato inconsistente:
 * el motor la pagaría al valor hora calculado y la dejaría en la tabla informal, y la
 * liquidación mostraría dos líneas de horas extras con «con BPS» para alguien sin aportes.
 * Por decisión del dueño del proyecto no se arregla en la presentación sino **en el ingreso**:
 * el interruptor queda apagado y deshabilitado, y el servidor fuerza lo mismo.
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
  COL_INTERRUPTOR,
  COL_HORAS,
  COL_OPCION,
  PlanillaMensual,
  type DiaContexto,
  type Renglon,
} from '@/components/dominio/PlanillaMensual'
import type { ListadoDePersonal } from '@/constants/listados'
import { useAccion } from '@/hooks/useAccion'
import { guardarHorasExtras } from '@/actions/novedades'
import { RECARGOS } from '@/constants/recargos'
import {
  formatearHoras,
  formatearImporte,
  formatearImporteEntero,
  todosEnteros,
} from '@/lib/format/money'
import { formatearFecha, parseFechaISO } from '@/lib/format/dates'

type Extra = { conBps: boolean; recargoPct: number }

function extra(renglon: Renglon): Extra {
  return renglon.extra as Extra
}

export function PlanillaHorasExtras(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  listadoDeOrigen: ListadoDePersonal
  periodo: string
  dias: DiaContexto[]
  guardados: Renglon[]
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  valorHoraCalculado: string | null
  valorHoraNegro: string | null
  /** §4.4.1 — el aporte vigente **en este mes**. `null` es «no hay registro». */
  aportaBps: boolean | null
  /** §6.4 — si no cobra boletos, no hay boletos que anunciar en el pie. */
  cobraBoletos: boolean
  soloLectura: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<{ guardados: number; borrados: number }>()

  /**
   * Solo se bloquea cuando se sabe que no aporta. Sin registro de aporte (`null`) no se
   * adivina: ese mes no se puede liquidar igual (§6.8), y el bloqueo no arreglaría nada.
   */
  const bpsEditable = props.aportaBps !== false

  // Persistentes entre cargas (§7.1).
  const [recargo, setRecargo] = useState(100)
  const [conBps, setConBps] = useState(bpsEditable)

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

  /**
   * Los totales de lo cargado en la sesión, y **el formato de los importes de toda la
   * pantalla**. Lo usan el encabezado y el pie, que hasta ahora calculaban por su cuenta.
   *
   * Los decimales siguen el criterio del §1.3: si ningún importe de la pantalla tiene
   * centavos no se muestran, y si alguno los tiene se muestran en todos, para que no queden
   * dos formatos a la vista. Por eso entran en la misma decisión los dos valores hora —que
   * son datos fijos del mes— y los dos totales, que cambian mientras se carga: 2,5 h a $395
   * dan $987,50 y ponen centavos también arriba.
   */
  function totalesDeLaSesion(renglones: Renglon[]) {
    // Con el interruptor bloqueado no hay renglones con BPS, ni siquiera los viejos que
    // quedaron con la marca puesta: el guardado los normaliza (§6.6).
    const conBpsDe = (renglon: Renglon) => bpsEditable && extra(renglon).conBps
    const horas = (soloConBps: boolean) =>
      renglones
        .filter((r) => conBpsDe(r) === soloConBps)
        .reduce((a, r) => a.plus(r.horas), new Decimal(0))

    const vhc = props.valorHoraCalculado ? new Decimal(props.valorHoraCalculado) : null
    const vhn = props.valorHoraNegro ? new Decimal(props.valorHoraNegro) : null

    const importeDe = (soloConBps: boolean, valorHora: Decimal | null) =>
      valorHora === null
        ? null
        : renglones
            .filter((r) => conBpsDe(r) === soloConBps)
            .reduce(
              (a, r) =>
                a.plus(new Decimal(r.horas).times(valorHora).times(1 + extra(r).recargoPct / 100)),
              new Decimal(0),
            )

    const conBpsImporte = importeDe(true, vhc)
    const sinBpsImporte = importeDe(false, vhn)

    return {
      conBpsHoras: horas(true),
      sinBpsHoras: horas(false),
      conBpsImporte,
      sinBpsImporte,
      importe: todosEnteros([vhc, vhn, conBpsImporte, sinBpsImporte])
        ? formatearImporteEntero
        : formatearImporte,
    }
  }

  return (
    <PlanillaMensual
      empleadoId={props.empleadoId}
      alias={props.alias}
      nombreCompleto={props.nombreCompleto}
      listadoDeOrigen={props.listadoDeOrigen}
      periodo={props.periodo}
      ruta={`/empleados/${props.empleadoId}/horas-extras`}
      claveMenu="horas-extras"
      titulo="Horas extras"
      dias={props.dias}
      guardados={props.guardados}
      estadoLiquidacion={props.estadoLiquidacion}
      enviando={enviando}
      soloLectura={props.soloLectura}
      onGuardar={alGuardar}
      encabezado={(renglones) => {
        const { importe } = totalesDeLaSesion(renglones)
        return (
          <span>
            Valor hora calculado:{' '}
            <strong>
              {props.valorHoraCalculado ? importe(props.valorHoraCalculado) : '—'}
            </strong>
            {' · '}
            Valor hora sin aportes:{' '}
            <strong>{props.valorHoraNegro ? importe(props.valorHoraNegro) : '—'}</strong>
          </span>
        )
      }}
      signo="+"
      aportaBps={props.aportaBps}
      // La excepción es la hora extra que no lleva descuento de BPS.
      esPlena={(renglon) => bpsEditable && extra(renglon).conBps}
      // §6.5 — el renglón en cero no paga nada: incluye el día en el pago de boletos.
      admiteCero
      confirmacionAlGuardar={(renglones) =>
        renglones.some((r) => r.horas === 0)
          ? 'Los registros de cero horas extra se usan solo para incluir el día en el pago de boletos.'
          : null
      }
      renderPopover={({ fecha, contexto, renglones, agregar, quitar, cerrar }) => (
        <PopoverHoras
          fecha={fecha}
          contexto={contexto}
          renglones={renglones}
          recargo={recargo}
          conBps={bpsEditable && conBps}
          bpsEditable={bpsEditable}
          setRecargo={setRecargo}
          setConBps={setConBps}
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
          <CampoLista etiqueta="Horas extra">
            <CampoNumero
              valor={renglon.horas}
              onValor={(n) => actualizar({ horas: n })}
              // §6.5 — el cero es válido acá: marca el día para el boleto.
              aceptar={(n) => n >= 0}
              step={0.5}
              min={0}
              className={cn('w-full', COL_HORAS)}
              aria-label="Horas"
            />
          </CampoLista>
          <CampoLista etiqueta="Recargo">
            <select
              value={extra(renglon).recargoPct}
              onChange={(e) => {
                const nuevo = Number(e.target.value)
                // §7.1 — el recargo es persistente entre cargas: lo que se elige acá es con
                // lo que nace el próximo «Agregar renglón».
                setRecargo(nuevo)
                actualizar({ extra: { ...extra(renglon), recargoPct: nuevo } })
              }}
              aria-label="Recargo"
              className={cn('h-9 w-full rounded-md border bg-transparent px-2 text-sm', COL_OPCION)}
            >
              {RECARGOS.map((r) => (
                <option key={r} value={r}>
                  {r} %
                </option>
              ))}
            </select>
          </CampoLista>
          <CampoLista etiqueta="BPS">
            <div className={cn('flex min-h-9 items-center', COL_INTERRUPTOR)}>
              <Switch
                // Se muestra apagado y no con lo que hay guardado: es lo que va a quedar
                // grabado cuando se guarde, y un renglón viejo con la marca puesta se
                // normaliza en ese mismo guardado.
                checked={bpsEditable && extra(renglon).conBps}
                disabled={!bpsEditable}
                onCheckedChange={(v) => {
                  setConBps(v)
                  actualizar({ extra: { ...extra(renglon), conBps: v } })
                }}
                aria-label="Lleva descuento BPS"
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
      etiquetaEntrada="Horas extra"
      etiquetaOpcion="Recargo"
      etiquetaInterruptor="BPS"
      extraNuevoRenglon={() => ({ conBps: bpsEditable && conBps, recargoPct: recargo })}
      renderResumen={(renglones) => {
        const { conBpsHoras, sinBpsHoras, conBpsImporte, sinBpsImporte, importe } =
          totalesDeLaSesion(renglones)

        /*
          §6.5 — días con horas extras en un día que **no era de trabajo**: o el régimen no le
          da horas, o es feriado no laborable. Es el mismo criterio que `noEraDiaDeTrabajo` en
          `lib/calculo/boletos.ts`, y tiene que serlo: mirando solo el régimen, el feriado que
          cae en un día con horas quedaba afuera y el pie anunciaba **de menos** boletos que
          los que la liquidación después paga.

          El feriado **laborable** —Carnaval, Turismo— no entra: ese día se trabaja
          normalmente, así que sus horas extras no agregan ningún viaje.

          Solo cuentan si la empleada cobra boletos ese mes (§6.4): sin eso el pie anunciaba
          boletos que la liquidación después no emite, y con una empleada sin régimen los
          anunciaba **todos los días**, porque para ella no hay ninguno con horas.
        */
        const noEraDiaDeTrabajo = new Set(
          props.dias
            .filter((d) => d.horasRegimen <= 0 || d.feriadoNoLaborable)
            .map((d) => d.fecha),
        )
        const boletosExtra = props.cobraBoletos
          ? new Set(renglones.filter((r) => noEraDiaDeTrabajo.has(r.fecha)).map((r) => r.fecha))
              .size
          : 0

        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {renglones.length} renglones · {formatearHoras(conBpsHoras.plus(sinBpsHoras))}
            </span>
            {/*
              Partir el total en «con BPS» y «sin BPS» solo dice algo cuando puede haber de
              los dos. Sin aporte ese mes son todas sin BPS, así que va un importe solo.
            */}
            {bpsEditable ? (
              <>
                <span className="text-muted-foreground">
                  Con BPS {formatearHoras(conBpsHoras)}
                  {conBpsImporte ? ` (${importe(conBpsImporte)})` : ''}
                </span>
                <span className="text-muted-foreground">
                  Sin BPS {formatearHoras(sinBpsHoras)}
                  {sinBpsImporte ? ` (${importe(sinBpsImporte)})` : ''}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Sin aportes al BPS este mes
                {sinBpsImporte ? ` (${importe(sinBpsImporte)})` : ''}
              </span>
            )}
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
  bpsEditable,
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
  bpsEditable: boolean
  setRecargo: (v: number) => void
  setConBps: (v: boolean) => void
  agregar: (r: Omit<Renglon, 'clave' | 'fecha'>) => void
  quitar: (clave: string) => void
  cerrar: () => void
}) {
  const [horas, setHoras] = useState('')
  const [nota, setNota] = useState('')

  // Mientras no haya horas válidas el «Agregar» queda deshabilitado, en vez de habilitado
  // y sin efecto: acá el campo arranca vacío siempre. El cero sí es válido (§6.5).
  const horasValidas = horasTipeadas(horas, true)

  function confirmar() {
    if (horasValidas === null) return
    agregar({ horas: horasValidas, nota, extra: { conBps, recargoPct: recargo } })
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="he-bps">¿Lleva descuento BPS?</Label>
          <Switch
            id="he-bps"
            checked={conBps}
            disabled={!bpsEditable}
            onCheckedChange={setConBps}
          />
        </div>
        {!bpsEditable ? (
          <p className="text-xs text-muted-foreground">
            Este mes la empleada no aporta al BPS: sus horas extras se pagan al valor hora sin
            aportes.
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
