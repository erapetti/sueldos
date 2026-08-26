/**
 * §7.5 — listado de pagos bancarios de la empleada, en su página propia.
 *
 * El pago bancario es el asiento `PAGO` de la cuenta corriente (§4.9), igual que el préstamo es
 * el asiento `PRESTAMO`, así que la pantalla es la misma con otras columnas. Las dos que agrega
 * son las que lo distinguen: el **libro** al que pertenece y la **liquidación** que cancela
 * (§4.14).
 */
import { notFound } from 'next/navigation'
import { accesoAEmpleado, empleadaDelMarco, exigirUsuario, puedeVer } from '@/lib/auth/guards'
import { listarPagosBancarios } from '@/lib/consultas/movimientos'
import { ListaPagosBancarios } from './ListaPagosBancarios'

export const dynamic = 'force-dynamic'

export default async function PaginaPagosBancarios({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  return (
    <ListaPagosBancarios
      empleada={empleadaDelMarco(acceso)}
      pagos={await listarPagosBancarios(id)}
    />
  )
}
