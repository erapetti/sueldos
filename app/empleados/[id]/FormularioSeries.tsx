'use client'

/**
 * §4.3, §4.3.1, §4.4 y §5.3 — alta de un nuevo registro de serie, siempre con el
 * `<SelectorVigencia>`.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectorVigencia, vigenciaPorDefecto } from '@/components/dominio/SelectorVigencia'
import { CampoMonto } from '@/components/dominio/CampoMonto'
import { useAccion } from '@/hooks/useAccion'
import { registrarRegimen, registrarSalario, registrarValorHoraNegro } from '@/actions/series'
import { NOMBRES_DIAS_CORTOS } from '@/lib/format/dates'

type Tipo = 'SALARIO' | 'VALOR_HORA_NEGRO' | 'REGIMEN'

const TITULOS: Record<Tipo, string> = {
  SALARIO: 'Nuevo salario',
  VALOR_HORA_NEGRO: 'Nuevo valor hora sin aportes',
  REGIMEN: 'Nuevo régimen horario',
}

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
