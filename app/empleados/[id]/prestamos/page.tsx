/**
 * §7.4 — listado de préstamos de la empleada, en su página propia.
 *
 * Hasta ahora el préstamo se registraba y no se volvía a ver: quedaba el asiento en la cuenta
 * corriente y las cuotas en el plan de pagos, sin ninguna pantalla desde donde mirarlo ni
 * corregirlo. Esta es esa pantalla, y la de detalle que cuelga de ella.
 */
import { notFound } from 'next/navigation'
import { accesoAEmpleado, empleadaDelMarco, exigirUsuario, puedeVer } from '@/lib/auth/guards'
import { listarPrestamos } from '@/lib/consultas/movimientos'
import { ListaPrestamos } from './ListaPrestamos'

export const dynamic = 'force-dynamic'

export default async function PaginaPrestamos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  return (
    <ListaPrestamos empleada={empleadaDelMarco(acceso)} prestamos={await listarPrestamos(id)} />
  )
}
