'use client'

/**
 * §7.4 — préstamo en mano, con su plan de devolución en el mismo formulario.
 *
 * El monto por cuota se autocalcula (monto / cuotas, con el ajuste del redondeo en la última)
 * y se muestra una grilla editable de las cuotas generadas antes de confirmar.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SelectorFecha } from './SelectorFecha'
import { CampoMonto, CampoTexto } from './CampoMonto'
import type { DialogoNovedadProps } from './DialogoPagoAdicional'
import { useAccion } from '@/hooks/useAccion'
import { registrarPrestamo } from '@/actions/prestamos'
import { repartirEnCuotas } from '@/lib/calculo/cuentaCorriente'
import {
  aISO,
  aPeriodoISO,
  formatearPeriodoCapitalizado,
  hoy,
  parseFechaISO,
  primerDiaDelMes,
  sumarMeses,
} from '@/lib/format/dates'
import {
  formatearImporte,
  formatearImporteEntero,
  formatoDeCampo,
  parsearNumero,
  todosEnteros,
} from '@/lib/format/money'

type Cuota = { fecha: string; monto: string }

/**
 * Convierte `AAAA-MM` a `AAAA-MM-01`, o null si todavía no está completo o no es un mes real.
 * El campo se tipea a mano, así que nunca se le pasa el texto crudo a `parseFechaISO`: mientras
 * se escribe pasa por estados incompletos como `2026-0`, y una excepción durante el render
 * tumba el árbol entero.
 */
function desdePeriodoTexto(texto: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto.trim())
  if (!m) return null
  const mesP = Number(m[2])
  if (mesP < 1 || mesP > 12) return null
  return `${m[1]}-${m[2]}-01`
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee.
 */
