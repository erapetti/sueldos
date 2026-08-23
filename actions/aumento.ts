'use server'

/**
 * §7.8 — aumento masivo de sueldos.
 *
 * **La fórmula del aumento está pendiente de definición (§13.4)**: falta resolver qué
 * parámetros entran (IPC, porcentaje por franja salarial, correctivo, tope). La pantalla
 * muestra "funcionalidad no implementada aún".
 *
 * El resto del caso de uso sí está especificado, así que la parte transaccional está
 * implementada y testeada: dado un porcentaje por empleado, inserta el nuevo salario y el
 * nuevo valor hora "en negro" con la **misma** `fechaVigencia`. Cuando §13.4 se defina,
 * lo único que hay que agregar es el cálculo que produce esos porcentajes.
 */
import { revalidatePath } from 'next/cache'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { auditar } from '@/lib/auditoria'
import { exigirAdmin } from '@/lib/auth/guards'
import { ErrorNegocio, ejecutar, exito, validar } from '@/lib/acciones/resultado'
import { fechaVigenciaISO, importePositivo, idUuid } from '@/lib/validacion/esquemas'
import { aColumnaImporte, aDecimal } from '@/lib/db/mapeo'
import { redondearPesos } from '@/lib/format/money'
import { parseFechaISO } from '@/lib/format/dates'
import { AUMENTO_NO_IMPLEMENTADO } from '@/lib/calculo/aumento'

const lineaAumento = z.object({
  empleadoId: idUuid,
  salarioNuevo: importePositivo,
  /** Un empleado destildado en la previsualización no recibe ninguno de los dos registros. */
  incluido: z.boolean(),
})

const aplicarAumento = z.object({
  fechaVigencia: fechaVigenciaISO,
  lineas: z.array(lineaAumento),
})

export type FilaPrevisualizacion = {
  empleadoId: string
  alias: string
  nombreCompleto: string
  salarioActual: string
  valorHoraNegroActual: string | null
  /** Sin la fórmula de §13.4 no hay salario nuevo que proponer. */
  salarioNuevo: null
  porcentaje: null
  valorHoraNegroNuevo: null
}

/**
 * §7.8 — previsualización. Devuelve los empleados alcanzados con sus valores actuales; las
 * columnas del salario nuevo y del porcentaje quedan vacías hasta que se defina §13.4.
 *
 * Alcanza a **todos los empleados activos del sistema**, independientemente de quién sea el
 * dueño (§3.4).
 */
export async function previsualizarAumento(fechaVigenciaISOTexto: string) {
  return ejecutar('aumento.previsualizar', async (log) => {
    const usuario = await exigirAdmin()
    log({ usuarioId: usuario.id, entidad: 'aumento' })

    const fechaVigencia = parseFechaISO(validar(fechaVigenciaISO, fechaVigenciaISOTexto))

    const empleados = await prisma.empleado.findMany({
      where: { activo: true },
      select: {
        id: true,
        alias: true,
        nombreCompleto: true,
        salarios: {
          where: { fechaVigencia: { lte: fechaVigencia } },
          orderBy: { fechaVigencia: 'desc' },
          take: 1,
        },
        valoresHoraNegro: {
          where: { fechaVigencia: { lte: fechaVigencia } },
          orderBy: { fechaVigencia: 'desc' },
          take: 1,
        },
      },
      orderBy: { alias: 'asc' },
    })

    const filas: FilaPrevisualizacion[] = empleados
      .filter((e) => e.salarios.length > 0)
      .map((e) => ({
        empleadoId: e.id,
        alias: e.alias,
        nombreCompleto: e.nombreCompleto,
        salarioActual: aDecimal(e.salarios[0].salario).toFixed(2),
        valorHoraNegroActual: e.valoresHoraNegro[0]
          ? aDecimal(e.valoresHoraNegro[0].valor).toFixed(2)
          : null,
        salarioNuevo: null,
        porcentaje: null,
        valorHoraNegroNuevo: null,
      }))

    return exito({ filas, motivoPendiente: AUMENTO_NO_IMPLEMENTADO })
  })
}

/**
 * §7.8 — aplica el aumento en una única transacción. Para cada empleado incluido:
 *
 *  - inserta un registro en `empleado_salarios` con el salario nuevo, `origen =
 *    'AUMENTO_MASIVO'` y las **mismas** `horas_semanales`;
 *  - inserta un registro en `empleado_valor_hora_negro` con `origen = 'AUMENTO_MASIVO'` y la
 *    **misma** `fecha_vigencia`, aplicándole el mismo porcentaje de aumento:
 *
 *      pct_aumento            = salario_nuevo / salario_actual − 1
 *      valor_hora_negro_nuevo = redondear_a_pesos( valor_hora_negro_vigente × (1 + pct_aumento) )
 *
 * El porcentaje es por empleado.
 */
