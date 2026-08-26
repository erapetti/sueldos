/**
 * §12 — pruebas que dependen de la base: transaccionalidad, cuenta corriente,
 * complementarias, licencia y reglas de acceso. Casos 18 a 22, 26, 28, 42, 43 y 44, más los
 * tests de autorización sobre las Server Actions que pide el cierre del §12.
 *
 * Ojo: cada caso **borra todas las tablas** de la base apuntada por `DATABASE_URL`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  actuarComo,
  crearEmpleadoDePrueba,
  crearUsuarioDePrueba,
  crearValorBoleto,
  limpiarBase,
  saldoDeCuenta,
  saldoDeDias,
  type UsuarioDePrueba,
} from './apoyo/base'
import { prisma } from '@/lib/db/prisma'
import { fecha } from '@/lib/format/dates'
import { confirmarLiquidacionMensual, anularLiquidacionConfirmada } from '@/actions/liquidaciones'
import { registrarPagoBancario, registrarPrestamo } from '@/actions/prestamos'
import { guardarHorasExtras, guardarFaltas, guardarPagoAdicional } from '@/actions/novedades'
import { registrarLicencia } from '@/actions/licencias'
import { cambiarVisibilidad } from '@/actions/empleados'
import { INCLUIR_PAGOS, pagoDeLiquidacion } from '@/lib/liquidacion/pago'

let dueno: UsuarioDePrueba
let otro: UsuarioDePrueba
let admin: UsuarioDePrueba

beforeEach(async () => {
  await limpiarBase()
  dueno = await crearUsuarioDePrueba('dueno@x.com')
  otro = await crearUsuarioDePrueba('otro@x.com')
  admin = await crearUsuarioDePrueba('admin@x.com', true)
  await crearValorBoleto()
  actuarComo(dueno)
})

/** Liquida un período y devuelve el resultado de la acción. */
async function liquidar(empleadoId: string, periodo: string, aceptaComplementaria = false) {
  return confirmarLiquidacionMensual({ empleadoId, periodo, aceptaComplementaria })
}

describe('18. cuenta corriente: préstamo + liquidación + pago bancario', () => {
  it('da el saldo esperado y anular la liquidación lo deja como antes', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    // Préstamo de $10.000 en 5 cuotas de $2.000 desde mayo.
    const prestamo = await registrarPrestamo({
      empleadoId: empleado.id,
      fecha: '2026-04-15',
      monto: '10000',
      concepto: 'Adelanto',
      conPlan: true,
      cuotas: [
        { fecha: '2026-05-01', monto: '2000' },
        { fecha: '2026-06-01', monto: '2000' },
        { fecha: '2026-07-01', monto: '2000' },
        { fecha: '2026-08-01', monto: '2000' },
        { fecha: '2026-09-01', monto: '2000' },
      ],
    })
    expect(prestamo.ok).toBe(true)
    expect(await saldoDeCuenta(empleado.id)).toBe('-10000.00')

    // Liquidación de mayo: $67.100 devengados − $2.000 de cuota = $65.100 a pagar.
    // Mayo de 2026 tiene 21 días de lunes a viernes: 42 boletos × $50 = $2.100.
    const liquidacion = await liquidar(empleado.id, '2026-05')
    expect(liquidacion.ok).toBe(true)

    const guardada = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(guardada.totalAPagar.toString()).toBe('65100')

    // El asiento va por el devengado bruto: 65.100 + 2.000 = 67.100.
    expect(await saldoDeCuenta(empleado.id)).toBe('57100.00')

    // La cuota quedó aplicada.
    const cuotaMayo = await prisma.planPago.findFirstOrThrow({
      where: { empleadoId: empleado.id, fecha: fecha(2026, 5, 1) },
    })
    expect(cuotaMayo.estado).toBe('APLICADA')

    // Pago bancario del neto.
    const pago = await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: '65100',
      libro: 'FORMAL',
      concepto: 'Sueldo mayo 2026',
      liquidacionId: guardada.id,
    })
    expect(pago.ok).toBe(true)

    // El saldo final es el préstamo pendiente: −10.000 + 2.000 amortizados.
    expect(await saldoDeCuenta(empleado.id)).toBe('-8000.00')
  })

  it('anular la liquidación deja el saldo como antes de confirmarla', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await registrarPrestamo({
      empleadoId: empleado.id,
      fecha: '2026-04-15',
      monto: '10000',
      concepto: 'Adelanto',
      conPlan: true,
      cuotas: [{ fecha: '2026-05-01', monto: '2000' }],
    })

    const saldoAntes = await saldoDeCuenta(empleado.id)

    await liquidar(empleado.id, '2026-05')
    const guardada = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(await saldoDeCuenta(empleado.id)).not.toBe(saldoAntes)

    const anulacion = await anularLiquidacionConfirmada({ liquidacionId: guardada.id })
    expect(anulacion.ok).toBe(true)

    expect(await saldoDeCuenta(empleado.id)).toBe(saldoAntes)

    // La cuota volvió a PENDIENTE y la liquidación quedó ANULADA, no borrada.
    const cuota = await prisma.planPago.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(cuota.estado).toBe('PENDIENTE')

    const anulada = await prisma.liquidacion.findUniqueOrThrow({ where: { id: guardada.id } })
    expect(anulada.estado).toBe('ANULADA')
    expect(anulada.ukVigente).toBeNull()

    // Los movimientos nunca se borran: quedó el original y su contra-asiento.
    const movimientos = await prisma.cuentaCorriente.findMany({
      where: { empleadoId: empleado.id, tipo: 'LIQUIDACION' },
    })
    expect(movimientos).toHaveLength(2)
    expect(movimientos.filter((m) => m.reversaDeId !== null)).toHaveLength(1)
  })

  it('anulada la liquidación, se puede volver a confirmar el mismo período', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await liquidar(empleado.id, '2026-05')
    const primera = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    await anularLiquidacionConfirmada({ liquidacionId: primera.id })

    const segunda = await liquidar(empleado.id, '2026-05')
    expect(segunda.ok).toBe(true)

    const vigentes = await prisma.liquidacion.count({
      where: { empleadoId: empleado.id, estado: 'CONFIRMADA' },
    })
    expect(vigentes).toBe(1)
  })
})

