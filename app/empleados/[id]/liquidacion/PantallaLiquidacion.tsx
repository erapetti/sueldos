'use client'

/**
 * §7.6 y §7.6.1 — desglose de la liquidación, con el bloque de cierre de la complementaria.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAccion } from '@/hooks/useAccion'
import { useModoLista } from '@/hooks/useModoLista'
import { anularLiquidacionConfirmada, confirmarLiquidacionMensual } from '@/actions/liquidaciones'
import {
  formatearImporteEntero,
  formatearCantidad,
  formatearHoras,
  formatearPorcentaje,
} from '@/lib/format/money'
import {
  formatearFecha,
  formatearPeriodoCapitalizado,
  mes,
  nombreMes,
  parseFechaISO,
  parsePeriodo,
} from '@/lib/format/dates'
import {
  admiteLiquidacionNueva,
  primerDiaConfirmable,
  type VistaDeLiquidacion,
} from '@/lib/calculo/periodos'
import type { EstadoVisible } from '@/lib/liquidacion/estadoVisible'
import { CODIGOS } from '@/lib/calculo/tipos'
import { DialogoDeAccion } from '@/components/dominio/DialogoDeAccion'
import { DialogoPagoBancario } from '@/components/dominio/DialogoPagoBancario'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'
import type { ListadoDePersonal } from '@/constants/listados'
import type { Vinculo } from '@/lib/validacion/vinculo'
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

/**
 * `38 b`. La unidad es **inventada para esta columna**: el §8.5 fija `$`, `h` y `%`, y no dice
 * nada de los boletos. Vive acá y no en `lib/format/money` justamente por eso: no es una
 * convención de la aplicación, es cómo se lee este renglón.
 *
 * Se probó con el icono `Bus` de lucide en vez de la «b» y **se descartó por decisión del
 * usuario**: a 14px —el alto de la cifra— un icono de trazo con ventanas y ruedas se lee como
 * una manchita, y era el único icono dentro de una columna de datos en toda la aplicación, al
 * lado de un `4 h` y un `15 %`.
 */
const formatearBoletos = (valor: string) => `${formatearCantidad(valor)} b`

/**
 * §8.5 — la columna «cantidad» no cuenta lo mismo en todas las líneas, así que cada una se
 * muestra con su unidad: **horas** en las faltas y en las tres de horas extras, el
 * **porcentaje** del concepto en los descuentos de BPS (§6.3) y **boletos** en la de boletos.
 * Sin la unidad, «15» se leía como quince de algo al lado de la materia gravada, y «4» de
 * faltas como cuatro faltas en vez de cuatro horas.
 *
 * Los únicos que quedan pelados son los días: los de un salario prorrateado (§6.9) y los
 * hábiles de un salario vacacional (§7.11) ya van dichos en la descripción de la línea, así
 * que la columna los repetiría.
 */
const CON_SU_UNIDAD: Record<string, (valor: string) => string> = {
  [CODIGOS.FALTAS]: formatearHoras,
  [CODIGOS.HORAS_EXTRAS_CON_BPS]: formatearHoras,
  [CODIGOS.HORAS_EN_FERIADOS]: formatearHoras,
  [CODIGOS.HORAS_EXTRAS_SIN_BPS]: formatearHoras,
  [CODIGOS.DESCUENTO_BPS]: formatearPorcentaje,
  [CODIGOS.BOLETOS]: formatearBoletos,
}

