'use client'

/**
 * §7.1 y §7.2 — base compartida de las dos planillas mensuales.
 *
 * Encabezado con selector de mes y flechas, calendario de 7 columnas (lunes a domingo),
 * modo lista rápida, pie fijo con el resumen en vivo, y guardado en lote de todos los
 * renglones en una sola operación.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, List, CalendarDays, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  aISO,
  aPeriodoISO,
  dia,
  diasDelMes,
  diasDelPeriodo,
  diaSemana,
  esDomingo,
  formatearPeriodoCapitalizado,
  hoy,
  nombreDiaSemanaCorto,
  NOMBRES_DIAS_CORTOS,
  parseFechaISO,
  parsePeriodo,
  sumarMeses,
} from '@/lib/format/dates'
import { formatearCantidad } from '@/lib/format/money'
import { DialogoDeAccion } from '@/components/dominio/DialogoDeAccion'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import type { ListadoDePersonal } from '@/constants/listados'

export type Renglon = {
  /** Clave local; los ya guardados traen además `id`. */
  clave: string
  id?: string
  fecha: string
  horas: number
  nota?: string
  /** Campos propios de cada planilla (recargo/BPS, o causal/descuenta). */
  extra: Record<string, unknown>
}

/**
 * Campo de una fila de la lista rápida. Abajo de `sm` la fila se apila y cada campo
 * ocupa su renglón con su etiqueta visible; desde `sm` el envoltorio desaparece con
 * `display: contents` y el campo vuelve a ser hijo directo de la fila, así el
 * layout de escritorio queda igual que antes.
 */
export function CampoLista({
  etiqueta,
  children,
}: {
  etiqueta: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 sm:contents">
      <span className="text-xs text-muted-foreground sm:hidden">{etiqueta}</span>
      {children}
    </div>
  )
}

/**
 * Anchos de las columnas de la lista rápida desde `sm`. Los comparten el encabezado y
 * los campos, para que una sola definición mantenga la alineación.
 *
 * La columna del día suma el input, el gap y el nombre del día de la semana:
 * 64 + 8 + 36 = 108px. El nombre va a ancho fijo porque «Dom» mide 31,6px y «Jue»
 * 22,4px, y esa diferencia corría 9px todo lo que venía después.
 */
export const COL_DIA = 'sm:w-[108px]'
export const COL_NOMBRE_DIA = 'w-9'
export const COL_HORAS = 'sm:w-20'
export const COL_OPCION = 'sm:w-32'
/** Columna del interruptor de la fila. El ancho lo fija la etiqueta del encabezado. */
export const COL_INTERRUPTOR = 'sm:w-24'
/** Columna angosta: un dato que no se edita, o un interruptor de etiqueta corta. */
export const COL_ANGOSTA = 'sm:w-14'

/**
 * Campo numérico de la lista rápida.
 *
 * Un `<input type="number">` controlado directamente por el número **no se puede vaciar**:
 * al borrar el último dígito el valor intermedio es `''`, que no es un número aceptable, el
 * padre lo rechaza y React repone el dígito anterior. Visto desde el teclado, el primer
 * dígito no se puede borrar y solo se puede escribir a su derecha.
 *
 * Se resuelve guardando el texto tipeado en estado local y avisando al padre únicamente
 * cuando ese texto ya es un número que `aceptar` admite. Al salir del campo, si quedó vacío
 * o inválido, se repone el último valor bueno: ningún renglón queda sin número.
 */
export function CampoNumero({
  valor,
  onValor,
  aceptar,
  className,
  ...resto
}: {
  valor: number
  onValor: (n: number) => void
  /** Qué números puede recibir el padre. El resto se tipea igual, pero no se propaga. */
  aceptar: (n: number) => boolean
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [texto, setTexto] = useState(String(valor))

  // Estado derivado de la prop: se sincroniza durante el render comparando contra el valor
  // anterior, no con un efecto (regla `set-state-in-effect`).
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    setTexto(String(valor))
  }

  function esBueno(t: string): boolean {
    if (t.trim() === '') return false
    const n = Number(t)
    return Number.isFinite(n) && aceptar(n)
  }

  return (
    <Input
      {...resto}
      type="number"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        if (esBueno(e.target.value)) onValor(Number(e.target.value))
      }}
      onBlur={(e) => {
        if (!esBueno(texto)) setTexto(String(valor))
        resto.onBlur?.(e)
      }}
      className={cn('tabular', className)}
    />
  )
}

/**
 * Día del renglón en la lista rápida. La planilla es de un mes, así que alcanza con el
 * número de día; al costado se anota el día de la semana, que es el dato que hace falta
 * para saber si ese día genera boletos adicionales (§6.5).
 *
 * El input lleva ancho y padding propios: con el `px-3` del original, los 56px no alcanzaban
 * para dos dígitos —medido, «11» y «31» desbordaban— porque las flechas del spinner se comen
 * unos 20px por dentro de la caja. Con 64px y `px-2` entran los dos dígitos y sobra.
 */
export function CampoDia({
  valor,
  onChange,
  soloLectura,
}: {
  valor: string
  onChange: (iso: string) => void
  soloLectura?: boolean
}) {
  const f = parseFechaISO(valor)
  const ultimo = diasDelMes(f)

  return (
    <div className="flex items-center gap-2">
      <CampoNumero
        valor={dia(f)}
        // El ISO es AAAA-MM-DD: se reemplaza solo el día para no salir del mes.
        onValor={(n) => onChange(`${valor.slice(0, 8)}${String(n).padStart(2, '0')}`)}
        aceptar={(n) => Number.isInteger(n) && n >= 1 && n <= ultimo}
        min={1}
        max={ultimo}
        step={1}
        disabled={soloLectura}
        className="w-16 px-2"
        aria-label="Día"
      />
      <span className={cn('shrink-0 text-sm text-muted-foreground', COL_NOMBRE_DIA)}>
        {nombreDiaSemanaCorto(diaSemana(f))}
      </span>
    </div>
  )
}

