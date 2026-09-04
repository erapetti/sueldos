/**
 * §7.6 — pantalla de cálculo de sueldo: desglose línea por línea del §6.2, selector de mes y
 * las acciones de confirmar, anular e imprimir.
 */
import { notFound, redirect } from 'next/navigation'
import {
  exigirUsuario,
  accesoAEmpleado,
  listadoDeOrigen,
  puedeEditar,
  puedeVer,
} from '@/lib/auth/guards'
import { calcularPeriodo } from '@/lib/liquidacion/datos'
import { liquidacionGuardada } from '@/lib/liquidacion/guardada'
import { estadoVisible } from '@/lib/liquidacion/estadoVisible'
import { listarLiquidaciones, totalPorPeriodo } from '@/lib/consultas/ficha'
import { ErrorDatosFaltantes } from '@/lib/calculo/errores'
import { aISO, aPeriodoISO } from '@/lib/format/dates'
import { periodoDePantalla } from '@/lib/consultas/periodoDePantalla'
import {
  anteriorPeriodo,
  consultaDePeriodo,
  mesEnRango,
  periodoValido,
  sePuedeConfirmar,
  siguientePeriodo,
  tipoDesdeUrl,
  vistaDesdeUrl,
  type PeriodoLiquidable,
  type TipoPeriodo,
} from '@/lib/calculo/periodos'
import { PantallaLiquidacion, type LineaVista } from './PantallaLiquidacion'
import { PantallaAguinaldo } from './PantallaAguinaldo'
import { AvisoDatosFaltantes } from './AvisoDatosFaltantes'

export const dynamic = 'force-dynamic'

/**
 * Lo que dice el chip del navegador cuando la URL no pide una secuencia: el estado de la
 * última liquidación vigente del período. Un período sin ninguna —o con todas anuladas—
 * está sin confirmar.
 */
function estadoDelPeriodo(
  liquidaciones: {
    periodoISO: string
    tipo: string
    secuencia: number
    estado: string
    pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA'
  }[],
  periodoISO: string,
  tipo: TipoPeriodo,
) {
  const vigentes = liquidaciones.filter(
    (l) => l.periodoISO === periodoISO && l.tipo === tipo && l.estado !== 'ANULADA',
  )
  // La de secuencia más alta, buscada y no tomada de la punta: en qué orden vienen es cosa de
  // la vista Lista, que ya las dio vuelta una vez.
  const ultima = vigentes.reduce<(typeof vigentes)[number] | null>(
    (mayor, l) => (mayor === null || l.secuencia > mayor.secuencia ? l : mayor),
    null,
  )
  return estadoVisible(ultima)
}

