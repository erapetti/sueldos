'use server'

/**
 * §4.3, §4.3.1, §4.4, §4.4.1 y §5 — series con fecha de vigencia del empleado.
 *
 * §5.4 — registrar un cambio nunca actualiza un registro existente: siempre inserta uno
 * nuevo. La única excepción es que ya exista uno con la misma `fechaVigencia`, y en ese caso
 * la UI pregunta antes de sobrescribirlo (`reemplazar`).
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { exigirEdicion } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import {
  nuevoAporteBps,
  nuevoCobraBoletos,
  nuevoRegimen,
  nuevoSalario,
  nuevoValorHoraNegro,
} from '@/lib/validacion/esquemas'
import { aColumnaCantidad, aDecimal, aRegimenHoras } from '@/lib/db/mapeo'
import { horasSemanalesDelRegimen } from '@/lib/calculo/boletos'
import { formatearPeriodo, hoy, parseFechaISO, primerDiaDelMes } from '@/lib/format/dates'

const YA_EXISTE =
  'Ya hay un valor vigente desde ese mes. Confirmá el reemplazo para sobrescribirlo.'

/**
 * **Aportar al BPS exige un régimen con horas.** Una empleada puede no tener jornada —todo lo
 * suyo son horas extras sin aportes y pagos adicionales— y ahí el régimen es un registro con
 * los siete días en cero. Lo que no puede es aportar al BPS sin jornada: no habría materia
 * gravada sobre la cual aportar, y el valor hora calculado con 0 horas no existe.
 *
 * Es una sola invariante en las dos direcciones, y se verifica en el servidor porque es
 * control de acceso a un dato inconsistente, no ayuda de la UI (§2.3).
 *
 * **Es por período, no «hoy».** Régimen y aporte son las dos series con `fecha_vigencia`
 * (§1.7.3): apagar el aporte desde el mes que viene no habilita un régimen vacío este mes.
 * Entre dos cambios ninguna de las dos se mueve, así que alcanza con mirar el mes del cambio
 * y los meses en los que alguna de las dos vuelve a cambiar de ahí en adelante.
 */
async function exigirAporteConRegimen(
  empleadoId: string,
  cambio:
    | { serie: 'REGIMEN'; fechaVigencia: Date; horasSemanales: Decimal }
    | { serie: 'APORTE_BPS'; fechaVigencia: Date; aportaBps: boolean },
): Promise<void> {
  const [regimenes, aportes] = await Promise.all([
    prisma.empleadoRegimen.findMany({ where: { empleadoId }, orderBy: { fechaVigencia: 'asc' } }),
    prisma.empleadoAporteBps.findMany({ where: { empleadoId }, orderBy: { fechaVigencia: 'asc' } }),
  ])

  // Sin ninguno de los dos no hay nada que contradecir: ese mes no se liquida igual (§6.8),
  // así que bloquear la carga no arreglaría nada. Es el mismo criterio del §1.7.4.
  if (regimenes.length === 0 || aportes.length === 0) return

  // Las dos series con el cambio propuesto ya aplicado; con la misma vigencia lo reemplaza.
  const horas = new Map<number, Decimal>(
    regimenes.map((r) => [r.fechaVigencia.getTime(), horasSemanalesDelRegimen(aRegimenHoras(r))]),
  )
  const aporta = new Map<number, boolean>(
    aportes.map((a) => [a.fechaVigencia.getTime(), a.aportaBps]),
  )

  if (cambio.serie === 'REGIMEN') horas.set(cambio.fechaVigencia.getTime(), cambio.horasSemanales)
  else aporta.set(cambio.fechaVigencia.getTime(), cambio.aportaBps)

  /**
   * §5.2 — el registro vigente para ese mes. Para un mes anterior a toda la serie devuelve el
   * más antiguo, que es con el que la empleada empezó: el mismo criterio de `aporteBpsALaFecha`.
   */
  function vigente<T>(serie: Map<number, T>, mes: number): T {
    const vigencias = [...serie.keys()].sort((a, b) => a - b)
    const anteriores = vigencias.filter((v) => v <= mes)
    return serie.get(anteriores.at(-1) ?? vigencias[0])!
  }

  const desde = cambio.fechaVigencia.getTime()
  const meses = [...new Set([desde, ...horas.keys(), ...aporta.keys()])]
    .filter((m) => m >= desde)
    .sort((a, b) => a - b)

  for (const mes of meses) {
    if (!vigente(aporta, mes)) continue
    if (vigente(horas, mes).greaterThan(0)) continue

    const cuando = formatearPeriodo(new Date(mes))
    throw new ErrorNegocio(
      cambio.serie === 'REGIMEN'
        ? `En ${cuando} la empleada aporta al BPS, así que no puede quedarse sin horas de régimen. Registrá primero que deja de aportar desde ese mes.`
        : `En ${cuando} el régimen horario no tiene horas, así que no puede aportar al BPS. Registrá primero un régimen con horas desde ese mes.`,
      { _: 'Aportar al BPS exige un régimen con horas' },
    )
  }
}

