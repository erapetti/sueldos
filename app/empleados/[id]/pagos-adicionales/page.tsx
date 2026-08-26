/**
 * §7.3 — listado de pagos adicionales de la empleada, en su página propia.
 *
 * Es la misma pantalla que la de préstamos (§7.4), con la diferencia de que un pago adicional
 * no es un asiento de cuenta corriente sino una novedad de la liquidación (§4.7): su fecha
 * decide en qué mes se paga, y por eso el listado muestra el período.
 */
import { notFound } from 'next/navigation'
import { accesoAEmpleado, empleadaDelMarco, exigirUsuario, puedeVer } from '@/lib/auth/guards'
import { listarPagosAdicionales } from '@/lib/consultas/movimientos'
import { ListaPagosAdicionales } from './ListaPagosAdicionales'

export const dynamic = 'force-dynamic'

export default async function PaginaPagosAdicionales({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  return (
    <ListaPagosAdicionales
      empleada={empleadaDelMarco(acceso)}
      pagos={await listarPagosAdicionales(id)}
    />
  )
}
