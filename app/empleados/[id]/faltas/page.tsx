/** §7.2 — planilla mensual de inasistencias, en su página propia. */
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
import { PlanillaFaltas } from './PlanillaFaltas'

export const dynamic = 'force-dynamic'

export default async function PaginaFaltas({
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

  const registros = await prisma.falta.findMany({
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
    extra: { causal: r.causal, descuenta: r.descuenta },
  }))

  return (
    <>
      {!contexto.hayRegimen ? (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No hay un régimen horario vigente para este mes: no se puede validar el tope de horas
          por día. Cargalo en la ficha del empleado antes de registrar inasistencias.
        </p>
      ) : null}

      <PlanillaFaltas
        empleadoId={id}
        alias={acceso.empleado.alias}
        nombreCompleto={acceso.empleado.nombreCompleto}
        periodo={aPeriodoISO(periodo)}
        dias={contexto.dias}
        guardados={guardados}
        estadoLiquidacion={contexto.estadoLiquidacion}
        soloLectura={!puedeEditar(acceso.nivel)}
      />
    </>
  )
}
