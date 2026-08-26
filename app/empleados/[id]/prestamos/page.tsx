/**
 * §7.4 — listado de préstamos de la empleada, en su página propia.
 *
 * Hasta ahora el préstamo se registraba y no se volvía a ver: quedaba el asiento en la cuenta
 * corriente y las cuotas en el plan de pagos, sin ninguna pantalla desde donde mirarlo ni
 * corregirlo. Esta es esa pantalla, y la de detalle que cuelga de ella.
 */
import { notFound } from 'next/navigation'
import { exigirUsuario, accesoAEmpleado, puedeEditar, puedeVer } from '@/lib/auth/guards'
import { listarPrestamos } from '@/lib/consultas/movimientos'
import { aISO } from '@/lib/format/dates'
import { ListaPrestamos } from './ListaPrestamos'

export const dynamic = 'force-dynamic'

export default async function PaginaPrestamos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const prestamos = await listarPrestamos(id)

  return (
    <ListaPrestamos
      empleadoId={id}
      alias={acceso.empleado.alias}
      nombreCompleto={acceso.empleado.nombreCompleto}
      fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
      soloLectura={!puedeEditar(acceso.nivel)}
      dadoDeBaja={!acceso.empleado.activo}
      visible={acceso.empleado.visible}
      prestamos={prestamos}
    />
  )
}