/**
 * §5.3 — al registrar un cambio con vigencia igual o anterior a un período ya liquidado, se
 * avisa. El cambio no modifica la liquidación confirmada, que guarda su snapshot (§4.14).
 */
async function avisoPorLiquidacionesAfectadas(
  empleadoId: string,
  fechaVigencia: Date,
): Promise<string | undefined> {
  const afectadas = await prisma.liquidacion.findMany({
    where: {
      empleadoId,
      periodo: { gte: fechaVigencia },
      estado: 'CONFIRMADA',
    },
    select: { periodo: true },
    orderBy: { periodo: 'asc' },
    distinct: ['periodo'],
  })

  if (afectadas.length === 0) return undefined

  const meses = afectadas.map((l) => formatearPeriodo(l.periodo)).join(', ')
  return afectadas.length === 1
    ? `Ya existe una liquidación confirmada de ${meses}. El cambio no la modifica; para aplicarlo hay que recalcular el período.`
    : `Ya existen liquidaciones confirmadas de: ${meses}. El cambio no las modifica; para aplicarlo hay que recalcular cada período.`
}

export async function registrarSalario(entrada: unknown) {
  return ejecutar('series.salario', async (log) => {
    const datos = validar(nuevoSalario, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado_salario', entidadId: empleado.id })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const existente = await prisma.empleadoSalario.findUnique({
      where: { empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia } },
    })
    if (existente && !datos.reemplazar) throw new ErrorNegocio(YA_EXISTE)

    const comun = {
      salario: datos.salario,
      horasSemanales: aColumnaCantidad(new Decimal(datos.horasSemanales)),
      origen: 'MANUAL' as const,
      modificadoPor: usuario.id,
    }

    if (existente) {
      await prisma.empleadoSalario.update({ where: { id: existente.id }, data: comun })
    } else {
      await prisma.empleadoSalario.create({
        data: { empleadoId: empleado.id, fechaVigencia, creadoPor: usuario.id, ...comun },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoPorLiquidacionesAfectadas(empleado.id, fechaVigencia))
  })
}