export async function aplicarAumentoMasivo(entrada: unknown) {
  return ejecutar('aumento.aplicar', async (log) => {
    const usuario = await exigirAdmin()
    const datos = validar(aplicarAumento, entrada)
    log({ usuarioId: usuario.id, entidad: 'aumento' })

    const fechaVigencia = parseFechaISO(datos.fechaVigencia)
    const incluidas = datos.lineas.filter((l) => l.incluido)
    if (incluidas.length === 0) throw new ErrorNegocio('No hay empleados incluidos en el aumento.')

    const empleados = await prisma.empleado.findMany({
      where: { id: { in: incluidas.map((l) => l.empleadoId) }, activo: true },
      select: {
        id: true,
        alias: true,
        salarios: {
          where: { fechaVigencia: { lte: fechaVigencia } },
          orderBy: { fechaVigencia: 'desc' },
          take: 1,
        },
        valoresHoraNegro: {
          where: { fechaVigencia: { lte: fechaVigencia } },
          orderBy: { fechaVigencia: 'desc' },
          take: 1,
        },
      },
    })

    const porId = new Map(empleados.map((e) => [e.id, e]))
    const aplicados: { alias: string; salarioNuevo: string; valorHoraNegroNuevo: string | null }[] = []

    await prisma.$transaction(async (tx) => {
      for (const linea of incluidas) {
        const empleado = porId.get(linea.empleadoId)
        // Solo alcanza a empleados activos (§7.8); el resto se saltea sin fallar el lote.
        if (!empleado || empleado.salarios.length === 0) continue

        const salarioActual = aDecimal(empleado.salarios[0].salario)
        const salarioNuevo = new Decimal(linea.salarioNuevo)
        const horasSemanales = empleado.salarios[0].horasSemanales

        await tx.empleadoSalario.upsert({
          where: {
            empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia },
          },
          create: {
            empleadoId: empleado.id,
            salario: aColumnaImporte(salarioNuevo),
            // El aumento no cambia la carga horaria.
            horasSemanales,
            fechaVigencia,
            origen: 'AUMENTO_MASIVO',
            creadoPor: usuario.id,
            modificadoPor: usuario.id,
          },
          update: {
            salario: aColumnaImporte(salarioNuevo),
            horasSemanales,
            origen: 'AUMENTO_MASIVO',
            modificadoPor: usuario.id,
          },
        })

        let valorHoraNegroNuevo: Decimal | null = null

        if (empleado.valoresHoraNegro.length > 0) {
          const pctAumento = salarioNuevo.dividedBy(salarioActual).minus(1)
          // Se registra redondeado a pesos enteros, igual que el valor hora calculado.
          valorHoraNegroNuevo = redondearPesos(
            aDecimal(empleado.valoresHoraNegro[0].valor).times(new Decimal(1).plus(pctAumento)),
          )

          await tx.empleadoValorHoraNegro.upsert({
            where: {
              empleadoId_fechaVigencia: { empleadoId: empleado.id, fechaVigencia },
            },
            create: {
              empleadoId: empleado.id,
              valor: aColumnaImporte(valorHoraNegroNuevo),
              // Misma fecha de vigencia que el salario: cambian juntos.
              fechaVigencia,
              origen: 'AUMENTO_MASIVO',
              creadoPor: usuario.id,
              modificadoPor: usuario.id,
            },
            update: {
              valor: aColumnaImporte(valorHoraNegroNuevo),
              origen: 'AUMENTO_MASIVO',
              modificadoPor: usuario.id,
            },
          })
        }

        aplicados.push({
          alias: empleado.alias,
          salarioNuevo: salarioNuevo.toFixed(2),
          valorHoraNegroNuevo: valorHoraNegroNuevo ? valorHoraNegroNuevo.toFixed(2) : null,
        })
      }

      await auditar(
        {
          usuarioId: usuario.id,
          entidad: 'aumento',
          accion: 'AUMENTO_MASIVO',
          datosDespues: { fechaVigencia: datos.fechaVigencia, aplicados },
        },
        tx,
      )
    })

    revalidatePath('/admin/aumento')
    revalidatePath('/empleados')

    return exito(
      { aplicados: aplicados.length },
      `Se aplicó el aumento a ${aplicados.length} empleado(s).`,
    )
  })
}
