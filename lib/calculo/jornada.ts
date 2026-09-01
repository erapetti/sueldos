/**
 * Los hechos de un día que deciden si hubo jornada, y lo que se sigue de eso.
 *
 * Vivían en `lib/calculo/boletos.ts`, que fue donde nacieron. Dejaron de ser solo de boletos
 * el día en que el tope de las faltas pasó a preguntar lo mismo (§4.6): la pregunta «¿ese día
 * la empleada tenía jornada?» la hacen el motor, el pie de las dos planillas y ahora también
 * la validación del registro de inasistencias, así que se escribe **una sola vez** acá
 * (IMPLEMENTATION_HINTS §1.14).
 */

/**
 * Los hechos de un día que deciden su jornada, y con ella su boleto. Es lo único que hace
 * falta para responder las tres preguntas del §6.4 y del §6.5, y por eso lo comparten el motor
 * y el pie de las planillas: **la regla se escribe una sola vez**. Tenerla en dos lados es lo
 * que hizo que el mismo error se repitiera tres veces (ver IMPLEMENTATION_HINTS §1.14).
 *
 * Las horas van en `number` y no en `Decimal` a propósito: el cliente recibe el día ya
 * serializado. Es seguro porque el CHECK `ck_regimenes_horas` las obliga a ser múltiplos de
 * 0,5, que son exactos en binario; el motor convierte con `.toNumber()` en el borde, como ya
 * hacía `lib/consultas/planilla.ts`.
 */
export type DiaDeBoletos = {
  horasRegimen: number
  feriadoNoLaborable: boolean
  /** §4.15.2 — el día cae dentro de algún período de licencia gozada. */
  enLicencia: boolean
  /** §6.4 — no se cuentan días anteriores al ingreso ni posteriores al egreso. */
  dentroDelVinculo: boolean
}

/** Por qué ese día no tenía jornada. Es lo que se le dice al que quiso cargar algo ahí. */
export type SinJornada =
  | 'FUERA_DEL_VINCULO'
  | 'SIN_REGIMEN'
  | 'FERIADO_NO_LABORABLE'
  | 'EN_LICENCIA'

/**
 * §6.4 y §6.5 — por qué el día **no** era de trabajo, o `null` si lo era.
 *
 * Devuelve el motivo y no un booleano porque los dos lados que preguntan necesitan explicarlo:
 * el servidor lo traduce a un `ErrorNegocio` con su mensaje y la planilla lo usa para
 * deshabilitar el día y decir por qué. Cuando se cumple más de uno gana el primero de la
 * lista, que es el que mejor describe el día: alguien que ya no trabaja acá no está «de
 * licencia».
 */
export function motivoSinJornada(dia: DiaDeBoletos): SinJornada | null {
  if (!dia.dentroDelVinculo) return 'FUERA_DEL_VINCULO'
  if (!(dia.horasRegimen > 0)) return 'SIN_REGIMEN'
  if (dia.feriadoNoLaborable) return 'FERIADO_NO_LABORABLE'
  if (dia.enLicencia) return 'EN_LICENCIA'
  return null
}

/**
 * La frase que explica el motivo, la misma en el servidor y en la pantalla. Se lee después de
 * la fecha: «El 25/08/2026 es feriado no laborable…».
 */
export const TEXTO_SIN_JORNADA: Record<SinJornada, string> = {
  FUERA_DEL_VINCULO: 'está fuera del vínculo de la empleada',
  SIN_REGIMEN: 'no tiene horas en el régimen vigente',
  FERIADO_NO_LABORABLE: 'es feriado no laborable, así que no tiene horas de régimen',
  EN_LICENCIA: 'es un día de licencia',
}

/**
 * §6.4 — el día era de trabajo según el régimen y el calendario, **antes de mirar las
 * novedades**: la empleada tenía jornada y ni el feriado ni la licencia se la sacaron. El §6.5
 * lo dice del otro lado —el feriado no laborable «invalida las horas del régimen vigente, por
 * lo tanto son días con 0 horas»—, que es la misma frase.
 */
export function eraDiaDeTrabajo(dia: DiaDeBoletos): boolean {
  return motivoSinJornada(dia) === null
}

/**
 * §4.6 — el tope de horas de falta del día: no se puede faltar a lo que no había que trabajar.
 *
 * El §4.6 dice «las horas que le corresponden a ese día según el régimen vigente», y el tope
 * era exactamente eso: las horas crudas del régimen. Con el feriado no laborable la lectura no
 * cambia, la completa —el §6.5 ya define que esos días «invalidan las horas del régimen
 * vigente, por lo tanto son días con 0 horas»—. Que el **día de licencia** también baje el
 * tope a cero sí es una divergencia con el §4.6, y es decisión del dueño del proyecto: son
 * días que ya están pagos por otro lado (§6.4), así que la falta los descontaría dos veces.
 */
export function topeDeFaltaDelDia(dia: DiaDeBoletos): number {
  return eraDiaDeTrabajo(dia) ? dia.horasRegimen : 0
}
