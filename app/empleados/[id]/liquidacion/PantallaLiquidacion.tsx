'use client'

/**
 * §7.6 y §7.6.1 — desglose de la liquidación, con el bloque de cierre de la complementaria.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useAccion } from '@/hooks/useAccion'
import { anularLiquidacionConfirmada, confirmarLiquidacionMensual } from '@/actions/liquidaciones'
import { formatearImporteEntero, formatearCantidad, formatearHoras } from '@/lib/format/money'
import {
  formatearFecha,
  formatearPeriodoCapitalizado,
  parseFechaISO,
  parsePeriodo,
} from '@/lib/format/dates'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import type { ListadoDePersonal } from '@/constants/listados'
import { ListaLiquidaciones, type FilaLiquidacion } from './ListaLiquidaciones'
import { NavegadorDePeriodo } from './NavegadorDePeriodo'

export type LineaVista = {
  orden: number
  tabla: 'FORMAL' | 'INFORMAL'
  codigo: string
  descripcion: string
  cantidad: string | null
  valorUnitario: string | null
  importe: string
  signo: number
  destacada: boolean
}

type Libro = 'FORMAL' | 'INFORMAL'

/** Cómo se nombra cada libro: como título de columna y dentro de una oración. */
const TITULO_LIBRO: Record<Libro, string> = {
  FORMAL: 'Con BPS',
  INFORMAL: 'Sin aportes',
}

const ETIQUETA_LIBRO: Record<Libro, string> = {
  FORMAL: 'con BPS',
  INFORMAL: 'sin aportes',
}

type Previa = {
  id: string
  secuencia: number
  totalAPagar: string
  /** §4.14 — el pago se mira libro por libro. */
  pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA'
  /** Los libros que le faltan cobrar. */
  faltan: Libro[]
  confirmadaEn: string | null
}

