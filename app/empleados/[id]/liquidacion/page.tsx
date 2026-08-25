/**
 * §7.6 — pantalla de cálculo de sueldo: desglose línea por línea del §6.2, selector de mes y
 * las acciones de confirmar, anular e imprimir.
 */
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { exigirUsuario, accesoAEmpleado, puedeEditar, puedeVer } from '@/lib/auth/guards'
import { calcularPeriodo } from '@/lib/liquidacion/datos'
import { listarLiquidaciones, totalPorPeriodo } from '@/lib/consultas/ficha'
import { ErrorDatosFaltantes } from '@/lib/calculo/errores'
import { aISO, aPeriodoISO, hoy, parsePeriodo, primerDiaDelMes } from '@/lib/format/dates'
import { PantallaLiquidacion, type LineaVista } from './PantallaLiquidacion'
import { AvisoDatosFaltantes } from './AvisoDatosFaltantes'

export const dynamic = 'force-dynamic'

export default async function PaginaLiquidacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { id } = await params
  const { periodo: periodoTexto } = await searchParams

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  // §7.6 — la vista «Lista» de esta misma pantalla.
  const liquidacionesDeLaEmpleada = await listarLiquidaciones(id)
  const totalesPorPeriodo = Object.fromEntries(totalPorPeriodo(liquidacionesDeLaEmpleada))

  // §6.10 — la pantalla abre por defecto en el mes en curso y no ofrece meses futuros.
  const mesActual = primerDiaDelMes(hoy())
  const pedido = periodoTexto ? parsePeriodo(periodoTexto) : mesActual
  const periodo = pedido.getTime() > mesActual.getTime() ? mesActual : pedido

  const comunes = {
    empleadoId: id,
    alias: acceso.empleado.alias,
    nombreCompleto: acceso.empleado.nombreCompleto,
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
      pagada: l.pagada,
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
      avisos={resultado.avisos}
      aportaBps={acceso.empleado.aportaBps}
      liquidaciones={liquidacionesDeLaEmpleada}
      totalesPorPeriodo={totalesPorPeriodo}
      cedula={acceso.empleado.cedula}
      fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
      previas={previas}
      lineasPersistidas={
        ultimaConfirmada
          ? ultimaConfirmada.lineas.map((l) => ({
              orden: l.orden,
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
