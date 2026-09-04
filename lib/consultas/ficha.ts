/**
 * §8.4 — datos de la ficha del empleado.
 *
 * La licencia no está: se la llevó entera `Movimientos/Licencias` (§7.11), con su estado de
 * cuenta de días, y sale de `listarLicencias` en `lib/consultas/movimientos.ts`.
 */
import 'server-only'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/lib/db/generated/client'
import { aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { horasSemanalesDelRegimen } from '@/lib/calculo/boletos'
import { conSaldoAcumulado, LIBROS } from '@/lib/calculo/cuentaCorriente'
import { INCLUIR_PAGOS, pagoDeLiquidacion, ultimoPago } from '@/lib/liquidacion/pago'
import { descripcionSeguroSalud } from '@/constants/segurosSalud'
import { aISO, formatearFecha, formatearPeriodo, hoy, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'

/**
 * De lo más nuevo a lo más viejo, y también **dentro del mes**: la secuencia más alta primero.
 * Los meses bajaban y las secuencias subían, así que la lista cambiaba de sentido a mitad de
 * camino y la última liquidación de un mes quedaba abajo de todo.
 */
const ORDEN_DE_LIQUIDACIONES = [
  { periodo: 'desc' },
  { tipo: 'asc' },
  { secuencia: 'desc' },
] satisfies Prisma.LiquidacionOrderByWithRelationInput[]

type LiquidacionConPagos = Prisma.LiquidacionGetPayload<{ include: typeof INCLUIR_PAGOS }>

/**
 * §4.14 — desde cuándo la liquidación está en el estado en que está: cuándo se anuló, cuándo
 * se terminó de cobrar, o cuándo se confirmó si todavía no cobró nada.
 *
 * Los dos sellos de la fila son instantes y el del pago es una fecha de negocio, así que los
 * instantes se pasan al día que fueron **en Montevideo** antes de mostrarlos: leídos en UTC,
 * los de la tardecita muestran el día siguiente (§2.4).
 */
function fechaDelEstado(l: LiquidacionConPagos): Date | null {
  if (l.estado === 'ANULADA') return l.anuladaEn ? hoy(l.anuladaEn) : null
  if (pagoDeLiquidacion(l).estado !== 'SIN_PAGAR') return ultimoPago(l)
  return l.confirmadaEn ? hoy(l.confirmadaEn) : null
}

/**
 * Una fila de la vista «Lista» (§7.6). La arman dos consultas —la de la ficha y la de la
 * pantalla de liquidación— y tiene que ser la misma forma en las dos.
 */
function filaDeLiquidacion(l: LiquidacionConPagos) {
  return {
    id: l.id,
    periodo: formatearPeriodo(l.periodo),
    periodoISO: aISO(l.periodo),
    tipo: l.tipo,
    secuencia: l.secuencia,
    estado: l.estado,
    totalAPagar: aDecimal(l.totalAPagar).toFixed(2),
    pago: pagoDeLiquidacion(l).estado,
    /** El día en que se creó la fila, que es el día en que se confirmó. */
    creadaEn: formatearFecha(hoy(l.creadoEn)),
    fechaDelEstado: formatearFecha(fechaDelEstado(l)),
  }
}

export async function datosDeFicha(empleadoId: string) {
  const [
    empleado,
    salarios,
    valoresHoraNegro,
    regimenes,
    aportesBps,
    cobraBoletos,
    movimientos,
    cuotas,
    liquidaciones,
    permisos,
  ] = await Promise.all([
    prisma.empleado.findUniqueOrThrow({
      where: { id: empleadoId },
      include: { dueno: { select: { id: true, nombre: true, email: true } } },
    }),
    prisma.empleadoSalario.findMany({
      where: { empleadoId },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoValorHoraNegro.findMany({
      where: { empleadoId },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoRegimen.findMany({
      where: { empleadoId },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoAporteBps.findMany({
      where: { empleadoId },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.empleadoCobraBoletos.findMany({
      where: { empleadoId },
      orderBy: { fechaVigencia: 'desc' },
    }),
    prisma.cuentaCorriente.findMany({
      where: { empleadoId },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
    }),
    prisma.planPago.findMany({
      where: { empleadoId, estado: { not: 'CANCELADA' } },
      orderBy: { fecha: 'asc' },
    }),
    prisma.liquidacion.findMany({
      where: { empleadoId },
      include: INCLUIR_PAGOS,
      orderBy: ORDEN_DE_LIQUIDACIONES,
    }),
    prisma.empleadoPermiso.findMany({
      where: { empleadoId },
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
    }),
  ])

  /*
    §4.9 — la cuenta corriente se lleva en dos libros, así que se listan por separado y cada
    uno acumula su propio saldo. Un saldo corrido que mezclara los dos no diría cuánto falta
    de ninguno: el formal se cancela con los pagos formales y el informal con los otros.

    Solo se devuelve el libro que tenga movimientos. Una empleada que nunca tocó uno de los
    dos ve una sola lista, como antes.
  */
  const librosDeCuenta = LIBROS.map((libro) => {
    const conSaldo = conSaldoAcumulado(
      movimientos
        .filter((m) => m.libro === libro)
        .map((m) => ({
          id: m.id,
          fecha: formatearFecha(m.fecha),
          tipo: m.tipo,
          concepto: m.concepto,
          debe: aDecimal(m.debe),
          haber: aDecimal(m.haber),
          esReversa: m.reversaDeId !== null,
        })),
    )

    return {
      libro,
      movimientos: conSaldo.map((m) => ({
        ...m,
        debe: m.debe.toFixed(2),
        haber: m.haber.toFixed(2),
        saldoAcumulado: m.saldoAcumulado.toFixed(2),
      })),
      saldo: conSaldo.at(-1)?.saldoAcumulado ?? new Decimal(0),
    }
  }).filter((l) => l.movimientos.length > 0)

  // §8.4 punto 5 — el saldo solo es correcto si las liquidaciones están confirmadas.
  const periodosConfirmados = new Set(
    liquidaciones
      .filter((l) => l.tipo === 'MENSUAL' && l.estado === 'CONFIRMADA')
      .map((l) => aISO(l.periodo)),
  )

  const mesesSinLiquidar: string[] = []
  const limite = empleado.fechaEgreso
    ? primerDiaDelMes(empleado.fechaEgreso)
    : sumarMeses(primerDiaDelMes(hoy()), -1)

  for (
    let mes = primerDiaDelMes(empleado.fechaIngreso);
    mes.getTime() <= limite.getTime();
    mes = sumarMeses(mes, 1)
  ) {
    if (!periodosConfirmados.has(aISO(mes))) mesesSinLiquidar.push(formatearPeriodo(mes))
    // Cota de seguridad para fichas con fechas de ingreso muy antiguas.
    if (mesesSinLiquidar.length > 60) break
  }

  return {
    empleado,
    salarios: salarios.map((s) => ({
      id: s.id,
      fechaVigencia: formatearFecha(s.fechaVigencia),
      fechaVigenciaISO: aISO(s.fechaVigencia),
      salario: aDecimal(s.salario).toFixed(2),
      horasSemanales: aDecimal(s.horasSemanales).toString(),
      valorHora: valorHoraCalculado({
        salario: aDecimal(s.salario),
        horasSemanales: aDecimal(s.horasSemanales),
      }).toFixed(2),
      origen: s.origen,
    })),
    valoresHoraNegro: valoresHoraNegro.map((v) => ({
      id: v.id,
      fechaVigencia: formatearFecha(v.fechaVigencia),
      fechaVigenciaISO: aISO(v.fechaVigencia),
      valor: aDecimal(v.valor).toFixed(2),
      origen: v.origen,
    })),
    regimenes: regimenes.map((r) => {
      const horas = aRegimenHoras(r)
      return {
        id: r.id,
        fechaVigencia: formatearFecha(r.fechaVigencia),
        fechaVigenciaISO: aISO(r.fechaVigencia),
        dias: [
          horas.lunes,
          horas.martes,
          horas.miercoles,
          horas.jueves,
          horas.viernes,
          horas.sabado,
          horas.domingo,
        ].map((d) => d.toString()),
        total: horasSemanalesDelRegimen(horas).toString(),
      }
    }),
    aportesBps: aportesBps.map((a) => ({
      id: a.id,
      fechaVigencia: formatearFecha(a.fechaVigencia),
      fechaVigenciaISO: aISO(a.fechaVigencia),
      aportaBps: a.aportaBps,
      seguroSalud: a.seguroSalud,
      seguroSaludDescripcion: descripcionSeguroSalud(a.seguroSalud),
    })),
    cobraBoletos: cobraBoletos.map((c) => ({
      id: c.id,
      fechaVigencia: formatearFecha(c.fechaVigencia),
      fechaVigenciaISO: aISO(c.fechaVigencia),
      cobraBoletos: c.cobraBoletos,
    })),
    librosDeCuenta: librosDeCuenta.map((l) => ({ ...l, saldo: l.saldo.toFixed(2) })),
    // El saldo de la empleada es la suma de los dos libros: lo que se le debe en total.
    saldo: librosDeCuenta.reduce((acc, l) => acc.plus(l.saldo), new Decimal(0)).toFixed(2),
    mesesSinLiquidar,
    cuotas: cuotas.map((c) => ({
      id: c.id,
      fecha: formatearFecha(c.fecha),
      fechaISO: aISO(c.fecha),
      monto: aDecimal(c.monto).toFixed(2),
      estado: c.estado,
    })),
    liquidaciones: liquidaciones.map(filaDeLiquidacion),
    permisos: permisos.map((p) => ({
      usuarioId: p.usuarioId,
      nombre: p.usuario.nombre ?? p.usuario.email,
      email: p.usuario.email,
      permiso: p.permiso,
    })),
  }
}

export type DatosFicha = Awaited<ReturnType<typeof datosDeFicha>>

/**
 * Liquidaciones de una empleada, para la vista «Lista» de §7.6. Es la misma forma que arma
 * `datosDeFicha`, aparte, para que la pantalla de liquidación no tenga que traerse la ficha
 * entera —diez consultas— cuando solo necesita esta.
 */
export async function listarLiquidaciones(empleadoId: string): Promise<DatosFicha['liquidaciones']> {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { empleadoId },
    include: INCLUIR_PAGOS,
    orderBy: ORDEN_DE_LIQUIDACIONES,
  })

  return liquidaciones.map(filaDeLiquidacion)
}

/** Total del período agrupando las secuencias, para la pestaña de liquidaciones (§7.6.1). */
export function totalPorPeriodo(
  liquidaciones: DatosFicha['liquidaciones'],
): Map<string, string> {
  const totales = new Map<string, Decimal>()
  for (const l of liquidaciones) {
    if (l.estado === 'ANULADA') continue
    const clave = `${l.periodoISO}|${l.tipo}`
    totales.set(clave, (totales.get(clave) ?? new Decimal(0)).plus(l.totalAPagar))
  }
  return new Map([...totales].map(([clave, total]) => [clave, total.toFixed(2)]))
}