/**
 * Horas tal como se tipean en el popover del día: acepta coma o punto decimal. Devuelve
 * `null` mientras no haya un número positivo, que es lo que deshabilita el «Agregar».
 *
 * No usa `parsearNumero` de `lib/format/money`: ese trata el punto como separador de miles y
 * convertiría «2.5» en 25, que acá sería un error de carga silencioso.
 */
export function horasTipeadas(texto: string, admiteCero = false): number | null {
  const valor = Number(texto.trim().replace(',', '.'))
  if (!Number.isFinite(valor)) return null
  return valor > 0 || (admiteCero && valor === 0) ? valor : null
}

/**
 * Horas de un día, ya sumadas, tal como se muestran en la celda del calendario.
 *
 * Las dos planillas muestran **lo mismo**: las horas extras con `+` y las inasistencias con
 * `−`, vengan de la planilla que se está editando o de la otra. Lo único que cambia entre
 * pantallas es el popover de carga.
 */
export type MarcaDia = {
  /** `+` horas extras, `−` inasistencias. */
  signo: '+' | '−'
  horas: number
  /**
   * El tratamiento normal del tipo: con descuento de BPS en las extras, y que se descuenta
   * del sueldo en las inasistencias. La excepción es la que se resalta.
   */
  plena: boolean
  /** false para los renglones de la sesión que todavía no se guardaron. */
  guardada: boolean
}

export type DiaContexto = {
  fecha: string
  /** Horas que le corresponden al día según el régimen vigente. */
  horasRegimen: number
  feriado: string | null
  feriadoNoLaborable: boolean
  /**
   * Novedades **guardadas** del día, de los dos tipos. La planilla descarta las de su propio
   * signo y las reemplaza por sus renglones en vivo, que incluyen lo que todavía no se guardó.
   */
  marcas: MarcaDia[]
}

/**
 * Lo que muestra una celda del calendario, ya sumado. La celda se lee en dos tercios —arriba
 * lo que pasa por el BPS, abajo lo que no— y cada tercio dice lo mismo:
 *
 *     {régimen}  −{faltas}  +{extras}
 *
 * El **régimen y las faltas van al tercio que le toca a la empleada ese mes**: arriba si
 * aporta, abajo si no. No se parten, porque no hay dos regímenes a la vez ni faltas «del otro
 * libro» (§1.7.2 de IMPLEMENTATION_HINTS). Las **horas extras sí se parten**, por su marca de
 * BPS, que es justamente lo que decide en qué tabla de la liquidación caen (§6.6).
 */
type CeldaDia = {
  regimen: number
  faltas: number
  extrasConBps: number
  extrasSinBps: number
  /** Si el régimen y las faltas van arriba (aporta) o abajo (no aporta). */
  regimenArriba: boolean
}

function contarCelda(marcas: MarcaDia[], regimen: number, aportaBps: boolean | null): CeldaDia {
  const celda: CeldaDia = {
    regimen,
    faltas: 0,
    extrasConBps: 0,
    extrasSinBps: 0,
    // `null` no es «no aporta» (§1.7.3): sin registro se lee como el caso normal, que es el
    // que aporta. Ese mes tampoco se puede liquidar, así que no hay nada que adivinar acá.
    regimenArriba: aportaBps !== false,
  }
  for (const m of marcas) {
    // El cero cuenta: es la marca de §6.5 que incluye el día en el pago de boletos. Suma 0,
    // pero hace que el `+0` se dibuje y se pueda abrir para borrarlo.
    if (!(m.horas >= 0)) continue
    if (m.signo === '−') celda.faltas += m.horas
    else if (m.plena) celda.extrasConBps += m.horas
    else celda.extrasSinBps += m.horas
  }
  return celda
}

/**
 * §6.4 — las horas de régimen que la celda **tiene** que mostrar.
 *
 * En un feriado **no laborable** el régimen no se trabaja: `calcularBoletos` saltea el día y
 * la liquidación no lo cuenta ni lo descuenta. Mostrar ahí las horas en letra grande decía
 * que ese día se trabaja, que es justo lo que no pasa. No se ocultan por CSS: no llegan a la
 * celda, así que tampoco están en la etiqueta accesible, que sale del mismo número.
 *
 * El feriado **laborable** —Carnaval, Turismo— no entra acá: se trabaja normalmente y sus
 * horas son las del régimen, como cualquier otro día. Lo que lo distingue en la celda es el
 * borde, que el calendario ya le pone a los dos tipos.
 */
function horasDeRegimenVisibles(contexto: DiaContexto | undefined): number {
  if (!contexto || contexto.feriadoNoLaborable) return 0
  return contexto.horasRegimen
}

/** Si hay algún renglón de horas extras, aunque sea de cero horas (§6.5). */
function hayExtras(marcas: MarcaDia[], plena: boolean): boolean {
  return marcas.some((m) => m.signo === '+' && m.plena === plena && m.horas >= 0)
}

/**
 * La cuenta de un tercio de la celda: el régimen en letra grande y, en letra normal, las faltas
 * con `−` y las horas extras con `+`.
 *
 * Cada pieza se dibuja solo si tiene algo que decir: un tercio sin nada queda vacío en vez de
 * mostrar ceros, que en una celda de 40px son ruido. La excepción es el `+0` de §6.5, que
 * **tiene** que verse: es la marca que suma el boleto del día, y si no se viera no habría forma
 * de saber que está ni de abrirla para borrarla.
 */
