/**
 * Cliente de Prisma.
 *
 * Prisma 7 usa un driver adapter en lugar del motor nativo; para MySQL 8 el adapter es
 * `@prisma/adapter-mariadb` (el driver de MariaDB habla el protocolo de MySQL).
 *
 * Los ajustes que se le hacen a la cadena de conexión —la zona horaria y la autenticación
 * contra loopback— están en `urlConexion.ts`, con el porqué de cada uno.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/client'
import { urlDeConexion } from './urlConexion'

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient }

function crearCliente(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta la variable de entorno DATABASE_URL')

  const adapter = new PrismaMariaDb(urlDeConexion(url))

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  })
}

export const prisma: PrismaClient = globalParaPrisma.prisma ?? crearCliente()

// En desarrollo, el hot reload de Next volvería a instanciar el cliente en cada recarga.
if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma

export type { PrismaClient }
