'use client'

/**
 * §5.3 — `<SelectorVigencia>`: al dar de alta cualquier registro de serie, el usuario elige
 * explícitamente desde qué mes rige.
 *
 * Su granularidad es mensual (§8.6): nunca se pide un día en una fecha de vigencia.
 */
import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  aISO,
  formatearPeriodoCapitalizado,
  hoy,
  NOMBRES_MESES,
  parseFechaISO,
  primerDiaDelMes,
  sumarMeses,
} from '@/lib/format/dates'

export type OpcionVigencia = 'ESTE_MES' | 'MES_SIGUIENTE' | 'OTRO'

export type SelectorVigenciaProps = {
  /** Fecha de vigencia elegida, siempre el día 1 de un mes (`AAAA-MM-01`). */
  valor: string
  onChange: (valorISO: string) => void
  disabled?: boolean
  className?: string
  /** Aviso a mostrar debajo, típicamente el de liquidaciones ya confirmadas (§5.3). */
  aviso?: string | null
}

const ANIOS_HACIA_ATRAS = 3
const ANIOS_HACIA_ADELANTE = 2

export function SelectorVigencia({
  valor,
  onChange,
  disabled,
  className,
  aviso,
}: SelectorVigenciaProps) {
  const esteMes = useMemo(() => aISO(primerDiaDelMes(hoy())), [])
  const mesSiguiente = useMemo(() => aISO(sumarMeses(primerDiaDelMes(hoy()), 1)), [])

  /**
   * La opción elegida no se puede derivar del valor: "Otro mes" puede coincidir con el mes
   * siguiente y el radio se volvería a mover solo. Se guarda aparte y solo se recalcula
   * cuando el valor cambia desde afuera.
   */
  const [opcion, setOpcion] = useState<OpcionVigencia>(() =>
    valor === esteMes ? 'ESTE_MES' : valor === mesSiguiente ? 'MES_SIGUIENTE' : 'OTRO',
  )

  const elegido = parseFechaISO(valor)
  const anioActual = hoy().getUTCFullYear()

  const anios = useMemo(() => {
    const lista: number[] = []
    for (let a = anioActual - ANIOS_HACIA_ATRAS; a <= anioActual + ANIOS_HACIA_ADELANTE; a += 1) {
      lista.push(a)
    }
    // Si el valor elegido cae fuera del rango, se agrega igual para no perderlo.
    if (!lista.includes(elegido.getUTCFullYear())) lista.push(elegido.getUTCFullYear())
    return lista.sort((a, b) => a - b)
  }, [anioActual, elegido])

  function cambiarOpcion(nueva: string) {
    setOpcion(nueva as OpcionVigencia)
    if (nueva === 'ESTE_MES') onChange(esteMes)
    else if (nueva === 'MES_SIGUIENTE') onChange(mesSiguiente)
    // Al pasar a "Otro mes" se conserva el valor actual como punto de partida.
  }

  function cambiarMes(mes: string) {
    onChange(aISO(new Date(Date.UTC(elegido.getUTCFullYear(), Number(mes) - 1, 1))))
  }

  function cambiarAnio(anio: string) {
    onChange(aISO(new Date(Date.UTC(Number(anio), elegido.getUTCMonth(), 1))))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Label>¿Desde qué mes rige?</Label>

      <RadioGroup
        value={opcion}
        onValueChange={cambiarOpcion}
        disabled={disabled}
        className="gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="ESTE_MES" id="vigencia-este-mes" />
          <Label htmlFor="vigencia-este-mes" className="font-normal">
            Este mes ({formatearPeriodoCapitalizado(parseFechaISO(esteMes))})
            <span className="ml-1 text-muted-foreground">— impacta la liquidación de este mes</span>
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <RadioGroupItem value="MES_SIGUIENTE" id="vigencia-mes-siguiente" />
          <Label htmlFor="vigencia-mes-siguiente" className="font-normal">
            Mes siguiente ({formatearPeriodoCapitalizado(parseFechaISO(mesSiguiente))})
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <RadioGroupItem value="OTRO" id="vigencia-otro" />
          <Label htmlFor="vigencia-otro" className="font-normal">
            Otro mes
          </Label>
        </div>
      </RadioGroup>

      {opcion === 'OTRO' ? (
        <div className="flex gap-2 pl-6">
          <Select
            value={String(elegido.getUTCMonth() + 1)}
            onValueChange={cambiarMes}
            disabled={disabled}
          >
            <SelectTrigger className="w-40" aria-label="Mes de vigencia">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOMBRES_MESES.map((nombre, i) => (
                <SelectItem key={nombre} value={String(i + 1)}>
                  {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(elegido.getUTCFullYear())}
            onValueChange={cambiarAnio}
            disabled={disabled}
          >
            <SelectTrigger className="w-28" aria-label="Año de vigencia">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anios.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {aviso ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {aviso}
        </p>
      ) : null}
    </div>
  )
}

/** Valor por defecto del selector: el mes siguiente (§5.3). */
export function vigenciaPorDefecto(): string {
  return aISO(sumarMeses(primerDiaDelMes(hoy()), 1))
}