function CuentaDelTercio(props: {
  /** Horas del régimen, o `null` si este no es el tercio de la empleada. */
  regimen: number | null
  faltas: number
  extras: number
  /** Si hay renglón de horas extras, aunque sume cero. */
  hayExtras: boolean
}) {
  const regimen = props.regimen !== null && props.regimen > 0 ? props.regimen : null
  if (regimen === null && props.faltas === 0 && !props.hayExtras) return null

  return (
    <span className="flex items-baseline gap-px tabular text-primary">
      {regimen !== null ? (
        <span className="text-sm leading-none font-medium sm:text-base lg:text-lg">
          {formatearCantidad(regimen)}
        </span>
      ) : null}
      {props.faltas > 0 ? (
        <span className="text-[10px] leading-none sm:text-xs lg:text-sm">
          −{formatearCantidad(props.faltas)}
        </span>
      ) : null}
      {props.hayExtras ? (
        <span className="text-[10px] leading-none sm:text-xs lg:text-sm">
          +{formatearCantidad(props.extras)}
        </span>
      ) : null}
    </span>
  )
}

/**
 * La etiqueta accesible de la celda: dice con palabras lo que la celda dice con la posición de
 * cada número, que para un lector de pantalla no existe.
 */
function etiquetaDeCelda(
  dia: number,
  contexto: DiaContexto | undefined,
  celda: CeldaDia,
  marcas: MarcaDia[],
): string {
  const cargas: string[] = []
  if (celda.faltas > 0) cargas.push(`${formatearCantidad(celda.faltas)} h de falta`)
  if (hayExtras(marcas, true))
    cargas.push(`${formatearCantidad(celda.extrasConBps)} h extras con BPS`)
  if (hayExtras(marcas, false))
    cargas.push(`${formatearCantidad(celda.extrasSinBps)} h extras sin aportes`)

  return [
    String(dia),
    contexto?.feriado,
    celda.regimen > 0 ? `${formatearCantidad(celda.regimen)} h de régimen` : null,
    cargas.length > 0 ? cargas.join(', ') : 'sin cargas',
  ]
    .filter(Boolean)
    .join(' — ')
}

export type PlanillaMensualProps = {
  empleadoId: string
  alias: string
  nombreCompleto: string
  /** De qué listado se vino, para el breadcrumb del encabezado. */
  listadoDeOrigen: ListadoDePersonal
  periodo: string
  /** Ruta base de la planilla, para navegar entre meses. */
  ruta: string
  titulo: string
  /** Ítem del menú de la empleada que queda marcado. */
  claveMenu: 'horas-extras' | 'faltas'
  /** Datos por día del período: horas del régimen y feriados. */
  dias: DiaContexto[]
  /** Renglones ya guardados. */
  guardados: Renglon[]
  /** Estado de la liquidación del período, para el encabezado. */
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  /**
   * Información extra del encabezado (valores hora vigentes). Recibe los renglones de la
   * sesión porque el formato de sus importes depende de ellos: los decimales se muestran u
   * ocultan mirando **todos** los importes de la pantalla, los de arriba y los del pie (§1.3).
   */
  encabezado: (renglones: Renglon[]) => React.ReactNode
  /** Contenido del popover de carga de un día. */
  renderPopover: (props: {
    fecha: string
    contexto: DiaContexto
    renglones: Renglon[]
    agregar: (renglon: Omit<Renglon, 'clave' | 'fecha'>) => void
    quitar: (clave: string) => void
    cerrar: () => void
  }) => React.ReactNode
  /** Signo con el que esta planilla suma en la celda: `+` extras, `−` inasistencias. */
  signo: MarcaDia['signo']
  /**
   * §1.7.3 — el aporte a BPS **del mes de la planilla**, no el de hoy. Decide en qué tercio de
   * la celda van el régimen y las faltas. `null` —sin registro de aporte— se lee como el caso
   * normal: arriba.
   */
  aportaBps: boolean | null
  /**
   * §6.5 — las horas extras admiten renglones en cero: no pagan nada, marcan que ese día fue
   * a trabajar para que entre en el cálculo de boletos. Las inasistencias no.
   */
  admiteCero?: boolean
  /** Confirmación antes de guardar, o `null` si el lote no la necesita. */
  confirmacionAlGuardar?: (renglones: Renglon[]) => string | null
  /** Si el renglón lleva el tratamiento normal de su tipo (con BPS / se descuenta). */
  esPlena: (renglon: Renglon) => boolean
  /** Fila del modo lista rápida. */
  renderFilaLista: (props: {
    renglon: Renglon
    contexto: DiaContexto | undefined
    actualizar: (cambios: Partial<Renglon>) => void
    quitar: () => void
  }) => React.ReactNode
  /** Resumen del pie: se calcula sobre los renglones de la sesión. */
  renderResumen: (renglones: Renglon[]) => React.ReactNode
  /**
   * Campos `extra` con los que nace un renglón del botón «Agregar renglón». Es una
   * función porque cada planilla los toma de su propio estado persistente, el mismo
   * que usa el popover.
   */
  extraNuevoRenglon: () => Record<string, unknown>
  /**
   * Etiquetas de las tres columnas que cambian entre planillas. Las otras dos —el día y
   * las horas del régimen— son iguales en las dos, así que el encabezado se arma acá.
   */
  etiquetaEntrada: string
  etiquetaOpcion: string
  etiquetaInterruptor: string
  /**
   * Guardado en lote. El aviso de §6.11 lo emite la acción y aparece una sola vez para todo
   * el lote; la planilla se recarga sola cuando cambian los renglones guardados.
   */
  onGuardar: (renglones: Renglon[], borrar: string[]) => void
  enviando: boolean
  soloLectura?: boolean
}

const ESTADO_TEXTO = {
  SIN_LIQUIDAR: 'Sin liquidar',
  LIQUIDADA: 'Liquidada',
  LIQUIDADA_Y_PAGADA: 'Liquidada y pagada',
} as const

let contador = 0
function nuevaClave(): string {
  contador += 1
  return `r${contador}`
}

