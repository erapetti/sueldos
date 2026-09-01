/**
 * §7.6 — pantalla de cálculo de sueldo: desglose línea por línea del §6.2, selector de mes y
 * las acciones de confirmar, anular e imprimir.
 */
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import {
  exigirUsuario,
  accesoAEmpleado,
  listadoDeOrigen,
  puedeEditar,
  puedeVer,
} from '@/lib/auth/guards'
import { calcularPeriodo } from '@/lib/liquidacion/datos'
import { listarLiquidaciones, totalPorPeriodo } from '@/lib/consultas/ficha'
import { ErrorDatosFaltantes } from '@/lib/calculo/errores'
import { aISO, aPeriodoISO } from '@/lib/format/dates'
import { periodoDePantalla } from '@/lib/consultas/periodoDePantalla'
import {
  anteriorPeriodo,
  mesEnRango,
  periodoValido,
  sePuedeConfirmar,
  siguientePeriodo,
  tipoDesdeUrl,
  type PeriodoLiquidable,
} from '@/lib/calculo/periodos'
import { PantallaLiquidacion, type LineaVista } from './PantallaLiquidacion'
import { PantallaAguinaldo } from './PantallaAguinaldo'
import { AvisoDatosFaltantes } from './AvisoDatosFaltantes'

export const dynamic = 'force-dynamic'

export default async function PaginaLiquidacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string; tipo?: string }>
}) {
  const { id } = await params
  const { periodo: periodoTexto, tipo: tipoTexto } = await searchParams

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
        puedeRetroceder={puedeRetroceder}
        puedeAvanzar={puedeAvanzar}
        liquidaciones={liquidacionesDeLaEmpleada}
        totalesPorPeriodo={totalesPorPeriodo}
      />
    )
  }

  /**
   * §7.6 — la liquidación del mes recién se puede confirmar desde el día 23 (§4.2.3). Se
   * resuelve acá y no en la pantalla porque depende de qué día es hoy: calculado en el
   * cliente, el primer dibujado no coincidiría con el del servidor.
   */
  const puedeConfirmar = sePuedeConfirmar(periodo)

  const comunes = {
    empleadoId: id,
    alias: acceso.empleado.alias,
    nombreCompleto: acceso.empleado.nombreCompleto,
    listadoDeOrigen: listadoDeOrigen(acceso.nivel),
    periodo: aPeriodoISO(periodo),
    puedeEditar: puedeEditar(acceso.nivel),
  }

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
    }))

  // Las líneas persistidas de la última liquidación confirmada, para el modo lectura (§4.14).
  const ultimaConfirmada =
    previas.length > 0
      ? await prisma.liquidacion.findUnique({
          where: { id: previas[previas.length - 1].id },
          include: { lineas: { orderBy: { orden: 'asc' } } },
        })
      : null

  return (
    <PantallaLiquidacion
      {...comunes}
      lineas={lineas}
      valorHoraCalculado={resultado.valorHoraCalculado.toFixed(2)}
      // §5.2 — las del registro de salario vigente en el período, no las de hoy.
      horasSemanales={contexto.entrada.salario?.horasSemanales.toString() ?? null}
      materiaGravada={resultado.materiaGravada.toFixed(2)}
      subtotal={resultado.subtotal.toFixed(2)}
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
      liquidaciones={liquidacionesDeLaEmpleada}
      totalesPorPeriodo={totalesPorPeriodo}
      puedeRetroceder={puedeRetroceder}
      puedeAvanzar={puedeAvanzar}
      cedula={acceso.empleado.cedula}
      fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
      previas={previas}
      puedeConfirmar={puedeConfirmar}
      lineasPersistidas={
        ultimaConfirmada
          ? ultimaConfirmada.lineas.map((l) => ({
              orden: l.orden,
              tabla: l.tabla,
              codigo: l.codigo,
              descripcion: l.descripcion,
              cantidad: l.cantidad ? l.cantidad.toString() : null,
              valorUnitario: l.valorUnitario ? l.valorUnitario.toString() : null,
              importe: l.importe.toString(),
              signo: l.signo,
              destacada: l.codigo === 'SUBTOTAL' || l.codigo === 'TOTAL',
            }))
          : null
      }
    />
  )
}
