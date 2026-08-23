/** §4.2.2 — alta de empleado: un único formulario, una única transacción. */
import { exigirUsuario } from '@/lib/auth/guards'
import { FormularioAlta } from './FormularioAlta'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

export const dynamic = 'force-dynamic'

export default async function PaginaNuevoEmpleado() {
  await exigirUsuario()
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Alta"
        titulo="Nuevo empleado"
        bajada="Se crean el empleado, el salario, el régimen horario y el valor hora «en negro», los cuatro con vigencia desde el 1° del mes de ingreso."
      />
      <FormularioAlta />
    </div>
  )
}
