/**
 * Los límites del vínculo laboral como criterio único: una novedad se registra entre el
 * ingreso y el egreso de la empleada, y ni un día antes ni uno después.
 *
 * Está acá y no en una acción porque **lo preguntan los dos lados**: el servidor lo traduce a
 * un `ErrorNegocio` y la pantalla lo usa para no ofrecer la fecha y explicar por qué. Con la
 * regla escrita dos veces se desvía, que es exactamente lo que ya pasó con las de boletos
 * (IMPLEMENTATION_HINTS §1.14).
 */

/**
 * El vínculo, en fechas ISO (`AAAA-MM-DD`).
 *
 * **En ISO y no en `Date`** a propósito: es lo que cruza al cliente, lo que tienen los
 * formularios, y compara como texto sin malabares de zona horaria. El servidor convierte con
 * `aISO()` en el borde.
 */
export type Vinculo = {
  fechaIngreso: string
  /** `null` mientras la empleada siga trabajando. */
  fechaEgreso: string | null
}

/** Dónde cae una fecha respecto del vínculo. */
export type PosicionEnElVinculo = 'OK' | 'ANTES_DEL_INGRESO' | 'POSTERIOR_AL_EGRESO'

/**
 * Si la fecha cae dentro del vínculo, y si no, de qué lado se fue.
 *
 * **Devuelve el motivo y no un booleano** porque los dos lados que preguntan necesitan
 * explicarlo: el servidor arma con él el mensaje del `ErrorNegocio` y su marca de campo, y el
 * formulario decide qué extremo del selector de fecha recortar.
 */
export function fechaEnElVinculo(fechaISO: string, vinculo: Vinculo): PosicionEnElVinculo {
  if (fechaISO < vinculo.fechaIngreso) return 'ANTES_DEL_INGRESO'
  if (vinculo.fechaEgreso && fechaISO > vinculo.fechaEgreso) return 'POSTERIOR_AL_EGRESO'
  return 'OK'
}

/**
 * El último día que un selector de fecha puede ofrecer: su propio tope, recortado por el
 * egreso. En ISO el mínimo de dos fechas sale comparando como texto.
 */
export function topeConElEgreso(tope: string, vinculo: Vinculo): string {
  return vinculo.fechaEgreso && vinculo.fechaEgreso < tope ? vinculo.fechaEgreso : tope
}

type FueraDelVinculo = Exclude<PosicionEnElVinculo, 'OK'>

/** La frase completa, para el `ErrorNegocio` y para el aviso del formulario. */
export const MENSAJE_FUERA_DEL_VINCULO: Record<FueraDelVinculo, string> = {
  ANTES_DEL_INGRESO: 'La fecha no puede ser anterior al ingreso de la empleada.',
  POSTERIOR_AL_EGRESO: 'La fecha no puede ser posterior al egreso de la empleada.',
}

/** La etiqueta corta, para marcar el campo del formulario. */
export const ETIQUETA_FUERA_DEL_VINCULO: Record<FueraDelVinculo, string> = {
  ANTES_DEL_INGRESO: 'Anterior al ingreso',
  POSTERIOR_AL_EGRESO: 'Posterior al egreso',
}
