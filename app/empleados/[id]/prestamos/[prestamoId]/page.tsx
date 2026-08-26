/** §7.4 — detalle de un préstamo: lo que se registró y lo que todavía se puede corregir. */
import { notFound } from 'next/navigation'
import { exigirUsuario, accesoAEmpleado, puedeEditar, puedeVer } from '@/lib/auth/guards'
import { detalleDePrestamo } from '@/lib/consultas/movimientos'
import { aISO, hoy, primerDiaDelMes } from '@/lib/format/dates'
import { DetallePrestamo } from './DetallePrestamo'

export const dynamic = 'force-dynamic'

export default async function PaginaDetallePrestamo({
  params,
}: {
  params: Promise<{ id: string; prestamoId: string }>
}) {
  const { id, prestamoId } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const prestamo = await detalleDePrestamo(id, prestamoId)
  // Un id que no es de esta empleada cae en 404 y no filtra que exista.
  if (!prestamo) notFound()

  return (
    <DetallePrestamo
      empleadoId={id}
      alias={acceso.empleado.alias}
      nombreCompleto={acceso.empleado.nombreCompleto}
      soloLectura={!puedeEditar(acceso.nivel)}
      fechaIngreso={aISO(acceso.empleado.fechaIngreso)}
      dadoDeBaja={!acceso.empleado.activo}
      visible={acceso.empleado.visible}
      prestamo={prestamo}
      // El mes en curso se decide en el servidor: es lo que separa las cuotas que todavía se
      // pueden tocar de las de meses ya pasados, y no puede depender del reloj del navegador.
      mesActual={aISO(primerDiaDelMes(hoy())).slice(0, 7)}
    />
  )
}