export async function registrarValorHoraNegro(entrada: unknown) {
  return ejecutar('series.valorHoraNegro', async (log) => {
    const datos = validar(nuevoValorHoraNegro, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado_valor_hora_negro', entidadId: empleado.id })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const existente = await prisma.empleadoValorHoraNegro.findUnique({
      where: { empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia } },
    })
    if (existente && !datos.reemplazar) throw new ErrorNegocio(YA_EXISTE)

    if (existente) {
      await prisma.empleadoValorHoraNegro.update({
        where: { id: existente.id },
        data: { valor: datos.valor, origen: 'MANUAL', modificadoPor: usuario.id },
      })
    } else {
      await prisma.empleadoValorHoraNegro.create({
        data: {
          empleadoId: empleado.id,
          valor: datos.valor,
          fechaVigencia,
          origen: 'MANUAL',
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoPorLiquidacionesAfectadas(empleado.id, fechaVigencia))
  })
}

/**
 * §4.4.1 — el aporte a BPS y el seguro de salud, que viajan juntos en el mismo registro: el
 * seguro solo tiene efecto si se aporta (§4.2), así que guardarlos por separado permitiría un
 * seguro vigente sin aporte.
 */
export async function registrarAporteBps(entrada: unknown) {
  return ejecutar('series.aporteBps', async (log) => {
    const datos = validar(nuevoAporteBps, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado_aporte_bps', entidadId: empleado.id })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const existente = await prisma.empleadoAporteBps.findUnique({
      where: { empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia } },
    })
    if (existente && !datos.reemplazar) throw new ErrorNegocio(YA_EXISTE)

    await exigirAporteConRegimen(empleado.id, {
      serie: 'APORTE_BPS',
      fechaVigencia,
      aportaBps: datos.aportaBps,
    })

    const comun = {
      aportaBps: datos.aportaBps,
      seguroSalud: datos.aportaBps ? (datos.seguroSalud ?? null) : null,
      modificadoPor: usuario.id,
    }

    if (existente) {
      await prisma.empleadoAporteBps.update({ where: { id: existente.id }, data: comun })
    } else {
      await prisma.empleadoAporteBps.create({
        data: { empleadoId: empleado.id, fechaVigencia, creadoPor: usuario.id, ...comun },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoPorLiquidacionesAfectadas(empleado.id, fechaVigencia))
  })
}

/**
 * §6.4 — «cobra boletos» es una serie con vigencia, como el aporte a BPS y por el mismo
 * motivo: leerlo de un campo suelto hacía que recalcular un período viejo le quitara —o le
 * agregara— los boletos de todos los meses, con el valor de hoy y no con el que regía entonces.
 */
export async function registrarCobraBoletos(entrada: unknown) {
  return ejecutar('series.cobraBoletos', async (log) => {
    const datos = validar(nuevoCobraBoletos, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado_cobra_boletos', entidadId: empleado.id })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const existente = await prisma.empleadoCobraBoletos.findUnique({
      where: { empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia } },
    })
    if (existente && !datos.reemplazar) throw new ErrorNegocio(YA_EXISTE)

    const comun = { cobraBoletos: datos.cobraBoletos, modificadoPor: usuario.id }

    if (existente) {
      await prisma.empleadoCobraBoletos.update({ where: { id: existente.id }, data: comun })
    } else {
      await prisma.empleadoCobraBoletos.create({
        data: { empleadoId: empleado.id, fechaVigencia, creadoPor: usuario.id, ...comun },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoPorLiquidacionesAfectadas(empleado.id, fechaVigencia))
  })
}

/**
 * §4.4 — la suma de los 7 días debe ser igual a `horasSemanales` del salario vigente a esa
 * misma fecha. Si no coincide, se bloquea el guardado.
 */
export async function registrarRegimen(entrada: unknown) {
  return ejecutar('series.regimen', async (log) => {
    const datos = validar(nuevoRegimen, entrada)
    const { usuario, empleado } = await exigirEdicion(datos.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'empleado_regimen', entidadId: empleado.id })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)

    const salarioVigente = await prisma.empleadoSalario.findFirst({
      where: { empleadoId: empleado.id, fechaVigencia: { lte: fechaVigencia } },
      orderBy: { fechaVigencia: 'desc' },
    })
    if (!salarioVigente) {
      throw new ErrorNegocio(
        'No hay un salario vigente a esa fecha contra el cual validar las horas semanales.',
      )
    }

    const suma = new Decimal(datos.lunes)
      .plus(datos.martes)
      .plus(datos.miercoles)
      .plus(datos.jueves)
      .plus(datos.viernes)
      .plus(datos.sabado)
      .plus(datos.domingo)

    const horasSemanales = aDecimal(salarioVigente.horasSemanales)
    if (!suma.equals(horasSemanales)) {
      const diferencia = suma.minus(horasSemanales)
      throw new ErrorNegocio(
        `El régimen suma ${suma.toString()} h y las horas semanales vigentes son ${horasSemanales.toString()} h (diferencia de ${diferencia.toString()} h).`,
        { _: 'La suma de los días tiene que coincidir con las horas semanales' },
      )
    }

    await exigirAporteConRegimen(empleado.id, {
      serie: 'REGIMEN',
      fechaVigencia,
      horasSemanales: suma,
    })

    const existente = await prisma.empleadoRegimen.findUnique({
      where: { empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia } },
    })
    if (existente && !datos.reemplazar) throw new ErrorNegocio(YA_EXISTE)

    const horas = {
      horasLunes: aColumnaCantidad(new Decimal(datos.lunes)),
      horasMartes: aColumnaCantidad(new Decimal(datos.martes)),
      horasMiercoles: aColumnaCantidad(new Decimal(datos.miercoles)),
      horasJueves: aColumnaCantidad(new Decimal(datos.jueves)),
      horasViernes: aColumnaCantidad(new Decimal(datos.viernes)),
      horasSabado: aColumnaCantidad(new Decimal(datos.sabado)),
      horasDomingo: aColumnaCantidad(new Decimal(datos.domingo)),
    }

    if (existente) {
      await prisma.empleadoRegimen.update({
        where: { id: existente.id },
        data: { ...horas, modificadoPor: usuario.id },
      })
    } else {
      await prisma.empleadoRegimen.create({
        data: {
          empleadoId: empleado.id,
          fechaVigencia,
          ...horas,
          creadoPor: usuario.id,
          modificadoPor: usuario.id,
        },
      })
    }

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, await avisoPorLiquidacionesAfectadas(empleado.id, fechaVigencia))
  })
}

