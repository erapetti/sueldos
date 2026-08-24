/**
 * §6.4 y §6.5 — cálculo de boletos.
 *
 * Criterio: se paga ida y vuelta por cada día que el empleado fue a trabajar.
 */
import Decimal from 'decimal.js'
import { aISO, diasDelPeriodo, diaSemana, primerDiaDelMes, ultimoDiaDelMes } from '@/lib/format/dates'
import type {
  DetalleBoletos,
  EmpleadoCalculo,
  FaltaCalculo,
  FeriadoCalculo,
  HoraExtraCalculo,
  RegimenHoras,
} from './tipos'

const DIAS: (keyof RegimenHoras)[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
]

/** Horas que le corresponden a una fecha según el régimen vigente. */
export function horasDelDia(regimen: RegimenHoras, f: Date): Decimal {
  return regimen[DIAS[diaSemana(f)]]
}

/** Suma de las horas semanales del régimen; §4.4 la valida contra `horasSemanales`. */
export function horasSemanalesDelRegimen(regimen: RegimenHoras): Decimal {
  return DIAS.reduce((acc, d) => acc.plus(regimen[d]), new Decimal(0))
}

export type EntradaBoletos = {
  periodo: Date
  empleado: EmpleadoCalculo
  regimen: RegimenHoras
  faltas: readonly FaltaCalculo[]
  horasExtras: readonly HoraExtraCalculo[]
  feriados: readonly FeriadoCalculo[]
  diasLicencia: readonly Date[]
}

export function calcularBoletos(entrada: EntradaBoletos): DetalleBoletos {
  const { periodo, empleado, regimen, faltas, horasExtras, feriados, diasLicencia } = entrada

  const feriadosNoLaborables = new Set(
    feriados.filter((f) => f.noLaborable).map((f) => aISO(f.fecha)),
  )
  const licencia = new Set(diasLicencia.map(aISO))

  // Horas de falta acumuladas por día. Se cuentan todas las causales y también las que no
  // descuentan sueldo: `descuenta` no afecta el conteo de boletos (§4.6.1, §6.4).
  const horasFaltaPorDia = new Map<string, Decimal>()
  for (const falta of faltas) {
    const clave = aISO(falta.fecha)
    horasFaltaPorDia.set(clave, (horasFaltaPorDia.get(clave) ?? new Decimal(0)).plus(falta.horas))
  }

  const contados = new Set<string>()
  let diasATrabajar = 0

  for (const f of diasDelPeriodo(periodo)) {
    const clave = aISO(f)

    // No se cuentan días anteriores al ingreso ni posteriores al egreso.
    if (f.getTime() < empleado.fechaIngreso.getTime()) continue
    if (empleado.fechaEgreso && f.getTime() > empleado.fechaEgreso.getTime()) continue

    const horasRegimen = horasDelDia(regimen, f)
    if (horasRegimen.lessThanOrEqualTo(0)) continue

    // Un día alcanzado por más de una causa se descuenta una sola vez: alcanza con saltearlo.
    if (feriadosNoLaborables.has(clave)) continue
    if (licencia.has(clave)) continue

    // Solo la falta de jornada completa descuenta el boleto; la parcial no.
    const faltadas = horasFaltaPorDia.get(clave)
    if (faltadas && faltadas.greaterThanOrEqualTo(horasRegimen)) continue

    contados.add(clave)
    diasATrabajar += 1
  }

  // §6.5 — fechas distintas del mes con horas extras que no estén ya contadas en días a
  // trabajar, y cuyo día no era de trabajo: o el régimen le da 0 horas, o es feriado no
  // laborable. El criterio es «fue a trabajar, viajó», así que no mira ni `con_bps` ni el
  // recargo; alcanza con que haya un registro de horas extras, aunque sea de cero horas.
  const desdeMes = primerDiaDelMes(periodo).getTime()
  const hastaMes = ultimoDiaDelMes(periodo).getTime()
  const diasExtra = new Set<string>()

  for (const he of horasExtras) {
    const t = he.fecha.getTime()
    if (t < desdeMes || t > hastaMes) continue
    const clave = aISO(he.fecha)
    const noEraDiaDeTrabajo =
      horasDelDia(regimen, he.fecha).lessThanOrEqualTo(0) || feriadosNoLaborables.has(clave)
    if (!noEraDiaDeTrabajo) continue
    if (contados.has(clave)) continue
    diasExtra.add(clave)
  }

  const diasExtraConBoleto = diasExtra.size

  return {
    diasATrabajar,
    diasExtraConBoleto,
    // Cada día suma 2 boletos: ida y vuelta.
    boletos: (diasATrabajar + diasExtraConBoleto) * 2,
  }
}