/**
 * Firma del contenido editable de un renglón, para detectar si se editó uno ya guardado.
 *
 * Las claves de `extra` se ordenan porque el objeto se arma en varios lugares —la carga
 * inicial, el popover, cada control de la fila— y el orden de inserción no es el mismo en
 * todos. Sin ordenar, dos renglones idénticos podrían dar firmas distintas y la planilla
 * quedaría avisando de cambios que no existen.
 */
/**
 * Salida que quedó esperando confirmación porque hay renglones en borrador.
 *
 * `vista` es el cambio entre calendario y lista rápida, que **no** pierde nada: los
 * renglones son los mismos en las dos vistas. `salir` es todo lo demás —cambiar de mes, el
 * menú, la migaja al empleado—, que sí se lleva el borrador. El texto del diálogo cambia
 * según el caso para no avisar de una pérdida que no va a pasar.
 */
type SalidaPendiente = { motivo: 'vista' | 'salir'; accion: () => void }

/**
 * Recorte de la Navigation API, que es la única forma de interceptar el botón atrás.
 * TypeScript todavía no la declara en `lib.dom`, así que se describe acá lo que se usa.
 */
type EventoNavegacion = Event & {
  navigationType: string
  destination?: { index: number }
}
type ApiNavegacion = {
  currentEntry?: { index: number }
  addEventListener: (tipo: 'navigate', manejador: (e: EventoNavegacion) => void) => void
  removeEventListener: (tipo: 'navigate', manejador: (e: EventoNavegacion) => void) => void
}

function firma(renglon: Renglon): string {
  const extra = Object.keys(renglon.extra)
    .sort()
    .map((k) => `${k}=${String(renglon.extra[k])}`)
    .join('|')
  return `${renglon.fecha}|${renglon.horas}|${renglon.nota ?? ''}|${extra}`
}

