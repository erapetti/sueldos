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
        // §3.3 — con el match por email ya no hay un sub que «reclamar»: lo que distingue a
        // un usuario pre-creado del que ya entró es si tiene un último acceso.
        reclamado: u.ultimoAcceso !== null,
        ultimoAcceso: u.ultimoAcceso ? formatearFecha(u.ultimoAcceso) : null,
        empleados: u._count.empleados,
      }))}
    />
  )
}
