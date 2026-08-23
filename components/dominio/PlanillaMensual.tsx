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
  formatearPeriodoCapitalizado,
  hoy,
  nombreDiaSemanaCorto,
  NOMBRES_DIAS_CORTOS,
  parseFechaISO,
  parsePeriodo,
  sumarMeses,
} from '@/lib/format/dates'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

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
const COL_DIA = 'sm:w-[108px]'
const COL_NOMBRE_DIA = 'w-9'
const COL_HORAS = 'sm:w-24'
const COL_OPCION = 'sm:w-32'

/**
 * Día del renglón en la lista rápida. La planilla es de un mes, así que alcanza con el
 * número de día; al costado se anota el día de la semana, que es el dato que hace falta
 * para saber si ese día genera boletos adicionales (§6.5).
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
      <Input
        type="number"
        min={1}
        max={ultimo}
        step={1}
        value={dia(f)}
        disabled={soloLectura}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isInteger(n) || n < 1 || n > ultimo) return
          // El ISO es AAAA-MM-DD: se reemplaza solo el día para no salir del mes.
          onChange(`${valor.slice(0, 8)}${String(n).padStart(2, '0')}`)
        }}
        className="w-16 tabular"
        aria-label="Día"
      />
      <span className={cn('shrink-0 text-sm text-muted-foreground', COL_NOMBRE_DIA)}>
        {nombreDiaSemanaCorto(diaSemana(f))}
      </span>
    </div>
  )
}

export type DiaContexto = {
  fecha: string
  /** Horas que le corresponden al día según el régimen vigente. */
  horasRegimen: number
  feriado: string | null
  feriadoNoLaborable: boolean
}

