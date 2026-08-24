'use client'

/**
 * §4.2.2 — formulario de alta.
 *
 * El campo del valor hora "en negro" se pre-carga con el valor hora calculado a partir del
 * salario y las horas semanales ingresados, y se recalcula en vivo mientras esos campos
 * cambian, hasta que el usuario lo edite manualmente.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
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
import { CampoMonto, CampoTexto } from '@/components/dominio/CampoMonto'
import { SelectorFecha } from '@/components/dominio/SelectorFecha'
import { useAccion } from '@/hooks/useAccion'
import { crearEmpleado } from '@/actions/empleados'
import { SEGUROS_SALUD } from '@/constants/segurosSalud'
import { valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { parsearNumero } from '@/lib/format/money'
import { aISO, hoy, NOMBRES_DIAS_CORTOS, formatearPeriodoCapitalizado, parseFechaISO, primerDiaDelMes } from '@/lib/format/dates'

const SIN_SEGURO = 'ninguno'

export function FormularioAlta() {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<{ id: string }>()

  const [datos, setDatos] = useState({
    alias: '',
    nombreCompleto: '',
    banco: '',
    cuenta: '',
    cobraBoletos: true,
    aportaBps: true,
    celular: '',
    direccion: '',
    cedula: '',
    seguroSalud: SIN_SEGURO,
  })
  const [fechaIngreso, setFechaIngreso] = useState<string | null>(aISO(hoy()))
  const [salario, setSalario] = useState('')
  const [horasSemanales, setHorasSemanales] = useState('')
  /**
   * §4.2.2 — se precarga con el valor hora calculado y se recalcula en vivo **hasta que el
   * usuario lo edite manualmente**. Se modela como derivado con una anulación manual, en vez
   * de con un efecto que persiga a los otros campos.
   */
  const [valorHoraNegroManual, setValorHoraNegroManual] = useState<string | null>(null)
  const [dias, setDias] = useState<string[]>(['', '', '', '', '', '', ''])

  const valorHoraSugerido = useMemo(() => {
    const s = parsearNumero(salario)
    const h = parsearNumero(horasSemanales)
    if (!s || !h || h.lessThanOrEqualTo(0)) return null
    return valorHoraCalculado({ salario: s, horasSemanales: h }).toDecimalPlaces(2)
  }, [salario, horasSemanales])

  const vhnEditado = valorHoraNegroManual !== null
  const valorHoraNegro =
    valorHoraNegroManual ?? (valorHoraSugerido ? valorHoraSugerido.toFixed(2) : '')

  const sumaRegimen = dias.reduce((a, d) => a.plus(parsearNumero(d) ?? 0), new Decimal(0))
  const horas = parsearNumero(horasSemanales)
  const regimenCuadra = horas ? sumaRegimen.equals(horas) : false

  function cambiar<K extends keyof typeof datos>(clave: K, valor: (typeof datos)[K]) {
    setDatos((previos) => ({ ...previos, [clave]: valor }))
  }

  function guardar() {
    ejecutar(
      () =>
        crearEmpleado({
          ...datos,
          seguroSalud: datos.seguroSalud === SIN_SEGURO ? null : datos.seguroSalud,
          fechaIngreso,
          salario,
          horasSemanales: Number(horasSemanales.replace(',', '.')),
          valorHoraNegro,
          regimen: {
            lunes: Number(dias[0] || 0),
            martes: Number(dias[1] || 0),
            miercoles: Number(dias[2] || 0),
            jueves: Number(dias[3] || 0),
            viernes: Number(dias[4] || 0),
            sabado: Number(dias[5] || 0),
            domingo: Number(dias[6] || 0),
          },
        }),
      {
        exito: 'Empleada creada.',
        onExito: (creado) => router.push(`/empleados/${creado.id}`),
      },
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="alias"
          etiqueta="Alias"
          valor={datos.alias}
          onChange={(v) => cambiar('alias', v)}
          error={campos.alias}
          disabled={enviando}
          maxLength={40}
        />
        <CampoTexto
          id="nombre-completo"
          etiqueta="Nombre completo"
          valor={datos.nombreCompleto}
          onChange={(v) => cambiar('nombreCompleto', v)}
          error={campos.nombreCompleto}
          disabled={enviando}
          maxLength={120}
        />
        <CampoTexto
          id="banco"
          etiqueta="Banco"
          valor={datos.banco}
          onChange={(v) => cambiar('banco', v)}
          error={campos.banco}
          disabled={enviando}
          ayuda="Opcional."
        />
        <CampoTexto
          id="cuenta"
          etiqueta="Cuenta"
          valor={datos.cuenta}
          onChange={(v) => cambiar('cuenta', v)}
          error={campos.cuenta}
          disabled={enviando}
          maxLength={32}
          ayuda="Opcional. Alfanumérica, hasta 32 caracteres. Se admite guion para cuenta-subcuenta."
        />

        <div className="space-y-1.5">
          <Label htmlFor="fecha-ingreso">Fecha de ingreso</Label>
          <SelectorFecha
            id="fecha-ingreso"
            valor={fechaIngreso}
            onChange={setFechaIngreso}
            maximo={aISO(hoy())}
            disabled={enviando}
            aria-label="Fecha de ingreso"
          />
          {campos.fechaIngreso ? (
            <p className="text-sm text-destructive">{campos.fechaIngreso}</p>
          ) : fechaIngreso ? (
            <p className="text-sm text-muted-foreground">
              Las vigencias arrancan en{' '}
              {formatearPeriodoCapitalizado(primerDiaDelMes(parseFechaISO(fechaIngreso)))}.
            </p>
          ) : null}
        </div>

        <CampoTexto
          id="cedula"
          etiqueta="Cédula"
          valor={datos.cedula}
          onChange={(v) => cambiar('cedula', v)}
          error={campos.cedula}
          disabled={enviando}
          ayuda="Opcional."
        />
        <CampoTexto
          id="celular"
          etiqueta="Celular"
          valor={datos.celular}
          onChange={(v) => cambiar('celular', v)}
          disabled={enviando}
        />
        <CampoTexto
          id="direccion"
          etiqueta="Dirección"
          valor={datos.direccion}
          onChange={(v) => cambiar('direccion', v)}
          disabled={enviando}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="cobra-boletos">Cobra boletos</Label>
          <Switch
            id="cobra-boletos"
            checked={datos.cobraBoletos}
            onCheckedChange={(v) => cambiar('cobraBoletos', v)}
            disabled={enviando}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="aporta-bps">Aporta BPS</Label>
          <Switch
            id="aporta-bps"
            checked={datos.aportaBps}
            onCheckedChange={(v) => cambiar('aportaBps', v)}
            disabled={enviando}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="seguro-salud">Seguro de salud</Label>
          <Select
            value={datos.seguroSalud}
            onValueChange={(v) => cambiar('seguroSalud', v)}
            disabled={enviando || !datos.aportaBps}
          >
            <SelectTrigger id="seguro-salud">
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
        </div>
      </section>

      <section className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">Salario y régimen horario</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <CampoMonto
            id="salario"
            etiqueta="Salario mensual nominal"
            valor={salario}
            onChange={setSalario}
            error={campos.salario}
            disabled={enviando}
          />
          <div className="space-y-1.5">
            <Label htmlFor="horas-semanales">Horas semanales</Label>
            <Input
              id="horas-semanales"
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
          <CampoMonto
            id="valor-hora-negro"
            etiqueta="Valor hora sin aportes"
            valor={valorHoraNegro}
            onChange={setValorHoraNegroManual}
            error={campos.valorHoraNegro}
            disabled={enviando}
            ayuda={
              valorHoraSugerido && !vhnEditado
                ? `Se precarga con el valor hora calculado ($ ${valorHoraSugerido.toFixed(2)}).`
                : undefined
            }
          />
        </div>

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
          <p
            className={
              horas && !regimenCuadra ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
            }
          >
            Suma: <span className="font-medium tabular">{sumaRegimen.toString()} h</span>
            {horas
              ? regimenCuadra
                ? ' — coincide con las horas semanales.'
                : ` — tiene que dar ${horas.toString()} h (diferencia de ${sumaRegimen.minus(horas).toString()} h).`
              : ''}
          </p>
          {campos.regimen ? <p className="text-sm text-destructive">{campos.regimen}</p> : null}
        </div>
      </section>

      <div className="flex gap-2">
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear empleada'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/empleados')} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