describe('§4.9 — los dos libros de la cuenta corriente', () => {
  it('una liquidación con las dos tablas emite un asiento por libro', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    // 2 h extras sin BPS un lunes de mayo: $600 al valor hora sin aportes.
    const extras = await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-04', horas: 2, conBps: false, recargoPct: 0 }],
      borrar: [],
    })
    expect(extras.ok).toBe(true)

    expect((await liquidar(empleado.id, '2026-05')).ok).toBe(true)

    const guardada = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id },
    })
    expect(guardada.totalAPagarFormal.toString()).toBe('67100')
    expect(guardada.totalAPagarInformal.toString()).toBe('600')

    const asientos = await prisma.cuentaCorriente.findMany({
      where: { liquidacionId: guardada.id },
      orderBy: { libro: 'asc' },
    })
    expect(asientos.map((a) => [a.libro, a.haber.toString()])).toEqual([
      ['FORMAL', '67100'],
      ['INFORMAL', '600'],
    ])

    // Pagar solo el formal deja la liquidación a medias, no pagada.
    const pago = await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: '67100',
      libro: 'FORMAL',
      concepto: 'Sueldo mayo 2026',
      liquidacionId: guardada.id,
    })
    expect(pago.ok).toBe(true)

    const conUnPago = await prisma.liquidacion.findFirstOrThrow({
      where: { id: guardada.id },
      include: INCLUIR_PAGOS,
    })
    expect(pagoDeLiquidacion(conUnPago).estado).toBe('PARCIAL')
    expect(pagoDeLiquidacion(conUnPago).faltan).toEqual(['INFORMAL'])

    // El libro formal quedó cancelado y el informal sigue con su saldo, aparte.
    const porLibro = await prisma.cuentaCorriente.groupBy({
      by: ['libro'],
      where: { empleadoId: empleado.id },
      _sum: { debe: true, haber: true },
    })
    const saldoDe = (libro: string) => {
      const fila = porLibro.find((f) => f.libro === libro)!
      return Number(fila._sum.haber) - Number(fila._sum.debe)
    }
    expect(saldoDe('FORMAL')).toBe(0)
    expect(saldoDe('INFORMAL')).toBe(600)
  })

  it('el préstamo de una empleada sin aportes va al libro informal', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id, aportaBps: false })

    const prestamo = await registrarPrestamo({
      empleadoId: empleado.id,
      fecha: '2026-04-15',
      monto: '4000',
      concepto: 'Adelanto',
      conPlan: true,
      cuotas: [{ fecha: '2026-05-01', monto: '4000' }],
    })
    expect(prestamo.ok).toBe(true)

    const movimiento = await prisma.cuentaCorriente.findFirstOrThrow({
      where: { empleadoId: empleado.id, tipo: 'PRESTAMO' },
    })
    expect(movimiento.libro).toBe('INFORMAL')

    // Y su cuota descuenta en la misma tabla, que para ella es la única.
    expect((await liquidar(empleado.id, '2026-05')).ok).toBe(true)
    const lineas = await prisma.liquidacionLinea.findMany({
      where: { liquidacion: { empleadoId: empleado.id }, codigo: 'CUOTA_PLAN' },
    })
    expect(lineas.map((l) => l.tabla)).toEqual(['INFORMAL'])
  })
})

