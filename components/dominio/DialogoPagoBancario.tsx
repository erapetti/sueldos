'use client'

/**
 * §7.5 — pago bancario. Opcionalmente se vincula a una liquidación confirmada, y en ese caso
 * precarga el monto con el total a pagar. El vínculo es lo que marca la liquidación como
 * pagada (§4.14).
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SelectorFecha } from './SelectorFecha'
import { CampoMonto, CampoTexto } from './CampoMonto'
import type { DialogoNovedadProps } from './DialogoPagoAdicional'
import { useAccion } from '@/hooks/useAccion'
import { liquidacionesParaPago, registrarPagoBancario } from '@/actions/prestamos'
import {
  aISO,
  formatearPeriodoCapitalizado,
  hoy,
  parseFechaISO,
  primerDiaDelMes,
  sumarMeses,
} from '@/lib/format/dates'
import { formatearImporte } from '@/lib/format/money'

type Liquidacion = {
  id: string
  periodo: string
  tipo: string
  secuencia: number
  totalAPagar: string
  pagada: boolean
}

const SIN_VINCULO = 'ninguna'

const ETIQUETA_TIPO: Record<string, string> = {
  MENSUAL: 'Mensual',
  AGUINALDO: 'Aguinaldo',
  SALARIO_VACACIONAL: 'Salario vacacional',
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee.
 */
export function DialogoPagoBancario(props: DialogoNovedadProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(v) => !v && props.onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {props.abierto ? <Cuerpo {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({ onCerrar, empleadoId, alias, fechaIngreso }: DialogoNovedadProps) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<{ id: string }>()

  const [fecha, setFecha] = useState<string | null>(aISO(hoy()))
  const [monto, setMonto] = useState('')
  // Por defecto, el sueldo del mes anterior: es lo que se paga a principios de mes.
  const [concepto, setConcepto] = useState(
    () => `Sueldo ${formatearPeriodoCapitalizado(sumarMeses(primerDiaDelMes(hoy()), -1))}`,
  )
  const [liquidacionId, setLiquidacionId] = useState<string>(SIN_VINCULO)
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])

  // Sincronización con el servidor: el setState va en el callback, no en el cuerpo del efecto.
  useEffect(() => {
    let vigente = true
    liquidacionesParaPago(empleadoId).then((r) => {
      if (vigente && r.ok) setLiquidaciones(r.datos)
    })
    return () => {
      vigente = false
    }
  }, [empleadoId])

  function elegirLiquidacion(valor: string) {
    setLiquidacionId(valor)
    if (valor === SIN_VINCULO) return

    const elegida = liquidaciones.find((l) => l.id === valor)
    if (!elegida) return

    setMonto(elegida.totalAPagar)
    const periodo = formatearPeriodoCapitalizado(parseFechaISO(elegida.periodo))
    setConcepto(
      elegida.tipo === 'MENSUAL'
        ? `Sueldo ${periodo}`
        : `${ETIQUETA_TIPO[elegida.tipo] ?? elegida.tipo} ${periodo}`,
    )
  }

  function guardar() {
    ejecutar(
      () =>
        registrarPagoBancario({
          empleadoId,
          fecha,
          monto,
          concepto,
          liquidacionId: liquidacionId === SIN_VINCULO ? null : liquidacionId,
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
        <DialogTitle>Registrar pago bancario</DialogTitle>
        <DialogDescription>{alias} — transferencia al empleado.</DialogDescription>
      </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pago-banc-liquidacion">Liquidación vinculada</Label>
            <Select
              value={liquidacionId}
              onValueChange={elegirLiquidacion}
              disabled={enviando}
            >
              <SelectTrigger id="pago-banc-liquidacion">
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VINCULO}>Ninguna</SelectItem>
                {liquidaciones.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {ETIQUETA_TIPO[l.tipo] ?? l.tipo} {formatearPeriodoCapitalizado(parseFechaISO(l.periodo))}
                    {l.secuencia > 1 ? ` (#${l.secuencia})` : ''} — {formatearImporte(l.totalAPagar)}
                    {l.pagada ? ' · ya pagada' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Vincularla es lo que la marca como pagada.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pago-banc-fecha">Fecha</Label>
            <SelectorFecha
              id="pago-banc-fecha"
              valor={fecha}
              onChange={setFecha}
              minimo={fechaIngreso}
              maximo={aISO(hoy())}
              disabled={enviando}
              aria-label="Fecha del pago"
            />
            {campos.fecha ? <p className="text-sm text-destructive">{campos.fecha}</p> : null}
          </div>

          <CampoMonto
            id="pago-banc-monto"
            etiqueta="Monto"
            valor={monto}
            onChange={setMonto}
            error={campos.monto}
            disabled={enviando}
          />

          <CampoTexto
            id="pago-banc-concepto"
            etiqueta="Concepto"
            valor={concepto}
            onChange={setConcepto}
            error={campos.concepto}
            disabled={enviando}
            maxLength={255}
          />
        </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </>
  )
}
