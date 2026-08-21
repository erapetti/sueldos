/**
 * §7.12 — generación anual de días de licencia.
 *
 *   curl -X POST -H "X-Cron-Token: $CRON_TOKEN" http://localhost:3000/api/cron/licencias
 *
 * No pasa por oauth2-proxy: exige loopback + token (§7.12). Recupera **todos** los
 * aniversarios pendientes, no solo los de hoy, para recuperarse solo si un día no llegó a
 * ejecutarse. Es idempotente por el índice único `(empleado_id, anio_aniversario)`.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import { verificarAccesoCron } from '@/lib/auth/cronAuth'
import { aniversariosPendientes } from '@/lib/calculo/licencias'
import { aISO, hoy } from '@/lib/format/dates'

export const dynamic = 'force-dynamic'

type DetalleGeneracion = {
  empleado: string
  aniversario: number
  dias: number
}

export async function POST(request: NextRequest) {
  // Si falta cualquiera de las dos condiciones: 404 sin procesar nada. Un 401 o un 403
  // confirmarían que el endpoint existe.
  if (!verificarAccesoCron(request).ok) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const fechaCorte = hoy()

  const empleados = await prisma.empleado.findMany({
    where: { activo: true },
    select: {
      id: true,
      alias: true,
      fechaIngreso: true,
      licenciaMovimientos: {
        where: { tipo: 'GENERACION_ANUAL' },
        select: { anioAniversario: true },
      },
    },
  })

  const detalle: DetalleGeneracion[] = []

  await prisma.$transaction(async (tx) => {
    for (const empleado of empleados) {
      const acreditados = empleado.licenciaMovimientos
        .map((m) => m.anioAniversario)
        .filter((n): n is number => n !== null)

      const pendientes = aniversariosPendientes(empleado.fechaIngreso, fechaCorte, acreditados)

      for (const pendiente of pendientes) {
        await tx.licenciaMovimiento.create({
          data: {
            empleadoId: empleado.id,
            fecha: pendiente.fecha,
            tipo: 'GENERACION_ANUAL',
            debe: '0',
            haber: pendiente.dias.toFixed(2),
            concepto: `Generación anual — ${pendiente.n} años`,
            anioAniversario: pendiente.n,
          },
        })

        detalle.push({
          empleado: empleado.alias,
          aniversario: pendiente.n,
          dias: pendiente.dias,
        })
      }
    }

    // §7.12 — solo se audita si hubo movimientos creados.
    if (detalle.length > 0) {
      await auditar(
        {
          usuarioId: null,
          entidad: 'licencia_movimientos',
          accion: 'CRON_LICENCIAS',
          datosDespues: { ejecutado: aISO(fechaCorte), detalle },
        },
        tx,
      )
    }
  })

  console.info(
    `[cron] licencias ejecutado=${aISO(fechaCorte)} empleados=${empleados.length} movimientos=${detalle.length}`,
  )

  return NextResponse.json({
    ejecutado: aISO(fechaCorte),
    empleados_procesados: empleados.length,
    movimientos_creados: detalle.length,
    detalle,
  })
}
