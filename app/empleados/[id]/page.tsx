/**
 * §8.4 — ficha del empleado. Título = alias, subtítulo = nombre completo.
 */
import { notFound, redirect } from 'next/navigation'
import {
  exigirUsuario,
  accesoAEmpleado,
  listadoDeOrigen,
  puedeEditar,
  puedeVer,
  esDueno,
} from '@/lib/auth/guards'
import { datosDeFicha, totalPorPeriodo } from '@/lib/consultas/ficha'
import { SECCIONES_DE_FICHA } from '@/components/dominio/EncabezadoEmpleada'
import { FichaEmpleado } from './FichaEmpleado'

export const dynamic = 'force-dynamic'

export default async function PaginaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ seccion?: string }>
}) {
  const { id } = await params
  const { seccion } = await searchParams

  // Sin sección pedida se va derecho a Inasistencias, que es la pantalla que más se usa: la
  // ficha entera es un clic de más para lo habitual. Con `?seccion=` se respeta lo pedido, así
  // los enlaces que apuntan a una sección concreta siguen funcionando.
  if (!seccion) redirect(`/empleados/${id}/faltas`)

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  // Una sección que no existe es un 404 y no una ficha vacía. Va después del permiso para no
  // cambiar en nada a quién se le muestra qué, y antes de la consulta para no ir a la base al
  // pedo. `includes` sobre el `as const` pide el ensanchado: `seccion` es un `string` cualquiera.
  if (!(SECCIONES_DE_FICHA as readonly string[]).includes(seccion)) notFound()

  // «Compartido con» es del dueño y de nadie más: el submenú ni siquiera dibuja el botón. Para
  // el que entra por la URL vale lo mismo que una sección inexistente, así que 404 y no una
  // ficha con el cuerpo vacío.
  const duenoDelEmpleado = esDueno(acceso.nivel)
  if (seccion === 'compartido' && !duenoDelEmpleado) notFound()

  const datos = await datosDeFicha(id)
  const totales = totalPorPeriodo(datos.liquidaciones)

  return (
    <FichaEmpleado
      empleadoId={id}
      seccionInicial={seccion}
      // §8.7 — el administrador ve la ficha de un empleado ajeno en modo lectura.
      soloLectura={!puedeEditar(acceso.nivel)}
      esDueno={duenoDelEmpleado}
      comoAdministrador={acceso.nivel === 'ADMIN'}
      listadoDeOrigen={listadoDeOrigen(acceso.nivel)}
      duenoNombre={datos.empleado.dueno.nombre ?? datos.empleado.dueno.email}
      empleado={{
        alias: datos.empleado.alias,
        nombreCompleto: datos.empleado.nombreCompleto,
        banco: datos.empleado.banco,
        cuenta: datos.empleado.cuenta,
        fechaIngreso: datos.empleado.fechaIngreso.toISOString().slice(0, 10),
        fechaEgreso: datos.empleado.fechaEgreso
          ? datos.empleado.fechaEgreso.toISOString().slice(0, 10)
          : null,
        cobraBoletos: datos.empleado.cobraBoletos,
        celular: datos.empleado.celular,
        direccion: datos.empleado.direccion,
        cedula: datos.empleado.cedula,
        activo: datos.empleado.activo,
        visible: datos.empleado.visible,
      }}
      salarios={datos.salarios}
      valoresHoraNegro={datos.valoresHoraNegro}
      aportesBps={datos.aportesBps}
      regimenes={datos.regimenes}
      librosDeCuenta={datos.librosDeCuenta}
      saldo={datos.saldo}
      mesesSinLiquidar={datos.mesesSinLiquidar}
      cuotas={datos.cuotas}
      liquidaciones={datos.liquidaciones}
      totalesPorPeriodo={Object.fromEntries(totales)}
      permisos={datos.permisos}
    />
  )
}
