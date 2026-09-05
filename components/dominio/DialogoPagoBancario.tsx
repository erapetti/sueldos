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
import { CampoFijo, CampoMonto, CampoTexto } from './CampoMonto'
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

/** Cómo se nombra una liquidación en el desplegable y en el renglón de la fija. */
function etiquetaDeLiquidacion(l: Liquidacion): string {
  const tipo = ETIQUETA_TIPO_LIQUIDACION[l.tipo] ?? l.tipo
  const periodo = formatearPeriodoCapitalizado(parseFechaISO(l.periodo))
  const secuencia = l.secuencia > 1 ? ` (#${l.secuencia})` : ''
  return `${tipo} ${periodo}${secuencia} — ${formatearImporte(l.totalAPagar)}`
}

/** El concepto por defecto del pago: el período y, si es del otro libro, que no lleva BPS. */
function conceptoDe(elegida: Liquidacion, deLibro: Libro): string {
  const periodo = formatearPeriodoCapitalizado(parseFechaISO(elegida.periodo))
  const base =
    elegida.tipo === 'MENSUAL'
      ? `Sueldo ${periodo}`
      : `${ETIQUETA_TIPO_LIQUIDACION[elegida.tipo] ?? elegida.tipo} ${periodo}`
  return deLibro === 'INFORMAL' ? `${base} (sin aportes)` : base
}

/** El libro que le falta cobrar; si no falta ninguno, el primero que la liquidación paga. */
function libroSugerido(elegida: Liquidacion, siNoTiene: Libro): Libro {
  return elegida.faltan[0] ?? elegida.libros[0] ?? siNoTiene
}

/**
 * El cuerpo se monta solo mientras el diálogo está abierto: así el formulario arranca limpio
 * en cada apertura, sin un efecto que lo resetee.
 */
/**
 * `liquidacionFija` es el id de la liquidación desde la que se abrió el diálogo —el chip «Sin
 * pagar» de la pantalla de liquidación—. Con ella el vínculo no se elige: ya está decidido, y
 * el desplegable se cambia por el renglón que dice cuál es.
 */
type PropsPagoBancario = DialogoNovedadProps & { liquidacionFija?: string }

export function DialogoPagoBancario(props: PropsPagoBancario) {
  return props.abierto ? <Cuerpo {...props} /> : null
}

function Cuerpo({ onCerrar, empleadoId, alias, vinculo, liquidacionFija }: PropsPagoBancario) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<{ id: string }>()

  const [fecha, setFecha] = useState<string | null>(aISO(hoy()))
  const [monto, setMonto] = useState('')
  // Por defecto, el sueldo del mes anterior: es lo que se paga a principios de mes.
  const [concepto, setConcepto] = useState(
    () => `Sueldo ${formatearPeriodoCapitalizado(sumarMeses(primerDiaDelMes(hoy()), -1))}`,
  )
  const [liquidacionId, setLiquidacionId] = useState<string>(liquidacionFija ?? SIN_VINCULO)
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])
  const [libro, setLibro] = useState<Libro>('FORMAL')

  /*
    Sincronización con el servidor: el setState va en el callback, no en el cuerpo del efecto.

    Con una liquidación fija, la precarga se hace acá y no al elegirla, porque nadie la elige:
    hay que esperar a que llegue la lista para saber qué libro le falta y cuánto paga.
  */
  useEffect(() => {
    let vigente = true
    liquidacionesParaPago(empleadoId).then((r) => {
      if (!vigente || !r.ok) return
      setLiquidaciones(r.datos.liquidaciones)

      const fija = liquidacionFija
        ? r.datos.liquidaciones.find((l) => l.id === liquidacionFija)
        : undefined
      if (fija) {
        const sugerido = libroSugerido(fija, 'FORMAL')
        setLibro(sugerido)
        setMonto(montoDelLibro(fija, sugerido))
        setConcepto(conceptoDe(fija, sugerido))
        return
      }

      // Sin liquidación vinculada, el libro por defecto es el que le toca a la empleada.
      setLibro(r.datos.aportaBps ? 'FORMAL' : 'INFORMAL')
    })
    return () => {
      vigente = false
    }
  }, [empleadoId, liquidacionFija])

  function elegirLiquidacion(valor: string) {
    setLiquidacionId(valor)
    if (valor === SIN_VINCULO) return

    const elegida = liquidaciones.find((l) => l.id === valor)
    if (!elegida) return

    const sugerido = libroSugerido(elegida, libro)
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

  /**
   * Con una liquidación vinculada, el formulario deja de tener qué preguntar: el libro y el
   * importe salen de ella. Se ofrecen los libros que **todavía tienen algo que cobrar** —los
   * de importe positivo, menos los que ya se pagaron—, así que el desplegable aparece solo
   * cuando hay de verdad dos caminos. Con uno solo es un campo fijo: un menú de una opción es
   * una manera de equivocarse sin ganar nada.
   *
   * Sin liquidación vinculada el pago es libre y siguen los dos libros y el importe a mano.
   */
  const librosACobrar = vinculada ? vinculada.faltan : LIBROS
  const libroDecidido = vinculada !== null && librosACobrar.length <= 1

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
        {liquidacionFija ? (
          <CampoFijo
            id="pago-banc-liquidacion"
            etiqueta="Liquidación vinculada"
            valor={vinculada ? etiquetaDeLiquidacion(vinculada) : '…'}
          />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="pago-banc-liquidacion">Liquidación vinculada</Label>
            <Select value={liquidacionId} onValueChange={elegirLiquidacion} disabled={enviando}>
              <SelectTrigger id="pago-banc-liquidacion">
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VINCULO}>Ninguna</SelectItem>
                {liquidaciones.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {etiquetaDeLiquidacion(l)}
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
        )}

        {libroDecidido ? (
          <CampoFijo
            id="pago-banc-libro"
            etiqueta="Libro"
            valor={ETIQUETA_LIBRO[libro]}
            ayuda={
              vinculada && vinculada.libros.length > 1
                ? 'El otro libro de esta liquidación ya está pagado.'
                : undefined
            }
          />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="pago-banc-libro">Libro</Label>
            <Select value={libro} onValueChange={elegirLibro} disabled={enviando}>
              <SelectTrigger id="pago-banc-libro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {librosACobrar.map((l) => (
                  <SelectItem key={l} value={l}>
                    {ETIQUETA_LIBRO[l]}
                    {vinculada ? ` — ${formatearImporte(montoDelLibro(vinculada, l))}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vinculada ? (
              <p className="text-sm text-muted-foreground">
                Esta liquidación se paga en dos transferencias, una por libro.
              </p>
            ) : null}
          </div>
        )}

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

        {/*
          Con una liquidación vinculada el importe es el del libro elegido y no se tipea: es la
          cifra que la aplicación va a dar por cobrada, así que dejarla escribir solo habilita
          equivocarse. Sin liquidación el pago es libre y el importe vuelve a ser un campo.
        */}
        <CampoMonto
          id="pago-banc-monto"
          etiqueta="Monto"
          valor={monto}
          onChange={setMonto}
          error={campos.monto}
          disabled={enviando}
          soloLectura={vinculada !== null}
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