type SerieDelEmpleado = 'SALARIO' | 'VALOR_HORA_NEGRO' | 'APORTE_BPS' | 'COBRA_BOLETOS' | 'REGIMEN'

/**
 * §5.4 — un registro de serie se puede borrar únicamente si su `fechaVigencia` es futura y
 * no participó de ninguna liquidación confirmada.
 */
export async function borrarRegistroDeSerie(serie: SerieDelEmpleado, id: string) {
  return ejecutar('series.borrar', async (log) => {
    const registro =
      serie === 'SALARIO'
        ? await prisma.empleadoSalario.findUnique({ where: { id } })
        : serie === 'VALOR_HORA_NEGRO'
          ? await prisma.empleadoValorHoraNegro.findUnique({ where: { id } })
          : serie === 'APORTE_BPS'
            ? await prisma.empleadoAporteBps.findUnique({ where: { id } })
            : serie === 'COBRA_BOLETOS'
              ? await prisma.empleadoCobraBoletos.findUnique({ where: { id } })
              : await prisma.empleadoRegimen.findUnique({ where: { id } })

    if (!registro) throw new ErrorNegocio('No se encontró el registro.')

    const { usuario, empleado } = await exigirEdicion(registro.empleadoId)
    log({ usuarioId: usuario.id, entidad: 'serie', entidadId: id })

    if (registro.fechaVigencia.getTime() <= primerDiaDelMes(hoy()).getTime()) {
      throw new ErrorNegocio('Solo se pueden borrar registros con vigencia futura.')
    }

    const liquidada = await prisma.liquidacion.findFirst({
      where: {
        empleadoId: empleado.id,
        periodo: { gte: registro.fechaVigencia },
        estado: 'CONFIRMADA',
      },
      select: { id: true },
    })
    if (liquidada) {
      throw new ErrorNegocio('El registro ya participó de una liquidación confirmada.')
    }

    if (serie === 'SALARIO') await prisma.empleadoSalario.delete({ where: { id } })
    else if (serie === 'VALOR_HORA_NEGRO') await prisma.empleadoValorHoraNegro.delete({ where: { id } })
    else if (serie === 'APORTE_BPS') await prisma.empleadoAporteBps.delete({ where: { id } })
    else if (serie === 'COBRA_BOLETOS') await prisma.empleadoCobraBoletos.delete({ where: { id } })
    else await prisma.empleadoRegimen.delete({ where: { id } })

    revalidatePath(`/empleados/${empleado.id}`)
    return exito(undefined, 'Se borró el registro.')
  })
}
