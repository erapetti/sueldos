/** §7.9 — feriados: listado por año, con alta y baja de feriados futuros. */
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { aISO, fecha, formatearFecha, hoy } from '@/lib/format/dates'
import { PantallaFeriados } from './PantallaFeriados'

export const dynamic = 'force-dynamic'

export default async function PaginaFeriados({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>
}) {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/empleados')

  const { anio: anioTexto } = await searchParams
  const anio = anioTexto && /^\d{4}$/.test(anioTexto) ? Number(anioTexto) : hoy().getUTCFullYear()

  const feriados = await prisma.feriado.findMany({
    where: { fecha: { gte: fecha(anio, 1, 1), lte: fecha(anio, 12, 31) } },
    orderBy: { fecha: 'asc' },
  })

  return (
    <PantallaFeriados
      anio={anio}
      hoyISO={aISO(hoy())}
      feriados={feriados.map((f) => ({
        fechaISO: aISO(f.fecha),
        fecha: formatearFecha(f.fecha),
        descripcion: f.descripcion,
        noLaborable: f.noLaborable,
      }))}
    />
  )
}
