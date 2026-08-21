/** §4.2.2 — alta de empleado: un único formulario, una única transacción. */
import { exigirUsuario } from '@/lib/auth/guards'
import { FormularioAlta } from './FormularioAlta'

export const dynamic = 'force-dynamic'

export default async function PaginaNuevoEmpleado() {
  await exigirUsuario()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo empleado</h1>
        <p className="text-sm text-muted-foreground">
          Se crean el empleado, el salario, el régimen horario y el valor hora «en negro», los
          cuatro con vigencia desde el 1° del mes de ingreso.
        </p>
      </div>
      <FormularioAlta />
    </div>
  )
}
