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

/**
 * Los hechos de un día que deciden su boleto. Es lo único que hace falta para responder las
 * tres preguntas del §6.4 y del §6.5, y por eso lo comparten el motor y el pie de las
 * planillas: **la regla se escribe una sola vez**. Tenerla en dos lados es lo que hizo que el
 * mismo error se repitiera tres veces (ver IMPLEMENTATION_HINTS §1.14).
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

/**
 * §6.4 — el día era de trabajo según el régimen y el calendario, **antes de mirar las
 * novedades**: la empleada tenía jornada y ni el feriado ni la licencia se la sacaron. El §6.5
 * lo dice del otro lado —el feriado no laborable «invalida las horas del régimen vigente, por
 * lo tanto son días con 0 horas»—, que es la misma frase.
 */
export function eraDiaDeTrabajo(dia: DiaDeBoletos): boolean {
  return dia.dentroDelVinculo && dia.horasRegimen > 0 && !dia.feriadoNoLaborable && !dia.enLicencia
}

/**
 * Cumplió la jornada del día: era de trabajo y no faltó entera. Es el día que paga boleto **por
 * su jornada**, o sea el que entra en `días_a_trabajar`.
 *
 * `horasFaltadas` son todas las del día, de cualquier causal y descuenten sueldo o no
 * (§4.6.1, §6.4).
 */
function hizoLaJornada(dia: DiaDeBoletos, horasFaltadas: number): boolean {
  return eraDiaDeTrabajo(dia) && horasFaltadas < dia.horasRegimen
}

/**
 * §6.4 — la falta de **jornada completa** descuenta el boleto del día; la parcial no. Descuenta
 * solo si ese día pagaba boleto: faltar a un feriado no laborable o a un día de licencia no
 * saca nada, porque ahí no había boleto.
 *
 * **Y no descuenta nada si ese día hay horas extras**: entonces fue igual, así que viajó igual.
 * El boleto no se pierde, cambia de dueño: lo pasa a pagar la hora extra (§6.5), que es lo que
 * decide en qué tabla cae (§6.5.1).
 */
export function laFaltaDescuentaElBoleto(
  dia: DiaDeBoletos,
  horasFaltadas: number,
  hayHorasExtras = false,
): boolean {
  return eraDiaDeTrabajo(dia) && !hizoLaJornada(dia, horasFaltadas) && !hayHorasExtras
}

/**
 * §6.5 — el boleto del día lo genera la **hora extra** y no la jornada. Lo pregunta el que ya
 * sabe que ese día tiene horas extras cargadas; no mira ni `con_bps` ni el recargo, porque el
 * criterio es «fue a trabajar, viajó» y el viaje es el mismo.
 *
 * Es todo lo que quedó afuera de `días_a_trabajar`: el día que el régimen deja en cero, el
 * feriado no laborable, el día de licencia, y **el día en que faltó la jornada completa**. En
 * los cuatro la empleada fue igual, y por eso cobra el viaje.
 *
 * **Divergencia con el §6.5**, por decisión del dueño del proyecto: el SPECS solo saca de la
 * cuenta al feriado no laborable —«y que no estén ya contadas en días_a_trabajar»—, así que ni
 * el día de licencia ni el de falta completa pagaban boleto. Ver IMPLEMENTATION_HINTS §1.14.
 */
export function generaBoletoAdicional(dia: DiaDeBoletos, horasFaltadas = 0): boolean {
  return dia.dentroDelVinculo && !hizoLaJornada(dia, horasFaltadas)
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

  /** Los hechos del día que deciden su boleto, en la forma que comparten motor y planillas. */
  const diaDeBoletos = (f: Date): DiaDeBoletos => {
    const clave = aISO(f)
    return {
      horasRegimen: horasDelDia(regimen, f).toNumber(),
      feriadoNoLaborable: feriadosNoLaborables.has(clave),
      enLicencia: licencia.has(clave),
      dentroDelVinculo:
        f.getTime() >= empleado.fechaIngreso.getTime() &&
        (!empleado.fechaEgreso || f.getTime() <= empleado.fechaEgreso.getTime()),
    }
  }

  /** Las horas de falta del día, ya sumadas. */
  const faltadasEn = (clave: string) => (horasFaltaPorDia.get(clave) ?? new Decimal(0)).toNumber()

  let diasATrabajar = 0

  for (const f of diasDelPeriodo(periodo)) {
    // Un día alcanzado por más de una causa se descuenta una sola vez: el predicado ya lo
    // resuelve, porque es una pregunta sobre el día y no una lista de descuentos.
    if (hizoLaJornada(diaDeBoletos(f), faltadasEn(aISO(f)))) diasATrabajar += 1
  }

  // §6.5 — fechas distintas del mes con horas extras que no pagaron boleto por su jornada.
  //
  // Ya no hace falta descontar las que están en `días_a_trabajar`: `generaBoletoAdicional` es
  // justamente «no hizo la jornada», así que un día contado allá ya devuelve false. Era el
  // mismo chequeo escrito dos veces.
  //
  // El `con_bps` sí decide **en qué tabla** de la liquidación cae el boleto del día (§6.5.1),
  // así que se guarda por fecha: `true` si alguna de las horas extras de ese día lleva BPS.
  // Un día con horas de los dos tipos cuenta como día con BPS, porque ya quedó documentado.
  const desdeMes = primerDiaDelMes(periodo).getTime()
  const hastaMes = ultimoDiaDelMes(periodo).getTime()
  const diasExtra = new Map<string, boolean>()

  for (const he of horasExtras) {
    const t = he.fecha.getTime()
    if (t < desdeMes || t > hastaMes) continue
    const clave = aISO(he.fecha)
    if (!generaBoletoAdicional(diaDeBoletos(he.fecha), faltadasEn(clave))) continue
    diasExtra.set(clave, (diasExtra.get(clave) ?? false) || he.conBps)
  }

  const diasExtraConBps = [...diasExtra.values()].filter(Boolean).length

  return {
    diasATrabajar,
    diasExtraConBps,
    diasExtraSinBps: diasExtra.size - diasExtraConBps,
    // Cada día suma 2 boletos: ida y vuelta.
    boletos: (diasATrabajar + diasExtra.size) * 2,
  }
}
