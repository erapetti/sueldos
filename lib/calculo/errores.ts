/**
 * §6.8 — si falta un dato obligatorio, el cálculo no devuelve números parciales:
 * falla con un error explícito que dice exactamente qué falta y adónde cargarlo.
 */

export type DatoFaltante = {
  codigo:
    | 'SALARIO'
    | 'REGIMEN'
    | 'APORTE_BPS'
    | 'COBRA_BOLETOS'
    | 'VALOR_HORA_NEGRO'
    | 'VALOR_BOLETO'
  mensaje: string
  /** Ruta relativa a la ficha del empleado donde se carga el dato. */
  destino: string
}

export class ErrorDatosFaltantes extends Error {
  readonly faltantes: DatoFaltante[]

  constructor(faltantes: DatoFaltante[]) {
    super(`Faltan datos para calcular: ${faltantes.map((f) => f.mensaje).join('; ')}`)
    this.name = 'ErrorDatosFaltantes'
    this.faltantes = faltantes
  }
}

/** Error de regla de negocio del motor de cálculo (período futuro, rango inválido, …). */
export class ErrorCalculo extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorCalculo'
  }
}

/** §13 — funcionalidad todavía sin definir en el SPECS. */
export class ErrorNoImplementado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorNoImplementado'
  }
}
