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
  registrarCobraBoletos,
  registrarRegimen,
  registrarSalario,
  registrarValorHoraNegro,
} from '@/actions/series'
import { SEGUROS_SALUD } from '@/constants/segurosSalud'
import { NOMBRES_DIAS_CORTOS } from '@/lib/format/dates'

type Tipo = 'SALARIO' | 'VALOR_HORA_NEGRO' | 'APORTE_BPS' | 'COBRA_BOLETOS' | 'REGIMEN'

const TITULOS: Record<Tipo, string> = {
  SALARIO: 'Nuevo salario',
  VALOR_HORA_NEGRO: 'Nuevo valor hora sin aportes',
  APORTE_BPS: 'Nuevo aporte a BPS',
  COBRA_BOLETOS: 'Nuevo «cobra boletos»',
  REGIMEN: 'Nuevo régimen horario',
}

const SIN_SEGURO = 'ninguno'

/** Lo que las dos series que se condicionan necesitan de la otra, resuelto por vigencia. */
type VigenciaDeRegimen = { fechaVigenciaISO: string; total: string }
type VigenciaDeAporte = { fechaVigenciaISO: string; aportaBps: boolean }

/**
 * §5.2 — el registro vigente para ese mes. Para un mes anterior a toda la serie devuelve el
 * más antiguo, igual que el servidor. Las vigencias son `AAAA-MM-01`, así que comparan como
 * texto.
 */
function vigenteA<T extends { fechaVigenciaISO: string }>(
  serie: readonly T[],
  fechaVigencia: string,
): T | null {
  if (serie.length === 0) return null
  const ordenada = [...serie].sort((a, b) => a.fechaVigenciaISO.localeCompare(b.fechaVigenciaISO))
  const anteriores = ordenada.filter((r) => r.fechaVigenciaISO <= fechaVigencia)
  return anteriores.at(-1) ?? ordenada[0]
}

export function FormularioSeries({
  tipo,
  empleadoId,
  regimenes = [],
  aportesBps = [],
  onGuardado,
}: {
  tipo: Tipo
  empleadoId: string
  /** Solo las usan `APORTE_BPS` y `REGIMEN`, que son las dos series que se condicionan. */
  regimenes?: readonly VigenciaDeRegimen[]
  aportesBps?: readonly VigenciaDeAporte[]
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
  const [cobraBoletos, setCobraBoletos] = useState(true)
  const [seguroSalud, setSeguroSalud] = useState(SIN_SEGURO)
  const [dias, setDias] = useState<string[]>(['', '', '', '', '', '', ''])

  const sumaRegimen = dias.reduce((a, d) => a + Number(d || 0), 0)

  /**
   * **Aportar al BPS exige un régimen con horas.** Con el régimen vigente a esa fecha en cero
   * el interruptor se muestra apagado y deshabilitado —la mecánica del §1.7.4—, para que se
   * lea el efecto; al cargarle un régimen con horas se habilita solo.
   *
   * Es una ayuda de la pantalla y se resuelve al mes de la vigencia elegida. El control está
   * en `actions/series.ts`, que además mira los meses siguientes: apagar el aporte desde el
   * mes que viene no habilita un régimen vacío este mes (§1.7.3).
   */
  const regimenVigente = vigenteA(regimenes, fechaVigencia)
  const sinRegimen = regimenVigente !== null && Number(regimenVigente.total) === 0

  const aporteVigente = vigenteA(aportesBps, fechaVigencia)
  const sumaEnCero = sumaRegimen === 0
  const regimenChocaConElAporte = sumaEnCero && (aporteVigente?.aportaBps ?? false)

  const aportaBpsEfectivo = sinRegimen ? false : aportaBps

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
                  aportaBps: aportaBpsEfectivo,
                  seguroSalud: seguroSalud === SIN_SEGURO ? null : seguroSalud,
                })
            : tipo === 'COBRA_BOLETOS'
              ? () => registrarCobraBoletos({ ...comun, cobraBoletos })
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
                {sinRegimen
                  ? 'El régimen horario vigente desde ese mes no tiene horas, así que no puede aportar. Cargale un régimen con horas y se habilita.'
                  : 'Si se apaga, no se le aplica ningún descuento de BPS desde ese mes.'}
              </p>
            </div>
            <Switch
              id="serie-aporta-bps"
              checked={aportaBpsEfectivo}
              onCheckedChange={setAportaBps}
              disabled={enviando || sinRegimen}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie-seguro-salud">Seguro de salud</Label>
            <Select
              value={seguroSalud}
              onValueChange={setSeguroSalud}
              disabled={enviando || !aportaBpsEfectivo}
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
            {!aportaBpsEfectivo ? (
              <p className="text-sm text-muted-foreground">
                Sin aporte al BPS el seguro de salud no tiene efecto.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tipo === 'COBRA_BOLETOS' ? (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="serie-cobra-boletos">Cobra boletos</Label>
            <p className="text-sm text-muted-foreground">
              Si se apaga, la liquidación no lleva línea de boletos desde ese mes.
            </p>
          </div>
          <Switch
            id="serie-cobra-boletos"
            checked={cobraBoletos}
            onCheckedChange={setCobraBoletos}
            disabled={enviando}
          />
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
            con las horas semanales del salario vigente a esa fecha, que van en cero si el
            régimen queda vacío.
          </p>
          {regimenChocaConElAporte ? (
            <p className="text-sm text-destructive">
              Desde ese mes la empleada aporta al BPS, así que el régimen no puede quedar sin
              horas. Registrá primero que deja de aportar.
            </p>
          ) : null}
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
