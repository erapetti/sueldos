'use client'

/**
 * §7.11 — registrar una licencia.
 *
 * Muestra en vivo los días hábiles con su desglose (§4.15.3), el saldo de días antes y
 * después, y el salario vacacional que se va a generar con su cálculo a la vista.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SelectorFecha } from './SelectorFecha'
import { DialogoDeAccion } from './DialogoDeAccion'
import type { DialogoNovedadProps } from './DialogoPagoAdicional'
import { useAccion } from '@/hooks/useAccion'
import { previsualizarLicencia, registrarLicencia } from '@/actions/licencias'
import { aISO, hoy } from '@/lib/format/dates'
import { formatearDias, formatearDiasHabiles, formatearImporte } from '@/lib/format/money'

type Previsualizacion = {
  diasCorridos: number
  domingos: number
  feriados: number
  diasHabiles: string
  saldoAntes: string
  saldoDespues: string
  salarioVigente: string | null
  salarioVacacional: string | null
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee.
 */
export function DialogoLicencia(props: DialogoNovedadProps) {
  return props.abierto ? <Cuerpo {...props} /> : null
}

function Cuerpo({ onCerrar, empleadoId, alias, fechaIngreso }: DialogoNovedadProps) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<{ licenciaId: string }>()

  const [desde, setDesde] = useState<string | null>(aISO(hoy()))
  const [hasta, setHasta] = useState<string | null>(aISO(hoy()))
  const [nota, setNota] = useState('')
  const [previa, setPrevia] = useState<Previsualizacion | null>(null)
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null)

  // El desglose se recalcula en el servidor porque depende de los feriados y del salario.
  // El setState va en el callback, no en el cuerpo del efecto.
  useEffect(() => {
    if (!desde || !hasta) return

    let vigente = true
    previsualizarLicencia(empleadoId, desde, hasta).then((r) => {
      if (!vigente) return
      if (r.ok) {
        setPrevia(r.datos)
        setErrorPrevia(null)
      } else {
        setPrevia(null)
        setErrorPrevia(r.error)
      }
    })
    return () => {
      vigente = false
    }
  }, [desde, hasta, empleadoId])

  const saldoQuedaNegativo = previa ? Number(previa.saldoDespues) < 0 : false

  function guardar() {
    ejecutar(() => registrarLicencia({ empleadoId, fechaDesde: desde, fechaHasta: hasta, nota }), {
      onExito: () => {
        onCerrar()
        router.refresh()
      },
    })
  }

  return (
    <DialogoDeAccion
      abierto
      onCerrar={onCerrar}
      titulo="Registrar licencia"
      descripcion={`${alias} — los días de licencia no descuentan sueldo, pero sí boletos.`}
      etiquetaConfirmar="Registrar licencia"
      etiquetaEnviando="Guardando…"
      onConfirmar={guardar}
      enviando={enviando}
      // Sin salario vacacional calculado no hay nada que registrar.
      confirmarDeshabilitado={!previa?.salarioVacacional}
      amplio
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="licencia-desde">Desde</Label>
            <SelectorFecha
              id="licencia-desde"
              valor={desde}
              onChange={setDesde}
              minimo={fechaIngreso}
              disabled={enviando}
              aria-label="Primer día de la licencia"
            />
            {campos.fechaDesde ? (
              <p className="text-sm text-destructive">{campos.fechaDesde}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="licencia-hasta">Hasta</Label>
            <SelectorFecha
              id="licencia-hasta"
              valor={hasta}
              onChange={setHasta}
              minimo={desde ?? fechaIngreso}
              disabled={enviando}
              aria-label="Último día de la licencia"
            />
            {campos.fechaHasta ? (
              <p className="text-sm text-destructive">{campos.fechaHasta}</p>
            ) : null}
          </div>
        </div>

        {errorPrevia ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorPrevia}
          </p>
        ) : null}

        {previa ? (
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <p>
              <span className="font-medium">{previa.diasCorridos} días corridos</span>
              {' − '}
              {previa.domingos} domingos {' − '} {previa.feriados} feriados {' = '}
              <span className="font-medium">{formatearDiasHabiles(previa.diasHabiles)}</span>
            </p>

            <p className="text-muted-foreground">
              Saldo de licencia: {formatearDias(previa.saldoAntes)} →{' '}
              <span className={saldoQuedaNegativo ? 'font-medium text-destructive' : 'font-medium'}>
                {formatearDias(previa.saldoDespues)}
              </span>
            </p>

            {saldoQuedaNegativo ? (
              <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-warn-ink">
                El saldo de licencia queda en {previa.saldoDespues} días. Se puede guardar igual.
              </p>
            ) : null}

            {previa.salarioVacacional && previa.salarioVigente ? (
              <div className="border-t pt-3">
                <p className="font-medium">
                  Salario vacacional: {formatearImporte(previa.salarioVacacional)}
                </p>
                <p className="text-muted-foreground">
                  {formatearImporte(previa.salarioVigente)} / 30 × {previa.diasHabiles} días
                  hábiles
                </p>
              </div>
            ) : (
              <p className="text-destructive">
                No hay salario vigente para el mes de inicio: no se puede calcular el salario
                vacacional.
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="licencia-nota">Nota</Label>
          <Textarea
            id="licencia-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={enviando}
            rows={2}
            maxLength={500}
          />
        </div>
      </div>
    </DialogoDeAccion>
  )
}
