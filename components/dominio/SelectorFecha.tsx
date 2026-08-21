'use client'

/**
 * §8.6 — `<SelectorFecha>`: **toda** fecha del sistema se ingresa con un calendario, nunca
 * con campos separados de día / mes / año.
 *
 * El día de la semana es un dato de negocio —determina si el empleado trabaja ese día, si la
 * hora extra genera boletos adicionales (§6.5) y cuántas horas puede tener una falta (§4.6)—
 * y se pierde en un ingreso numérico.
 */
import { useMemo, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { aISO, formatearFecha, parseFechaISO } from '@/lib/format/dates'

export type DiaDestacado = {
  /** Fecha en formato `AAAA-MM-DD`. */
  fecha: string
  descripcion: string
}

export type SelectorFechaProps = {
  /** Fecha seleccionada, en formato `AAAA-MM-DD`. */
  valor: string | null
  onChange: (valorISO: string | null) => void
  /** Límite inferior inclusive (`AAAA-MM-DD`); típicamente la fecha de ingreso (§6.11). */
  minimo?: string | null
  /** Límite superior inclusive; típicamente hoy (§6.11). */
  maximo?: string | null
  /** Feriados a resaltar, con su nombre en el tooltip. */
  feriados?: DiaDestacado[]
  /** Días de la semana sin horas en el régimen vigente (lunes = 0 … domingo = 6). */
  diasSinHoras?: number[]
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/** Convierte `dd/mm/aaaa` a `AAAA-MM-DD`, o null si todavía no está completo. */
function desdeTexto(texto: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim())
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const anio = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

  const f = new Date(Date.UTC(anio, mes - 1, dia))
  // Rechaza fechas que se desbordan, como el 31/02.
  if (f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null
  return aISO(f)
}

/** El `Calendar` de shadcn trabaja con fechas locales; se traduce en el borde. */
function aLocal(iso: string): Date {
  const f = parseFechaISO(iso)
  return new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())
}

function desdeLocal(f: Date): string {
  return aISO(new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())))
}

export function SelectorFecha({
  valor,
  onChange,
  minimo,
  maximo,
  feriados = [],
  diasSinHoras = [],
  id,
  placeholder = 'dd/mm/aaaa',
  disabled,
  className,
  'aria-label': ariaLabel,
}: SelectorFechaProps) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(() => (valor ? formatearFecha(parseFechaISO(valor)) : ''))

  // El texto es estado derivado del valor: cuando el valor cambia desde afuera hay que
  // reescribirlo. Se ajusta durante el render comparando contra el valor anterior, que es
  // el patrón que React recomienda en lugar de un efecto.
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    setTexto(valor ? formatearFecha(parseFechaISO(valor)) : '')
  }

  const porFecha = useMemo(
    () => new Map(feriados.map((f) => [f.fecha, f.descripcion])),
    [feriados],
  )

  const seleccionada = valor ? aLocal(valor) : undefined

  // §8.6 — los días fuera de rango se **deshabilitan**, en vez de rechazarse al guardar.
  const deshabilitados = useMemo(() => {
    const reglas: ({ before: Date } | { after: Date })[] = []
    if (minimo) reglas.push({ before: aLocal(minimo) })
    if (maximo) reglas.push({ after: aLocal(maximo) })
    return reglas
  }, [minimo, maximo])

  const modificadores = useMemo(
    () => ({
      feriado: (dia: Date) => porFecha.has(desdeLocal(dia)),
      // `getDay()` da domingo = 0; el régimen se indexa con lunes = 0.
      sinHoras: (dia: Date) => diasSinHoras.includes((dia.getDay() + 6) % 7),
    }),
    [porFecha, diasSinHoras],
  )

  function alTipear(nuevo: string) {
    setTexto(nuevo)
    // El calendario se sincroniza mientras se escribe.
    const iso = desdeTexto(nuevo)
    if (iso) onChange(iso)
    else if (nuevo.trim() === '') onChange(null)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        id={id}
        value={texto}
        onChange={(e) => alTipear(e.target.value)}
        onBlur={() => setTexto(valor ? formatearFecha(parseFechaISO(valor)) : '')}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel ?? 'Fecha'}
        className="tabular"
      />

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="Abrir el calendario"
            className="shrink-0"
          >
            <CalendarIcon className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={seleccionada}
            defaultMonth={seleccionada}
            onSelect={(dia) => {
              if (!dia) return
              onChange(desdeLocal(dia))
              setAbierto(false)
            }}
            disabled={deshabilitados}
            modifiers={modificadores}
            modifiersClassNames={{
              feriado: 'text-destructive font-semibold',
              sinHoras: 'text-muted-foreground/60',
            }}
            // §8.6 — la semana empieza en lunes.
            weekStartsOn={1}
            showOutsideDays={false}
            autoFocus
          />
          {porFecha.has(valor ?? '') ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Feriado: {porFecha.get(valor!)}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
