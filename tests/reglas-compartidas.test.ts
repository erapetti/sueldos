/**
 * Las reglas que el pie de las planillas **le pregunta al motor** en vez de recalcular: las de
 * boletos del §6.4 y del §6.5, y la valorización de horas extras del §6.6.
 *
 * Tenerlas escritas dos veces es lo que hizo que el mismo error volviera tres veces
 * (IMPLEMENTATION_HINTS §1.14), así que estos casos son el contrato entre los dos lados: si
 * alguien cambia una regla, la pantalla y la liquidación se mueven juntas o esto se pone en
 * rojo.
 *
 * Calendario de referencia: abril de 2026 arranca miércoles y tiene 22 días de lunes a viernes.
 */
import { describe, expect, it } from 'vitest'
import {
  calcularBoletos,
  generaBoletoAdicional,
  laFaltaDescuentaElBoleto,
} from '@/lib/calculo/boletos'
import {
  eraDiaDeTrabajo,
  motivoSinJornada,
  topeDeFaltaDelDia,
  type DiaDeBoletos,
} from '@/lib/calculo/jornada'
import {
  importeDeHorasExtras,
  totalDeHorasExtras,
  valorHoraConRecargo,
} from '@/lib/calculo/liquidacion'
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

/*
  §4.6 — el tope de horas de falta del día. Es el mismo predicado que usa `guardarFaltas`, y
  el que la planilla de inasistencias usa para deshabilitar el día y para precargar el campo:
  si se desvían, la pantalla ofrece cargar lo que el servidor rechaza.
*/
describe('§4.6 — el tope de falta del día', () => {
  it('en un día común es el del régimen', () => {
    expect(topeDeFaltaDelDia(dia())).toBe(8)
  })

  it('el feriado no laborable no tiene jornada a la que faltar', () => {
    expect(topeDeFaltaDelDia(dia({ feriadoNoLaborable: true }))).toBe(0)
    expect(motivoSinJornada(dia({ feriadoNoLaborable: true }))).toBe('FERIADO_NO_LABORABLE')
  })

  /*
    Divergencia con el §4.6, por decisión del dueño del proyecto: el §6.4 ya deja pagos los
    días de licencia, así que la falta los descontaría dos veces.
  */
  it('el día de licencia tampoco', () => {
    expect(topeDeFaltaDelDia(dia({ enLicencia: true }))).toBe(0)
    expect(motivoSinJornada(dia({ enLicencia: true }))).toBe('EN_LICENCIA')
  })

  it('ni el día fuera del vínculo, que gana a todo lo demás', () => {
    expect(topeDeFaltaDelDia(dia({ dentroDelVinculo: false }))).toBe(0)
    expect(motivoSinJornada(dia({ dentroDelVinculo: false, enLicencia: true }))).toBe(
      'FUERA_DEL_VINCULO',
    )
  })

  it('el día que el régimen deja en cero ya lo dejaba en cero', () => {
    expect(topeDeFaltaDelDia(dia({ horasRegimen: 0 }))).toBe(0)
    expect(motivoSinJornada(dia({ horasRegimen: 0 }))).toBe('SIN_REGIMEN')
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

  /*
    Si ese día hay horas extras, fue igual: el boleto no se pierde, lo pasa a pagar la hora
    extra (§6.5). Descontarlo acá y volver a sumarlo allá daría lo mismo en el total, pero la
    planilla anunciaría un descuento que no existe.
  */
  it('con horas extras ese día la falta no descuenta nada: fue igual', () => {
    expect(laFaltaDescuentaElBoleto(dia(), 8, true)).toBe(false)
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

  /**
   * El criterio del §6.5 es «fue a trabajar, viajó». Si faltó la jornada entera pero cargó
   * horas extras, fue igual, así que cobra el viaje: la falta lo saca de `días_a_trabajar`, y
   * la hora extra se lo devuelve como día extra. Antes no cobraba nada.
   */
  it('el día con falta de jornada completa lo genera: fue igual', () => {
    expect(generaBoletoAdicional(dia(), 8)).toBe(true)
  })

  it('con falta parcial no lo genera: ese día ya pagó boleto por su jornada', () => {
    expect(generaBoletoAdicional(dia(), 4)).toBe(false)
  })

  it('no lo genera fuera del vínculo: no era empleada, no fue a trabajar', () => {
    expect(generaBoletoAdicional(dia({ dentroDelVinculo: false }))).toBe(false)
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
    La falta lo saca de `días_a_trabajar` y la hora extra se lo devuelve como día extra: el
    total de boletos no cambia, pero el boleto pasa a la tabla que le toque a la hora extra
    (§6.5.1) en vez de a la de la jornada.
  */
  it('un día con falta de jornada completa y horas extras paga su boleto', () => {
    const r = calcularBoletos({
      ...base,
      faltas: [
        { fecha: f('2026-04-08'), horas: D(6), causal: 'CON_AVISO' as const, descuenta: true },
      ],
      horasExtras: [horaExtra('2026-04-08', 3, true, 0)],
    })

    expect(r.diasATrabajar).toBe(21)
    expect(r.diasExtraConBps).toBe(1)
    expect(r.boletos).toBe(44)
  })

  it('la misma falta sin horas extras sigue sin pagar boleto', () => {
    const r = calcularBoletos({
      ...base,
      faltas: [
        { fecha: f('2026-04-08'), horas: D(6), causal: 'CON_AVISO' as const, descuenta: true },
      ],
    })

    expect(r.diasATrabajar).toBe(21)
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

describe('§6.6 — el importe de las horas extras se calcula en un solo lugar', () => {
  /*
    §6.7 — el redondeo es **por línea**, así que agrupar por recargo y redondear cada grupo no
    da lo mismo que sumar todo y redondear al final. Es la cuenta que el pie de la planilla
    hacía por su cuenta, sin redondear, y por eso anunciaba un importe parecido al que después
    se liquidaba pero no el mismo.
  */
  it('redondea cada recargo por separado, como la liquidación', () => {
    const vh = D('395')
    // 2,5 h al 100 % = 1.975 exactos; 1,5 h al 20 % = 711 exactos.
    expect(importeDeHorasExtras(D('2.5'), vh, 100).toString()).toBe('1975')
    expect(importeDeHorasExtras(D('1.5'), vh, 20).toString()).toBe('711')
  })

  it('el total agrupa por recargo antes de redondear', () => {
    const vh = D('395')
    const total = totalDeHorasExtras(
      [
        { horas: D('1.5'), recargoPct: 100 },
        { horas: D('1'), recargoPct: 100 },
        { horas: D('1.5'), recargoPct: 20 },
      ],
      vh,
    )
    // Las dos del 100 % son una sola línea de 2,5 h: 1.975, más 711 de la del 20 %.
    expect(total.toString()).toBe('2686')
  })

  it('el valor unitario lleva el recargo', () => {
    expect(valorHoraConRecargo(D('300'), 0).toString()).toBe('300')
    expect(valorHoraConRecargo(D('300'), 100).toString()).toBe('600')
    expect(valorHoraConRecargo(D('300'), 20).toString()).toBe('360')
  })
})
