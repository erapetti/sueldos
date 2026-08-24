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
   * §7.6.1 — suma de `total_a_pagar` de las liquidaciones vigentes anteriores del mismo
   * (empleado, período, tipo). 0 en la secuencia 1.
   */
  totalYaLiquidado: Decimal
}

/** Signo de una línea: suma, resta, o subtotal/informativa. */
export type SignoLinea = 1 | -1 | 0

export type LineaLiquidacion = {
  orden: number
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
  diasExtraConBoleto: number
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
  /** Total del período según el cálculo completo (§4.14). */
  totalRecalculado: Decimal
  totalYaLiquidado: Decimal
  /** totalRecalculado − totalYaLiquidado. Puede ser negativo en una complementaria. */
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
