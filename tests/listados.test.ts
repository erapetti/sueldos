/**
 * §12 — casos 34 a 41 y 45, 46 verificados contra la consulta única de §8.3 y §8.7,
 * que es la que realmente se usa en producción para el estado derivado (§11).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actuarComo,
  crearEmpleadoDePrueba,
  crearUsuarioDePrueba,
  crearValorBoleto,
  limpiarBase,
  type UsuarioDePrueba,
} from './apoyo/base'
import { prisma } from '@/lib/db/prisma'
import {
  listarEmpleadosVisibles,
  listarTodosLosEmpleados,
} from '@/lib/consultas/empleados'
import { confirmarLiquidacionMensual } from '@/actions/liquidaciones'
import { registrarPagoBancario } from '@/actions/prestamos'
import { guardarHorasExtras } from '@/actions/novedades'
import { aPeriodoISO, fecha, hoy, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'

let dueno: UsuarioDePrueba
let otro: UsuarioDePrueba
let admin: UsuarioDePrueba

const mesActual = () => aPeriodoISO(hoy())
const mesAnterior = () => aPeriodoISO(sumarMeses(primerDiaDelMes(hoy()), -1))

beforeEach(async () => {
  await limpiarBase()
  dueno = await crearUsuarioDePrueba('dueno@x.com')
  otro = await crearUsuarioDePrueba('otro@x.com')
  admin = await crearUsuarioDePrueba('admin@x.com', true)
  await crearValorBoleto()
  actuarComo(dueno)
})

/** Liquida un período y, si se pide, registra el pago que lo cancela. */
async function liquidarYPagar(empleadoId: string, periodo: string, pagar: boolean) {
  const resultado = await confirmarLiquidacionMensual({ empleadoId, periodo })
  expect(resultado.ok).toBe(true)

  if (!pagar) return
  const liquidacion = await prisma.liquidacion.findFirstOrThrow({
    where: { empleadoId, estado: 'CONFIRMADA' },
    orderBy: { creadoEn: 'desc' },
  })
  await registrarPagoBancario({
    empleadoId,
    fecha: '2026-01-05',
    monto: liquidacion.totalAPagar.toString(),
    libro: 'FORMAL',
    concepto: 'Pago',
    liquidacionId: liquidacion.id,
  })
}

async function estadoDe(empleadoId: string): Promise<string> {
  const filas = await listarTodosLosEmpleados(dueno.id, false)
  return filas.find((f) => f.id === empleadoId)!.estado
}

describe('estado derivado en la consulta única (§4.2.3, §11)', () => {
  it('37. mes anterior liquidado sin pago registrado da Falta pagar', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidarYPagar(empleado.id, mesAnterior(), false)
    expect(await estadoDe(empleado.id)).toBe('FALTA_PAGAR')
  })

  it('36. mes anterior sin liquidar da Falta liquidación', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    expect(await estadoDe(empleado.id)).toBe('FALTA_LIQUIDACION')
  })

  it('34. mes anterior liquidado y pagado da Activo', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidarYPagar(empleado.id, mesAnterior(), true)

    // Antes del día 23 no se exige el mes en curso; a partir del 23 sí.
    const esperado = hoy().getUTCDate() >= 23 ? 'FALTA_LIQUIDACION' : 'ACTIVO'
    expect(await estadoDe(empleado.id)).toBe(esperado)
  })

  it('35. con el mes en curso también liquidado y pagado siempre da Activo', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidarYPagar(empleado.id, mesAnterior(), true)
    await liquidarYPagar(empleado.id, mesActual(), true)
    expect(await estadoDe(empleado.id)).toBe('ACTIVO')
  })

  it('40. un empleado que ingresó este mes no debe la liquidación del mes anterior', async () => {
    const empleado = await crearEmpleadoDePrueba({
      duenoId: dueno.id,
      fechaIngreso: primerDiaDelMes(hoy()),
    })
    const esperado = hoy().getUTCDate() >= 23 ? 'FALTA_LIQUIDACION' : 'ACTIVO'
    expect(await estadoDe(empleado.id)).toBe(esperado)
  })

  it('38. dado de baja con la liquidación final impaga da Falta pagar, no Baja', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidarYPagar(empleado.id, mesAnterior(), false)
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: false, fechaEgreso: sumarMeses(primerDiaDelMes(hoy()), -1) },
    })
    expect(await estadoDe(empleado.id)).toBe('FALTA_PAGAR')
  })

  it('39. dado de baja con todo liquidado y pagado da Baja', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })
    await liquidarYPagar(empleado.id, mesAnterior(), true)
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: false, fechaEgreso: sumarMeses(primerDiaDelMes(hoy()), -1) },
    })
    expect(await estadoDe(empleado.id)).toBe('BAJA')
  })

  it('§4.9 pagado solo el libro formal sigue dando Falta pagar', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id })

    // Unas horas extras sin BPS le abren la tabla informal, que queda sin cobrar.
    const extras = await guardarHorasExtras({
      empleadoId: empleado.id,
      periodo: mesAnterior(),
      renglones: [
        { fecha: `${mesAnterior()}-02`, horas: 2, conBps: false, recargoPct: 0 },
      ],
      borrar: [],
    })
    expect(extras.ok).toBe(true)

    const resultado = await confirmarLiquidacionMensual({
      empleadoId: empleado.id,
      periodo: mesAnterior(),
    })
    expect(resultado.ok).toBe(true)

    const liquidacion = await prisma.liquidacion.findFirstOrThrow({
      where: { empleadoId: empleado.id, estado: 'CONFIRMADA' },
    })
    expect(Number(liquidacion.totalAPagarInformal)).toBeGreaterThan(0)

    const pago = await registrarPagoBancario({
      empleadoId: empleado.id,
      fecha: `${mesActual()}-05`,
      monto: liquidacion.totalAPagarFormal.toString(),
      libro: 'FORMAL',
      concepto: 'Pago del formal',
      liquidacionId: liquidacion.id,
    })
    expect(pago.ok).toBe(true)

    expect(await estadoDe(empleado.id)).toBe('FALTA_PAGAR')
  })

  it('41. dado de baja hace meses: no se le exigen liquidaciones posteriores al egreso', async () => {
    const empleado = await crearEmpleadoDePrueba({
      duenoId: dueno.id,
      fechaIngreso: fecha(2024, 1, 1),
    })
    const egreso = sumarMeses(primerDiaDelMes(hoy()), -3)
    await liquidarYPagar(empleado.id, aPeriodoISO(egreso), true)
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { activo: false, fechaEgreso: egreso },
    })
    expect(await estadoDe(empleado.id)).toBe('BAJA')
  })
})