function cantidadDeLaLinea(linea: LineaVista) {
  if (!linea.cantidad) return ''
  return (CON_SU_UNIDAD[linea.codigo] ?? formatearCantidad)(linea.cantidad)
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

/**
 * §7.6.1 — la etiqueta de la diferencia depende de su signo, y hay dos cifras que pueden
 * tenerlo distinto: la del período y la del libro formal, que es la única que sale impresa.
 */
function etiquetaDeLaDiferencia(monto: number) {
  return monto < 0 ? 'DIFERENCIA A DESCONTAR' : 'DIFERENCIA A PAGAR'
}

const SALDO_A_FAVOR_DE_LA_EMPRESA =
  'Queda como saldo a favor de la empresa en la cuenta corriente de la empleada hasta que se compense.'

/**
 * Un botón apagado con el motivo en un tooltip. Los cuatro botones de esta pantalla que pueden
 * quedar apagados lo usan, así que la mecánica está escrita una vez.
 *
 * El `span` envuelve al botón porque un botón `disabled` no dispara eventos de puntero: el
 * `disabled:pointer-events-none` que ya trae `Button` los deja pasar al envoltorio, que es el
 * que abre el tooltip. El `tabIndex` lo pone además al alcance del teclado, que no tiene hover.
 *
 * En un teléfono el tooltip no aparece —no hay con qué pasar por encima— y ahí el botón queda
 * apagado sin explicación. Es una decisión tomada, no un olvido.
 */
function BotonApagado({
  motivo,
  variant,
  children,
}: {
  motivo: React.ReactNode
  variant?: 'outline'
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant={variant} disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{motivo}</TooltipContent>
    </Tooltip>
  )
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
  /** ISO `AAAA-MM-DD` del último pago cobrado, o `null` si no cobró ninguno. */
  pagadaEn: string | null
}

/**
 * §7.6.1 — por qué el período va por una complementaria y no se puede modificar lo que ya
 * está. Es la primera oración del diálogo.
 *
 * El SPECS escribe la del caso completo —«ya fue pagada el {fecha} por ${monto}»— y las otras
 * dos existen porque esa oración no siempre es cierta: con un solo libro cobrado la
 * liquidación no «fue pagada», y una diferencia de cero o negativa figura pagada sin que nadie
 * haya pagado nada, así que no hay fecha que mostrar. Decía la fecha de **confirmación** en
 * los tres casos, que es otro día.
 */
function motivoDeLaComplementaria(periodo: Date, ultima: Previa | null): string {
  if (!ultima) return ''
  const mes = formatearPeriodoCapitalizado(periodo)
  if (ultima.pagadaEn === null) {
    return `La liquidación de ${mes} ya está confirmada y no se puede modificar.`
  }
  const cuando = formatearFecha(parseFechaISO(ultima.pagadaEn))
  return ultima.pago === 'PAGADA'
    ? `La liquidación de ${mes} ya fue pagada el ${cuando} por ${formatearImporteEntero(ultima.totalAPagar)}. No se puede modificar.`
    : `La liquidación de ${mes} ya tiene un pago del ${cuando} y no se puede modificar.`
}

export function PantallaLiquidacion(props: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  listadoDeOrigen: ListadoDePersonal
  periodo: string
  puedeEditar: boolean
  /** El desglose a dibujar: el cálculo de hoy, o el guardado de la liquidación pedida. */
  lineas: LineaVista[]
  valorHoraCalculado: string
  /** Del registro de salario vigente en el período (§5.2). */
  horasSemanales: string | null
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
  /** §7.5 — el ingreso, que sale en el encabezado, y el egreso, que topea la fecha del pago. */
  vinculo: Vinculo
  previas: Previa[]
  /** §7.6 — el mes en curso recién se puede confirmar desde el día 23 (§4.2.3). */
  puedeConfirmar: boolean
  /** Lo que dice el chip del navegador: el estado de la liquidación que se está mirando. */
  estado: EstadoVisible
  /**
   * §7.6.1 — la liquidación guardada que la URL pidió por su id, si pidió alguna. `null` es
   * el borrador del período: el cálculo con los datos de hoy, con las acciones de confirmarlo
   * o de generar con él la complementaria.
   */
  mostrada: {
    id: string
    secuencia: number
    /** Cuántas la preceden en el período: lo que su cierre ya tenía liquidado. */
    previas: number
    confirmadaEn: string | null
    /** §7.6 — solo la última confirmada y sin pagar se puede anular. */
    anulable: boolean
    /** Por qué no, para el tooltip del botón apagado. */
    motivoNoAnulable: string | null
  } | null
  /** Con cuál de las dos caras abre la pantalla, cuando la URL lo dice. */
  vista: VistaDeLiquidacion | null
  /** Firma de lo que pide la URL: cambia cuando se pide otro período u otra secuencia. */
  pedido: string
}) {
  const router = useRouter()
  const confirmacion = useAccion<{ id: string; secuencia: number }>()
  const anulacion = useAccion<undefined>()
  const enviando = confirmacion.enviando || anulacion.enviando
  const [dialogo, setDialogo] = useState<'COMPLEMENTARIA' | 'ANULAR' | null>(null)
  /** §7.5 — el diálogo de pago bancario, abierto desde el chip del navegador. */
  const [cobrando, setCobrando] = useState(false)
  /**
   * §7.6 — las dos caras de la pantalla. Abre en el detalle del mes en curso, que es a lo que
   * se viene la mayoría de las veces; la lista dice qué meses están cerrados.
   */
  const [modoLista, setModoLista] = useModoLista(props.vista, props.pedido)

  const periodo = useMemo(() => parsePeriodo(props.periodo), [props.periodo])

  /**
   * §7.6.1 — la pantalla tiene dos modos y `mostrada` los separa.
   *
   * **Sin `liquidacion` en la URL es el borrador**: el cálculo del período con los datos de
   * hoy, y el pie dice cuánto habría que pagar si se confirma, o sea la diferencia contra lo
   * ya liquidado. Es a lo que se viene: el mes que falta liquidar, o la complementaria que
   * hace falta porque los datos cambiaron después de confirmar.
   *
   * **Con `liquidacion` es una liquidación guardada**, tal como quedó, y lo único que se
   * ofrece es anularla. No se recalcula nada.
   *
   * Antes el período mostraba la última confirmada en modo lectura, y por eso las tablas y el
   * pie podían decir cosas distintas —las tablas lo confirmado y el pie el recálculo—, y el
   * borrador de la complementaria no se podía ver en ningún lado.
   */
  const mostrada = props.mostrada
  /** La última liquidación vigente del período: las anuladas no están en `previas`. */
  const ultima = props.previas.at(-1) ?? null
  /**
   * §7.6.1 — la regla que evita que se apilen liquidaciones sin pagar: mientras la última no
   * tenga ningún pago no se puede generar otra, y la salida es cobrarla o anularla. Alcanza
   * con que **un** libro esté pagado para salir de acá: ese asiento ya no se puede tocar
   * —anular lo rechaza— y entonces el único camino es la complementaria.
   *
   * Mira la última y no «alguna», que es lo que miraba antes: con la #1 pagada y la #2 sin
   * pagar, «alguna» daba pagada y ofrecía la complementaria en vez de dejar anular la #2.
   *
   * La regla es la misma que aplica la acción al confirmar, y por eso sale de un solo lugar.
   */
  const ultimaSinPagar = !admiteLiquidacionNueva(ultima)
  /** Las que están antes de la que se muestra: las que su cierre ya tenía liquidadas. */
  const cuantasPrevias = mostrada ? mostrada.previas : props.previas.length
  const esComplementaria = cuantasPrevias > 0
  const diferencia = Number(props.totalAPagar)


  /**
   * §6.2 — la liquidación se lee en dos tablas: la formal, que pasa por el BPS, y la informal,
   * con lo que se paga sin aportes. Cada una cierra en su propio total a pagar.
   *
   * Las dos salen de las mismas líneas, así que basta con agruparlas: la formal no existe si
   * la empleada no aporta BPS, y la informal solo si algo cayó en ella. Ninguna se rotula: sus
   * propias líneas dicen cuál es cuál —la formal tiene los descuentos de BPS— y el rótulo era
   * un renglón más arriba de cada tarjeta.
   */
  const tablas = (['FORMAL', 'INFORMAL'] as const)
    .map((tabla) => ({ tabla, lineas: props.lineas.filter((l) => l.tabla === tabla) }))
    .filter((t) => t.lineas.length > 0)

  const dosTablas = tablas.length > 1

  /**
   * El total del período: la suma de los dos totales a pagar. Sale de las líneas y no de
   * `totalRecalculado` para que mirando una liquidación guardada sea exactamente lo que
   * muestran las tablas de arriba, que son las de esa liquidación y no un cálculo de hoy.
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

  /**
   * En papel no sale nada informal, ni acá: de las columnas del cierre se imprime solo la
   * formal. Si el cierre no tiene columna formal —una empleada que no aporta—, el bloque
   * entero se queda afuera, porque en la hoja serían tres rótulos sin ninguna cifra.
   */
  const cierreEnPapel = librosDelCierre.includes('FORMAL')
  const diferenciaFormal = Number(props.porLibro.FORMAL.aPagar)

  /** Una celda por libro y, si hay dos, la del total. */
  function celdasDelCierre(
    campo: 'recalculado' | 'yaLiquidado' | 'aPagar',
    total: string,
    { negado = false, negativoEnRojo = false } = {},
  ) {
    /*
      El renglón de lo ya liquidado es una resta, y el signo va **con la cifra**, en la columna
      de los importes, no pegado al rótulo: así se lee alineado con los demás montos y en la
      misma convención que las líneas de la liquidación (§8.5).

      El cero no se niega: `-0` es negativo para decimal.js y saldría un «−$ 0».
    */
    const conSigno = (valor: string) =>
      negado && Number(valor) !== 0 ? -Number(valor) : valor

    const celda = (valor: string, clave: string, borde: boolean) => (
      <td
        key={clave}
        className={cn(
          'pl-4 text-right tabular',
          borde && 'border-t pt-2',
          negativoEnRojo && Number(valor) < 0 && 'text-destructive',
          // La columna informal y la del total delatarían lo que las tablas ya esconden.
          clave !== 'FORMAL' && 'print:hidden',
        )}
      >
        {formatearImporteEntero(conSigno(valor))}
      </td>
    )
    const borde = campo === 'aPagar'
    return [
      ...librosDelCierre.map((libro) => celda(props.porLibro[libro][campo], libro, borde)),
      ...(dosLibrosEnElCierre ? [celda(total, 'total', borde)] : []),
    ]
  }

  /**
   * §7.6 — aviso de que la información cargada cambió después de confirmar. Se compara el
   * recálculo completo del período contra lo ya liquidado: si difieren, hay algo —una novedad
   * nueva, un cambio de salario, de boleto o de BPS— que las liquidaciones confirmadas no
   * reflejan, y el borrador que se está mirando es justamente la complementaria que lo aplica.
   */
  /**
   * §7.6.1 — si el recálculo de hoy difiere de lo ya liquidado, o sea si hay complementaria
   * que generar. Se mira **libro por libro** y no por el total: el formal puede dar +$100 y el
   * informal −$100, y ahí el total da cero pero cada libro tiene su propio asiento que hacer.
   */
  const hayDiferencia = (['FORMAL', 'INFORMAL'] as const).some(
    (libro) => Number(props.porLibro[libro].aPagar) !== 0,
  )

  /** El aviso de que la información cargada cambió después de confirmar. */
  const parametrosCambiaron = mostrada === null && esComplementaria && hayDiferencia

  /**
   * §7.6.1 — el cierre se muestra cuando explica algo.
   *
   * Mirando una liquidación guardada siempre explica: es lo que esa liquidación pagó sobre lo
   * que el período ya tenía liquidado. En el borrador, en cambio, sin diferencia queda un
   * «DIFERENCIA A PAGAR $ 0» debajo de un total que ya está liquidado: tres renglones para
   * decir que no hay nada que hacer, que es lo que ya dice el botón apagado. Se ve apenas se
   * confirma un mes, que es cuando el borrador pasa a ser el de una complementaria que todavía
   * no tiene nada adentro.
   */
  const muestraElCierre = esComplementaria && (mostrada !== null || hayDiferencia)

  /**
   * §7.5 — la liquidación que el chip manda a cobrar: la que se está mirando, o la última
   * vigente del período si la URL no pidió ninguna. Es la misma de la que habla el chip.
   *
   * Solo cuando queda algo por cobrar —sin pagar, o con un libro cobrado y el otro no— y con
   * permiso de edición: registrar un pago es escribir.
   */
  const aCobrar =
    props.puedeEditar && (props.estado === 'SIN_PAGAR' || props.estado === 'PARCIAL')
      ? (mostrada?.id ?? ultima?.id ?? null)
      : null

  /**
   * §7.6 — el cartel del borrador dice **lo que el chip no dice**.
   *
   * El chip del navegador ya cuenta el estado de la última liquidación vigente —«Sin pagar»,
   * «Pagada», «Pago parcial»—, así que una oración que repita eso es decir dos veces lo mismo
   * con distinta letra, y encima a dos centímetros de distancia. Queda entonces lo que el chip
   * no tiene forma de decir: cuántas liquidaciones hay cuando hay más de una, qué libro falta
   * cobrar cuando el pago es parcial, y que la información cargada cambió después de
   * confirmar. Sin nada de eso, no hay cartel.
   */
  const loQueElChipNoDice = [
    props.previas.length > 1
      ? `Este período tiene ${props.previas.length} liquidaciones confirmadas.`
      : null,
    props.estado === 'PARCIAL' && ultima
      ? `Falta el pago ${ultima.faltan.map((l) => ETIQUETA_LIBRO[l]).join(' y el pago ')}.`
      : null,
    parametrosCambiaron
      ? 'La información ingresada cambió y es necesaria una liquidación complementaria.'
      : null,
  ].filter((oracion) => oracion !== null)

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
    const liquidacionId = mostrada ? mostrada.id : ultima?.id
    if (!liquidacionId) return
    anulacion.ejecutar(() => anularLiquidacionConfirmada({ liquidacionId }), {
      onExito: () => {
        setDialogo(null)
        router.refresh()
      },
    })
  }

  return (
    /*
      La separación entre bloques va en `gap` y no en `space-y-*`, por la hoja impresa. Con
      `space-y-*` el margen lo lleva cada hijo que no es el último del DOM, y los últimos de esta
      pantalla —la tabla informal, el total general y los botones— son `no-print`: en papel la
      última tarjeta visible se queda con 20px de margen colgando debajo. Cuando el contenido
      termina cerca del borde de la hoja, esos 20px caen en la página siguiente y sale una hoja en
      blanco al final. El `gap` de flex solo se aplica entre elementos que existen —un
      `display: none` no es ítem de flex—, así que no reserva nada después del último visible.
    */
    <div className="flex flex-col gap-5">
      <div className="no-print space-y-3">
        {/* El mismo encabezado y menú que la ficha: esto es una pantalla más de la empleada. */}
        <EncabezadoEmpleada
          empleadoId={props.empleadoId}
          alias={props.alias}
          nombreCompleto={props.nombreCompleto}
          activa="liquidaciones"
          listadoDeOrigen={props.listadoDeOrigen}
          periodo={props.periodo}
        />

        <NavegadorDePeriodo
          empleadoId={props.empleadoId}
          actual={{ periodo, tipo: 'MENSUAL' }}
          estado={props.estado}
          onCobrar={aCobrar ? () => setCobrando(true) : undefined}
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

        {mostrada ? (
          /*
            La URL pidió una liquidación concreta, así que el cartel dice cuál es y de cuándo,
            en vez de contar cómo viene el período. El estado —pagada, anulada— lo dice el
            chip del navegador.
          */
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            Liquidación #{mostrada.secuencia} de {formatearPeriodoCapitalizado(periodo)}
            {mostrada.confirmadaEn
              ? `, confirmada el ${formatearFecha(new Date(mostrada.confirmadaEn))}`
              : ''}
            .
          </p>
        ) : loQueElChipNoDice.length > 0 ? (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {loQueElChipNoDice.join(' ')}
          </p>
        ) : null}

        {/*
          Encabezado de la liquidación. Identifica al empleado y a la liquidación en la hoja
          impresa. El encabezado de la página es `no-print`, así que esta tarjeta es lo único
          que sale impreso: si el mes no está acá, la hoja no dice de qué liquidación se trata.
          Por eso «Fecha» va en el bloque, y en negrita.

          La cédula es opcional (§4.2): sin ella el renglón no se muestra, en vez de dejar un
          hueco o un «sin cédula».
        */}
        <div className="rounded-card border bg-card shadow-soft px-[22px] py-4">
          <h2 className="text-[32px] leading-tight">{props.nombreCompleto}</h2>

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {props.cedula ? (
              <>
                <dt className="text-muted-foreground">CI</dt>
                <dd className="tabular">{props.cedula}</dd>
              </>
            ) : null}

            <dt className="text-muted-foreground">Ingreso</dt>
            <dd className="tabular">{formatearFecha(parseFechaISO(props.vinculo.fechaIngreso))}</dd>

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

        {/*
          §6.2 — una tarjeta por tabla: la formal, la informal y, cuando existen las dos, la
          del total general. Cada una es una tabla independiente y no lleva rótulo.

          En papel no sale nada informal: la tabla sin aportes es `no-print`, y con ella el
          total general, que la delataría al restarlo del total. La hoja impresa cierra en el
          total a pagar de la tabla formal.

          El corte es por lo que la tabla **es**, no por su posición: para una empleada sin
          aportes la informal es la única que hay, así que su hoja sale con el encabezado de
          datos y ninguna tabla.
        */}
        {tablas.map((t) => (
          <div
            key={t.tabla}
            className={cn(
              'overflow-hidden rounded-card border bg-card shadow-soft',
              t.tabla === 'INFORMAL' && 'no-print',
            )}
          >
            <table
              className={cn(
                'w-full text-sm',
                '[&>tbody>tr:first-child>td]:pt-4 [&>tbody>tr:last-child>td]:pb-4',
              )}
            >
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
                        linea.destacada && 'bg-muted/90 font-semibold',
                        linea.codigo === 'MATERIA_GRAVADA' && 'bg-muted/60 font-medium',
                      )}
                    >
                      <td className="py-3 pr-2 pl-[22px]">{linea.descripcion}</td>
                      <td className="px-2 py-3 text-right tabular text-muted-foreground">
                        {cantidadDeLaLinea(linea)}
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
        ))}

        {/*
          Con las dos tablas, lo que se paga en total no está en ninguna de las dos. En papel no
          va: incluye lo informal.
        */}
        {dosTablas ? (
          <div className="no-print overflow-hidden rounded-card border bg-card shadow-soft">
            <table className="w-full text-sm">
              <tbody>
                <tr className="font-semibold">
                  <th scope="row" className="py-4 pr-2 pl-[22px] text-left">
                    Total general
                  </th>
                  <td className="py-4 pr-[22px] pl-2 text-right tabular">
                    {formatearImporteEntero(totalGeneral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/*
          §7.6.1 — bloque de cierre de la complementaria. La diferencia se calcula **por
          libro**, porque cada uno tiene su propio asiento y su propio pago: si el formal ya se
          pagó y el cambio del mes fue en el informal, la columna formal cierra en cero y ese
          asiento no se vuelve a tocar.

          Con un solo libro en juego se muestra una sola columna, como antes.

          En papel sale **solo la columna formal**, igual que en las tablas: la informal y la
          del total no se imprimen, el rótulo y el aviso pasan a mirar la cifra del formal, y si
          el cierre no tiene columna formal el bloque entero se queda afuera de la hoja.
        */}
        {muestraElCierre ? (
          <div
            className={cn(
              'overflow-x-auto rounded-card bg-card shadow-soft border-2 border-primary/40 px-[22px] py-5',
              !cierreEnPapel && 'no-print',
            )}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Cierre de la liquidación complementaria</caption>
              <thead>
                <tr className="text-right text-muted-foreground">
                  <th scope="col" className="text-left font-normal"></th>
                  {librosDelCierre.map((libro) => (
                    <th
                      scope="col"
                      key={libro}
                      className={cn('pl-4 font-normal', libro !== 'FORMAL' && 'print:hidden')}
                    >
                      {dosLibrosEnElCierre ? TITULO_LIBRO[libro] : ''}
                    </th>
                  ))}
                  {dosLibrosEnElCierre ? (
                    <th scope="col" className="pl-4 font-normal print:hidden">
                      Total
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {/*
                    Mirando una liquidación guardada, esta cifra es el total de las tablas de
                    arriba —las líneas de esa liquidación—, así que el rótulo la nombra por lo
                    que es y no por cómo se calculó. En la pantalla del período, en cambio, es
                    el recálculo de hoy: puede no coincidir con lo que muestran las tablas, que
                    ahí son las de la última confirmada, y por eso conserva su nombre.
                  */}
                  <th scope="row" className="text-left font-normal">
                    {mostrada
                      ? `Total a pagar (liquidación #${mostrada.secuencia})`
                      : 'Total recalculado del período'}
                  </th>
                  {celdasDelCierre('recalculado', props.totalRecalculado)}
                </tr>
                <tr className="text-muted-foreground">
                  <th scope="row" className="text-left font-normal">
                    Ya liquidado{' '}
                    {cuantasPrevias === 1
                      ? '(liquidación #1)'
                      : `(${cuantasPrevias} liquidaciones)`}
                  </th>
                  {celdasDelCierre('yaLiquidado', props.totalYaLiquidado, { negado: true })}
                </tr>
                <tr className="font-semibold">
                  <th scope="row" className="border-t pt-2 text-left">
                    {/*
                      En pantalla el rótulo mira la diferencia del período; en papel, la del
                      libro formal, que es la única cifra impresa. Los dos signos pueden no
                      coincidir: el formal puede dar a pagar y el informal darlo vuelta.
                    */}
                    <span className="print:hidden">{etiquetaDeLaDiferencia(diferencia)}</span>
                    <span className="hidden print:inline">
                      {etiquetaDeLaDiferencia(diferenciaFormal)}
                    </span>
                  </th>
                  {celdasDelCierre('aPagar', props.totalAPagar, { negativoEnRojo: true })}
                </tr>
              </tbody>
            </table>

            {/* El aviso acompaña a la cifra negativa, y cada soporte muestra una cifra. */}
            {diferencia < 0 ? (
              <p className="mt-2 text-sm text-destructive print:hidden">
                {SALDO_A_FAVOR_DE_LA_EMPRESA}
              </p>
            ) : null}
            {diferenciaFormal < 0 ? (
              <p className="mt-2 hidden text-sm text-destructive print:block">
                {SALDO_A_FAVOR_DE_LA_EMPRESA}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Acciones */}
        {props.puedeEditar ? (
          <div className="no-print flex flex-wrap gap-2">
            {mostrada ? (
              /*
                Mirando una liquidación guardada lo único que se ofrece es anular **esa**.
                Generar la complementaria no está acá a propósito: la complementaria se calcula
                sobre el período entero y se pide desde la pantalla del período, sin secuencia
                en la URL.

                Cuando no se puede anular el botón queda apagado con el motivo en el tooltip,
                en vez de desaparecer: el usuario llegó buscando anular y un botón que no está
                no explica nada.
              */
              mostrada.anulable ? (
                <Button variant="outline" onClick={() => setDialogo('ANULAR')} disabled={enviando}>
                  Anular la liquidación #{mostrada.secuencia}
                </Button>
              ) : (
                <BotonApagado variant="outline" motivo={mostrada.motivoNoAnulable}>
                  Anular la liquidación #{mostrada.secuencia}
                </BotonApagado>
              )
            ) : !esComplementaria ? (
              // El mes todavía no tiene ninguna liquidación vigente: se confirma la primera,
              // y §7.6 — no antes del día 23 (§4.2.3).
              props.puedeConfirmar ? (
                <Button onClick={() => confirmar(false)} disabled={enviando}>
                  {enviando ? 'Confirmando…' : 'Confirmar liquidación'}
                </Button>
              ) : (
                <BotonApagado
                  motivo={
                    <>
                      La liquidación de {nombreMes(mes(periodo))} se habilita el{' '}
                      {formatearFecha(primerDiaConfirmable(periodo))}.
                    </>
                  }
                >
                  Confirmar liquidación
                </BotonApagado>
              )
            ) : ultimaSinPagar ? (
              /*
                La regla: con la última sin pagar no se genera otra. Anular es la salida, y por
                eso los dos botones van juntos acá; el de la complementaria queda apagado
                diciendo qué falta en vez de desaparecer.
              */
              <>
                <Button variant="outline" onClick={() => setDialogo('ANULAR')} disabled={enviando}>
                  Anular la liquidación #{ultima!.secuencia}
                </Button>
                <BotonApagado
                  motivo={`La liquidación #${ultima!.secuencia} todavía no está pagada: pagala o anulala antes de generar otra.`}
                >
                  Generar complementaria
                </BotonApagado>
              </>
            ) : hayDiferencia ? (
              <Button onClick={() => setDialogo('COMPLEMENTARIA')} disabled={enviando}>
                Generar complementaria
              </Button>
            ) : (
              // Sin diferencia la complementaria sería una liquidación de $ 0, con su asiento
              // y todo. No se ofrece, y el tooltip dice por qué.
              <BotonApagado motivo="No hay diferencia con lo ya liquidado.">
                Generar complementaria
              </BotonApagado>
            )}
          </div>
        ) : null}

        {/* §7.6.1 — confirmación obligatoria antes de generar una complementaria */}
        </>
      )}

      <DialogoDeAccion
        abierto={dialogo === 'COMPLEMENTARIA'}
        onCerrar={() => setDialogo(null)}
        titulo="Generar liquidación complementaria"
        descripcion={
          /*
            El diálogo solo se abre con la última pagada: la rama de «ya tiene una liquidación
            confirmada» sin pagar dejó de existir, porque ese caso ahora no ofrece el botón.
          */
          <>
            {motivoDeLaComplementaria(periodo, ultima)} Se generará una liquidación
            complementaria por la diferencia de {formatearImporteEntero(props.totalAPagar)}.
          </>
        }
        etiquetaConfirmar="Generar complementaria"
        onConfirmar={() => confirmar(true)}
        enviando={enviando}
      />

      {/*
        §7.5 — el pago del chip. La liquidación va fija: el chip habla de una y el diálogo cobra
        esa, sin volver a preguntar cuál. Al registrarlo, `DialogoPagoBancario` hace
        `router.refresh()`, que vuelve a dibujar la pantalla con el mismo mes y la misma vista
        —la vista es estado del componente y el refresh no lo pisa—, así que el chip y el
        cartel pasan solos a decir lo que corresponda, que con un pago parcial no es «Pagada».
      */}
      {aCobrar ? (
        <DialogoPagoBancario
          abierto={cobrando}
          onCerrar={() => setCobrando(false)}
          empleadoId={props.empleadoId}
          alias={props.alias}
          vinculo={props.vinculo}
          liquidacionFija={aCobrar}
        />
      ) : null}

      {/* Anular revierte una liquidación confirmada: el acento va en «Cancelar». */}
      <DialogoDeAccion
        abierto={dialogo === 'ANULAR'}
        onCerrar={() => setDialogo(null)}
        titulo={
          mostrada ? `Anular la liquidación #${mostrada.secuencia}` : 'Anular la liquidación'
        }
        descripcion="La liquidación actual se marca como anulada. Las cuotas del plan de pagos que había aplicado vuelven a pendientes y el asiento de cuenta corriente se revierte con un contra-asiento. No se borra nada."
        etiquetaConfirmar="Anular"
        onConfirmar={anular}
        enviando={enviando}
        peligrosa
      />
    </div>
  )
}
