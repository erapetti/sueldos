/**
 * §11 — tabla `auditoria` para las operaciones de administrador y las liquidaciones.
 *
 * Es complementaria a las columnas `creado_por` / `modificado_por`, que van en cada tabla.
 */
import 'server-only'
import type { Prisma } from '@/lib/db/generated/client'
import { prisma } from '@/lib/db/prisma'

export type EntradaAuditoria = {
  /** `null` en los procesos automáticos (§7.12). */
  usuarioId: string | null
  entidad: string
  entidadId?: string | null
  accion: string
  datosAntes?: Prisma.InputJsonValue | null
  datosDespues?: Prisma.InputJsonValue | null
}

type ClientePrisma = Prisma.TransactionClient | typeof prisma

export async function auditar(entrada: EntradaAuditoria, cliente: ClientePrisma = prisma) {
  await cliente.auditoria.create({
    data: {
      usuarioId: entrada.usuarioId,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId ?? null,
      accion: entrada.accion,
      datosAntes: entrada.datosAntes ?? undefined,
      datosDespues: entrada.datosDespues ?? undefined,
    },
  })
}
