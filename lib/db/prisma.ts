/**
 * Cliente de Prisma.
 *
 * Prisma 7 usa un driver adapter en lugar del motor nativo; para MySQL 8 el adapter es
 * `@prisma/adapter-mariadb` (el driver de MariaDB habla el protocolo de MySQL).
 *
 * La conexión se abre en **UTC**: todas las fechas de negocio son `DATE` y se manejan como
 * medianoche UTC (ver lib/format/dates), así que ninguna conversión de zona debe intervenir
 * entre la base y la aplicación. `America/Montevideo` solo se usa para saber qué día es hoy.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/client'

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Fuerza `timezone=Z` en la cadena de conexión si no viene puesta. Sin esto el driver
 * interpreta las columnas `DATETIME` en la zona local del proceso, que en este deploy es
 * `America/Montevideo`, y los timestamps quedarían guardados en hora local.
 */
function conZonaUtc(url: string): string {
  try {
    const u = new URL(url)
    if (!u.searchParams.has('timezone')) u.searchParams.set('timezone', 'Z')
    return u.toString()
  } catch {
    return url
  }
}

function crearCliente(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta la variable de entorno DATABASE_URL')

  const adapter = new PrismaMariaDb(conZonaUtc(url))

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  })
}

export const prisma: PrismaClient = globalParaPrisma.prisma ?? crearCliente()

// En desarrollo, el hot reload de Next volvería a instanciar el cliente en cada recarga.
if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma

export type { PrismaClient }