export function PlanillaMensual(props: PlanillaMensualProps) {
  const router = useRouter()
  const periodo = useMemo(() => parsePeriodo(props.periodo), [props.periodo])
  const hoyISO = useMemo(() => aISO(hoy()), [])

  const [renglones, setRenglones] = useState<Renglon[]>(props.guardados)
  const [borrar, setBorrar] = useState<string[]>([])
  const [modoLista, setModoLista] = useState(false)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const [foco, setFoco] = useState<string | null>(null)
  const [salida, setSalida] = useState<SalidaPendiente | null>(null)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)
  const grillaRef = useRef<HTMLDivElement>(null)
  /** Se levanta justo antes de una navegación con carga completa ya confirmada, para que el
   * aviso del navegador no vuelva a preguntar lo mismo. */
  const saliendoRef = useRef(false)

  // Al cambiar de mes, o después de guardar, la planilla se recarga con lo guardado. Es
  // estado derivado de las props: se ajusta durante el render comparando contra el valor
  // anterior, en vez de con un efecto.
  const [guardadosPrevios, setGuardadosPrevios] = useState(props.guardados)
  if (props.guardados !== guardadosPrevios) {
    setGuardadosPrevios(props.guardados)
    setRenglones(props.guardados)
    setBorrar([])
    setDiaAbierto(null)
  }

  // Hay cambios si se borró algo, si se agregó un renglón nuevo, o si se editó alguno de
  // los que ya estaban guardados: la acción de guardado hace `update` de los que traen `id`,
  // así que editar el día o las horas de un renglón guardado también se tiene que poder
  // guardar. Comparar solo la cantidad dejaba «Guardar» deshabilitado en ese caso.
  const hayCambios = useMemo(() => {
    if (borrar.length > 0) return true
    if (renglones.length !== props.guardados.length) return true
    const previos = new Map(props.guardados.map((r) => [r.id, r]))
    return renglones.some((r) => {
      if (!r.id) return true
      const previo = previos.get(r.id)
      return !previo || firma(r) !== firma(previo)
    })
  }, [renglones, borrar, props.guardados])

  // §7.1 — cerrar o recargar con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!hayCambios) return
    function alSalir(e: BeforeUnloadEvent) {
      // Si la salida ya se confirmó en nuestro diálogo, no se pregunta dos veces.
      if (saliendoRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [hayCambios])

  /**
   * §7.1 — salir de la planilla por un link tampoco puede llevarse el borrador en silencio.
   *
   * `beforeunload` solo cubre recargar o cerrar la pestaña: las navegaciones del App Router
   * no lo disparan, así que irse por el menú perdía los renglones sin avisar. Mientras haya
   * cambios se interceptan los clics en cualquier `<a href>` en **fase de captura**, que es
   * la que corre antes del handler del `Link` de Next.
   *
   * Se hace acá, con un listener propio, y no con el `onNavigate` de `Link`: si no, cada
   * link de la aplicación —menú, drawer, migajas— tendría que conocer el estado de esta
   * pantalla, y el bloqueo dejaría de ser auditable en un solo lugar.
   */
  useEffect(() => {
    if (!hayCambios) return

    function alClic(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      // Con modificadores el navegador abre en otra pestaña o ventana: no se pierde nada.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      if (!(e.target instanceof Element)) return
      const ancla = e.target.closest('a[href]')
      if (!(ancla instanceof HTMLAnchorElement)) return
      if (ancla.target === '_blank' || ancla.hasAttribute('download')) return

      const href = ancla.getAttribute('href') ?? ''
      // Un ancla interna, o un link a donde ya estamos, no se lleva nada.
      if (href.startsWith('#') || ancla.href === window.location.href) return

      e.preventDefault()
      e.stopPropagation()

      // `/oauth2/*` lo atiende el proxy, no el App Router (§3.5): necesita carga completa.
      const porElRouter = ancla.origin === window.location.origin && !href.startsWith('/oauth2')

      setSalida({
        motivo: 'salir',
        accion: () => {
          if (porElRouter) {
            router.push(href)
          } else {
            saliendoRef.current = true
            window.location.assign(ancla.href)
          }
        },
      })
    }

    document.addEventListener('click', alClic, true)
    return () => document.removeEventListener('click', alClic, true)
  }, [hayCambios, router])

  /**
   * §7.1 — el botón atrás del navegador.
   *
   * El aviso nativo no se puede usar acá: **está verificado que `beforeunload` no se
   * dispara** al volver atrás dentro de la aplicación. Es una travesía del historial en el
   * mismo documento, no una descarga, así que el navegador no tiene nada que avisar; el
   * aviso nativo sale solo al recargar o cerrar la pestaña.
   *
   * Lo que sí permite cancelar una travesía es la Navigation API, y con ella se muestra el
   * mismo diálogo que las demás salidas.
   *
   * Soporte: **verificado en Chromium y en Firefox**. En Firefox se confirmó que el atrás
   * abre *este* diálogo y no el aviso nativo, que es la forma de saber que la API está
   * interceptando y no que se colgó de un `beforeunload` entre documentos.
   * Safari quedó sin probar. El guardia se monta solo si `window.navigation` existe, así
   * que en un navegador que no la tenga no rompe nada: simplemente el atrás se lleva el
   * borrador sin aviso. Si hay que verificarlo en otro navegador, `typeof window.navigation`
   * en la consola dice si está.
   */
  useEffect(() => {
    if (!hayCambios) return

    const navegacion = (window as unknown as { navigation?: ApiNavegacion }).navigation
    if (!navegacion) return

    function alNavegar(e: EventoNavegacion) {
      // Solo el atrás y el adelante: los `push` del router ya pasaron por el diálogo.
      if (e.navigationType !== 'traverse' || !e.cancelable) return
      if (saliendoRef.current) return

      const destino = e.destination?.index
      e.preventDefault()

      setSalida({
        motivo: 'salir',
        accion: () => {
          saliendoRef.current = true
          // Se repite el salto real, que puede ser adelante o de más de un paso: el atrás
          // sostenido del navegador permite volver varias entradas de una vez.
          const actual = navegacion?.currentEntry?.index ?? -1
          if (destino !== undefined && destino >= 0 && actual >= 0) {
            window.history.go(destino - actual)
          } else {
            window.history.back()
          }
        },
      })
    }

    navegacion.addEventListener('navigate', alNavegar)
    return () => navegacion.removeEventListener('navigate', alNavegar)
  }, [hayCambios])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Renglon[]>()
    for (const r of renglones) {
      const lista = mapa.get(r.fecha) ?? []
      lista.push(r)
      mapa.set(r.fecha, lista)
    }
    return mapa
  }, [renglones])

  const contextoPorDia = useMemo(
    () => new Map(props.dias.map((d) => [d.fecha, d])),
    [props.dias],
  )

  /**
   * Día en el que va a caer el próximo «Agregar renglón», o null si no queda
   * ninguno y el botón tiene que quedar deshabilitado.
   *
   * La carga avanza hacia adelante: el día siguiente al último que ya tiene algo,
   * sin importar si es un renglón guardado o de esta sesión. Al pasarse de fin de
   * mes se vuelve a buscar el primer día libre, así se pueden completar los huecos
   * que quedaron atrás.
   *
   * Se deriva de los renglones y no de un contador propio, para que siga tanto las
   * ediciones de fecha a mano como el «Descartar», que devuelve la lista a lo
   * guardado.
   */
  const fechaNuevoRenglon = useMemo(() => {
    const fechas = props.dias.map((d) => d.fecha)
    if (fechas.length === 0) return null

    const ocupados = new Set(renglones.map((r) => r.fecha))
    const primerLibre = fechas.find((f) => !ocupados.has(f)) ?? null

    if (renglones.length === 0) return primerLibre ?? fechas[0]

    // Las fechas son ISO, así que el máximo sale comparando como texto.
    const ultima = renglones.map((r) => r.fecha).reduce((a, b) => (a > b ? a : b))
    const siguiente = fechas.find((f) => f > ultima)
    if (siguiente) return siguiente

    // Se llegó a fin de mes: se completan los huecos de atrás.
    return primerLibre
  }, [props.dias, renglones])

  /**
   * No se agrega otro renglón mientras haya uno sin horas cargadas. Donde el cero es un valor
   * legítimo —las horas extras, §6.5— el renglón en cero no bloquea nada.
   */
  const hayRenglonSinHoras = useMemo(
    () => renglones.some((r) => (props.admiteCero ? !(r.horas >= 0) : !(r.horas > 0))),
    [renglones, props.admiteCero],
  )

  const agregar = useCallback((fecha: string, datos: Omit<Renglon, 'clave' | 'fecha'>) => {
    setRenglones((previos) => [...previos, { ...datos, clave: nuevaClave(), fecha }])
  }, [])

  const quitar = useCallback((clave: string) => {
    setRenglones((previos) => {
      const objetivo = previos.find((r) => r.clave === clave)
      // Los renglones ya guardados se marcan para borrar en el mismo lote.
      if (objetivo?.id) setBorrar((b) => [...b, objetivo.id!])
      return previos.filter((r) => r.clave !== clave)
    })
  }, [])

  const actualizar = useCallback((clave: string, cambios: Partial<Renglon>) => {
    setRenglones((previos) =>
      previos.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)),
    )
  }, [])

  /** Corre `accion`, o la deja esperando confirmación si hay renglones en borrador. */
  function pedirSalida(motivo: SalidaPendiente['motivo'], accion: () => void) {
    if (!hayCambios) {
      accion()
      return
    }
    setSalida({ motivo, accion })
  }

  function irAMes(delta: number) {
    pedirSalida('salir', () =>
      router.push(`${props.ruta}?periodo=${aPeriodoISO(sumarMeses(periodo, delta))}`),
    )
  }

  function guardar() {
    const aviso = props.confirmacionAlGuardar?.(renglones) ?? null
    if (aviso) {
      setConfirmacion(aviso)
      return
    }
    props.onGuardar(renglones, borrar)
  }

  function descartar() {
    setRenglones(props.guardados)
    setBorrar([])
  }

  // §7.1 — las flechas del teclado mueven de día, para cargar todo sin usar el mouse.
  function alTeclado(e: React.KeyboardEvent, fecha: string) {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    const delta = deltas[e.key]
    if (delta === undefined) return

    e.preventDefault()
    const todos = props.dias.map((d) => d.fecha)
    const indice = todos.indexOf(fecha)
    const destino = todos[indice + delta]
    if (!destino) return

    setFoco(destino)
    grillaRef.current
      ?.querySelector<HTMLButtonElement>(`[data-fecha="${destino}"]`)
      ?.focus()
  }

  const diasDelMes = useMemo(() => diasDelPeriodo(periodo), [periodo])
  // Celdas vacías para que el 1° caiga en su columna (la semana arranca en lunes).
  const relleno = diaSemana(diasDelMes[0])
  /**
   * Y las de la cola, para que la cuadrícula cierre un rectángulo: sin ellas la última fila
   * queda mordida y se ve el borde por dentro. Antes no hacían falta, porque las celdas tenían
   * aire entre sí y cada fila terminaba donde terminaba.
   */
  const rellenoFinal = (7 - ((relleno + diasDelMes.length) % 7)) % 7

  const noPuedeAvanzar = periodo.getTime() >= parsePeriodo(aPeriodoISO(hoy())).getTime()

  return (
    <div className="space-y-4 pb-48 sm:pb-32">
      {/* Encabezado */}
      <div className="space-y-3">
        {/*
          El encabezado y el menú son los mismos de la ficha: la planilla es una página aparte
          pero se ve adentro de la misma empleada. El título propio de la planilla no hace
          falta —el menú ya marca dónde estás— y repetirlo dejaba dos títulos en la pantalla.
        */}
        <EncabezadoEmpleada
          empleadoId={props.empleadoId}
          alias={props.alias}
          nombreCompleto={props.nombreCompleto}
          activa={props.claveMenu}
          listadoDeOrigen={props.listadoDeOrigen}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => irAMes(-1)} aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-40 text-center font-medium">
              {formatearPeriodoCapitalizado(periodo)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => irAMes(1)}
              disabled={noPuedeAvanzar}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/*
            El estado de la liquidación es un link a la liquidación **de ese mes**: «Sin
            liquidar» sin decir dónde liquidar deja el trabajo a medias.
          */}
          <Link
            href={`/empleados/${props.empleadoId}/liquidacion?periodo=${props.periodo}`}
            className="rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {ESTADO_TEXTO[props.estadoLiquidacion]}
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => pedirSalida('vista', () => setModoLista((v) => !v))}
            className="ml-auto"
          >
            {modoLista ? (
              <>
                <CalendarDays className="size-4" aria-hidden /> Calendario
              </>
            ) : (
              <>
                <List className="size-4" aria-hidden /> Lista rápida
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">{props.encabezado(renglones)}</div>
      </div>

      {/* Cuerpo */}
      {modoLista ? (
        <div className="space-y-2 rounded-card bg-card shadow-soft border px-[22px] py-5">
          {renglones.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no cargaste nada. Agregá el primer renglón.
            </p>
          ) : (
            <>
              {/* Abajo de sm cada campo lleva su etiqueta al lado; desde sm alcanza una vez. */}
              <div className="hidden gap-2 pb-1 text-xs text-muted-foreground sm:flex">
                <span className={COL_DIA}>Día</span>
                <span className={COL_ANGOSTA}>Horas</span>
                <span className={COL_HORAS}>{props.etiquetaEntrada}</span>
                <span className={COL_OPCION}>{props.etiquetaOpcion}</span>
                <span className={COL_INTERRUPTOR}>{props.etiquetaInterruptor}</span>
              </div>
            </>
          )}
          {renglones.length === 0 ? null : (
            renglones
              .slice()
              .sort((a, b) => a.fecha.localeCompare(b.fecha))
              .map((renglon) => (
                <div
                  key={renglon.clave}
                  className="space-y-1 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {props.renderFilaLista({
                      renglon,
                      contexto: contextoPorDia.get(renglon.fecha),
                      actualizar: (cambios) => actualizar(renglon.clave, cambios),
                      quitar: () => quitar(renglon.clave),
                    })}
                  </div>

                  {/*
                    La nota se cargaba en el popover del calendario y no se veía en ningún
                    lado. Va en su propio renglón —no como una columna más— porque es texto
                    libre: en la fila no habría entrado sin recortar los otros campos, que ya
                    tienen 14px de holgura a 640px.
                  */}
                  <Input
                    value={renglon.nota ?? ''}
                    onChange={(e) => actualizar(renglon.clave, { nota: e.target.value })}
                    disabled={props.soloLectura}
                    placeholder="Nota (opcional)"
                    aria-label={`Nota del ${renglon.fecha}`}
                    className="h-8 border-dashed bg-transparent text-xs shadow-none"
                  />
                </div>
              ))
          )}

          {!props.soloLectura ? (
            <Button
              variant="outline"
              size="sm"
              disabled={fechaNuevoRenglon === null || hayRenglonSinHoras}
              onClick={() => {
                if (!fechaNuevoRenglon) return
                agregar(fechaNuevoRenglon, {
                  horas: 0,
                  extra: props.extraNuevoRenglon(),
                })
              }}
            >
              Agregar renglón
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          ref={grillaRef}
          className="rounded-card bg-card shadow-soft border px-2 py-4 sm:px-[22px] sm:py-5"
        >
          <div className="grid grid-cols-7 pb-2 text-center text-xs font-medium text-muted-foreground">
            {NOMBRES_DIAS_CORTOS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/*
            Cuadrícula sin aire entre celdas: los bordes se comparten y las esquinas van rectas
            —el redondeo de la tarjeta ya alcanza—. Las celdas llevan solo el borde de arriba y
            el de la izquierda, y la primera fila y la primera columna lo pierden, así no queda
            una línea doble contra el marco.

            Los selectores apuntan a `button` y no a `*` a propósito: los huecos del principio y
            del final del mes son `div` sin borde ni fondo, así que se ven como un vacío en la
            cuadrícula en vez de como días que existen. Los de la cola siguen estando aunque no
            se vean: sin ellos la última fila queda corta y la retícula se descuadra.
          */}
          <div
            className={cn(
              // El marco lleva el mismo ancho y el mismo color que las líneas internas: hace de
              // borde de arriba de la primera fila y de la izquierda de la primera columna, así
              // que si difiere se nota. El token de borde de la aplicación —7 % de alfa— sirve
              // para un marco pero desaparece como retícula de datos.
              'grid grid-cols-7 border-2 border-foreground/20',
              '[&>button]:border-t-2 [&>button]:border-l-2 [&>button]:border-foreground/20',
              '[&>button:nth-child(-n+7)]:border-t-0 [&>button:nth-child(7n+1)]:border-l-0',
            )}
          >
            {Array.from({ length: relleno }, (_, i) => (
              <div key={`hueco-${i}`} />
            ))}

            {diasDelMes.map((fechaDia, i) => {
              const fecha = aISO(fechaDia)
              const contexto = contextoPorDia.get(fecha)
              const delDia = porDia.get(fecha) ?? []
              // Las del propio signo salen de `renglones`, que ya incluye lo guardado y lo
              // que se está editando; del contexto solo se toman las del otro tipo.
              const marcas: MarcaDia[] = [
                ...(contexto?.marcas ?? []).filter((m) => m.signo !== props.signo),
                ...delDia.map((r) => ({
                  signo: props.signo,
                  horas: r.horas,
                  plena: props.esPlena(r),
                  guardada: Boolean(r.id),
                })),
              ]
              const celda = contarCelda(marcas, horasDeRegimenVisibles(contexto), props.aportaBps)
              const noTrabaja = (contexto?.horasRegimen ?? 0) <= 0
              const esHoy = fecha === hoyISO
              // El fondo marca los días en los que no se trabaja: domingos y feriados
              // no laborables. El borde marca que es feriado, de cualquiera de los dos
              // tipos, así un domingo feriado se distingue de un domingo común. El nombre
              // del feriado queda en el tooltip y en la etiqueta accesible, no en la celda.
              const esFeriado = !!contexto?.feriado
              const fondoNoHabil = esDomingo(fechaDia) || !!contexto?.feriadoNoLaborable

              /**
               * Cada celda dibuja su borde de **arriba y de la izquierda**; el de abajo se lo
               * pone el día siguiente de la misma columna y el de la derecha, el vecino. Con
               * los huecos de la cola transparentes eso deja dos días sin cerrar —el último
               * del mes por la derecha, y los de la fila anterior que quedan sobre un hueco—,
               * así que esos dibujan también el borde que les falta.
               *
               * Los del **relleno inicial** no tienen el problema: están antes que los días,
               * y cada día dibuja los dos bordes que lo tocan.
               */
              const enGrilla = relleno + i
              const ultimo = relleno + diasDelMes.length - 1
              const enUltimaFila = enGrilla >= relleno + diasDelMes.length + rellenoFinal - 7
              const cierraDerecha = enGrilla === ultimo && (enGrilla + 1) % 7 !== 0
              const cierraAbajo = !enUltimaFila && enGrilla + 7 > ultimo

              return (
                <Popover
                  key={fecha}
                  open={diaAbierto === fecha}
                  onOpenChange={(v) => setDiaAbierto(v ? fecha : null)}
                >
                  <PopoverAnchor asChild>
                    <button
                      type="button"
                      data-fecha={fecha}
                      onClick={() => !props.soloLectura && setDiaAbierto(fecha)}
                      onKeyDown={(e) => alTeclado(e, fecha)}
                      onFocus={() => setFoco(fecha)}
                      tabIndex={foco === fecha || (!foco && fechaDia.getUTCDate() === 1) ? 0 : -1}
                      disabled={props.soloLectura}
                      title={contexto?.feriado ?? undefined}
                      aria-label={etiquetaDeCelda(fechaDia.getUTCDate(), contexto, celda, marcas)}
                      className={cn(
                        'flex min-h-16 flex-col text-left text-xs transition-colors sm:min-h-20 lg:min-h-24',
                        'focus-visible:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                        noTrabaja && !fondoNoHabil && 'bg-muted/50',
                        fondoNoHabil && 'bg-destructive/10',
                        cierraDerecha && 'border-r-2 border-foreground/20',
                        cierraAbajo && 'border-b-2 border-foreground/20',
                        esFeriado && 'ring-1 ring-inset ring-destructive/60',
                        esHoy && 'relative z-10 ring-2 ring-inset ring-primary',
                        !props.soloLectura && 'hover:bg-accent',
                        // El día abierto se resalta como con marcador: el popover puede quedar
                        // lejos de la celda —se acomoda al borde de la pantalla— y sin esto no
                        // hay nada que diga a qué día se le está cargando. El color es
                        // `--resalte`, que existe porque ningún token servía: los fondos que ya
                        // conviven acá están todos a menos de 11 puntos de distancia entre sí.
                        // Gana al hover para que no se apague justo cuando el puntero está
                        // encima, que es casi siempre mientras se carga.
                        diaAbierto === fecha && 'bg-resalte hover:bg-resalte',
                      )}
                    >
                      {/*
                        Los dos tercios. El de arriba lleva lo que pasa por el BPS y el de abajo
                        lo que no; el número del día va de ancla en la esquina, chico.

                        **El tercio grande es el que lleva el régimen**: arriba si la empleada
                        aporta ese mes, abajo si no. El orden —con BPS arriba, sin aportes
                        abajo— no cambia; lo que cambia es dónde está el espacio, que tiene que
                        estar del lado que tiene números.

                        Las dos cuentas se apoyan **contra la división**: la de arriba en su
                        base y la de abajo en su tope, así se leen como un solo bloque de dos
                        renglones en vez de dos datos en esquinas opuestas de la celda.

                        El fondo tenue marca **el tercio que no es el de la empleada**: el de
                        abajo si aporta, el de arriba si no. Así el gris cae siempre sobre la
                        franja chica y vacía, y no sobre la que tiene los números.

                        La tipografía sube por breakpoint: en mobile la celda mide 46px y no da
                        para más, pero en pantalla grande sobra lugar y los números pueden
                        leerse de lejos.
                      */}
                      <span
                        className={cn(
                          'flex items-start justify-between gap-0.5 px-1 pt-0.5',
                          celda.regimenArriba ? 'flex-[2]' : 'flex-1 bg-foreground/[0.04]',
                        )}
                      >
                        <span
                          className={cn(
                            'text-[10px] leading-none text-muted-foreground sm:text-xs',
                            esHoy && 'font-semibold text-primary',
                          )}
                        >
                          {fechaDia.getUTCDate()}
                        </span>
                        <span className="self-end pb-0.5">
                          <CuentaDelTercio
                            regimen={celda.regimenArriba ? celda.regimen : null}
                            faltas={celda.regimenArriba ? celda.faltas : 0}
                            extras={celda.extrasConBps}
                            hayExtras={hayExtras(marcas, true)}
                          />
                        </span>
                      </span>

                      {/*
                        La división es una **banda con fondo propio** y no una línea punteada:
                        el token de borde de la aplicación es 7 % de alfa, así que dentro de una
                        celda de 46px una línea más no se distingue de las de la cuadrícula. La
                        banda además resuelve de quién es el número: cuelga de su propia franja
                        en vez de apoyarse en el filo, donde se leía como de la celda siguiente.
                      */}
                      <span
                        className={cn(
                          'flex items-start justify-end px-1 pt-0.5',
                          celda.regimenArriba ? 'flex-1 bg-foreground/[0.04]' : 'flex-[2]',
                        )}
                      >
                        <CuentaDelTercio
                          regimen={celda.regimenArriba ? null : celda.regimen}
                          faltas={celda.regimenArriba ? 0 : celda.faltas}
                          extras={celda.extrasSinBps}
                          hayExtras={hayExtras(marcas, false)}
                        />
                      </span>
                    </button>
                  </PopoverAnchor>

                  <PopoverContent align="start" className="w-72">
                    {props.renderPopover({
                      fecha,
                      contexto: contexto ?? {
                        fecha,
                        horasRegimen: 0,
                        feriado: null,
                        feriadoNoLaborable: false,
                        marcas: [],
                      },
                      renglones: delDia,
                      agregar: (datos) => agregar(fecha, datos),
                      quitar,
                      cerrar: () => setDiaAbierto(null),
                    })}
                  </PopoverContent>
                </Popover>
              )
            })}

            {Array.from({ length: rellenoFinal }, (_, i) => (
              <div key={`cola-${i}`} />
            ))}
          </div>
        </div>
      )}

      {/*
        §7.1 — confirmación única para todas las salidas con borrador.

        El énfasis va siempre en la opción que no pierde nada. Cambiar de vista no pierde el
        borrador, así que ahí el acento se queda en la acción; salir sí lo pierde, y entonces
        el acento pasa a «Seguir editando» y la salida queda en rojo. Eso es exactamente lo
        que hace `peligrosa`, que por eso no es fija sino el motivo de la salida.
      */}
      <DialogoDeAccion
        abierto={salida !== null}
        onCerrar={() => setSalida(null)}
        titulo={
          salida?.motivo === 'vista'
            ? '¿Cambiar de vista con renglones sin guardar?'
            : 'Tenés renglones sin guardar'
        }
        descripcion={
          salida?.motivo === 'vista'
            ? 'Los renglones en borrador no se pierden: son los mismos en las dos vistas y en el calendario se ven en amarillo. Pero siguen sin guardarse.'
            : 'Si salís de la planilla se pierden los renglones en borrador. Guardalos o descartalos para conservarlos.'
        }
        etiquetaCancelar="Seguir editando"
        etiquetaConfirmar={salida?.motivo === 'vista' ? 'Cambiar de vista' : 'Salir sin guardar'}
        onConfirmar={() => {
          const accion = salida?.accion
          setSalida(null)
          accion?.()
        }}
        peligrosa={salida?.motivo === 'salir'}
      />

      {/*
        Confirmación de lo que el lote tiene de inhabitual, antes de guardarlo. Guardar no
        destruye nada, así que el acento se queda en la acción.
      */}
      <DialogoDeAccion
        abierto={confirmacion !== null}
        onCerrar={() => setConfirmacion(null)}
        titulo="Antes de guardar"
        descripcion={confirmacion}
        etiquetaCancelar="Descartar"
        etiquetaConfirmar="Continuar"
        onConfirmar={() => {
          setConfirmacion(null)
          props.onGuardar(renglones, borrar)
        }}
      />

      {/* Pie fijo (§7.1) */}
      {!props.soloLectura ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur no-print">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:pl-72">
            <div className="min-w-0 text-sm sm:flex-1">{props.renderResumen(renglones)}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={descartar}
                disabled={!hayCambios || props.enviando}
                className="flex-1 sm:flex-none"
              >
                Descartar
              </Button>
              <Button
                onClick={guardar}
                disabled={!hayCambios || props.enviando}
                className="flex-1 sm:flex-none"
              >
                {props.enviando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { nuevaClave, Trash2, Input }
