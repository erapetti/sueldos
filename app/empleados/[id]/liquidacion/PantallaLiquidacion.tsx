'use client'

/**
 * §7.6 y §7.6.1 — desglose de la liquidación, con el bloque de cierre de la complementaria.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
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
  aPeriodoISO,
  formatearFecha,
  formatearPeriodoCapitalizado,
  hoy,
  parseFechaISO,
  parsePeriodo,
  primerDiaDelMes,
  sumarMeses,
} from '@/lib/format/dates'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

export type LineaVista = {
  orden: number
  codigo: string
  descripcion: string
  cantidad: string | null
  valorUnitario: string | null
  importe: string
  signo: number
  destacada: boolean
}

type Previa = {
  id: string
  secuencia: number
  totalAPagar: string
  pagada: boolean
  confirmadaEn: string | null
}

export function PantallaLiquidacion(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
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
  avisos: string[]
  aportaBps: boolean
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

  const periodo = useMemo(() => parsePeriodo(props.periodo), [props.periodo])
  const noPuedeAvanzar = periodo.getTime() >= primerDiaDelMes(hoy()).getTime()

  const ultima = props.previas.at(-1) ?? null
  const hayPagada = props.previas.some((p) => p.pagada)
  const esComplementaria = props.previas.length > 0
  const diferencia = Number(props.totalAPagar)

  // §7.6 — una liquidación confirmada se muestra en modo lectura con sus valores persistidos.
  const enModoLectura = ultima !== null
  const lineasAMostrar =
    enModoLectura && props.lineasPersistidas ? props.lineasPersistidas : props.lineas

  /**
   * §7.6 — aviso de que los parámetros actuales darían un resultado distinto. Se compara el
   * recálculo completo del período contra lo ya liquidado: si difieren, hay algo (una
   * novedad nueva, un cambio de salario, de boleto o de BPS) que la liquidación confirmada
   * no refleja.
   */
  const parametrosCambiaron =
    enModoLectura && Number(props.totalRecalculado) !== Number(props.totalYaLiquidado)

  function irAMes(delta: number) {
    router.push(
      `/empleados/${props.empleadoId}/liquidacion?periodo=${aPeriodoISO(sumarMeses(periodo, delta))}`,
    )
  }

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
        <EncabezadoPagina
          className="mb-0"
          rotulo="Liquidación"
          titulo="Cálculo de sueldo"
          bajada={
            <>
              <Link href={`/empleados/${props.empleadoId}`} className="hover:underline">
                {props.alias}
              </Link>{' '}
              — {props.nombreCompleto}
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
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

          <Button variant="outline" onClick={() => window.print()} className="ml-auto">
            <Printer className="size-4" aria-hidden />
            Imprimir
          </Button>
        </div>
      </div>

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
          {hayPagada ? 'Ya fue pagada.' : 'Todavía no está pagada.'}
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

        <table
          className={cn(
            'w-full text-sm',
            '[&>tbody>tr:first-child>td]:pt-4 [&>tbody>tr:last-child>td]:pb-4',
          )}
        >
          <caption className="sr-only">Desglose de la liquidación</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Valor unitario</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lineasAMostrar.map((linea) => {
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
      </div>

      {/* §7.6.1 — bloque de cierre de la complementaria */}
      {esComplementaria ? (
        <div className="rounded-card bg-card shadow-soft border-2 border-primary/40 px-[22px] py-5">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Total recalculado del período</dt>
              <dd className="tabular">{formatearImporteEntero(props.totalRecalculado)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>
                − Ya liquidado{' '}
                {props.previas.length === 1
                  ? '(liquidación #1)'
                  : `(${props.previas.length} liquidaciones)`}
              </dt>
              <dd className="tabular">{formatearImporteEntero(props.totalYaLiquidado)}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>{diferencia < 0 ? '= DIFERENCIA A DESCONTAR' : '= DIFERENCIA A PAGAR'}</dt>
              <dd className={cn('tabular', diferencia < 0 && 'text-destructive')}>
                {formatearImporteEntero(props.totalAPagar)}
              </dd>
            </div>
          </dl>

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
