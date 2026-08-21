/** §7.1 — planilla mensual de horas extras, en su página propia. */
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { exigirUsuario, accesoAEmpleado, puedeEditar, puedeVer } from '@/lib/auth/guards'
import { contextoDePlanilla } from '@/lib/consultas/planilla'
import { aDecimal } from '@/lib/db/mapeo'
import {
  aISO,
  aPeriodoISO,
  hoy,
  parsePeriodo,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from '@/lib/format/dates'
import { PlanillaHorasExtras } from './PlanillaHorasExtras'

export const dynamic = 'force-dynamic'

export default async function PaginaHorasExtras({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { id } = await params
  const { periodo: periodoTexto } = await searchParams

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const periodo = periodoTexto ? parsePeriodo(periodoTexto) : primerDiaDelMes(hoy())
  const contexto = await contextoDePlanilla(id, periodo)

  const registros = await prisma.horaExtra.findMany({
    where: {
      empleadoId: id,
      fecha: { gte: primerDiaDelMes(periodo), lte: ultimoDiaDelMes(periodo) },
    },
    orderBy: { fecha: 'asc' },
  })

  const guardados = registros.map((r) => ({
    clave: r.id,
    id: r.id,
    fecha: aISO(r.fecha),
    horas: aDecimal(r.horas).toNumber(),
    nota: r.nota ?? '',
    extra: { conBps: r.conBps, recargoPct: r.recargoPct },
  }))

  return (
    <PlanillaHorasExtras
      empleadoId={id}
      alias={acceso.empleado.alias}
      nombreCompleto={acceso.empleado.nombreCompleto}
      periodo={aPeriodoISO(periodo)}
      dias={contexto.dias}
      guardados={guardados}
      estadoLiquidacion={contexto.estadoLiquidacion}
      valorHoraCalculado={contexto.valorHoraCalculado}
      valorHoraNegro={contexto.valorHoraNegro}
      soloLectura={!puedeEditar(acceso.nivel)}
    />
  )
}
