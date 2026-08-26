/**
 * §8.4 — datos de la ficha del empleado.
 */
import 'server-only'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { valorHoraCalculado } from '@/lib/calculo/liquidacion'
import { horasSemanalesDelRegimen } from '@/lib/calculo/boletos'
import { conSaldoAcumulado, LIBROS } from '@/lib/calculo/cuentaCorriente'
import { saldoDiasLicencia } from '@/lib/calculo/licencias'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from '@/lib/liquidacion/pago'
import { aISO, formatearFecha, formatearPeriodo, hoy, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'

export async function datosDeFicha(empleadoId: string) {
  const [
    empleado,
    salarios,
    valoresHoraNegro,
    regimenes,
    movimientos,
    cuotas,
    licencias,
    licenciaMovimientos,
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
    prisma.cuentaCorriente.findMany({
      where: { empleadoId },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
    }),
    prisma.planPago.findMany({
      where: { empleadoId, estado: { not: 'CANCELADA' } },
      orderBy: { fecha: 'asc' },
    }),
    prisma.licencia.findMany({
      where: { empleadoId },
      include: { liquidacion: { select: { totalAPagar: true, estado: true } } },
      orderBy: { fechaDesde: 'desc' },
    }),
    prisma.licenciaMovimiento.findMany({
      where: { empleadoId },
      orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
    }),
    prisma.liquidacion.findMany({
      where: { empleadoId },
      include: INCLUIR_PAGOS,
      orderBy: [{ periodo: 'desc' }, { tipo: 'asc' }, { secuencia: 'asc' }],
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
    licencias: licencias.map((l) => ({
      id: l.id,
      desde: formatearFecha(l.fechaDesde),
      hasta: formatearFecha(l.fechaHasta),
      diasHabiles: aDecimal(l.diasHabiles).toString(),
      salarioVacacional: l.liquidacion ? aDecimal(l.liquidacion.totalAPagar).toFixed(2) : null,
      liquidacionAnulada: l.liquidacion?.estado === 'ANULADA',
      nota: l.nota,
    })),
    licenciaMovimientos: conSaldoAcumulado(
      licenciaMovimientos.map((m) => ({
        id: m.id,
        fecha: formatearFecha(m.fecha),
        tipo: m.tipo,
        concepto: m.concepto,
        debe: aDecimal(m.debe),
        haber: aDecimal(m.haber),
      })),
    ).map((m) => ({
      ...m,
      debe: m.debe.toString(),
      haber: m.haber.toString(),
      saldoAcumulado: m.saldoAcumulado.toString(),
    })),
    saldoDias: saldoDiasLicencia(
      licenciaMovimientos.map((m) => ({ debe: aDecimal(m.debe), haber: aDecimal(m.haber) })),
    ).toString(),
    liquidaciones: liquidaciones.map((l) => ({
      id: l.id,
      periodo: formatearPeriodo(l.periodo),
      periodoISO: aISO(l.periodo),
      tipo: l.tipo,
      secuencia: l.secuencia,
      estado: l.estado,
      totalAPagar: aDecimal(l.totalAPagar).toFixed(2),
      pago: pagoDeLiquidacion(l).estado,
    })),
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
    orderBy: [{ periodo: 'desc' }, { tipo: 'asc' }, { secuencia: 'asc' }],
  })

  return liquidaciones.map((l) => ({
    id: l.id,
    periodo: formatearPeriodo(l.periodo),
    periodoISO: aISO(l.periodo),
    tipo: l.tipo,
    secuencia: l.secuencia,
    estado: l.estado,
    totalAPagar: aDecimal(l.totalAPagar).toFixed(2),
    pago: pagoDeLiquidacion(l).estado,
  }))
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