describe('19 y 21. liquidación complementaria (§7.6.1)', () => {
  it('con diferencia positiva genera un único asiento por la diferencia', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await liquidar(empleado.id, '2026-05')
    const original = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: original.totalAPagar.toString(),
      libro: 'FORMAL',
      concepto: 'Sueldo mayo',
      liquidacionId: original.id,
    })

    const saldoTrasPago = await saldoDeCuenta(empleado.id)
    expect(saldoTrasPago).toBe('0.00')

    // Aparecen 4 h extras al 100 % → 4 × 500 × 2 = $4.000.
    await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, conBps: true, recargoPct: 100 }],
      borrar: [],
    })

    // Sin la confirmación explícita, la acción rechaza.
    const sinConfirmar = await liquidar(empleado.id, '2026-05')
    expect(sinConfirmar.ok).toBe(false)

    const complementaria = await liquidar(empleado.id, '2026-05', true)
    expect(complementaria.ok).toBe(true)

    const segunda = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, secuencia: 2 },
    })
    expect(segunda.totalRecalculado.toString()).toBe('71100')
    expect(segunda.totalYaLiquidado.toString()).toBe('67100')
    expect(segunda.totalAPagar.toString()).toBe('4000')

    // Un único asiento nuevo, por la diferencia.
    const asientos = await prisma.cuentaCorriente.findMany({
      where: { liquidacionId: segunda.id },
    })
    expect(asientos).toHaveLength(1)
    expect(asientos[0].haber.toString()).toBe('4000')

    // El saldo es el que habría dado liquidar el mes bien de entrada.
    expect(await saldoDeCuenta(empleado.id)).toBe('4000.00')
  })

  it('con diferencia negativa el asiento va al debe', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, conBps: true, recargoPct: 100 }],
      borrar: [],
    })
    await liquidar(empleado.id, '2026-05')

    const original = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(original.totalAPagar.toString()).toBe('71100')
    await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: '71100',
      libro: 'FORMAL',
      concepto: 'Sueldo mayo',
      liquidacionId: original.id,
    })

    // Se borran las horas extras cargadas por error.
    const extras = await prisma.horaExtra.findMany({ where: { empleadoId: empleado.id } })
    await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [],
      borrar: extras.map((e) => e.id),
    })

    const complementaria = await liquidar(empleado.id, '2026-05', true)
    expect(complementaria.ok).toBe(true)

    const segunda = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, secuencia: 2 },
    })
    expect(segunda.totalAPagar.toString()).toBe('-4000')

    const asientos = await prisma.cuentaCorriente.findMany({ where: { liquidacionId: segunda.id } })
    expect(asientos).toHaveLength(1)
    expect(asientos[0].debe.toString()).toBe('4000')

    // Queda un saldo a favor de la empresa.
    expect(await saldoDeCuenta(empleado.id)).toBe('-4000.00')
  })

  it('21. dos complementarias sucesivas acumulan total_ya_liquidado', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await liquidar(empleado.id, '2026-05')
    const primera = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: primera.totalAPagar.toString(),
      libro: 'FORMAL',
      concepto: 'Sueldo mayo',
      liquidacionId: primera.id,
    })

    await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, conBps: true, recargoPct: 100 }],
      borrar: [],
    })
    await liquidar(empleado.id, '2026-05', true)

    await guardarPagoAdicional({
      empleadoId: empleado.id,
      fecha: '2026-05-20',
      monto: '1500',
      concepto: 'Premio',
    })
    await liquidar(empleado.id, '2026-05', true)

    const tercera = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, secuencia: 3 },
    })
    expect(tercera.totalYaLiquidado.toString()).toBe('71100')
    expect(tercera.totalRecalculado.toString()).toBe('72600')
    expect(tercera.totalAPagar.toString()).toBe('1500')

    // La suma de las tres secuencias es el total del período.
    const todas = await prisma.liquidacion.findMany({
      where: { empleadoId: empleado.id, estado: 'CONFIRMADA' },
    })
    const suma = todas.reduce((acc, l) => acc + Number(l.totalAPagar), 0)
    expect(suma).toBe(72600)
  })
})