export function PantallaLiquidacion(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  listadoDeOrigen: ListadoDePersonal
  periodo: string
  puedeEditar: boolean
  lineas: LineaVista[]
  valorHoraCalculado: string
  /** Del registro de salario vigente en el período (§5.2). */
  horasSemanales: string | null
  materiaGravada: string
  subtotal: string
  totalRecalculado: string
  totalYaLiquidado: string
  totalAPagar: string
  /** §7.6.1 — el cierre de la complementaria se calcula libro por libro. */
  porLibro: Record<Libro, { recalculado: string; yaLiquidado: string; aPagar: string }>
  avisos: string[]
  liquidaciones: FilaLiquidacion[]
  /** §7.6 — solo se puede ir atrás si hay algo antes que mirar. */
  puedeRetroceder: boolean
  /** §6.10 — no se ofrecen períodos futuros. */
  puedeAvanzar: boolean
  totalesPorPeriodo: Record<string, string>
  cedula: string | null
  /** ISO `AAAA-MM-DD`. */
  fechaIngreso: string
  previas: Previa[]
  lineasPersistidas: LineaVista[] | null
}) {
  const router = useRouter()
  const confirmacion = useAccion<{ id: string; secuencia: number }>()
  const anulacion = useAccion<undefined>()
  const enviando = confirmacion.enviando || anulacion.enviando
  const [dialogo, setDialogo] = useState<'COMPLEMENTARIA' | 'ANULAR' | null>(null)
  /**
   * §7.6 — las dos caras de la pantalla. Abre en el detalle del mes en curso, que es a lo que
   * se viene la mayoría de las veces; la lista dice qué meses están cerrados.
   *
   * Es estado local y no `?vista=` en la URL, igual que el conmutador de las planillas: así
   * las tres pantallas con vistas se manejan igual.
   */
  const [modoLista, setModoLista] = useState(false)

  const periodo = useMemo(() => parsePeriodo(props.periodo), [props.periodo])

  const ultima = props.previas.at(-1) ?? null
  // §7.6.1 — alcanza con que un libro esté pagado: ese asiento ya no se toca.
  const hayPagada = props.previas.some((p) => p.pago !== 'SIN_PAGAR')
  const pagadaEntera = props.previas.length > 0 && props.previas.every((p) => p.pago === 'PAGADA')
  const esComplementaria = props.previas.length > 0
  const diferencia = Number(props.totalAPagar)

  // §7.6 — una liquidación confirmada se muestra en modo lectura con sus valores persistidos.
  const enModoLectura = ultima !== null
  const lineasAMostrar =
    enModoLectura && props.lineasPersistidas ? props.lineasPersistidas : props.lineas

  /**
   * §6.2 — la liquidación se lee en dos tablas: la formal, que pasa por el BPS, y la informal,
   * con lo que se paga sin aportes. Cada una cierra en su propio total a pagar.
   *
   * Las dos salen de las mismas líneas, así que basta con agruparlas: la formal no existe si
   * la empleada no aporta BPS, y la informal solo si algo cayó en ella. Cuando queda una sola
   * tabla no se rotula: el título sobraría.
   */
  const tablas = (
    [
      { tabla: 'FORMAL', titulo: 'Conceptos con BPS' },
      { tabla: 'INFORMAL', titulo: 'Conceptos sin BPS' },
    ] as const
  )
    .map((t) => ({ ...t, lineas: lineasAMostrar.filter((l) => l.tabla === t.tabla) }))
    .filter((t) => t.lineas.length > 0)

  const dosTablas = tablas.length > 1

  /**
   * El total del período: la suma de los dos totales a pagar. Sale de las líneas y no de
   * `totalRecalculado` para que en modo lectura sea exactamente lo que muestran las tablas.
   */
  const totalGeneral = tablas.reduce(
    (acc, t) => acc + Number(t.lineas.find((l) => l.codigo === 'TOTAL')?.importe ?? 0),
    0,
  )

  /**
   * §7.6.1 — los libros que participan del cierre: los que tienen algo recalculado o algo ya
   * liquidado. Con uno solo, el bloque se lee igual que cuando no había libros.
   */
  const librosDelCierre = (['FORMAL', 'INFORMAL'] as const).filter((libro) => {
    const l = props.porLibro[libro]
    return Number(l.recalculado) !== 0 || Number(l.yaLiquidado) !== 0
  })
  const dosLibrosEnElCierre = librosDelCierre.length > 1

  /** Una celda por libro y, si hay dos, la del total. */
  function celdasDelCierre(
    campo: 'recalculado' | 'yaLiquidado' | 'aPagar',
    total: string,
    negativoEnRojo = false,
  ) {
    const celda = (valor: string, clave: string, borde: boolean) => (
      <td
        key={clave}
        className={cn(
          'pl-4 text-right tabular',
          borde && 'border-t pt-2',
          negativoEnRojo && Number(valor) < 0 && 'text-destructive',
        )}
      >
        {formatearImporteEntero(valor)}
      </td>
    )
    const borde = campo === 'aPagar'
    return [
      ...librosDelCierre.map((libro) => celda(props.porLibro[libro][campo], libro, borde)),
      ...(dosLibrosEnElCierre ? [celda(total, 'total', borde)] : []),
    ]
  }

  /**
   * §7.6 — aviso de que los parámetros actuales darían un resultado distinto. Se compara el
   * recálculo completo del período contra lo ya liquidado: si difieren, hay algo (una
   * novedad nueva, un cambio de salario, de boleto o de BPS) que la liquidación confirmada
   * no refleja.
   */
  const parametrosCambiaron =
    enModoLectura && Number(props.totalRecalculado) !== Number(props.totalYaLiquidado)

  function confirmar(aceptaComplementaria: boolean) {
    confirmacion.ejecutar(
      () =>
        confirmarLiquidacionMensual({
          empleadoId: props.empleadoId,
          periodo: props.periodo,
          aceptaComplementaria,
        }),
      {
        onExito: () => {
          setDialogo(null)
          router.refresh()
        },
      },
    )
  }

  function anular() {
    if (!ultima) return
    anulacion.ejecutar(() => anularLiquidacionConfirmada({ liquidacionId: ultima.id }), {
      onExito: () => {
        setDialogo(null)
        router.refresh()
      },
    })
  }

  return (
    <div className="space-y-5">
      <div className="no-print space-y-3">
        {/* El mismo encabezado y menú que la ficha: esto es una pantalla más de la empleada. */}
        <EncabezadoEmpleada
          empleadoId={props.empleadoId}
          alias={props.alias}
          nombreCompleto={props.nombreCompleto}
          activa="liquidaciones"
          listadoDeOrigen={props.listadoDeOrigen}
        />

        <NavegadorDePeriodo
          empleadoId={props.empleadoId}
          actual={{ periodo, tipo: 'MENSUAL' }}
          puedeRetroceder={props.puedeRetroceder}
          puedeAvanzar={props.puedeAvanzar}
          modoLista={modoLista}
          onModoLista={setModoLista}
          acciones={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Imprimir
            </Button>
          }
        />
      </div>

      {modoLista ? (
        <ListaLiquidaciones
          empleadoId={props.empleadoId}
          liquidaciones={props.liquidaciones}
          totalesPorPeriodo={props.totalesPorPeriodo}
        />
      ) : (
        <>
        {props.avisos.map((aviso) => (
          <p
            key={aviso}
            className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink"
          >
            {aviso}
          </p>
        ))}

        {enModoLectura ? (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {esComplementaria && props.previas.length > 1
              ? `Este período tiene ${props.previas.length} liquidaciones confirmadas.`
              : 'Este período ya tiene una liquidación confirmada.'}{' '}
            {pagadaEntera
              ? 'Ya fue pagada.'
              : hayPagada
                ? `Está pagada en parte: falta el pago ${(ultima?.faltan ?? [])
                    .map((l) => ETIQUETA_LIBRO[l])
                    .join(' y el pago ')}.`
                : 'Todavía no está pagada.'}
            {parametrosCambiaron
              ? ' Los parámetros actuales darían un resultado distinto: para aplicarlo hay que recalcular el período.'
              : ''}
          </p>
        ) : null}

        {/* Encabezado de la liquidación */}
        <div className="overflow-hidden rounded-card border bg-card shadow-soft">
          {/*
            Identifica al empleado y a la liquidación en la hoja impresa. El encabezado de la
            página es `no-print`, así que esta tarjeta es lo único que sale impreso: si el mes
            no está acá, la hoja no dice de qué liquidación se trata. Por eso «Fecha» va en el
            bloque, y en negrita.

            La cédula es opcional (§4.2): sin ella el renglón no se muestra, en vez de dejar un
            hueco o un «sin cédula».
          */}
          <div className="border-b px-[22px] pt-4 pb-3">
            <h2 className="text-[32px] leading-tight">{props.nombreCompleto}</h2>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {props.cedula ? (
                <>
                  <dt className="text-muted-foreground">CI</dt>
                  <dd className="tabular">{props.cedula}</dd>
                </>
              ) : null}

              <dt className="text-muted-foreground">Ingreso</dt>
              <dd className="tabular">{formatearFecha(parseFechaISO(props.fechaIngreso))}</dd>

              {props.horasSemanales !== null ? (
                <>
                  <dt className="text-muted-foreground">Horas semanales</dt>
                  <dd className="tabular">{formatearHoras(props.horasSemanales)}</dd>
                </>
              ) : null}

              <dt className="text-muted-foreground">Valor hora calculado</dt>
              <dd className="tabular">{formatearImporteEntero(props.valorHoraCalculado)}</dd>

              <dt className="text-muted-foreground">Fecha</dt>
              <dd className="font-semibold">{formatearPeriodoCapitalizado(periodo)}</dd>
            </dl>
          </div>

          {tablas.map((t) => (
            <table
              key={t.tabla}
              className={cn(
                'w-full border-b text-sm last:border-0',
                '[&>tbody>tr:first-child>td]:pt-4 [&>tbody>tr:last-child>td]:pb-4',
              )}
            >
              {/*
                El título de la tabla es su `caption`: con las dos tablas se muestra, y con una
                sola queda solo para el lector de pantalla, como estaba antes.
              */}
              <caption
                className={cn(
                  dosTablas
                    ? 'px-[22px] pt-4 text-left text-sm font-semibold text-muted-foreground'
                    : 'sr-only',
                )}
              >
                {dosTablas ? t.titulo : 'Desglose de la liquidación'}
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Valor unitario</th>
                  <th scope="col">Importe</th>
                </tr>
              </thead>
              <tbody>
                {t.lineas.map((linea) => {
                  const negativa = linea.signo === -1
                  return (
                    <tr
                      key={`${linea.orden}-${linea.codigo}`}
                      className={cn(
                        'border-b last:border-0',
                        linea.destacada && 'bg-muted/60 font-semibold',
                        linea.codigo === 'MATERIA_GRAVADA' && 'bg-muted/30 font-medium',
                      )}
                    >
                      <td className="py-3 pr-2 pl-[22px]">{linea.descripcion}</td>
                      <td className="px-2 py-3 text-right tabular text-muted-foreground">
                        {linea.cantidad ? formatearCantidad(linea.cantidad) : ''}
                      </td>
                      <td className="hidden px-2 py-3 text-right tabular text-muted-foreground sm:table-cell">
                        {linea.valorUnitario ? formatearImporteEntero(linea.valorUnitario) : ''}
                      </td>
                      <td
                        className={cn(
                          'py-3 pr-[22px] pl-2 text-right tabular',
                          // §8.5 — los importes negativos van en rojo y con signo menos.
                          negativa && 'text-destructive',
                        )}
                      >
                        {negativa
                          ? `−${formatearImporteEntero(linea.importe)}`
                          : formatearImporteEntero(linea.importe)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

          {/* Con las dos tablas, lo que se paga en total no está en ninguna de las dos. */}
          {dosTablas ? (
            <div className="flex justify-between gap-4 border-t-2 px-[22px] py-3 font-semibold">
              <span>Total general</span>
              <span className="tabular">{formatearImporteEntero(totalGeneral)}</span>
            </div>
          ) : null}
        </div>

        {/*
          §7.6.1 — bloque de cierre de la complementaria. La diferencia se calcula **por
          libro**, porque cada uno tiene su propio asiento y su propio pago: si el formal ya se
          pagó y el cambio del mes fue en el informal, la columna formal cierra en cero y ese
          asiento no se vuelve a tocar.

          Con un solo libro en juego se muestra una sola columna, como antes.
        */}
        {esComplementaria ? (
          <div className="overflow-x-auto rounded-card bg-card shadow-soft border-2 border-primary/40 px-[22px] py-5">
            <table className="w-full text-sm">
              <caption className="sr-only">Cierre de la liquidación complementaria</caption>
              <thead>
                <tr className="text-right text-muted-foreground">
                  <th scope="col" className="text-left font-normal"></th>
                  {librosDelCierre.map((libro) => (
                    <th scope="col" key={libro} className="pl-4 font-normal">
                      {dosLibrosEnElCierre ? TITULO_LIBRO[libro] : ''}
                    </th>
                  ))}
                  {dosLibrosEnElCierre ? (
                    <th scope="col" className="pl-4 font-normal">
                      Total
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="text-left font-normal">
                    Total recalculado del período
                  </th>
                  {celdasDelCierre('recalculado', props.totalRecalculado)}
                </tr>
                <tr className="text-muted-foreground">
                  <th scope="row" className="text-left font-normal">
                    − Ya liquidado{' '}
                    {props.previas.length === 1
                      ? '(liquidación #1)'
                      : `(${props.previas.length} liquidaciones)`}
                  </th>
                  {celdasDelCierre('yaLiquidado', props.totalYaLiquidado)}
                </tr>
                <tr className="font-semibold">
                  <th scope="row" className="border-t pt-2 text-left">
                    {diferencia < 0 ? '= DIFERENCIA A DESCONTAR' : '= DIFERENCIA A PAGAR'}
                  </th>
                  {celdasDelCierre('aPagar', props.totalAPagar, true)}
                </tr>
              </tbody>
            </table>

            {diferencia < 0 ? (
              <p className="mt-2 text-sm text-destructive">
                Queda como saldo a favor de la empresa en la cuenta corriente de la empleada hasta
                que se compense.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Acciones */}
        {props.puedeEditar ? (
          <div className="no-print flex flex-wrap gap-2">
            {hayPagada ? (
              <Button onClick={() => setDialogo('COMPLEMENTARIA')} disabled={enviando}>
                Generar liquidación complementaria
              </Button>
            ) : esComplementaria ? (
              <>
                <Button variant="outline" onClick={() => setDialogo('ANULAR')} disabled={enviando}>
                  Anular la liquidación #{ultima!.secuencia}
                </Button>
                <Button onClick={() => setDialogo('COMPLEMENTARIA')} disabled={enviando}>
                  Generar complementaria
                </Button>
              </>
            ) : (
              <Button onClick={() => confirmar(false)} disabled={enviando}>
                {enviando ? 'Confirmando…' : 'Confirmar liquidación'}
              </Button>
            )}
          </div>
        ) : null}

        {/* §7.6.1 — confirmación obligatoria antes de generar una complementaria */}
        </>
      )}

      <AlertDialog open={dialogo === 'COMPLEMENTARIA'} onOpenChange={(v) => !v && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generar liquidación complementaria</AlertDialogTitle>
            <AlertDialogDescription>
              {hayPagada && ultima?.confirmadaEn
                ? `La liquidación de ${formatearPeriodoCapitalizado(periodo)} ya fue pagada el ${formatearFecha(
                    new Date(ultima.confirmadaEn),
                  )} por ${formatearImporteEntero(ultima.totalAPagar)}. No se puede modificar. `
                : `${formatearPeriodoCapitalizado(periodo)} ya tiene una liquidación confirmada. `}
              Se generará una liquidación complementaria por la diferencia de{' '}
              {formatearImporteEntero(props.totalAPagar)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar(true)} disabled={enviando}>
              Generar complementaria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialogo === 'ANULAR'} onOpenChange={(v) => !v && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular la liquidación</AlertDialogTitle>
            <AlertDialogDescription>
              Las cuotas del plan de pagos que había aplicado vuelven a pendientes y el asiento
              de cuenta corriente se revierte con un contra-asiento. No se borra nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Anular revierte una liquidación confirmada: el acento va en «Cancelar». */}
          <AlertDialogFooter>
            <AlertDialogCancel variant="default" disabled={enviando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={anular} disabled={enviando}>
              Anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
