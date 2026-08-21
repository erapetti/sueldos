/**
 * Datos iniciales.
 *
 * Crea el administrador de `BOOTSTRAP_ADMIN_EMAIL` si la tabla `usuarios` está vacía (§3.3)
 * y, en desarrollo, un juego de datos de ejemplo con `SEED_DEMO=1`.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../lib/db/generated/client'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta la variable de entorno DATABASE_URL')

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) })

function fecha(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia))
}

async function bootstrap() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.log('Sin BOOTSTRAP_ADMIN_EMAIL: no se crea el administrador inicial.')
    return null
  }

  const cantidad = await prisma.usuario.count()
  if (cantidad > 0) {
    console.log(`La tabla usuarios ya tiene ${cantidad} registros: se ignora BOOTSTRAP_ADMIN_EMAIL.`)
    return prisma.usuario.findFirst({ where: { esAdmin: true } })
  }

  const admin = await prisma.usuario.create({
    data: { email, esAdmin: true, activo: true, nombre: 'Administrador inicial' },
  })
  console.log(`Administrador inicial creado: ${admin.email}`)
  return admin
}

/** Feriados nacionales fijos del Uruguay. Los movibles se cargan desde la pantalla. */
async function feriadosFijos(anio: number) {
  const fijos: [number, number, string, boolean][] = [
    [1, 1, 'Año Nuevo', true],
    [5, 1, 'Día de los Trabajadores', true],
    [7, 18, 'Jura de la Constitución', true],
    [8, 25, 'Declaratoria de la Independencia', true],
    [12, 25, 'Día de la Familia', true],
    [1, 6, 'Día de los Niños', false],
    [5, 18, 'Batalla de Las Piedras', false],
    [6, 19, 'Natalicio de Artigas', false],
    [10, 12, 'Día de la Raza', false],
    [11, 2, 'Día de los Difuntos', false],
  ]

  for (const [mes, dia, descripcion, noLaborable] of fijos) {
    await prisma.feriado.upsert({
      where: { fecha: fecha(anio, mes, dia) },
      create: { fecha: fecha(anio, mes, dia), descripcion, noLaborable },
      update: {},
    })
  }
  console.log(`Feriados fijos de ${anio} cargados.`)
}

async function main() {
  await bootstrap()
  const anio = new Date().getUTCFullYear()
  await feriadosFijos(anio)
  await feriadosFijos(anio + 1)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
