/**
 * Rótulos de dominio que se muestran igual en varias pantallas.
 *
 * Estaban declarados de nuevo en cada una —tres copias del de los libros, dos del de los tipos
 * de liquidación— y una copia vieja hace que la misma cosa se llame distinto según por dónde se
 * llegue. No van los de `PantallaLiquidacion`, que dice «con BPS» y «sin aportes» en minúscula
 * porque los usa en medio de una oración y no como rótulo.
 */

/** §4.9 — cómo se rotula cada libro de la cuenta corriente. */
export const ETIQUETA_LIBRO: Record<'FORMAL' | 'INFORMAL', string> = {
  FORMAL: 'Formal (con BPS)',
  INFORMAL: 'Sin aportes',
}

/** §4.14 — cómo se rotula cada tipo de liquidación. */
export const ETIQUETA_TIPO_LIQUIDACION: Record<string, string> = {
  MENSUAL: 'Mensual',
  AGUINALDO: 'Aguinaldo',
  SALARIO_VACACIONAL: 'Salario vacacional',
}

/**
 * §4.14 — cómo se nombra una liquidación cuando se la menciona desde otra pantalla: el pago
 * bancario que la cancela, el aviso de un período ya liquidado. La secuencia solo se dice si
 * hay más de una, que es el caso de las complementarias (§7.6.1).
 */
export function nombreDeLiquidacion(liquidacion: {
  tipo: string
  /** El período ya formateado, como «marzo 2026». */
  periodo: string
  secuencia: number
}): string {
  const tipo = ETIQUETA_TIPO_LIQUIDACION[liquidacion.tipo] ?? liquidacion.tipo
  const secuencia = liquidacion.secuencia > 1 ? ` (#${liquidacion.secuencia})` : ''
  return `${tipo} ${liquidacion.periodo}${secuencia}`
}
