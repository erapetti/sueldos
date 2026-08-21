/**
 * §7.9 — descuentos de BPS: tabla agrupada por concepto y seguro de salud, mostrando el
 * valor vigente y el histórico expandible.
 */
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { aDecimalOpcional } from '@/lib/db/mapeo'
import { aISO, formatearFecha, hoy, primerDiaDelMes } from '@/lib/format/dates'
import { PantallaBps, type GrupoBps } from './PantallaBps'

export const dynamic = 'force-dynamic'

export default async function PaginaBps() {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/empleados')

  const filas = await prisma.bpsConcepto.findMany({
    orderBy: [{ concepto: 'asc' }, { seguroSaludClave: 'asc' }, { fechaVigencia: 'desc' }],
  })

  const mesActual = aISO(primerDiaDelMes(hoy()))

  // Agrupado por (concepto, seguro de salud): el primero de cada grupo es el más reciente.
  const grupos = new Map<string, GrupoBps>()
  for (const fila of filas) {
    const clave = `${fila.concepto}|${fila.seguroSaludClave}`
    const registro = {
      id: fila.id,
      fechaVigencia: formatearFecha(fila.fechaVigencia),
      fechaVigenciaISO: aISO(fila.fechaVigencia),
      porcentaje: aDecimalOpcional(fila.porcentaje)?.toString() ?? null,
    }

    const grupo = grupos.get(clave)
    if (grupo) {
      grupo.historico.push(registro)
      continue
    }

    grupos.set(clave, {
      clave,
      concepto: fila.concepto,
      seguroSalud: fila.seguroSalud,
      historico: [registro],
      // El vigente es el de mayor fechaVigencia <= mes actual.
      vigente: null,
    })
  }

  for (const grupo of grupos.values()) {
    grupo.vigente = grupo.historico.find((h) => h.fechaVigenciaISO <= mesActual) ?? null
  }

  return <PantallaBps grupos={[...grupos.values()]} mesActual={mesActual} />
}
