/**
 * §8.7 — Todos los empleados. Disponible para todos los usuarios: muestra todos los
 * empleados accesibles, estén visibles o no.
 *
 * Es el único lugar desde donde se puede volver a mostrar un empleado oculto, y el único
 * punto de acceso del administrador a los empleados ajenos.
 */
import { exigirUsuario } from '@/lib/auth/guards'
import { listarTodosLosEmpleados } from '@/lib/consultas/empleados'
import { aISO, formatearFecha } from '@/lib/format/dates'
import { TablaTodos, type FilaTabla } from './TablaTodos'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

export const dynamic = 'force-dynamic'

export default async function PantallaTodos() {
  const usuario = await exigirUsuario()
  const empleados = await listarTodosLosEmpleados(usuario.id, usuario.esAdmin)

  // La tabla es un componente cliente: las fechas viajan ya serializadas.
  const filas: FilaTabla[] = empleados.map((e) => ({
    id: e.id,
    alias: e.alias,
    nombreCompleto: e.nombreCompleto,
    duenoId: e.duenoId,
    duenoNombre: e.duenoNombre,
    activo: e.activo,
    visible: e.visible,
    fechaIngreso: aISO(e.fechaIngreso),
    fechaIngresoTexto: formatearFecha(e.fechaIngreso),
    nivel: e.nivel,
    estado: e.estado,
    compartidoCon: e.compartidoCon,
  }))

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Listado completo"
        titulo="Todos los empleados"
        bajada={
          usuario.esAdmin
            ? 'Todos los empleados del sistema, incluidos los ocultos y los dados de baja.'
            : 'Tus empleados y los compartidos con vos, incluidos los ocultos y los dados de baja.'
        }
      />

      <TablaTodos filas={filas} usuarioId={usuario.id} esAdmin={usuario.esAdmin} />
    </div>
  )
}
