/**
 * §7.7 — aguinaldo. La fórmula está pendiente de definición (§13.3), así que la pantalla
 * informa que la funcionalidad todavía no está implementada.
 */
import { notFound } from 'next/navigation'
import { exigirUsuario, accesoAEmpleado, puedeVer } from '@/lib/auth/guards'
import { NoImplementado } from '@/components/dominio/NoImplementado'
import { esMesDeAguinaldo, MOTIVO_NO_IMPLEMENTADO } from '@/lib/calculo/aguinaldo'
import { hoy, primerDiaDelMes } from '@/lib/format/dates'

export const dynamic = 'force-dynamic'

export default async function PaginaAguinaldo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const enMes = esMesDeAguinaldo(primerDiaDelMes(hoy()))

  return (
    <NoImplementado
      titulo="Aguinaldo"
      subtitulo={`${acceso.empleado.alias} — ${acceso.empleado.nombreCompleto}`}
      motivo={
        enMes
          ? `${MOTIVO_NO_IMPLEMENTADO} Falta definir si la base es el promedio del semestre, qué conceptos la integran y si lleva descuentos de BPS. Lo único resuelto es que los pagos adicionales y los boletos no integran la base.`
          : `El aguinaldo se liquida en junio y en diciembre. Además, ${MOTIVO_NO_IMPLEMENTADO.charAt(0).toLowerCase()}${MOTIVO_NO_IMPLEMENTADO.slice(1)}`
      }
      volverA={`/empleados/${id}`}
      volverTexto="Volver a la ficha"
    />
  )
}
