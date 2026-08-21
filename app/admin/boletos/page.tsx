/** §7.9 — costo de boletos: serie histórica y alta de un valor nuevo. */
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { aDecimal } from '@/lib/db/mapeo'
import { aISO, formatearFecha } from '@/lib/format/dates'
import { PantallaBoletos } from './PantallaBoletos'

export const dynamic = 'force-dynamic'

export default async function PaginaBoletos() {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/empleados')

  const valores = await prisma.valorBoleto.findMany({ orderBy: { fechaVigencia: 'desc' } })

  const autores = await prisma.usuario.findMany({
    where: { id: { in: valores.map((v) => v.creadoPor).filter((x): x is string => x !== null) } },
    select: { id: true, nombre: true, email: true },
  })
  const porId = new Map(autores.map((a) => [a.id, a.nombre ?? a.email]))

  return (
    <PantallaBoletos
      valores={valores.map((v) => ({
        id: v.id,
        monto: aDecimal(v.monto).toFixed(2),
        fechaVigencia: formatearFecha(v.fechaVigencia),
        fechaVigenciaISO: aISO(v.fechaVigencia),
        cargadoPor: v.creadoPor ? (porId.get(v.creadoPor) ?? '—') : '—',
        cargadoEn: formatearFecha(v.creadoEn),
      }))}
    />
  )
}