export default async function PaginaLiquidacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    periodo?: string
    tipo?: string
    liquidacion?: string
    vista?: string
  }>
}) {
  const { id } = await params
  const {
    periodo: periodoTexto,
    tipo: tipoTexto,
    liquidacion: liquidacionTexto,
    vista: vistaTexto,
  } = await searchParams

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  // §7.6 — la vista «Lista» de esta misma pantalla.
  const liquidacionesDeLaEmpleada = await listarLiquidaciones(id)
  const totalesPorPeriodo = Object.fromEntries(totalPorPeriodo(liquidacionesDeLaEmpleada))

  // El mes lo resuelve el pedido de la URL, la memoria de la navegación o el atraso de
  // liquidaciones, en ese orden, y siempre dentro del rango de la empleada (§6.10 — no hay
  // meses futuros).
  const { periodo, rango } = await periodoDePantalla(acceso.empleado, periodoTexto)

  // §7.7 — el aguinaldo es un período más de la secuencia, no una pantalla aparte. Una URL
  // armada a mano con un aguinaldo fuera de junio o diciembre cae al mensual de ese mes.
  const pedidoTipo = tipoDesdeUrl(tipoTexto)
  const actual: PeriodoLiquidable = periodoValido({ periodo, tipo: pedidoTipo })
    ? { periodo, tipo: pedidoTipo }
    : { periodo, tipo: 'MENSUAL' }

  /**
   * Las dos flechas miran el mismo rango que las planillas: del mes de ingreso al de egreso,
   * sin pasar del mes en curso (§6.10 — no hay períodos futuros).
   *
   * La de atrás pedía antes que existiera una liquidación anterior, y eso dejaba encerrada
   * justamente a la empleada con el mes atrasado: sin liquidaciones previas no había forma de
   * llegar al mes que faltaba liquidar. Ahora se puede recorrer toda la historia de la
   * empleada, esté liquidada o no.
   *
   * Las dos miran el **período siguiente de la secuencia** y no el mes: desde el mensual de
   * junio se avanza a su aguinaldo —el mes es el mismo— y desde el aguinaldo de diciembre no,
   * porque el que sigue es enero del año que viene.
   */
  const puedeRetroceder = mesEnRango(anteriorPeriodo(actual).periodo, rango)
  const puedeAvanzar = mesEnRango(siguientePeriodo(actual).periodo, rango)

  /**
   * §7.6 — con qué cara abre la pantalla, y qué le pidió la URL.
   *
   * La vista es estado del componente, como en las planillas, así que el parámetro solo fija
   * el valor inicial; `pedido` es lo que le deja ver al cliente que el pedido cambió, para
   * que el enlace de la Lista abra el detalle en vez de dejar la Lista puesta.
   */
  const vista = vistaDesdeUrl(vistaTexto)
  const pedido = `${aPeriodoISO(periodo)}|${actual.tipo}|${liquidacionTexto ?? ''}|${vistaTexto ?? ''}`

  const comunes = {
    empleadoId: id,
    alias: acceso.empleado.alias,
    nombreCompleto: acceso.empleado.nombreCompleto,
    listadoDeOrigen: listadoDeOrigen(acceso.nivel),
    periodo: aPeriodoISO(periodo),
    puedeEditar: puedeEditar(acceso.nivel),
    vista,
    pedido,
  }

  const delNavegador = {
    liquidaciones: liquidacionesDeLaEmpleada,
    totalesPorPeriodo,
    puedeRetroceder,
    puedeAvanzar,
  }

  /*
    §7.6.1 — la URL puede pedir **una** liquidación del período por su id, que es a donde
    llevan las filas de la Lista. Se muestra tal como quedó guardada, sin recalcular nada.

    Solo el mensual se abre así: el aguinaldo todavía no se liquida (§13.3). Un id que no
    corresponde —el de otro mes, el de otra empleada, uno inventado— vuelve al listado, que es
    donde se ve qué liquidaciones hay.
  */
  if (liquidacionTexto !== undefined) {
    const guardada =
      actual.tipo === 'MENSUAL'
        ? await liquidacionGuardada(id, periodo, 'MENSUAL', liquidacionTexto)
        : null

    if (!guardada) {
      redirect(`/empleados/${id}/liquidacion?${consultaDePeriodo(actual)}&vista=lista`)
    }

    return (
      <PantallaLiquidacion
        {...comunes}
        {...delNavegador}
        estado={guardada.estado}
        mostrada={{
          id: guardada.id,
          secuencia: guardada.secuencia,
          previas: guardada.previas,
          confirmadaEn: guardada.confirmadaEn,
          anulable: guardada.anulable,
          motivoNoAnulable: guardada.motivoNoAnulable,
        }}
        lineas={guardada.lineas}
        valorHoraCalculado={guardada.valorHoraCalculado}
        horasSemanales={guardada.horasSemanales}
        totalRecalculado={guardada.totalRecalculado}
        totalYaLiquidado={guardada.totalYaLiquidado}
        totalAPagar={guardada.totalAPagar}
        porLibro={guardada.porLibro}
        avisos={guardada.avisos}
        cedula={acceso.empleado.cedula}
        fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
        // El período entero no entra en juego: lo que se mira es una liquidación sola.
        previas={[]}
        puedeConfirmar={false}
      />
    )
  }

  const estado = estadoDelPeriodo(liquidacionesDeLaEmpleada, aISO(periodo), actual.tipo)

  // El aguinaldo tiene otro formato y su fórmula está pendiente (§13.3): por ahora la pantalla
  // informa eso, con el mismo encabezado y el mismo navegador que el resto.
  if (actual.tipo === 'AGUINALDO') {
    return (
      <PantallaAguinaldo
        empleadoId={id}
        alias={acceso.empleado.alias}
        nombreCompleto={acceso.empleado.nombreCompleto}
        listadoDeOrigen={listadoDeOrigen(acceso.nivel)}
        periodo={aPeriodoISO(periodo)}
        estado={estado}
        vista={vista}
        pedido={pedido}
        {...delNavegador}
      />
    )
  }

  /**
   * §7.6 — la liquidación del mes recién se puede confirmar desde el día 23 (§4.2.3). Se
   * resuelve acá y no en la pantalla porque depende de qué día es hoy: calculado en el
   * cliente, el primer dibujado no coincidiría con el del servidor.
   */
  const puedeConfirmar = sePuedeConfirmar(periodo)

  let calculo
  try {
    calculo = await calcularPeriodo(id, periodo)
  } catch (e) {
    if (e instanceof ErrorDatosFaltantes) {
      // §6.8 — no se muestran números parciales: solo el cartel con lo que falta.
      return <AvisoDatosFaltantes {...comunes} faltantes={e.faltantes} />
    }
    throw e
  }

  const { contexto, resultado } = calculo

  const lineas: LineaVista[] = resultado.lineas.map((l) => ({
    orden: l.orden,
    tabla: l.tabla,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad ? l.cantidad.toString() : null,
    valorUnitario: l.valorUnitario ? l.valorUnitario.toFixed(2) : null,
    importe: l.importe.toFixed(2),
    signo: l.signo,
    destacada: Boolean(l.destacada),
  }))

  const previas = contexto.liquidacionesPrevias
    .filter((l) => l.confirmadaEn !== null)
    .map((l) => ({
      id: l.id,
      secuencia: l.secuencia,
      totalAPagar: l.totalAPagar.toFixed(2),
      pago: l.pago.estado,
      faltan: l.pago.faltan,
      confirmadaEn: l.confirmadaEn ? l.confirmadaEn.toISOString() : null,
      pagadaEn: l.pagadaEn ? aISO(l.pagadaEn) : null,
    }))

  return (
    <PantallaLiquidacion
      {...comunes}
      {...delNavegador}
      estado={estado}
      // Sin secuencia en la URL se mira el período entero, no una liquidación concreta.
      mostrada={null}
      lineas={lineas}
      valorHoraCalculado={resultado.valorHoraCalculado.toFixed(2)}
      // §5.2 — las del registro de salario vigente en el período, no las de hoy.
      horasSemanales={contexto.entrada.salario?.horasSemanales.toString() ?? null}
      totalRecalculado={resultado.totalRecalculado.toFixed(2)}
      totalYaLiquidado={resultado.totalYaLiquidado.toFixed(2)}
      totalAPagar={resultado.totalAPagar.toFixed(2)}
      porLibro={{
        FORMAL: {
          recalculado: resultado.totalRecalculadoFormal.toFixed(2),
          yaLiquidado: resultado.totalYaLiquidadoFormal.toFixed(2),
          aPagar: resultado.totalAPagarFormal.toFixed(2),
        },
        INFORMAL: {
          recalculado: resultado.totalRecalculadoInformal.toFixed(2),
          yaLiquidado: resultado.totalYaLiquidadoInformal.toFixed(2),
          aPagar: resultado.totalAPagarInformal.toFixed(2),
        },
      }}
      avisos={resultado.avisos}
      cedula={acceso.empleado.cedula}
      fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
      previas={previas}
      puedeConfirmar={puedeConfirmar}
    />
  )
}