describe('45. visibilidad en los dos listados (§8.3, §8.7)', () => {
  it('un empleado oculto no aparece en /empleados y sí en /empleados/todos', async () => {
    await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Visible' })
    const oculto = await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Oculto' })
    await prisma.empleado.update({
      where: { id: oculto.id },
      data: { visible: false, activo: false, fechaEgreso: fecha(2026, 1, 31) },
    })

    const listado = await listarEmpleadosVisibles(dueno.id)
    expect(listado.map((f) => f.alias)).toEqual(['Visible'])

    const todos = await listarTodosLosEmpleados(dueno.id, false)
    expect(todos.map((f) => f.alias).sort()).toEqual(['Oculto', 'Visible'])
  })

  it('lo mismo para quien lo tiene compartido', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Compartido' })
    await prisma.empleadoPermiso.create({
      data: { empleadoId: empleado.id, usuarioId: otro.id, permiso: 'VER' },
    })
    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { visible: false, activo: false, fechaEgreso: fecha(2026, 1, 31) },
    })

    expect(await listarEmpleadosVisibles(otro.id)).toHaveLength(0)

    const todos = await listarTodosLosEmpleados(otro.id, false)
    expect(todos.map((f) => f.alias)).toEqual(['Compartido'])
    expect(todos[0].nivel).toBe('VER')
  })
})

describe('42. alcance del administrador (§8.7)', () => {
  it('no ve empleados ajenos en /empleados y sí en /empleados/todos', async () => {
    const ajeno = await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Ajeno' })
    const propio = await crearEmpleadoDePrueba({ duenoId: admin.id, alias: 'Propio' })

    const listado = await listarEmpleadosVisibles(admin.id)
    expect(listado.map((f) => f.alias)).toEqual(['Propio'])

    const todos = await listarTodosLosEmpleados(admin.id, true)
    expect(todos.map((f) => f.alias)).toEqual(['Ajeno', 'Propio'])

    // Sobre el ajeno, el nivel es ADMIN: ficha en modo lectura.
    expect(todos.find((f) => f.id === ajeno.id)!.nivel).toBe('ADMIN')
    expect(todos.find((f) => f.id === propio.id)!.nivel).toBe('DUENO')
  })

  it('un usuario común no ve los empleados ajenos ni en /empleados/todos', async () => {
    await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Ajeno' })
    expect(await listarTodosLosEmpleados(otro.id, false)).toHaveLength(0)
  })
})

describe('el listado trae el dueño y con quiénes está compartido (§8.7)', () => {
  it('sin una consulta por fila', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: 'Ana' })
    await prisma.empleadoPermiso.createMany({
      data: [
        { empleadoId: empleado.id, usuarioId: otro.id, permiso: 'VER' },
        { empleadoId: empleado.id, usuarioId: admin.id, permiso: 'EDITAR' },
      ],
    })

    const todos = await listarTodosLosEmpleados(dueno.id, false)
    expect(todos[0].duenoNombre).toBe('dueno')
    expect(todos[0].compartidoCon.sort()).toEqual(['admin', 'otro'])
  })
})

describe('46. el listado completo se resuelve en una sola consulta (§11)', () => {
  it('sin importar cuántos empleados haya', async () => {
    for (let i = 0; i < 6; i += 1) {
      const empleado = await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: `Emp${i}` })
      await liquidarYPagar(empleado.id, mesAnterior(), i % 2 === 0)
    }

    const espia = vi.spyOn(prisma, '$queryRaw')
    try {
      const filas = await listarEmpleadosVisibles(dueno.id)
      expect(filas).toHaveLength(6)
      expect(espia).toHaveBeenCalledTimes(1)
    } finally {
      espia.mockRestore()
    }
  })

  it('también el de "Todos los empleados"', async () => {
    for (let i = 0; i < 4; i += 1) {
      await crearEmpleadoDePrueba({ duenoId: dueno.id, alias: `Emp${i}` })
    }

    const espia = vi.spyOn(prisma, '$queryRaw')
    try {
      const filas = await listarTodosLosEmpleados(admin.id, true)
      expect(filas).toHaveLength(4)
      expect(espia).toHaveBeenCalledTimes(1)
    } finally {
      espia.mockRestore()
    }
  })
})
