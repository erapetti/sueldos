/**
 * Tipos del motor de cálculo (§9): código puro, sin acceso a la base ni a la sesión.
 * Todas las fechas son fechas de negocio (medianoche UTC, ver lib/format/dates).
 */
import type Decimal from 'decimal.js'
import type { CausalFaltaValor } from '@/constants/causales'

/** Horas que trabaja el empleado cada día de la semana (§4.4). */
export type RegimenHoras = {
  lunes: Decimal
  martes: Decimal
  miercoles: Decimal
  jueves: Decimal
  viernes: Decimal
  sabado: Decimal
  domingo: Decimal
}

export type SalarioVigente = {
  salario: Decimal
  horasSemanales: Decimal
}

export type FaltaCalculo = {
  fecha: Date
  horas: Decimal
  causal: CausalFaltaValor
  /** §4.6.1 — solo las que descuentan restan horas en el paso 2. */
  descuenta: boolean
}

export type HoraExtraCalculo = {
  fecha: Date
  horas: Decimal
  /** true = entra en el paso 3 al valor hora calculado; false = paso 10 al valor hora "en negro". */
  conBps: boolean
  recargoPct: number
}

export type PagoAdicionalCalculo = {
  fecha: Date
  monto: Decimal
  concepto: string | null
}

export type CuotaPlanCalculo = {
  id?: string
  fecha: Date
  monto: Decimal
  /** El recálculo de un período considera también las cuotas ya aplicadas (§7.6.1). */
  yaAplicada: boolean
  /** Fecha del préstamo que originó el plan, para nombrar la línea de la liquidación. */
  fechaPrestamo: Date
  /**
   * §4.9 — el libro del préstamo que originó la cuota. La cuota descuenta **ahí**, y no en el
   * libro que le tocaría hoy a la empleada: si pidió el préstamo antes de empezar a aportar,
   * lo sigue devolviendo contra el libro informal. Es lo que hace que el préstamo amortice
   * dentro de su propio libro.
   */
  libro: Libro
  /** Qué número de cuota es dentro de su plan, empezando en 1. */
  ordinal: number
  /** Cuántas cuotas tiene el plan completo. */
  deTotal: number
}

/** Concepto de BPS ya resuelto para el período y el empleado (§4.11). */
export type ConceptoBpsResuelto = {
  concepto: string
  porcentaje: Decimal
  seguroSalud: string | null
}

export type FeriadoCalculo = {
  fecha: Date
  noLaborable: boolean
}

export type EmpleadoCalculo = {
  fechaIngreso: Date
  fechaEgreso: Date | null
  cobraBoletos: boolean
}

/**
 * §4.4.1 — el aporte a BPS vigente para el período, ya resuelto de la serie (§5.2).
 *
 * Es una serie y no un campo del empleado, así que puede faltar: el motor lo trata como al
 * salario o al régimen y falla con un error explícito (§6.8) en vez de asumir que no aporta.
 */
export type AporteBpsVigente = {
  aportaBps: boolean
  seguroSalud: string | null
}

/**
 * Entrada del cálculo mensual, ya resuelta: las series vienen filtradas al valor vigente
 * del período (§5.2) y los conceptos de BPS ya resueltos (§4.11).
 * Los campos que pueden faltar son `null` y el motor decide si eso es un error (§6.8).
 */
export type EntradaLiquidacion = {
  /** Primer día del mes liquidado. */
  periodo: Date
  empleado: EmpleadoCalculo
  aporteBps: AporteBpsVigente | null
  salario: SalarioVigente | null
  regimen: RegimenHoras | null
  valorHoraNegro: Decimal | null
  valorBoleto: Decimal | null
  conceptosBps: ConceptoBpsResuelto[]
  faltas: FaltaCalculo[]
  horasExtras: HoraExtraCalculo[]
  pagosAdicionales: PagoAdicionalCalculo[]
  cuotasPlan: CuotaPlanCalculo[]
  feriados: FeriadoCalculo[]
  /** Días comprendidos en algún período de licencia gozada (§4.15.2). */
  diasLicencia: Date[]
  /**
   * §7.6.1 — lo ya liquidado del período **por libro**: suma de `total_a_pagar_formal` y de
   * `total_a_pagar_informal` de las liquidaciones vigentes anteriores del mismo
   * (empleado, período, tipo). 0 en la secuencia 1.
   *
   * Va por libro porque la complementaria puede ser parcial: si el libro formal ya se pagó y
   * el informal no, un cambio que solo toca el informal tiene que dar diferencia cero en el
   * formal y no volver a mover un asiento ya pagado.
   */
  totalYaLiquidadoFormal: Decimal
  totalYaLiquidadoInformal: Decimal
}