describe('20. complementaria con cuotas ya aplicadas', () => {
  it('no se descuentan ni se marcan dos veces', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await registrarPrestamo({
      empleadoId: empleado.id,
      fecha: '2026-04-15',
      monto: '2000',
      concepto: 'Adelanto',
      conPlan: true,
      cuotas: [{ fecha: '2026-05-01', monto: '2000' }],
    })

    await liquidar(empleado.id, '2026-05')
    const primera = await prisma.liquidacion.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(primera.totalAPagar.toString()).toBe('65100') // 67.100 − 2.000

    await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: '65100',
      libro: 'FORMAL',
      concepto: 'Sueldo mayo',
      liquidacionId: primera.id,
    })

    await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, conBps: true, recargoPct: 100 }],
      borrar: [],
    })
    await liquidar(empleado.id, '2026-05', true)

    const segunda = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, secuencia: 2 },
    })
    // El recálculo considera la cuota una sola vez: 71.100 − 2.000 = 69.100.
    expect(segunda.totalRecalculado.toString()).toBe('69100')
    expect(segunda.totalAPagar.toString()).toBe('4000')

    // La cuota sigue aplicada por la primera liquidación, no por la complementaria.
    const cuota = await prisma.planPago.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(cuota.estado).toBe('APLICADA')
    expect(cuota.liquidacionAplicadaId).toBe(primera.id)

    // El asiento de la complementaria es solo por la diferencia.
    const asientos = await prisma.cuentaCorriente.findMany({ where: { liquidacionId: segunda.id } })
    expect(asientos).toHaveLength(1)
    expect(asientos[0].haber.toString()).toBe('4000')
  })
})

describe('26. registrar una licencia crea las cuatro cosas del §7.11', () => {
  it('en una transacción, y el saldo de días baja exactamente en dias_habiles', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await prisma.licenciaMovimiento.create({
      data: {
        empleadoId: empleado.id,
        fecha: fecha(2021, 1, 1),
        tipo: 'GENERACION_ANUAL',
        debe: '0',
        haber: '20',
        concepto: 'Generación anual — 1 años',
        anioAniversario: 1,
      },
    })
    expect(await saldoDeDias(empleado.id)).toBe('20')

    // Lunes 6/4 al viernes 17/4 de 2026: 12 días corridos, 1 domingo → 11 hábiles.
    const resultado = await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-06',
      fechaHasta: '2026-04-17',
      nota: 'Vacaciones',
    })
    expect(resultado.ok).toBe(true)

    const licencia = await prisma.licencia.findFirstOrThrow({ where: { empleadoId: empleado.id } })
    expect(licencia.diasHabiles.toString()).toBe('11')

    const goce = await prisma.licenciaMovimiento.findFirstOrThrow({
      where: { empleadoId: empleado.id, tipo: 'GOCE' },
    })
    expect(goce.debe.toString()).toBe('11')
    expect(goce.licenciaId).toBe(licencia.id)

    const liquidacion = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, tipo: 'SALARIO_VACACIONAL' },
    })
    expect(liquidacion.estado).toBe('CONFIRMADA')
    expect(liquidacion.periodo.toISOString().slice(0, 10)).toBe('2026-04-01')
    // 65.000 / 30 × 11 = 23.833,33 -> 23.833
    expect(liquidacion.totalAPagar.toString()).toBe('23833')

    const asiento = await prisma.cuentaCorriente.findFirstOrThrow({
      where: { liquidacionId: liquidacion.id },
    })
    expect(asiento.haber.toString()).toBe('23833')

    expect(await saldoDeDias(empleado.id)).toBe('9')
  })

  it('27. una licencia mayor al saldo se guarda y deja el saldo negativo', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    const resultado = await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-06',
      fechaHasta: '2026-04-17',
    })
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.aviso).toContain('-11')
    expect(await saldoDeDias(empleado.id)).toBe('-11')
  })

  it('28. rechaza períodos superpuestos', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-06',
      fechaHasta: '2026-04-17',
    })

    const solapada = await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-15',
      fechaHasta: '2026-04-20',
    })
    expect(solapada.ok).toBe(false)
    if (!solapada.ok) expect(solapada.error).toContain('superpone')

    expect(await prisma.licencia.count({ where: { empleadoId: empleado.id } })).toBe(1)
  })

  it('una segunda licencia en el mismo mes genera la secuencia 2', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-06',
      fechaHasta: '2026-04-10',
    })
    const segunda = await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-04-20',
      fechaHasta: '2026-04-24',
    })
    expect(segunda.ok).toBe(true)

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: empleado.id, tipo: 'SALARIO_VACACIONAL' },
      orderBy: { secuencia: 'asc' },
    })
    expect(liquidaciones.map((l) => l.secuencia)).toEqual([1, 2])
  })
})

