/**
 * §6.4 y §6.5 — las tres preguntas que decide un día en el cálculo de boletos, ahora escritas
 * una sola vez en `lib/calculo/boletos.ts`.
 *
 * Las usan el motor y el pie de las dos planillas. Tenerlas duplicadas es lo que hizo que el
 * mismo error volviera tres veces (IMPLEMENTATION_HINTS §1.14), así que estos casos son el
 * contrato entre los dos lados: si alguien cambia una regla, la pantalla y la liquidación se
 * mueven juntas o esto se pone en rojo.
 *
 * Calendario de referencia: abril de 2026 arranca miércoles y tiene 22 días de lunes a viernes.
 */
import { describe, expect, it } from 'vitest'
import {
  calcularBoletos,
  eraDiaDeTrabajo,
  generaBoletoAdicional,
  laFaltaDescuentaElBoleto,
  type DiaDeBoletos,
} from '@/lib/calculo/boletos'
import { D, f, horaExtra, regimenLunesAViernes } from './helpers'

/** Un miércoles común de 8 h: el día que sí es de trabajo. */
function dia(over: Partial<DiaDeBoletos> = {}): DiaDeBoletos {
  return {
    horasRegimen: 8,
    feriadoNoLaborable: false,
    enLicencia: false,
    dentroDelVinculo: true,
    ...over,
  }
}

describe('§6.4 — el día era de trabajo', () => {
  it('el día con horas del régimen, sin nada que lo cancele', () => {
    expect(eraDiaDeTrabajo(dia())).toBe(true)
  })

  it('no lo es el día que el régimen deja en cero', () => {
    expect(eraDiaDeTrabajo(dia({ horasRegimen: 0 }))).toBe(false)
  })

  /*
    §6.5 lo dice del otro lado —el feriado no laborable «invalida las horas del régimen
    vigente, por lo tanto son días con 0 horas»—, que es la misma frase.
  */
  it('no lo es el feriado no laborable, aunque el régimen le dé horas', () => {
    expect(eraDiaDeTrabajo(dia({ feriadoNoLaborable: true }))).toBe(false)
  })

  it('no lo es el día de licencia', () => {
    expect(eraDiaDeTrabajo(dia({ enLicencia: true }))).toBe(false)
  })

  it('no lo es el día fuera del vínculo', () => {
    expect(eraDiaDeTrabajo(dia({ dentroDelVinculo: false }))).toBe(false)
  })
})

describe('§6.4 — la falta que descuenta el boleto', () => {
  it('la de jornada completa lo descuenta', () => {
    expect(laFaltaDescuentaElBoleto(dia(), 8)).toBe(true)
  })

  it('la parcial no', () => {
    expect(laFaltaDescuentaElBoleto(dia(), 4)).toBe(false)
  })

  /*
    Es el caso que el pie de inasistencias anunciaba mal: decía «−2 boletos» por faltar a un
    día que nunca pagó boleto, y la liquidación no descontaba nada.
  */
  it('faltar a un feriado no laborable no descuenta nada: ese día no había boleto', () => {
    expect(laFaltaDescuentaElBoleto(dia({ feriadoNoLaborable: true }), 8)).toBe(false)
  })

  it('faltar a un día de licencia tampoco', () => {
    expect(laFaltaDescuentaElBoleto(dia({ enLicencia: true }), 8)).toBe(false)
  })
})

describe('§6.5 — el día que genera un boleto adicional', () => {
  it('el día que el régimen deja en cero', () => {
    expect(generaBoletoAdicional(dia({ horasRegimen: 0 }))).toBe(true)
  })

  it('el feriado no laborable, aunque el régimen le dé horas', () => {
    expect(generaBoletoAdicional(dia({ feriadoNoLaborable: true }))).toBe(true)
  })

  /**
   * **Divergencia con el §6.5**, por decisión del dueño del proyecto: el SPECS saca de la
   * cuenta solo al feriado no laborable y no dice nada de la licencia. Si fue a hacer horas
   * extras, viajó, que es el criterio del propio §6.5.
   */
  it('el día de licencia, que antes no lo generaba', () => {
    expect(generaBoletoAdicional(dia({ enLicencia: true }))).toBe(true)
  })

  it('el día de trabajo común no lo genera: su boleto ya está contado', () => {
    expect(generaBoletoAdicional(dia())).toBe(false)
  })
})

describe('el motor usa las mismas reglas', () => {
  const base = {
    periodo: f('2026-04-01'),
    empleado: { fechaIngreso: f('2020-01-01'), fechaEgreso: null },
    regimen: regimenLunesAViernes(6),
    faltas: [],
    horasExtras: [],
    feriados: [],
    diasLicencia: [],
  }

  it('un día de licencia con horas extras paga su boleto', () => {
    const r = calcularBoletos({
      ...base,
      // Miércoles 8/4/2026, día de régimen, dentro de una licencia.
      diasLicencia: [f('2026-04-08')],
      horasExtras: [horaExtra('2026-04-08', 3, true, 0)],
    })

    // 22 días de lunes a viernes menos el de licencia, más ese mismo día por las horas extras.
    expect(r.diasATrabajar).toBe(21)
    expect(r.diasExtraConBps).toBe(1)
    expect(r.boletos).toBe(44)
  })

  it('un día de licencia sin horas extras sigue sin pagar boleto', () => {
    const r = calcularBoletos({ ...base, diasLicencia: [f('2026-04-08')] })
    expect(r.diasATrabajar).toBe(21)
    expect(r.boletos).toBe(42)
  })

  /*
    La falta saca el día de `días_a_trabajar`, pero no lo convierte en día no laborable: sigue
    sin generar boleto adicional. Es lo único que la decisión sobre la licencia **no** cambió,
    y no se puede expresar con el predicado porque la falta no es un hecho del día.
  */
  it('un día con falta de jornada completa y horas extras no paga boleto', () => {
    const r = calcularBoletos({
      ...base,
      faltas: [
        { fecha: f('2026-04-08'), horas: D(6), causal: 'CON_AVISO' as const, descuenta: true },
      ],
      horasExtras: [horaExtra('2026-04-08', 3, true, 0)],
    })

    expect(r.diasATrabajar).toBe(21)
    expect(r.diasExtraConBps).toBe(0)
    expect(r.boletos).toBe(42)
  })

  it('faltar la jornada completa de un feriado no laborable no descuenta boletos', () => {
    const conFeriado = {
      ...base,
      feriados: [{ fecha: f('2026-04-08'), noLaborable: true }],
    }
    const sinFalta = calcularBoletos(conFeriado)
    const conFalta = calcularBoletos({
      ...conFeriado,
      faltas: [{ fecha: f('2026-04-08'), horas: D(6), causal: 'CON_AVISO' as const, descuenta: true }],
    })

    expect(sinFalta.diasATrabajar).toBe(21)
    expect(conFalta.diasATrabajar).toBe(21)
  })
})