/** Signo de una línea: suma, resta, o subtotal/informativa. */
export type SignoLinea = 1 | -1 | 0

/**
 * §4.9 y §6.2 — el corte entre lo que pasa por el BPS y lo que no.
 *
 * `FORMAL` es lo que lleva aportes y cierra en su propio total a pagar; `INFORMAL` es lo que
 * se paga sin ellos —las horas extras sin BPS y los boletos que generan— y cierra en otro.
 * Una empleada que no aporta al BPS solo se relaciona con el informal.
 *
 * El mismo corte nombra la tabla de la liquidación y el libro de la cuenta corriente, porque
 * son la misma cosa: cada tabla cierra en su libro.
 */
export type Libro = 'FORMAL' | 'INFORMAL'

export type LineaLiquidacion = {
  orden: number
  tabla: Libro
  codigo: string
  descripcion: string
  cantidad: Decimal | null
  valorUnitario: Decimal | null
  /** Siempre redondeado a 2 decimales (§6.7). Positivo; el signo va aparte. */
  importe: Decimal
  signo: SignoLinea
  /** Los pasos 6 y 11 se muestran destacados (§6.2). */
  destacada?: boolean
}

export type DetalleBoletos = {
  diasATrabajar: number
  /** §6.5 — días fuera del régimen con alguna hora extra con BPS: su boleto va a la formal. */
  diasExtraConBps: number
  /** §6.5 — días fuera del régimen sin ninguna hora extra con BPS: su boleto va a la informal. */
  diasExtraSinBps: number
  boletos: number
}

export type ResultadoLiquidacion = {
  periodo: Date
  lineas: LineaLiquidacion[]
  valorHoraCalculado: Decimal
  factorProrrateo: Decimal
  diasConVinculo: number
  diasDelMes: number
  materiaGravada: Decimal
  totalDescuentosBps: Decimal
  subtotal: Decimal
  boletos: DetalleBoletos | null
  /** §6.2 — total de la tabla formal, que es lo que muestra su línea TOTAL. */
  totalRecalculadoFormal: Decimal
  /** §6.2 — ídem para la tabla informal. */
  totalRecalculadoInformal: Decimal
  /** Total del período según el cálculo completo (§4.14): la suma de los dos de arriba. */
  totalRecalculado: Decimal
  totalYaLiquidadoFormal: Decimal
  totalYaLiquidadoInformal: Decimal
  totalYaLiquidado: Decimal
  /**
   * Lo que se paga en cada libro: recalculado − ya liquidado **de ese libro**. Cualquiera de
   * los dos puede ser negativo en una complementaria, y cada uno es el importe de su asiento.
   */
  totalAPagarFormal: Decimal
  totalAPagarInformal: Decimal
  /** La suma de los dos. Puede ser negativo en una complementaria. */
  totalAPagar: Decimal
  /** Avisos no bloqueantes (liquidación final incompleta, empleado sin vínculo, …). */
  avisos: string[]
}

/** Códigos de línea, estables: se persisten en `liquidacion_lineas`. */
export const CODIGOS = {
  SALARIO_BASE: 'SALARIO_BASE',
  FALTAS: 'FALTAS',
  HORAS_EXTRAS_CON_BPS: 'HE_CON_BPS',
  HORAS_EN_FERIADOS: 'HE_FERIADO',
  MATERIA_GRAVADA: 'MATERIA_GRAVADA',
  DESCUENTO_BPS: 'DESC_BPS',
  SUBTOTAL: 'SUBTOTAL',
  PAGO_ADICIONAL: 'PAGO_ADICIONAL',
  CUOTA_PLAN: 'CUOTA_PLAN',
  BOLETOS: 'BOLETOS',
  HORAS_EXTRAS_SIN_BPS: 'HE_SIN_BPS',
  TOTAL: 'TOTAL',
  SALARIO_VACACIONAL: 'SALARIO_VACACIONAL',
} as const
