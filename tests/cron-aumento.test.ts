/**
 * §12 — casos 22 (aumento masivo) y 33 (cron de licencias), y §7.12 en general.
 * Corren contra la base apuntada por `DATABASE_URL`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import {
  actuarComo,
  crearEmpleadoDePrueba,
  crearUsuarioDePrueba,
  limpiarBase,
  saldoDeDias,
  type UsuarioDePrueba,
} from './apoyo/base'
import { prisma } from '@/lib/db/prisma'
import { aplicarAumentoMasivo } from '@/actions/aumento'
import { POST as cronLicencias } from '@/app/api/cron/licencias/route'
import { fecha } from '@/lib/format/dates'
import { esLoopback } from '@/lib/auth/cronAuth'

let admin: UsuarioDePrueba
let comun: UsuarioDePrueba

beforeEach(async () => {
  await limpiarBase()
  admin = await crearUsuarioDePrueba('admin@x.com', true)
  comun = await crearUsuarioDePrueba('comun@x.com')
  actuarComo(admin)
})

describe('22. aumento masivo (§7.8)', () => {
  it('el valor hora "en negro" sube el mismo porcentaje que el salario, con porcentajes distintos por empleado', async () => {
    // Ana: $65.000 y $300 la hora en negro. Aumento del 10 % → $71.500 y $330.
    const ana = await crearEmpleadoDePrueba({
      duenoId: admin.id,
      alias: 'Ana',
      salario: '65000.00',
      valorHoraNegro: '300.00',
    })
    // Beto: $50.000 y $250. Aumento del 20 % → $60.000 y $300.
    const beto = await crearEmpleadoDePrueba({
      duenoId: comun.id,
      alias: 'Beto',
      salario: '50000.00',
      valorHoraNegro: '250.00',
    })
    // Carla queda excluida con el checkbox.
    const carla = await crearEmpleadoDePrueba({
      duenoId: comun.id,
      alias: 'Carla',
      salario: '40000.00',
      valorHoraNegro: '200.00',
    })

    const resultado = await aplicarAumentoMasivo({
      fechaVigencia: '2026-07-01',
      lineas: [
        { empleadoId: ana.id, salarioNuevo: '71500', incluido: true },
        { empleadoId: beto.id, salarioNuevo: '60000', incluido: true },
        { empleadoId: carla.id, salarioNuevo: '44000', incluido: false },
      ],
    })
    expect(resultado.ok).toBe(true)

    const vigencia = fecha(2026, 7, 1)

    const salarioAna = await prisma.empleadoSalario.findUniqueOrThrow({
      where: { empleadoId_fechaVigencia: { empleadoId: ana.id, fechaVigencia: vigencia } },
    })
    expect(salarioAna.salario.toString()).toBe('71500')
    expect(salarioAna.origen).toBe('AUMENTO_MASIVO')
    // El aumento no cambia la carga horaria.
    expect(salarioAna.horasSemanales.toString()).toBe('30')

    const vhnAna = await prisma.empleadoValorHoraNegro.findUniqueOrThrow({
      where: { empleadoId_fechaVigencia: { empleadoId: ana.id, fechaVigencia: vigencia } },
    })
    expect(vhnAna.valor.toString()).toBe('330') // 300 × 1,10
    expect(vhnAna.origen).toBe('AUMENTO_MASIVO')

    const vhnBeto = await prisma.empleadoValorHoraNegro.findUniqueOrThrow({
      where: { empleadoId_fechaVigencia: { empleadoId: beto.id, fechaVigencia: vigencia } },
    })
    expect(vhnBeto.valor.toString()).toBe('300') // 250 × 1,20

    // Ambos registros comparten la fecha de vigencia.
    expect(vhnAna.fechaVigencia.toISOString()).toBe(salarioAna.fechaVigencia.toISOString())

    // El empleado excluido no recibe ninguno de los dos registros.
    expect(
      await prisma.empleadoSalario.count({ where: { empleadoId: carla.id, fechaVigencia: vigencia } }),
    ).toBe(0)
    expect(
      await prisma.empleadoValorHoraNegro.count({
        where: { empleadoId: carla.id, fechaVigencia: vigencia },
      }),
    ).toBe(0)
  })

  it('alcanza a todos los empleados del sistema, sea quien sea el dueño', async () => {
    const ajeno = await crearEmpleadoDePrueba({ duenoId: comun.id, alias: 'Ajeno' })

    const resultado = await aplicarAumentoMasivo({
      fechaVigencia: '2026-07-01',
      lineas: [{ empleadoId: ajeno.id, salarioNuevo: '71500', incluido: true }],
    })
    expect(resultado.ok).toBe(true)
    expect(
      await prisma.empleadoSalario.count({
        where: { empleadoId: ajeno.id, fechaVigencia: fecha(2026, 7, 1) },
      }),
    ).toBe(1)
  })

  it('solo alcanza a empleados activos', async () => {
    const inactivo = await crearEmpleadoDePrueba({ duenoId: admin.id, alias: 'Inactivo' })
    await prisma.empleado.update({ where: { id: inactivo.id }, data: { activo: false } })

    const resultado = await aplicarAumentoMasivo({
      fechaVigencia: '2026-07-01',
      lineas: [{ empleadoId: inactivo.id, salarioNuevo: '71500', incluido: true }],
    })
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.datos.aplicados).toBe(0)
  })

  it('un usuario común no puede aplicarlo', async () => {
    const empleado = await crearEmpleadoDePrueba({ duenoId: comun.id })
    actuarComo(comun)

    const resultado = await aplicarAumentoMasivo({
      fechaVigencia: '2026-07-01',
      lineas: [{ empleadoId: empleado.id, salarioNuevo: '71500', incluido: true }],
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('administradores')
  })
})

/** Construye una request al endpoint del cron con la IP y el token indicados. */
function requestDeCron(opciones: { token?: string; ip?: string } = {}) {
  const headers = new Headers()
  if (opciones.token !== undefined) headers.set('x-cron-token', opciones.token)
  headers.set('x-forwarded-for', opciones.ip ?? '127.0.0.1')
  return new NextRequest('http://localhost:3000/api/cron/licencias', { method: 'POST', headers })
}

