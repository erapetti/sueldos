import Decimal from 'decimal.js'
import { fecha, parseFechaISO, periodoDe } from '@/lib/format/dates'
import type {
  EntradaLiquidacion,
  RegimenHoras,
  ConceptoBpsResuelto,
  FaltaCalculo,
  HoraExtraCalculo,
  CuotaPlanCalculo,
} from '@/lib/calculo/tipos'

export const D = (v: number | string) => new Decimal(v)
export const f = parseFechaISO
export { fecha, periodoDe }

/** Régimen de lunes a viernes, 8 h por día (40 h semanales). */
export function regimenLunesAViernes(horasPorDia = 8): RegimenHoras {
  return {
    lunes: D(horasPorDia),
    martes: D(horasPorDia),
    miercoles: D(horasPorDia),
    jueves: D(horasPorDia),
    viernes: D(horasPorDia),
    sabado: D(0),
    domingo: D(0),
  }
}

export function regimen(
  lunes: number,
  martes: number,
  miercoles: number,
  jueves: number,
  viernes: number,
  sabado: number,
  domingo: number,
): RegimenHoras {
  return {
    lunes: D(lunes),
    martes: D(martes),
    miercoles: D(miercoles),
    jueves: D(jueves),
    viernes: D(viernes),
    sabado: D(sabado),
    domingo: D(domingo),
  }
}

export function conceptoBps(
  concepto: string,
  porcentaje: number,
  seguroSalud: string | null = null,
): ConceptoBpsResuelto {
  return { concepto, porcentaje: D(porcentaje), seguroSalud }
}

export function falta(
  fechaISO: string,
  horas: number,
  causal: FaltaCalculo['causal'] = 'CON_AVISO',
  descuenta = true,
): FaltaCalculo {
  return { fecha: f(fechaISO), horas: D(horas), causal, descuenta }
}

export function horaExtra(
  fechaISO: string,
  horas: number,
  conBps: boolean,
  recargoPct: number,
): HoraExtraCalculo {
  return { fecha: f(fechaISO), horas: D(horas), conBps, recargoPct }
}

/**
 * Entrada base: empleado que ingresó antes del período, con salario de $65.000 por 30 h
 * semanales, régimen de lunes a viernes de 6 h, cobra boletos y aporta BPS.
 *
 * Los valores están elegidos para que el valor hora calculado dé exacto:
 * 65.000 / (30 × 52/12) = 65.000 / 130 = **$500**.
 */
export function entradaBase(over: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion {
  return {
    periodo: periodoDe(2026, 4),
    empleado: {
      fechaIngreso: f('2020-01-01'),
      fechaEgreso: null,
    },
    aporteBps: { aportaBps: true, seguroSalud: null },
    cobraBoletos: true,
    salario: { salario: D(65000), horasSemanales: D(30) },
    regimen: regimenLunesAViernes(6),
    valorHoraNegro: D(300),
    valorBoleto: D(50),
    conceptosBps: [],
    faltas: [],
    horasExtras: [],
    pagosAdicionales: [],
    cuotasPlan: [],
    feriados: [],
    diasLicencia: [],
    totalYaLiquidadoFormal: D(0),
    totalYaLiquidadoInformal: D(0),
    ...over,
  }
}

/**
 * Cuota del plan de pagos para el cálculo. `ordinal`, `deTotal` y `fechaPrestamo` son lo que
 * la línea usa para nombrarse —«Cuota 2 de 5 del préstamo de 25/03»— y casi ningún test los
 * mira, así que traen un plan de una sola cuota por defecto.
 *
 * El `libro` por defecto es el formal, que es donde queda el préstamo de una empleada que
 * aporta (§4.9); el test que le importa lo pasa explícito.
 */
export function cuotaPlan(
  fechaISO: string,
  monto: Decimal,
  over: Partial<CuotaPlanCalculo> = {},
): CuotaPlanCalculo {
  return {
    fecha: f(fechaISO),
    monto,
    yaAplicada: false,
    fechaPrestamo: f('2026-03-25'),
    libro: 'FORMAL',
    ordinal: 1,
    deTotal: 1,
    ...over,
  }
}

/**
 * §7.6.1 — lo ya liquidado del período, **por libro**, a partir de las liquidaciones previas.
 * Es lo que hace `armarContextoLiquidacion` con las secuencias anteriores: suma el total a
 * pagar de cada libro por separado, porque la complementaria puede ser parcial.
 */
export function yaLiquidado(
  ...previas: readonly { totalAPagarFormal: Decimal; totalAPagarInformal: Decimal }[]
): { totalYaLiquidadoFormal: Decimal; totalYaLiquidadoInformal: Decimal } {
  return {
    totalYaLiquidadoFormal: previas.reduce((acc, p) => acc.plus(p.totalAPagarFormal), D(0)),
    totalYaLiquidadoInformal: previas.reduce((acc, p) => acc.plus(p.totalAPagarInformal), D(0)),
  }
}

/** Suma de las líneas aplicando su signo, para verificar que cierran contra el total. */
export function sumarLineas(
  lineas: readonly { codigo: string; importe: Decimal; signo: number }[],
): Decimal {
  return lineas
    .filter((l) => l.signo !== 0)
    .reduce((acc, l) => acc.plus(l.importe.times(l.signo)), D(0))
}

export function lineasCon(
  lineas: readonly { codigo: string }[],
  codigo: string,
): number {
  return lineas.filter((l) => l.codigo === codigo).length
}
