/**
 * §7.11 — licencias de la empleada, en su página propia.
 *
 * Reemplaza a las dos pantallas que había: la sección `Datos/Licencia` de la ficha y el botón
 * «Registrar licencia» del submenú de Movimientos. La tabla es el **estado de cuenta de días**
 * (§4.15.1) con los períodos gozados adentro: las dos que estaban separadas en la ficha —el
 * libro y «Períodos gozados»— son la misma cosa mirada por año de licencia.
 */
import { notFound } from 'next/navigation'
import { accesoAEmpleado, empleadaDelMarco, exigirUsuario, puedeVer } from '@/lib/auth/guards'
import { listarLicencias } from '@/lib/consultas/movimientos'
import { ListaLicencias } from './ListaLicencias'

export const dynamic = 'force-dynamic'

export default async function PaginaLicencias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  return <ListaLicencias empleada={empleadaDelMarco(acceso)} libro={await listarLicencias(id)} />
}