describe('33. cron de generación anual de licencia (§7.12)', () => {
  const TOKEN = 'token-de-prueba'

  beforeEach(() => {
    process.env.CRON_TOKEN = TOKEN
  })

  it('acredita todos los aniversarios atrasados, no solo el de hoy', async () => {
    // Ingreso en 2020: a 2026 le corresponden los aniversarios 1 a 6.
    const empleado = await crearEmpleadoDePrueba({
      duenoId: admin.id,
      fechaIngreso: fecha(2020, 1, 10),
    })

    const respuesta = await cronLicencias(requestDeCron({ token: TOKEN }))
    expect(respuesta.status).toBe(200)

    const cuerpo = await respuesta.json()
    expect(cuerpo.empleados_procesados).toBe(1)
    expect(cuerpo.movimientos_creados).toBe(6)

    const movimientos = await prisma.licenciaMovimiento.findMany({
      where: { empleadoId: empleado.id },
      orderBy: { anioAniversario: 'asc' },
    })
    expect(movimientos.map((m) => m.anioAniversario)).toEqual([1, 2, 3, 4, 5, 6])
    // 20, 20, 20, 20, 21, 21 → el aniversario 4 da 20, no 21.
    expect(movimientos.map((m) => Number(m.haber))).toEqual([20, 20, 20, 20, 21, 21])
    expect(await saldoDeDias(empleado.id)).toBe('122')

    expect(movimientos[0].concepto).toBe('Generación anual — 1 años')
    expect(movimientos[0].fecha.toISOString().slice(0, 10)).toBe('2021-01-10')
  })

  it('ejecutarlo dos veces el mismo día no duplica nada', async () => {
    const empleado = await crearEmpleadoDePrueba({
      duenoId: admin.id,
      fechaIngreso: fecha(2020, 1, 10),
    })

    await cronLicencias(requestDeCron({ token: TOKEN }))
    const saldoTrasPrimera = await saldoDeDias(empleado.id)

    const segunda = await cronLicencias(requestDeCron({ token: TOKEN }))
    const cuerpo = await segunda.json()
    expect(cuerpo.movimientos_creados).toBe(0)
    expect(await saldoDeDias(empleado.id)).toBe(saldoTrasPrimera)
  })

  it('ignora a los empleados con activo = false', async () => {
    const inactivo = await crearEmpleadoDePrueba({
      duenoId: admin.id,
      alias: 'Inactivo',
      fechaIngreso: fecha(2020, 1, 10),
    })
    await prisma.empleado.update({ where: { id: inactivo.id }, data: { activo: false } })

    const respuesta = await cronLicencias(requestDeCron({ token: TOKEN }))
    const cuerpo = await respuesta.json()
    expect(cuerpo.empleados_procesados).toBe(0)
    expect(cuerpo.movimientos_creados).toBe(0)
    expect(await prisma.licenciaMovimiento.count({ where: { empleadoId: inactivo.id } })).toBe(0)
  })

  it('un empleado con menos de un año no genera nada', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2026, 6, 1) })
    const cuerpo = await (await cronLicencias(requestDeCron({ token: TOKEN }))).json()
    expect(cuerpo.movimientos_creados).toBe(0)
  })

  it('sin token responde 404', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })
    const respuesta = await cronLicencias(requestDeCron({}))
    expect(respuesta.status).toBe(404)
    expect(await prisma.licenciaMovimiento.count()).toBe(0)
  })

  it('con un token equivocado responde 404', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })
    const respuesta = await cronLicencias(requestDeCron({ token: 'otro-token' }))
    expect(respuesta.status).toBe(404)
    expect(await prisma.licenciaMovimiento.count()).toBe(0)
  })

  it('sin el header de origen igual procesa: el bind a 127.0.0.1 es la garantía', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })
    const headers = new Headers()
    headers.set('x-cron-token', TOKEN)
    const sinOrigen = new NextRequest('http://localhost:3000/api/cron/licencias', {
      method: 'POST',
      headers,
    })
    expect((await cronLicencias(sinOrigen)).status).toBe(200)
  })

  it('desde una IP que no es loopback responde 404', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })
    const respuesta = await cronLicencias(requestDeCron({ token: TOKEN, ip: '10.0.0.7' }))
    expect(respuesta.status).toBe(404)
    expect(await prisma.licenciaMovimiento.count()).toBe(0)
  })

  it('acepta ::1 como loopback', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })
    const respuesta = await cronLicencias(requestDeCron({ token: TOKEN, ip: '::1' }))
    expect(respuesta.status).toBe(200)
  })

  it('32. ingreso el 29/02: el aniversario cae el 28/02 en años no bisiestos', async () => {
    const empleado = await crearEmpleadoDePrueba({
      duenoId: admin.id,
      fechaIngreso: fecha(2024, 2, 29),
    })

    await cronLicencias(requestDeCron({ token: TOKEN }))

    const movimientos = await prisma.licenciaMovimiento.findMany({
      where: { empleadoId: empleado.id },
      orderBy: { anioAniversario: 'asc' },
    })
    expect(movimientos.map((m) => m.fecha.toISOString().slice(0, 10))).toEqual([
      '2025-02-28',
      '2026-02-28',
    ])
  })

  it('registra la ejecución en auditoría solo si creó movimientos', async () => {
    await crearEmpleadoDePrueba({ duenoId: admin.id, fechaIngreso: fecha(2020, 1, 10) })

    await cronLicencias(requestDeCron({ token: TOKEN }))
    const conMovimientos = await prisma.auditoria.findMany({ where: { accion: 'CRON_LICENCIAS' } })
    expect(conMovimientos).toHaveLength(1)
    expect(conMovimientos[0].usuarioId).toBeNull()

    await cronLicencias(requestDeCron({ token: TOKEN }))
    const sinMovimientos = await prisma.auditoria.findMany({ where: { accion: 'CRON_LICENCIAS' } })
    expect(sinMovimientos).toHaveLength(1)
  })
})

describe('§7.12 reconocimiento de direcciones de loopback', () => {
  it('acepta las formas habituales de loopback', () => {
    for (const direccion of [
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
      '[::1]',
      '[::1]:54321',
      '127.0.0.1:8080',
      ' 127.0.0.1 ',
    ]) {
      expect(esLoopback(direccion), direccion).toBe(true)
    }
  })

  it('rechaza cualquier otra', () => {
    for (const direccion of [
      '10.0.0.7',
      '192.168.1.5:443',
      '2001:db8::1',
      '[2001:db8::1]:443',
      '',
      null,
      '10.0.0.7, 127.0.0.1',
    ]) {
      expect(esLoopback(direccion), String(direccion)).toBe(false)
    }
  })
})
