/**
 * Qué mes abre una pantalla de la empleada —horas extras, inasistencias o liquidación— cuando
 * se entra a ella.
 *
 * Hay tres respuestas posibles, y se prueban en este orden:
 *
 *  1. **El de la URL.** Un `?periodo=` explícito manda siempre: es el que ponen las flechas
 *     del selector, los enlaces del menú y cualquier link guardado.
 *  2. **El que se venía mirando.** Se recuerda en una cookie (`COOKIE_PERIODO`), así al pasar
 *     de inasistencias a horas extras, o al saltar a otra empleada desde el listado, el mes no
 *     vuelve al de hoy. Dura lo que dure la ventana del navegador.
 *  3. **El que corresponde por el atraso.** Sin nada de lo anterior —la primera pantalla de la
 *     sesión— se abre el **mes anterior** si está sin liquidar y la empleada ya había
 *     ingresado; si no, el mes en curso.
 *
 * El punto 3 se aparta del §6.10, que dice que la pantalla abre en el mes en curso. Es
 * deliberado: lo habitual es entrar a cargar las novedades del mes que falta liquidar, y
 * empezar en un mes que ya está cerrado obliga a retroceder a mano cada vez. Queda anotado en
 * `IMPLEMENTATION_HINTS.md` como divergencia.
 */
import 'server-only'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import {
  acotarPeriodo,
  COOKIE_PERIODO,
  parsePeriodoSeguro,
  rangoDePeriodos,
  type RangoDePeriodos,
} from '@/lib/calculo/periodos'
import { hoy, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'

export type EmpleadaDelPeriodo = {
  id: string
  fechaIngreso: Date
  fechaEgreso: Date | null
}

export async function periodoDePantalla(
  empleada: EmpleadaDelPeriodo,
  periodoTexto: string | undefined,
): Promise<{ periodo: Date; rango: RangoDePeriodos }> {
  const rango = rangoDePeriodos(empleada)

  const pedido =
    parsePeriodoSeguro(periodoTexto) ??
    parsePeriodoSeguro((await cookies()).get(COOKIE_PERIODO)?.value) ??
    (await periodoPorDefecto(empleada))

  return { periodo: acotarPeriodo(pedido, rango), rango }
}

/**
 * El mes anterior cuando quedó sin liquidar, y el mes en curso en cualquier otro caso.
 *
 * «Sin liquidar» es el mismo criterio que el resto de la aplicación: no hay una liquidación
 * `MENSUAL` `CONFIRMADA` de ese mes. Las filas de `Liquidacion` se crean únicamente al
 * confirmar, así que un mes pendiente no tiene fila y no hay un estado intermedio que mirar.
 */
async function periodoPorDefecto(empleada: EmpleadaDelPeriodo): Promise<Date> {
  const mesActual = primerDiaDelMes(hoy())
  // Una empleada que ingresó este mes no tiene mes anterior que liquidar.
  if (primerDiaDelMes(empleada.fechaIngreso).getTime() >= mesActual.getTime()) return mesActual

  const mesAnterior = sumarMeses(mesActual, -1)
  const liquidada = await prisma.liquidacion.findFirst({
    where: {
      empleadoId: empleada.id,
      periodo: mesAnterior,
      tipo: 'MENSUAL',
      estado: 'CONFIRMADA',
    },
    select: { id: true },
  })

  return liquidada ? mesActual : mesAnterior
}