export function DialogoPrestamo(props: DialogoNovedadProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {props.abierto ? <Cuerpo {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({ onCerrar, empleadoId, alias, fechaIngreso }: DialogoNovedadProps) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<{ id: string }>()

  const mesActual = useMemo(() => aISO(primerDiaDelMes(hoy())), [])

  const [fecha, setFecha] = useState<string | null>(aISO(hoy()))
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [conPlan, setConPlan] = useState(true)
  const [cantidadCuotas, setCantidadCuotas] = useState('3')
  const [primerMes, setPrimerMes] = useState(mesActual)
  /** Lo tipeado en el campo del mes, que pasa por estados incompletos antes de ser un período. */
  const [textoPrimerMes, setTextoPrimerMes] = useState(() => mesActual.slice(0, 7))
  /**
   * Las cuotas se autocalculan a partir del monto, la cantidad y el mes de la primera, y se
   * dejan de recalcular en cuanto el usuario las edita. Se modela como derivado con una
   * anulación manual, en vez de con un efecto que persiga a los otros campos.
   */
  const [cuotasManuales, setCuotasManuales] = useState<Cuota[] | null>(null)

  const cuotasCalculadas = useMemo<Cuota[]>(() => {
    if (!conPlan) return []

    const total = parsearNumero(monto)
    const cantidad = Number(cantidadCuotas)
    if (!total || total.lessThanOrEqualTo(0) || !Number.isInteger(cantidad) || cantidad < 1) {
      return []
    }

    const inicio = parseFechaISO(primerMes)
    const importes = repartirEnCuotas(total, cantidad)
    /**
     * §1.3 de las notas — los importes se mueven en pesos enteros. `repartirEnCuotas` ya
     * reparte entero; el único resto posible son los centavos del monto tipeado, que caen en
     * la última cuota. `formatoDeCampo` resuelve las dos reglas, y es el mismo que usa la
     * pantalla de detalle del préstamo.
     */
    const escribir = formatoDeCampo(importes)
    return importes.map((m, i) => ({
      fecha: aISO(sumarMeses(inicio, i)),
      monto: escribir(m),
    }))
  }, [conPlan, monto, cantidadCuotas, primerMes])

  const cuotas = cuotasManuales ?? cuotasCalculadas

  const sumaCuotas = useMemo(
    () => cuotas.reduce((acc, c) => acc.plus(parsearNumero(c.monto) ?? 0), new Decimal(0)),
    [cuotas],
  )
  const totalPrestamo = parsearNumero(monto)
  const descuadre =
    conPlan && totalPrestamo && cuotas.length > 0 && !sumaCuotas.equals(totalPrestamo)
  const importeDelAviso = todosEnteros([sumaCuotas, totalPrestamo])
    ? formatearImporteEntero
    : formatearImporte

  function cambiarCuota(indice: number, campo: keyof Cuota, valor: string) {
    setCuotasManuales(cuotas.map((c, i) => (i === indice ? { ...c, [campo]: valor } : c)))
  }

  function guardar() {
    ejecutar(
      () =>
        registrarPrestamo({
          empleadoId,
          fecha,
          monto,
          concepto,
          conPlan,
          cuotas: conPlan ? cuotas : [],
        }),
      {
        onExito: () => {
          onCerrar()
          router.refresh()
        },
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar préstamo</DialogTitle>
        <DialogDescription>{alias} — pago en mano, con su plan de devolución.</DialogDescription>
      </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prestamo-fecha">Fecha</Label>
            <SelectorFecha
              id="prestamo-fecha"
              valor={fecha}
              onChange={setFecha}
              minimo={fechaIngreso}
              maximo={aISO(hoy())}
              disabled={enviando}
              aria-label="Fecha del préstamo"
            />
            {campos.fecha ? <p className="text-sm text-destructive">{campos.fecha}</p> : null}
          </div>

          <CampoMonto
            id="prestamo-monto"
            etiqueta="Monto"
            valor={monto}
            onChange={(v) => {
              setMonto(v)
              setCuotasManuales(null)
            }}
            error={campos.monto}
            disabled={enviando}
          />

          <CampoTexto
            id="prestamo-concepto"
            etiqueta="Concepto"
            valor={concepto}
            onChange={setConcepto}
            error={campos.concepto}
            disabled={enviando}
            placeholder="Adelanto, préstamo…"
            maxLength={255}
          />

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="prestamo-con-plan">Plan de devolución</Label>
              <p className="text-sm text-muted-foreground">
                Desactivalo para registrar el préstamo sin cuotas previstas.
              </p>
            </div>
            <Switch
              id="prestamo-con-plan"
              checked={conPlan}
              onCheckedChange={(v) => {
                setConPlan(v)
                setCuotasManuales(null)
              }}
              disabled={enviando}
            />
          </div>

          {conPlan ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prestamo-cuotas">Cantidad de cuotas</Label>
                  <Input
                    id="prestamo-cuotas"
                    type="number"
                    min={1}
                    max={60}
                    value={cantidadCuotas}
                    onChange={(e) => {
                      setCantidadCuotas(e.target.value)
                      setCuotasManuales(null)
                    }}
                    disabled={enviando}
                    className="tabular"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prestamo-primer-mes">Mes de la primera cuota</Label>
                  {/*
                    Campo de texto y no `type="month"`: Firefox no lo soporta y lo degrada a un
                    input común, con lo cual el mismo formulario se veía distinto según el
                    navegador. Acá siempre es `aaaa-mm`, en todos lados.
                  */}
                  <Input
                    id="prestamo-primer-mes"
                    value={textoPrimerMes}
                    onChange={(e) => {
                      setTextoPrimerMes(e.target.value)
                      const iso = desdePeriodoTexto(e.target.value)
                      if (iso) {
                        setPrimerMes(iso)
                        setCuotasManuales(null)
                      }
                    }}
                    onBlur={() => setTextoPrimerMes(aPeriodoISO(parseFechaISO(primerMes)))}
                    disabled={enviando}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="aaaa-mm"
                    maxLength={7}
                    className="tabular"
                  />
                </div>
              </div>

              {cuotas.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Cuotas generadas</p>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {cuotas.map((cuota, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-40 text-sm text-muted-foreground">
                          {formatearPeriodoCapitalizado(parseFechaISO(cuota.fecha))}
                        </span>
                        <Input
                          value={cuota.monto}
                          onChange={(e) => cambiarCuota(i, 'monto', e.target.value)}
                          disabled={enviando}
                          inputMode="decimal"
                          aria-label={`Monto de la cuota ${i + 1}`}
                          className="tabular"
                        />
                      </div>
                    ))}
                  </div>

                  {descuadre ? (
                    <p className="text-sm text-warn-ink">
                      Las cuotas suman {importeDelAviso(sumaCuotas)} y el préstamo es de{' '}
                      {importeDelAviso(totalPrestamo)}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {campos.cuotas ? <p className="text-sm text-destructive">{campos.cuotas}</p> : null}
            </div>
          ) : null}
        </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar préstamo'}
        </Button>
      </DialogFooter>
    </>
  )
}
