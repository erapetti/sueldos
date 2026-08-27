'use client'

/**
 * §4.3, §4.3.1, §4.4, §4.4.1 y §5.3 — alta de un nuevo registro de serie, siempre con el
 * `<SelectorVigencia>`.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SelectorVigencia, vigenciaPorDefecto } from '@/components/dominio/SelectorVigencia'
import { CampoMonto } from '@/components/dominio/CampoMonto'
import { useAccion } from '@/hooks/useAccion'
import {
  registrarAporteBps,
  registrarRegimen,
  registrarSalario,
  registrarValorHoraNegro,
} from '@/actions/series'
import { SEGUROS_SALUD } from '@/constants/segurosSalud'
import { NOMBRES_DIAS_CORTOS } from '@/lib/format/dates'

type Tipo = 'SALARIO' | 'VALOR_HORA_NEGRO' | 'APORTE_BPS' | 'REGIMEN'

const TITULOS: Record<Tipo, string> = {
  SALARIO: 'Nuevo salario',
  VALOR_HORA_NEGRO: 'Nuevo valor hora sin aportes',
  APORTE_BPS: 'Nuevo aporte a BPS',
  REGIMEN: 'Nuevo régimen horario',
}

const SIN_SEGURO = 'ninguno'

export function FormularioSeries({
  tipo,
  empleadoId,
  onGuardado,
}: {
  tipo: Tipo
  empleadoId: string
  onGuardado: () => void
}) {
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [abierto, setAbierto] = useState(false)
  const [fechaVigencia, setFechaVigencia] = useState(vigenciaPorDefecto())
  const [reemplazar, setReemplazar] = useState(false)

  const [salario, setSalario] = useState('')
  const [horasSemanales, setHorasSemanales] = useState('')
  const [valor, setValor] = useState('')
  const [aportaBps, setAportaBps] = useState(true)
  const [seguroSalud, setSeguroSalud] = useState(SIN_SEGURO)
  const [dias, setDias] = useState<string[]>(['', '', '', '', '', '', ''])

  function guardar() {
    const comun = { empleadoId, fechaVigencia, reemplazar }

    const accion =
      tipo === 'SALARIO'
        ? () =>
            registrarSalario({
              ...comun,
              salario,
              horasSemanales: Number(horasSemanales.replace(',', '.')),
            })
        : tipo === 'VALOR_HORA_NEGRO'
          ? () => registrarValorHoraNegro({ ...comun, valor })
          : tipo === 'APORTE_BPS'
            ? () =>
                registrarAporteBps({
                  ...comun,
                  aportaBps,
                  seguroSalud: seguroSalud === SIN_SEGURO ? null : seguroSalud,
                })
            : () =>
                registrarRegimen({
                  ...comun,
                  lunes: Number(dias[0] || 0),
                  martes: Number(dias[1] || 0),
                  miercoles: Number(dias[2] || 0),
                  jueves: Number(dias[3] || 0),
                  viernes: Number(dias[4] || 0),
                  sabado: Number(dias[5] || 0),
                  domingo: Number(dias[6] || 0),
                })

    ejecutar(accion, {
      exito: 'Registro guardado.',
      duracionAviso: 14_000,
      onExito: () => {
        setAbierto(false)
        setReemplazar(false)
        onGuardado()
      },
    })
  }

  if (!abierto) {
    return (
      <Button variant="outline" onClick={() => setAbierto(true)}>
        {TITULOS[tipo]}
      </Button>
    )
  }

  const sumaRegimen = dias.reduce((a, d) => a + Number(d || 0), 0)

  return (
    <div className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
      <h3 className="font-medium">{TITULOS[tipo]}</h3>

      {tipo === 'SALARIO' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoMonto
            id="serie-salario"
            etiqueta="Salario mensual nominal"
            valor={salario}
            onChange={setSalario}
            error={campos.salario}
            disabled={enviando}
          />
          <div className="space-y-1.5">
            <Label htmlFor="serie-horas">Horas semanales</Label>
            <Input
              id="serie-horas"
              value={horasSemanales}
              onChange={(e) => setHorasSemanales(e.target.value)}
              inputMode="decimal"
              disabled={enviando}
              className="tabular"
            />
            {campos.horasSemanales ? (
              <p className="text-sm text-destructive">{campos.horasSemanales}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tipo === 'VALOR_HORA_NEGRO' ? (
        <CampoMonto
          id="serie-vhn"
          etiqueta="Valor hora"
          valor={valor}
          onChange={setValor}
          error={campos.valor}
          disabled={enviando}
        />
      ) : null}

      {/*
        §4.4.1 — el aporte y el seguro se cargan juntos porque son un solo registro: el seguro
        solo tiene efecto si se aporta (§4.2), así que con el switch apagado se deshabilita.
      */}
      {tipo === 'APORTE_BPS' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="serie-aporta-bps">Aporta BPS</Label>
              <p className="text-sm text-muted-foreground">
                Si se apaga, no se le aplica ningún descuento de BPS desde ese mes.
              </p>
            </div>
            <Switch
              id="serie-aporta-bps"
              checked={aportaBps}
              onCheckedChange={setAportaBps}
              disabled={enviando}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie-seguro-salud">Seguro de salud</Label>
            <Select
              value={seguroSalud}
              onValueChange={setSeguroSalud}
              disabled={enviando || !aportaBps}
            >
              <SelectTrigger id="serie-seguro-salud">
                <SelectValue placeholder="Sin seguro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_SEGURO}>Sin seguro</SelectItem>
                {SEGUROS_SALUD.map((s) => (
                  <SelectItem key={s.codigo} value={s.codigo}>
                    {s.codigo} — {s.descripcion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!aportaBps ? (
              <p className="text-sm text-muted-foreground">
                Sin aporte al BPS el seguro de salud no tiene efecto.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tipo === 'REGIMEN' ? (
        <div className="space-y-2">
          <Label>Horas por día</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {NOMBRES_DIAS_CORTOS.map((nombre, i) => (
              <div key={nombre} className="space-y-1">
                <Label htmlFor={`dia-${i}`} className="text-xs text-muted-foreground">
                  {nombre}
                </Label>
                <Input
                  id={`dia-${i}`}
                  value={dias[i]}
                  onChange={(e) =>
                    setDias((previos) => previos.map((d, j) => (j === i ? e.target.value : d)))
                  }
                  inputMode="decimal"
                  disabled={enviando}
                  className="tabular"
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Suma: <span className="font-medium tabular">{sumaRegimen} h</span>. Tiene que coincidir
            con las horas semanales del salario vigente a esa fecha.
          </p>
        </div>
      ) : null}

      <SelectorVigencia
        valor={fechaVigencia}
        onChange={setFechaVigencia}
        disabled={enviando}
      />

      {campos._ ? <p className="text-sm text-destructive">{campos._}</p> : null}

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={reemplazar}
          onChange={(e) => setReemplazar(e.target.checked)}
          disabled={enviando}
        />
        Reemplazar si ya existe un valor vigente desde ese mes
      </label>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
