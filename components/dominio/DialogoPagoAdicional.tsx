'use client'

/** §7.3 — registrar un pago adicional: fecha, monto y concepto. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { DialogoDeAccion } from './DialogoDeAccion'
import { SelectorFecha } from './SelectorFecha'
import { CampoMonto, CampoTexto } from './CampoMonto'
import { useAccion } from '@/hooks/useAccion'
import { guardarPagoAdicional } from '@/actions/novedades'
import { aISO, hoy } from '@/lib/format/dates'

export type DialogoNovedadProps = {
  abierto: boolean
  onCerrar: () => void
  empleadoId: string
  alias: string
  fechaIngreso: string
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee. El diálogo entero vive adentro del cuerpo
 * porque el pie depende de su estado —qué se está enviando, si falta completar algo—.
 */
export function DialogoPagoAdicional(props: DialogoNovedadProps) {
  return props.abierto ? <Cuerpo {...props} /> : null
}

function Cuerpo({ onCerrar, empleadoId, alias, fechaIngreso }: DialogoNovedadProps) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [fecha, setFecha] = useState<string | null>(aISO(hoy()))
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')

  function guardar() {
    ejecutar(() => guardarPagoAdicional({ empleadoId, fecha, monto, concepto }), {
      exito: 'Pago adicional registrado.',
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
      titulo="Registrar pago adicional"
      descripcion={`${alias} — no lleva descuentos de ningún tipo y se liquida en el mes de la fecha.`}
      etiquetaConfirmar="Guardar"
      etiquetaEnviando="Guardando…"
      onConfirmar={guardar}
      enviando={enviando}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pago-fecha">Fecha</Label>
          <SelectorFecha
            id="pago-fecha"
            valor={fecha}
            onChange={setFecha}
            minimo={fechaIngreso}
            maximo={aISO(hoy())}
            disabled={enviando}
            aria-label="Fecha del pago adicional"
          />
          {campos.fecha ? <p className="text-sm text-destructive">{campos.fecha}</p> : null}
        </div>

        <CampoMonto
          id="pago-monto"
          etiqueta="Monto"
          valor={monto}
          onChange={setMonto}
          error={campos.monto}
          disabled={enviando}
        />

        <CampoTexto
          id="pago-concepto"
          etiqueta="Concepto"
          valor={concepto}
          onChange={setConcepto}
          error={campos.concepto}
          disabled={enviando}
          placeholder="Premio, viático, reintegro…"
          maxLength={255}
        />
      </div>
    </DialogoDeAccion>
  )
}
