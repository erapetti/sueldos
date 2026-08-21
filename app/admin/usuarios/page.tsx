/** §3.4 — ABM de usuarios. */
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { formatearFecha } from '@/lib/format/dates'
import { PantallaUsuarios } from './PantallaUsuarios'

export const dynamic = 'force-dynamic'

export default async function PaginaUsuarios() {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/empleados')

  const usuarios = await prisma.usuario.findMany({
    include: { _count: { select: { empleados: true } } },
    orderBy: { email: 'asc' },
  })

  return (
    <PantallaUsuarios
      usuarioActualId={usuario.id}
      usuarios={usuarios.map((u) => ({
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        esAdmin: u.esAdmin,
        activo: u.activo,
        // §3.3 — queda NULL hasta el primer ingreso.
        reclamado: u.googleSub !== null,
        ultimoAcceso: u.ultimoAcceso ? formatearFecha(u.ultimoAcceso) : null,
        empleados: u._count.empleados,
      }))}
    />
  )
}
