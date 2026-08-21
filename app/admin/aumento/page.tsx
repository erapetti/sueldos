/**
 * §7.8 — aumento de sueldos. El criterio del gobierno está pendiente de definición (§13.4),
 * así que la pantalla informa que la funcionalidad todavía no está implementada.
 *
 * La parte transaccional del caso de uso sí está implementada y testeada en
 * `actions/aumento.ts`: cuando se defina la fórmula, solo hay que producir el salario nuevo
 * de cada empleado y la pantalla puede pasar a la previsualización.
 */
import { exigirUsuario } from '@/lib/auth/guards'
import { redirect } from 'next/navigation'
import { NoImplementado } from '@/components/dominio/NoImplementado'
import { AUMENTO_NO_IMPLEMENTADO } from '@/lib/calculo/aumento'

export const dynamic = 'force-dynamic'

export default async function PaginaAumento() {
  const usuario = await exigirUsuario()
  if (!usuario.esAdmin) redirect('/empleados')

  return (
    <NoImplementado
      titulo="Aumento de sueldos"
      subtitulo="Alcanza a todos los empleados activos del sistema, sea quien sea el dueño."
      motivo={`${AUMENTO_NO_IMPLEMENTADO} Falta definir qué parámetros entran: IPC, porcentaje por franja salarial, correctivo y tope. El resto del caso de uso ya está resuelto: al confirmarse, cada empleado incluido recibe en una sola transacción su nuevo salario y su nuevo valor hora «en negro» ajustado por el mismo porcentaje, ambos con la misma fecha de vigencia.`}
      volverA="/empleados"
      volverTexto="Volver a Empleados"
    />
  )
}