export type PlanillaMensualProps = {
  empleadoId: string
  alias: string
  nombreCompleto: string
  periodo: string
  /** Ruta base de la planilla, para navegar entre meses. */
  ruta: string
  titulo: string
  /** Datos por día del período: horas del régimen y feriados. */
  dias: DiaContexto[]
  /** Renglones ya guardados. */
  guardados: Renglon[]
  /** Estado de la liquidación del período, para el encabezado. */
  estadoLiquidacion: 'SIN_LIQUIDAR' | 'LIQUIDADA' | 'LIQUIDADA_Y_PAGADA'
  /** Información extra del encabezado (valores hora vigentes). */
  encabezado: React.ReactNode
  /** Contenido del popover de carga de un día. */
  renderPopover: (props: {
    fecha: string
    contexto: DiaContexto
    renglones: Renglon[]
    agregar: (renglon: Omit<Renglon, 'clave' | 'fecha'>) => void
    quitar: (clave: string) => void
    cerrar: () => void
  }) => React.ReactNode
  /** Etiqueta corta de un renglón dentro de la celda del calendario. */
  renderEtiqueta: (renglon: Renglon) => React.ReactNode
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
  /** Etiqueta de la tercera columna en el encabezado de la lista: «Recargo» o «Causal». */
  etiquetaOpcion: string
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

export function PlanillaMensual(props: PlanillaMensualProps) {
  const router = useRouter()
  const periodo = useMemo(() => parsePeriodo(props.periodo), [props.periodo])
  const hoyISO = useMemo(() => aISO(hoy()), [])

  const [renglones, setRenglones] = useState<Renglon[]>(props.guardados)
  const [borrar, setBorrar] = useState<string[]>([])
  const [modoLista, setModoLista] = useState(false)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const [foco, setFoco] = useState<string | null>(null)
  const grillaRef = useRef<HTMLDivElement>(null)

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

  const hayCambios = useMemo(() => {
    if (borrar.length > 0) return true
    if (renglones.length !== props.guardados.length) return true
    return renglones.some((r) => !r.id)
  }, [renglones, borrar, props.guardados])

  // §7.1 — cerrar con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!hayCambios) return
    function alSalir(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
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
   * Se deriva de los renglones y no de un contador propio, para que siga tanto las
   * ediciones de fecha a mano como el «Descartar», que devuelve la lista a lo
   * guardado.
   */
  const fechaNuevoRenglon = useMemo(() => {
    const fechas = props.dias.map((d) => d.fecha)
    if (fechas.length === 0) return null

    // Los renglones de esta sesión son los que todavía no tienen id.
    const deLaSesion = renglones.filter((r) => !r.id).map((r) => r.fecha)

    if (deLaSesion.length === 0) {
      // Sin nada cargado se arranca en el primer día del mes que no tenga renglones.
      const ocupados = new Set(renglones.map((r) => r.fecha))
      const libre = fechas.find((f) => !ocupados.has(f))
      // Si el mes está completo se empieza por el principio: un día con un renglón
      // igual admite el del otro tipo.
      return libre ?? fechas[0]
    }

    // De ahí en adelante, el día siguiente al último cargado. Las fechas son ISO,
    // así que se comparan como texto.
    const ultima = deLaSesion.reduce((a, b) => (a > b ? a : b))
    return fechas.find((f) => f > ultima) ?? null
  }, [props.dias, renglones])

  /** No se agrega otro renglón mientras haya uno sin horas cargadas. */
  const hayRenglonSinHoras = useMemo(() => renglones.some((r) => !(r.horas > 0)), [renglones])

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

  function irAMes(delta: number) {
    if (hayCambios && !confirm('Tenés cambios sin guardar. ¿Salir igual?')) return
    router.push(`${props.ruta}?periodo=${aPeriodoISO(sumarMeses(periodo, delta))}`)
  }

  function guardar() {
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

  const noPuedeAvanzar = periodo.getTime() >= parsePeriodo(aPeriodoISO(hoy())).getTime()

  return (
    <div className="space-y-4 pb-48 sm:pb-32">
      {/* Encabezado */}
      <div className="space-y-3">
        <EncabezadoPagina
          className="mb-0"
          rotulo="Planilla mensual"
          titulo={props.titulo}
          bajada={
            <>
              <Link href={`/empleados/${props.empleadoId}`} className="hover:underline">
                {props.alias}
              </Link>{' '}
              — {props.nombreCompleto}
            </>
          }
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

          <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            {ESTADO_TEXTO[props.estadoLiquidacion]}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setModoLista((v) => !v)}
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

        <div className="text-sm text-muted-foreground">{props.encabezado}</div>
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
                <span className={COL_HORAS}>Horas</span>
                <span className={COL_OPCION}>{props.etiquetaOpcion}</span>
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
                  className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:border-0 sm:pb-0"
                >
                  {props.renderFilaLista({
                    renglon,
                    contexto: contextoPorDia.get(renglon.fecha),
                    actualizar: (cambios) => actualizar(renglon.clave, cambios),
                    quitar: () => quitar(renglon.clave),
                  })}
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
        <div ref={grillaRef} className="rounded-card bg-card shadow-soft border px-[22px] py-5">
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium text-muted-foreground">
            {NOMBRES_DIAS_CORTOS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: relleno }, (_, i) => (
              <div key={`hueco-${i}`} />
            ))}

            {diasDelMes.map((fechaDia) => {
              const fecha = aISO(fechaDia)
              const contexto = contextoPorDia.get(fecha)
              const delDia = porDia.get(fecha) ?? []
              const noTrabaja = (contexto?.horasRegimen ?? 0) <= 0
              const esHoy = fecha === hoyISO

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
                      aria-label={`${fechaDia.getUTCDate()} — ${contexto?.feriado ?? ''} ${
                        delDia.length > 0 ? `${delDia.length} renglones` : 'sin cargas'
                      }`}
                      className={cn(
                        'flex min-h-20 flex-col items-start gap-1 rounded-md border p-1.5 text-left text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        noTrabaja && 'bg-muted/50',
                        esHoy && 'ring-2 ring-primary',
                        !props.soloLectura && 'hover:bg-accent',
                      )}
                    >
                      <span className="flex w-full items-baseline justify-between">
                        <span className={cn('font-medium', esHoy && 'text-primary')}>
                          {fechaDia.getUTCDate()}
                        </span>
                        {contexto && contexto.horasRegimen > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            {contexto.horasRegimen} h
                          </span>
                        ) : null}
                      </span>

                      {contexto?.feriado ? (
                        <span className="line-clamp-2 text-[10px] text-destructive">
                          {contexto.feriado}
                        </span>
                      ) : null}

                      <span className="flex w-full flex-col gap-0.5">
                        {delDia.map((r) => (
                          <span key={r.clave}>{props.renderEtiqueta(r)}</span>
                        ))}
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
          </div>
        </div>
      )}

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
