/**
 * Apoyo de los tests de integración: base limpia y datos de referencia.
 *
 * Los tests corren contra la base apuntada por `DATABASE_URL`. **Borran todas las tablas**
 * antes de cada caso, así que nunca deben apuntarse a una base con datos reales.
 */
import { vi } from 'vitest'
import { prisma } from '@/lib/db/prisma'
import { fecha, primerDiaDelMes } from '@/lib/format/dates'

export type UsuarioDePrueba = {
  id: string
  email: string
  nombre: string | null
  esAdmin: boolean
}

/** Usuario que devuelven los guards durante los tests. Se cambia con `actuarComo`. */
let usuarioActivo: UsuarioDePrueba | null = null

vi.mock('@/lib/auth/currentUser', () => ({
  usuarioActual: async () => usuarioActivo,
  identidadActual: async () =>
    usuarioActivo
      ? { estado: 'OK' as const, usuario: usuarioActivo }
      : { estado: 'SIN_ACCESO' as const, motivo: 'NO_REGISTRADO' as const, email: null },
}))

export function actuarComo(usuario: UsuarioDePrueba | null) {
  usuarioActivo = usuario
}

/** Borra todo, respetando el orden de las claves foráneas. */
export async function limpiarBase() {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
  const tablas = [
    'auditoria',
    'liquidacion_lineas',
    'plan_pagos',
    'cuenta_corriente',
    'licencia_movimientos',
    'licencias',
    'liquidaciones',
    'horas_extras',
    'faltas',
    'pagos_adicionales',
    'empleado_permisos',
    'empleado_regimenes',
    'empleado_valor_hora_negro',
    'empleado_salarios',
    'empleados',
    'usuarios',
    'bps_conceptos',
    'valor_boleto',
    'feriados',
  ]
  for (const tabla of tablas) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${tabla}\``)
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
  actuarComo(null)
}

export async function crearUsuarioDePrueba(
  email: string,
  esAdmin = false,
): Promise<UsuarioDePrueba> {
  const creado = await prisma.usuario.create({
    data: { email, nombre: email.split('@')[0], esAdmin, activo: true },
  })
  return { id: creado.id, email: creado.email, nombre: creado.nombre, esAdmin: creado.esAdmin }
}

export type OpcionesEmpleado = {
  alias?: string
  duenoId: string
  fechaIngreso?: Date
  cobraBoletos?: boolean
  aportaBps?: boolean
  seguroSalud?: string | null
  salario?: string
  horasSemanales?: string
  valorHoraNegro?: string
  horasPorDiaHabil?: string
}

/**
 * Empleado equivalente al de los tests unitarios: $65.000 por 30 h semanales, régimen de
 * lunes a viernes de 6 h, con vigencias desde enero de 2020.
 */
export async function crearEmpleadoDePrueba(opciones: OpcionesEmpleado) {
  const fechaIngreso = opciones.fechaIngreso ?? fecha(2020, 1, 1)
  const vigencia = primerDiaDelMes(fechaIngreso)
  const horas = opciones.horasPorDiaHabil ?? '6.00'

  const empleado = await prisma.empleado.create({
    data: {
      duenoId: opciones.duenoId,
      alias: opciones.alias ?? 'Ana',
      nombreCompleto: 'Ana Pérez',
      banco: 'BROU',
      cuenta: 'ABC123',
      fechaIngreso,
      cobraBoletos: opciones.cobraBoletos ?? true,
      aportaBps: opciones.aportaBps ?? true,
      seguroSalud: opciones.seguroSalud ?? null,
    },
  })

  await prisma.empleadoSalario.create({
    data: {
      empleadoId: empleado.id,
      salario: opciones.salario ?? '65000.00',
      horasSemanales: opciones.horasSemanales ?? '30.00',
      fechaVigencia: vigencia,
    },
  })

  await prisma.empleadoValorHoraNegro.create({
    data: {
      empleadoId: empleado.id,
      valor: opciones.valorHoraNegro ?? '300.00',
      fechaVigencia: vigencia,
    },
  })

  await prisma.empleadoRegimen.create({
    data: {
      empleadoId: empleado.id,
      fechaVigencia: vigencia,
      horasLunes: horas,
      horasMartes: horas,
      horasMiercoles: horas,
      horasJueves: horas,
      horasViernes: horas,
      horasSabado: '0.00',
      horasDomingo: '0.00',
    },
  })

  return empleado
}

export async function crearValorBoleto(monto = '50.00', vigencia = fecha(2020, 1, 1)) {
  return prisma.valorBoleto.create({ data: { monto, fechaVigencia: vigencia } })
}

export async function saldoDeCuenta(empleadoId: string): Promise<string> {
  const movimientos = await prisma.cuentaCorriente.findMany({
    where: { empleadoId },
    select: { debe: true, haber: true },
  })
  const { default: Decimal } = await import('decimal.js')
  return movimientos
    .reduce(
      (acc: InstanceType<typeof Decimal>, m) =>
        acc.plus(m.haber.toString()).minus(m.debe.toString()),
      new Decimal(0),
    )
    .toFixed(2)
}

export async function saldoDeDias(empleadoId: string): Promise<string> {
  const movimientos = await prisma.licenciaMovimiento.findMany({
    where: { empleadoId },
    select: { debe: true, haber: true },
  })
  const { default: Decimal } = await import('decimal.js')
  return movimientos
    .reduce(
      (acc: InstanceType<typeof Decimal>, m) =>
        acc.plus(m.haber.toString()).minus(m.debe.toString()),
      new Decimal(0),
    )
    .toString()
}