describe('29. los días de licencia descuentan boletos y no descuentan sueldo', () => {
  it('se ve en la liquidación mensual del período', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    // Del lunes 4/5 al viernes 8/5 de 2026: 5 días laborables del régimen.
    await registrarLicencia({
      empleadoId: empleado.id,
      fechaDesde: '2026-05-04',
      fechaHasta: '2026-05-08',
    })

    await liquidar(empleado.id, '2026-05')
    const mensual = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, tipo: 'MENSUAL' },
      include: { lineas: true },
    })

    const salarioBase = mensual.lineas.find((l) => l.codigo === 'SALARIO_BASE')!
    expect(salarioBase.importe.toString()).toBe('65000')

    // Mayo 2026 tiene 21 días de lunes a viernes; menos los 5 de licencia son 16.
    const boletos = mensual.lineas.find((l) => l.codigo === 'BOLETOS')!
    expect(boletos.cantidad!.toString()).toBe('32')
  })
})

describe('43. no se puede anular una liquidación pagada (§7.6.1)', () => {
  it('la acción la rechaza', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await liquidar(empleado.id, '2026-05')
    const liquidacion = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id },
    })

    await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: '2026-06-05',
      monto: liquidacion.totalAPagar.toString(),
      libro: 'FORMAL',
      concepto: 'Sueldo mayo',
      liquidacionId: liquidacion.id,
    })

    const anulacion = await anularLiquidacionConfirmada({ liquidacionId: liquidacion.id })
    expect(anulacion.ok).toBe(false)
    if (!anulacion.ok) expect(anulacion.error).toContain('complementaria')

    const sigue = await prisma.liquidacion.findUniqueOrThrow({ where: { id: liquidacion.id } })
    expect(sigue.estado).toBe('CONFIRMADA')
  })
})

describe('44. períodos permitidos (§6.10)', () => {
  it('no se puede liquidar un período futuro', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    const resultado = await liquidar(empleado.id, '2099-01')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('futuro')
  })

  it('se puede liquidar el mes en curso cualquier día del mes', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    const { hoy, aPeriodoISO } = await import('@/lib/format/dates')
    const resultado = await liquidar(empleado.id, aPeriodoISO(hoy()))
    expect(resultado.ok).toBe(true)
  })
})

