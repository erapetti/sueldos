'use client'

/**
 * §7.5 — pago bancario. Opcionalmente se vincula a una liquidación confirmada, y en ese caso
 * precarga el monto con el total a pagar. El vínculo es lo que marca la liquidación como
 * pagada (§4.14).
 *
 * El desplegable ofrece solo las que **tienen algo que cobrar**: las cobradas enteras las deja
 * afuera `liquidacionesParaPago`, así que acá no hay un estado «ya pagada» que dibujar.
 *
 * §4.9 — cada pago pertenece a un libro. Una liquidación con las dos tablas se paga con **dos
 * transferencias**, así que el diálogo se abre una vez por libro: al elegir la liquidación
 * ofrece el libro que todavía falta y precarga el monto de ese libro.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { DialogoDeAccion } from './DialogoDeAccion'
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
import { ETIQUETA_LIBRO, ETIQUETA_TIPO_LIQUIDACION } from '@/constants/etiquetas'

type Libro = 'FORMAL' | 'INFORMAL'

type Liquidacion = {
  id: string
  periodo: string
  tipo: string
  secuencia: number
  totalAPagar: string
  totalAPagarFormal: string
  totalAPagarInformal: string
  /** Libros que esta liquidación paga. */
  libros: Libro[]
  /** Los que todavía no tienen pago. */
  faltan: Libro[]
  pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA'
}

const SIN_VINCULO = 'ninguna'

const LIBROS: Libro[] = ['FORMAL', 'INFORMAL']

/** Lo que la liquidación paga en un libro. */
function montoDelLibro(liquidacion: Liquidacion, libro: Libro): string {
  return libro === 'FORMAL' ? liquidacion.totalAPagarFormal : liquidacion.totalAPagarInformal
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee.
 */
export function DialogoPagoBancario(props: DialogoNovedadProps) {
  return props.abierto ? <Cuerpo {...props} /> : null
}

function Cuerpo({ onCerrar, empleadoId, alias, vinculo }: DialogoNovedadProps) {
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
  const [libro, setLibro] = useState<Libro>('FORMAL')

  // Sincronización con el servidor: el setState va en el callback, no en el cuerpo del efecto.
  useEffect(() => {
    let vigente = true
    liquidacionesParaPago(empleadoId).then((r) => {
      if (!vigente || !r.ok) return
      setLiquidaciones(r.datos.liquidaciones)
      // Sin liquidación vinculada, el libro por defecto es el que le toca a la empleada.
      setLibro(r.datos.aportaBps ? 'FORMAL' : 'INFORMAL')
    })
    return () => {
      vigente = false
    }
  }, [empleadoId])

  /** El concepto por defecto del pago: el período y, si es del otro libro, que no lleva BPS. */
  function conceptoDe(elegida: Liquidacion, deLibro: Libro): string {
    const periodo = formatearPeriodoCapitalizado(parseFechaISO(elegida.periodo))
    const base =
      elegida.tipo === 'MENSUAL'
        ? `Sueldo ${periodo}`
        : `${ETIQUETA_TIPO_LIQUIDACION[elegida.tipo] ?? elegida.tipo} ${periodo}`
    return deLibro === 'INFORMAL' ? `${base} (sin aportes)` : base
  }

  function elegirLiquidacion(valor: string) {
    setLiquidacionId(valor)
    if (valor === SIN_VINCULO) return

    const elegida = liquidaciones.find((l) => l.id === valor)
    if (!elegida) return

    // El libro que falta pagar; si no falta ninguno, el primero que la liquidación paga.
    const sugerido = elegida.faltan[0] ?? elegida.libros[0] ?? libro
    setLibro(sugerido)
    setMonto(montoDelLibro(elegida, sugerido))
    setConcepto(conceptoDe(elegida, sugerido))
  }

  /** Cambiar de libro reprecarga el monto y el concepto de ese libro. */
  function elegirLibro(valor: string) {
    const nuevo = valor as Libro
    setLibro(nuevo)

    const elegida = liquidaciones.find((l) => l.id === liquidacionId)
    if (!elegida) return
    setMonto(montoDelLibro(elegida, nuevo))
    setConcepto(conceptoDe(elegida, nuevo))
  }

  const vinculada = liquidaciones.find((l) => l.id === liquidacionId) ?? null

  function guardar() {
    ejecutar(
      () =>
        registrarPagoBancario({
          empleadoId,
          fecha,
          monto,
          libro,
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
    <DialogoDeAccion
      abierto
      onCerrar={onCerrar}
      titulo="Registrar pago bancario"
      descripcion={`${alias} — transferencia al empleado.`}
      etiquetaConfirmar="Registrar pago"
      etiquetaEnviando="Guardando…"
      onConfirmar={guardar}
      enviando={enviando}
    >
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
                  {ETIQUETA_TIPO_LIQUIDACION[l.tipo] ?? l.tipo} {formatearPeriodoCapitalizado(parseFechaISO(l.periodo))}
                  {l.secuencia > 1 ? ` (#${l.secuencia})` : ''} — {formatearImporte(l.totalAPagar)}
                  {l.pago === 'PARCIAL'
                    ? ` · falta ${l.faltan.map((f) => ETIQUETA_LIBRO[f]).join(' y ')}`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Vincularla es lo que la marca como pagada.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pago-banc-libro">Libro</Label>
          <Select value={libro} onValueChange={elegirLibro} disabled={enviando}>
            <SelectTrigger id="pago-banc-libro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIBROS.map((l) => (
                <SelectItem key={l} value={l}>
                  {ETIQUETA_LIBRO[l]}
                  {vinculada && vinculada.libros.includes(l)
                    ? ` — ${formatearImporte(montoDelLibro(vinculada, l))}`
                    : ''}
                  {vinculada && vinculada.libros.includes(l) && !vinculada.faltan.includes(l)
                    ? ' · ya pagado'
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vinculada && vinculada.libros.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              Esta liquidación se paga en dos transferencias, una por libro.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pago-banc-fecha">Fecha</Label>
          {/* §7.5 — el egreso no topea nada: al que se fue se le sigue pagando por banco. */}
          <SelectorFecha
            id="pago-banc-fecha"
            valor={fecha}
            onChange={setFecha}
            minimo={vinculo.fechaIngreso}
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
    </DialogoDeAccion>
  )
}
