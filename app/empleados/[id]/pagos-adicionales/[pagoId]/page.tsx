/** §7.3 — detalle de un pago adicional: lo que se registró y lo que todavía se puede corregir. */
import { notFound } from 'next/navigation'
import { accesoAEmpleado, empleadaDelMarco, exigirUsuario, puedeVer } from '@/lib/auth/guards'
import { detalleDePagoAdicional } from '@/lib/consultas/movimientos'
import { DetallePagoAdicional } from './DetallePagoAdicional'

export const dynamic = 'force-dynamic'

export default async function PaginaDetallePagoAdicional({
  params,
}: {
  params: Promise<{ id: string; pagoId: string }>
}) {
  const { id, pagoId } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const pago = await detalleDePagoAdicional(id, pagoId)
  // Un id que no es de esta empleada cae en 404 y no filtra que exista.
  if (!pago) notFound()

  return <DetallePagoAdicional empleada={empleadaDelMarco(acceso)} pago={pago} />
}