describe('42 y autorización de las Server Actions (§3.4)', () => {
  it('un usuario sin acceso no puede leer ni operar el empleado', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    actuarComo(otro)

    const resultado = await liquidar(empleado.id, '2026-05')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('No tenés acceso')
  })

  it('con permiso VER no puede registrar novedades', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await prisma.empleadoPermiso.create({
      data: { empleadoId: empleado.id, usuarioId: otro.id, permiso: 'VER' },
    })
    actuarComo(otro)

    const resultado = await guardarPagoAdicional({
      empleadoId: empleado.id,
      fecha: '2026-05-10',
      monto: '1000',
      concepto: 'Premio',
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('no tenés permiso')
  })

  it('con permiso EDITAR sí puede', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await prisma.empleadoPermiso.create({
      data: { empleadoId: empleado.id, usuarioId: otro.id, permiso: 'EDITAR' },
    })
    actuarComo(otro)

    const resultado = await guardarPagoAdicional({
      empleadoId: empleado.id,
      fecha: '2026-05-10',
      monto: '1000',
      concepto: 'Premio',
    })
    expect(resultado.ok).toBe(true)
  })

  it('42. un administrador no puede registrar novedades sobre un empleado ajeno', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    actuarComo(admin)

    const resultado = await guardarPagoAdicional({
      empleadoId: empleado.id,
      fecha: '2026-05-10',
      monto: '1000',
      concepto: 'Premio',
    })
    expect(resultado.ok).toBe(false)
  })

  it('42. pero sí después de compartírselo', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    actuarComo(admin)

    const { compartirEmpleado } = await import('@/actions/empleados')
    const compartido = await compartirEmpleado({
      empleadoId: empleado.id,
      usuarioId: admin.id,
      permiso: 'EDITAR',
    })
    expect(compartido.ok).toBe(true)

    const resultado = await guardarPagoAdicional({
      empleadoId: empleado.id,
      fecha: '2026-05-10',
      monto: '1000',
      concepto: 'Premio',
    })
    expect(resultado.ok).toBe(true)
  })

  it('un administrador no puede compartir un empleado ajeno con un tercero', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    actuarComo(admin)

    const { compartirEmpleado } = await import('@/actions/empleados')
    const resultado = await compartirEmpleado({
      empleadoId: empleado.id,
      usuarioId: otro.id,
      permiso: 'VER',
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('a vos mismo')
  })

  it('solo se oculta del listado a un empleado dado de baja (§8.3)', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    const activo = await cambiarVisibilidad({ empleadoId: empleado.id, visible: false })
    expect(activo.ok).toBe(false)

    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: false, fechaEgreso: fecha(2026, 5, 20) },
    })

    const dadoDeBaja = await cambiarVisibilidad({ empleadoId: empleado.id, visible: false })
    expect(dadoDeBaja.ok).toBe(true)
    if (dadoDeBaja.ok) expect(dadoDeBaja.aviso).toContain('Todo el Personal')
  })
})

describe('§4.6 tope de horas de falta por día', () => {
  it('rechaza cargar más horas de las que corresponden a ese día', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    const resultado = await guardarFaltas({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 8, causal: 'CON_AVISO', descuenta: true }],
      borrar: [],
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('6 h')
  })

  it('suma las faltas ya guardadas del mismo día para verificar el tope', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    const primera = await guardarFaltas({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, causal: 'CON_AVISO', descuenta: true }],
      borrar: [],
    })
    expect(primera.ok).toBe(true)

    const segunda = await guardarFaltas({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [{ fecha: '2026-05-06', horas: 4, causal: 'CON_AVISO', descuenta: true }],
      borrar: [],
    })
    expect(segunda.ok).toBe(false)
  })

  it('§4.6.1 el servidor fuerza `descuenta` en las causales que lo fijan', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    await guardarFaltas({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [
        { fecha: '2026-05-06', horas: 6, causal: 'MATERNIDAD', descuenta: false },
        { fecha: '2026-05-07', horas: 6, causal: 'ENFERMEDAD', descuenta: false },
        // CON_AVISO es editable, así que acá el cliente sí decide.
        { fecha: '2026-05-08', horas: 6, causal: 'CON_AVISO', descuenta: false },
      ],
      borrar: [],
    })

    const faltas = await prisma.falta.findMany({
      where: { empleadoId: empleado.id },
      orderBy: { fecha: 'asc' },
    })
    expect(faltas.map((f) => [f.causal, f.descuenta])).toEqual([
      ['MATERNIDAD', true],
      ['ENFERMEDAD', false],
      ['CON_AVISO', false],
    ])
  })
})

describe('§6.11 aviso de período ya liquidado', () => {
  it('sale una sola vez para todo el lote', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidar(empleado.id, '2026-05')

    const resultado = await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: '2026-05',
      renglones: [
        { fecha: '2026-05-06', horas: 2, conBps: true, recargoPct: 100 },
        { fecha: '2026-05-07', horas: 2, conBps: true, recargoPct: 100 },
        { fecha: '2026-05-08', horas: 2, conBps: true, recargoPct: 100 },
      ],
      borrar: [],
    })

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.aviso).toContain('ya tiene una liquidación confirmada')
      expect(resultado.datos.guardados).toBe(3)
    }
  })
})
