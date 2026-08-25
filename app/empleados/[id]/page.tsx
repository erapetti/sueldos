/**
 * §8.4 — ficha del empleado. Título = alias, subtítulo = nombre completo.
 */
import { notFound } from 'next/navigation'
import { exigirUsuario, accesoAEmpleado, puedeEditar, puedeVer, esDueno } from '@/lib/auth/guards'
import { datosDeFicha, totalPorPeriodo } from '@/lib/consultas/ficha'
import { descripcionSeguroSalud } from '@/constants/segurosSalud'
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

  const usuario = await exigirUsuario()
  const acceso = await accesoAEmpleado(id, usuario)
  if (!acceso || !puedeVer(acceso.nivel)) notFound()

  const datos = await datosDeFicha(id)
  const totales = totalPorPeriodo(datos.liquidaciones)

  return (
    <FichaEmpleado
      empleadoId={id}
      // Novedades dejó de existir como sección —horas extras e inasistencias son ítems
      // propios del menú— así que la ficha abre en Datos, que es el primero.
      seccionInicial={seccion ?? 'datos'}
      // §8.7 — el administrador ve la ficha de un empleado ajeno en modo lectura.
      soloLectura={!puedeEditar(acceso.nivel)}
      esDueno={esDueno(acceso.nivel)}
      comoAdministrador={acceso.nivel === 'ADMIN'}
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
        aportaBps: datos.empleado.aportaBps,
        celular: datos.empleado.celular,
        direccion: datos.empleado.direccion,
        cedula: datos.empleado.cedula,
        seguroSalud: datos.empleado.seguroSalud,
        seguroSaludDescripcion: descripcionSeguroSalud(datos.empleado.seguroSalud),
        activo: datos.empleado.activo,
        visible: datos.empleado.visible,
      }}
      salarios={datos.salarios}
      valoresHoraNegro={datos.valoresHoraNegro}
      regimenes={datos.regimenes}
      cuentaCorriente={datos.cuentaCorriente}
      saldo={datos.saldo}
      mesesSinLiquidar={datos.mesesSinLiquidar}
      cuotas={datos.cuotas}
      licencias={datos.licencias}
      licenciaMovimientos={datos.licenciaMovimientos}
      saldoDias={datos.saldoDias}
      liquidaciones={datos.liquidaciones}
      totalesPorPeriodo={Object.fromEntries(totales)}
      permisos={datos.permisos}
    />
  )
}
