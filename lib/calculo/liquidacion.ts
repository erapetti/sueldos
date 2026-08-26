/**
 * §6 — cálculo de la liquidación mensual.
 *
 * Código puro (§9): recibe una entrada ya resuelta y devuelve las líneas. No accede a la
 * base ni a la sesión.
 *
 * Redondeo: los cálculos intermedios van con precisión completa; **cada línea se cierra en
 * pesos enteros** con ROUND_HALF_UP; los subtotales y el total son la suma de las líneas ya
 * redondeadas, así que la columna cierra exacta.
 *
 * Es una divergencia deliberada del §6.7, que pide 2 decimales por línea. Ver
 * `redondearPesos` en lib/format/money.
 */
import Decimal from 'decimal.js'
import { redondearPesos } from '@/lib/format/money'
import {
  aISO,
  diasCorridos,
  diasDelMes,
  formatearDiaMes,
  formatearPeriodo,
  maxFecha,
  minFecha,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from '@/lib/format/dates'
import { calcularBoletos, horasDelDia } from './boletos'
import { ErrorDatosFaltantes, type DatoFaltante } from './errores'
import {
  CODIGOS,
  type EntradaLiquidacion,
  type LineaLiquidacion,
  type ResultadoLiquidacion,
  type SalarioVigente,
} from './tipos'

/**
 * §4.3 — valor hora calculado. No se persiste: es derivado.
 *
 *   valor_hora_calculado = redondear_a_pesos( salario / ( horas_semanales × 52/12 ) )
 *
 * `horas_semanales × 52/12` son las horas que tiene el mes promedio: 52 semanas repartidas
 * en 12 meses.
 *
 * **Divergencia del SPECS.** El §4.3 dice que se usa con precisión completa y que solo se
 * redondea al mostrarlo. Por decisión del proyecto se registra ya redondeado a pesos
 * enteros, que es lo que hace que las líneas que lo usan —faltas y horas extras— cierren
 * sin decimales. Ver `redondearPesos`.
 */
export function valorHoraCalculado(salario: SalarioVigente): Decimal {
  const horasDelMes = salario.horasSemanales.times(52).dividedBy(12)
  return redondearPesos(salario.salario.dividedBy(horasDelMes))
}

/**
 * §6.9 — factor de prorrateo del primer y último mes.
 *
 * `días_del_período_con_vínculo_vigente / días_del_mes`, contando días corridos entre el
 * mayor de (ingreso, primer día del mes) y el menor de (egreso, último día del mes).
 */
export function calcularProrrateo(
  periodo: Date,
  fechaIngreso: Date,
  fechaEgreso: Date | null,
): { factor: Decimal; diasConVinculo: number; diasDelMes: number } {
  const primero = primerDiaDelMes(periodo)
  const ultimo = ultimoDiaDelMes(periodo)
  const total = diasDelMes(periodo)

  const desde = maxFecha(fechaIngreso, primero)
  const hasta = fechaEgreso ? minFecha(fechaEgreso, ultimo) : ultimo

  const diasConVinculo = diasCorridos(desde, hasta)
  return {
    factor: new Decimal(diasConVinculo).dividedBy(total),
    diasConVinculo,
    diasDelMes: total,
  }
}

/** §6.8 — verificación de los datos obligatorios antes de calcular. */
function verificarDatos(entrada: EntradaLiquidacion): void {
  const faltantes: DatoFaltante[] = []

  if (!entrada.salario) {
    faltantes.push({
      codigo: 'SALARIO',
      mensaje: `No hay salario vigente para ${formatearPeriodo(entrada.periodo)}`,
      destino: 'salario',
    })
  }
  if (!entrada.regimen) {
    faltantes.push({
      codigo: 'REGIMEN',
      mensaje: `No hay régimen horario vigente para ${formatearPeriodo(entrada.periodo)}`,
      destino: 'regimen',
    })
  }
  const hayExtrasSinBps = entrada.horasExtras.some((h) => !h.conBps)
  if (hayExtrasSinBps && !entrada.valorHoraNegro) {
    faltantes.push({
      codigo: 'VALOR_HORA_NEGRO',
      mensaje: `Hay horas extras sin descuento BPS y no hay valor hora sin aportes vigente para ${formatearPeriodo(entrada.periodo)}`,
      destino: 'salario',
    })
  }
  if (entrada.empleado.cobraBoletos && !entrada.valorBoleto) {
    faltantes.push({
      codigo: 'VALOR_BOLETO',
      mensaje: `La empleada cobra boletos y no hay valor de boleto vigente para ${formatearPeriodo(entrada.periodo)}`,
      destino: '/admin/boletos',
    })
  }

  if (faltantes.length > 0) throw new ErrorDatosFaltantes(faltantes)
}

/** Agrupa horas extras por porcentaje de recargo, para emitir una línea por recargo. */
function agruparPorRecargo(
  extras: readonly { horas: Decimal; recargoPct: number }[],
): { recargoPct: number; horas: Decimal }[] {
  const porRecargo = new Map<number, Decimal>()
  for (const e of extras) {
    porRecargo.set(e.recargoPct, (porRecargo.get(e.recargoPct) ?? new Decimal(0)).plus(e.horas))
  }
  return [...porRecargo.entries()]
    .map(([recargoPct, horas]) => ({ recargoPct, horas }))
    // §6.5 — un renglón en cero existe solo para el boleto: no genera línea de liquidación.
    .filter((g) => g.horas.greaterThan(0))
    .sort((a, b) => a.recargoPct - b.recargoPct)
}

export function calcularLiquidacionMensual(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  verificarDatos(entrada)

  // verificarDatos ya garantizó que estos no son null.
  const salario = entrada.salario!
  const regimen = entrada.regimen!

  const { empleado, periodo } = entrada
  const avisos: string[] = []
  const lineas: LineaLiquidacion[] = []
  let orden = 0

  const vhc = valorHoraCalculado(salario)

  // ── Paso 1: salario base, prorrateado si es el primer o el último mes (§6.9) ──────────
  const prorrateo = calcularProrrateo(periodo, empleado.fechaIngreso, empleado.fechaEgreso)
  const salarioBase = redondearPesos(salario.salario.times(prorrateo.factor))

  if (prorrateo.diasConVinculo === 0) {
    avisos.push(
      `La empleada no tuvo vínculo vigente en ${formatearPeriodo(periodo)}: el salario base es cero.`,
    )
  }

  lineas.push({
    orden: (orden += 1),
    codigo: CODIGOS.SALARIO_BASE,
    descripcion: prorrateo.factor.equals(1)
      ? 'Salario base'
      : `Salario base (${prorrateo.diasConVinculo}/${prorrateo.diasDelMes} días)`,
    cantidad: prorrateo.factor.equals(1) ? null : new Decimal(prorrateo.diasConVinculo),
    valorUnitario: prorrateo.factor.equals(1) ? null : salario.salario,
    importe: salarioBase,
    signo: 1,
  })

  // ── Paso 2: faltas (solo las que descuentan, §4.6.1) ─────────────────────────────────
  const faltasQueDescuentan = entrada.faltas.filter((f) => f.descuenta)
  const horasFalta = faltasQueDescuentan.reduce((acc, f) => acc.plus(f.horas), new Decimal(0))
  const importeFaltas = redondearPesos(vhc.times(horasFalta))

  if (horasFalta.greaterThan(0)) {
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.FALTAS,
      descripcion: 'Faltas',
      cantidad: horasFalta,
      valorUnitario: vhc,
      importe: importeFaltas,
      signo: -1,
    })
  }

  // ── Paso 3: horas extras con descuento BPS, al valor hora calculado (§6.6) ───────────
  //
  // Las horas trabajadas en un feriado no laborable se muestran aparte, en el paso 3 bis. Se
  // identifican por llevar descuento de BPS y recargo **0 %**: el día ya viene pago adentro
  // del salario base —es mensual y el feriado no se descuenta—, así que trabajarlo agrega
  // otro valor hora por hora y termina pagándose doble sin necesidad de recargo.
  //
  // El desglose es **solo presentación**: se valorizan igual que en la línea genérica y
  // suman a la misma materia gravada, así que la regla de cálculo del §6.2 no cambia. Lo que
  // aporta es que la hoja informe que el mes incluyó un feriado trabajado.
  const feriadosNoLaborables = new Set(
    entrada.feriados.filter((f) => f.noLaborable).map((f) => aISO(f.fecha)),
  )

  const conBps = entrada.horasExtras.filter((h) => h.conBps)

  /**
   * Horas a desglosar, por fecha de feriado: las cargadas al 0 %, **topeadas por las que el
   * régimen le asigna a ese día**. Lo que exceda el régimen no es el feriado trabajado, es
   * hora extra común, y se queda en la línea genérica.
   *
   * Si el régimen le da 0 horas a ese día —un feriado en domingo, por ejemplo— el tope es 0 y
   * no se desglosa nada: no hay jornada ya pagada en el salario base que reflejar.
   */
  const porFechaFeriado = new Map<string, { fecha: Date; horas: Decimal }>()
  for (const h of conBps) {
    if (h.recargoPct !== 0) continue
    const clave = aISO(h.fecha)
    if (!feriadosNoLaborables.has(clave)) continue
    const previo = porFechaFeriado.get(clave)
    if (previo) previo.horas = previo.horas.plus(h.horas)
    else porFechaFeriado.set(clave, { fecha: h.fecha, horas: h.horas })
  }

  let horasEnFeriados = new Decimal(0)
  for (const { fecha, horas } of porFechaFeriado.values()) {
    horasEnFeriados = horasEnFeriados.plus(Decimal.min(horas, horasDelDia(regimen, fecha)))
  }

  let totalExtrasConBps = new Decimal(0)

  for (const grupo of agruparPorRecargo(conBps)) {
    // Al 0 % se descuenta lo que se llevó el desglose; el resto sigue siendo hora extra común.
    const horas = grupo.recargoPct === 0 ? grupo.horas.minus(horasEnFeriados) : grupo.horas
    if (horas.lessThanOrEqualTo(0)) continue

    const unitario = vhc.times(new Decimal(1).plus(new Decimal(grupo.recargoPct).dividedBy(100)))
    const importe = redondearPesos(horas.times(unitario))
    totalExtrasConBps = totalExtrasConBps.plus(importe)
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.HORAS_EXTRAS_CON_BPS,
      descripcion: `Horas extras con BPS (recargo ${grupo.recargoPct} %)`,
      cantidad: horas,
      valorUnitario: unitario,
      importe,
      signo: 1,
    })
  }

  // ── Paso 3 bis: horas trabajadas en un feriado no laborable ──────────────────────────
  if (horasEnFeriados.greaterThan(0)) {
    const importe = redondearPesos(horasEnFeriados.times(vhc))
    totalExtrasConBps = totalExtrasConBps.plus(importe)
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.HORAS_EN_FERIADOS,
      descripcion: 'Horas en feriados no laborables',
      cantidad: horasEnFeriados,
      valorUnitario: vhc,
      importe,
      signo: 1,
    })
  }

  // ── Paso 4: materia gravada = 1 − 2 + 3 ──────────────────────────────────────────────
  const materiaGravada = salarioBase.minus(importeFaltas).plus(totalExtrasConBps)

  // §6.3 — con `aportaBps = false` no se renderiza ni la materia gravada ni los descuentos:
  // el paso 4 pasa directamente al paso 6.
  if (empleado.aportaBps) {
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.MATERIA_GRAVADA,
      descripcion: 'Materia gravada',
      cantidad: null,
      valorUnitario: null,
      importe: materiaGravada,
      signo: 0,
    })
  }

  // ── Paso 5: descuentos de BPS, una línea por concepto (§6.3) ─────────────────────────
  let totalDescuentosBps = new Decimal(0)

  if (empleado.aportaBps) {
    for (const concepto of entrada.conceptosBps) {
      const importe = redondearPesos(materiaGravada.times(concepto.porcentaje).dividedBy(100))
      totalDescuentosBps = totalDescuentosBps.plus(importe)
      lineas.push({
        orden: (orden += 1),
        codigo: CODIGOS.DESCUENTO_BPS,
        descripcion: concepto.seguroSalud
          ? `${concepto.concepto} (seguro ${concepto.seguroSalud})`
          : concepto.concepto,
        cantidad: concepto.porcentaje,
        valorUnitario: materiaGravada,
        importe,
        signo: -1,
      })
    }
  }
  // El §6.3 pide además la leyenda «Empleado sin aportes al BPS» en el encabezado. No se
  // emite, por decisión del usuario: se deduce de las líneas —no hay materia gravada ni
  // ningún descuento de BPS— y aparecía dos veces en la misma pantalla. Divergencia
  // registrada en IMPLEMENTATION_HINTS.

  // ── Paso 6: subtotal = 4 − 5 ─────────────────────────────────────────────────────────
  const subtotal = materiaGravada.minus(totalDescuentosBps)
  lineas.push({
    orden: (orden += 1),
    codigo: CODIGOS.SUBTOTAL,
    descripcion: 'Subtotal',
    cantidad: null,
    valorUnitario: null,
    importe: subtotal,
    signo: 0,
    destacada: true,
  })

  // ── Paso 7: pagos adicionales, sin descuentos de ningún tipo (§4.7) ──────────────────
  let totalPagosAdicionales = new Decimal(0)
  for (const pago of entrada.pagosAdicionales) {
    const importe = redondearPesos(pago.monto)
    totalPagosAdicionales = totalPagosAdicionales.plus(importe)
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.PAGO_ADICIONAL,
      descripcion: pago.concepto ? `Pago adicional: ${pago.concepto}` : 'Pago adicional',
      cantidad: null,
      valorUnitario: null,
      importe,
      signo: 1,
    })
  }

  // ── Paso 8: cuotas del plan de pagos del mes (§4.8) ──────────────────────────────────
  let totalCuotas = new Decimal(0)
  for (const cuota of entrada.cuotasPlan) {
    const importe = redondearPesos(cuota.monto)
    totalCuotas = totalCuotas.plus(importe)
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.CUOTA_PLAN,
      /*
        «Cuota 2 de 5 del préstamo de 25/08». Decía «Cuota del plan de pagos» y con dos
        préstamos abiertos en el mismo mes las dos líneas quedaban idénticas, sin forma de
        saber cuál era cuál ni cuánto faltaba de cada uno.
      */
      descripcion: `Cuota ${cuota.ordinal} de ${cuota.deTotal} del préstamo de ${formatearDiaMes(
        cuota.fechaPrestamo,
      )}`,
      cantidad: null,
      valorUnitario: null,
      importe,
      signo: -1,
    })
  }

  // ── Paso 9: boletos (§6.4, §6.5) ─────────────────────────────────────────────────────
  let detalleBoletos = null
  let importeBoletos = new Decimal(0)

  if (empleado.cobraBoletos) {
    detalleBoletos = calcularBoletos({
      periodo,
      empleado,
      regimen,
      faltas: entrada.faltas,
      horasExtras: entrada.horasExtras,
      feriados: entrada.feriados,
      diasLicencia: entrada.diasLicencia,
    })

    const valorBoleto = entrada.valorBoleto!
    importeBoletos = redondearPesos(new Decimal(detalleBoletos.boletos).times(valorBoleto))

    const detalleDias =
      detalleBoletos.diasExtraConBoleto > 0
        ? `${detalleBoletos.diasATrabajar} días + ${detalleBoletos.diasExtraConBoleto} por horas extras`
        : `${detalleBoletos.diasATrabajar} días`

    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.BOLETOS,
      descripcion: `Boletos (${detalleDias}, ida y vuelta)`,
      cantidad: new Decimal(detalleBoletos.boletos),
      valorUnitario: valorBoleto,
      importe: importeBoletos,
      signo: 1,
    })
  }

  // ── Paso 10: horas extras sin BPS, al valor hora "en negro" (§6.6) ───────────────────
  const extrasSinBps = agruparPorRecargo(entrada.horasExtras.filter((h) => !h.conBps))
  let totalExtrasSinBps = new Decimal(0)

  for (const grupo of extrasSinBps) {
    const vhn = entrada.valorHoraNegro!
    const unitario = vhn.times(new Decimal(1).plus(new Decimal(grupo.recargoPct).dividedBy(100)))
    const importe = redondearPesos(grupo.horas.times(unitario))
    totalExtrasSinBps = totalExtrasSinBps.plus(importe)
    lineas.push({
      orden: (orden += 1),
      codigo: CODIGOS.HORAS_EXTRAS_SIN_BPS,
      descripcion: `Horas extras sin BPS (recargo ${grupo.recargoPct} %)`,
      cantidad: grupo.horas,
      valorUnitario: unitario,
      importe,
      signo: 1,
    })
  }

  // ── Paso 11: total a pagar ───────────────────────────────────────────────────────────
  const totalRecalculado = subtotal
    .plus(totalPagosAdicionales)
    .minus(totalCuotas)
    .plus(importeBoletos)
    .plus(totalExtrasSinBps)

  lineas.push({
    orden: (orden += 1),
    codigo: CODIGOS.TOTAL,
    descripcion: 'Total a pagar',
    cantidad: null,
    valorUnitario: null,
    importe: totalRecalculado,
    signo: 0,
    destacada: true,
  })

  // §6.9 / §13.1 — la liquidación del mes de egreso está incompleta hasta que se especifique
  // el cálculo del despido y de la licencia no gozada.
  if (
    empleado.fechaEgreso &&
    empleado.fechaEgreso.getTime() >= primerDiaDelMes(periodo).getTime() &&
    empleado.fechaEgreso.getTime() <= ultimoDiaDelMes(periodo).getTime()
  ) {
    avisos.push('Liquidación final: falta calcular despido y licencia no gozada.')
  }

  const totalAPagar = totalRecalculado.minus(entrada.totalYaLiquidado)

  return {
    periodo,
    lineas,
    valorHoraCalculado: vhc,
    factorProrrateo: prorrateo.factor,
    diasConVinculo: prorrateo.diasConVinculo,
    diasDelMes: prorrateo.diasDelMes,
    materiaGravada,
    totalDescuentosBps,
    subtotal,
    boletos: detalleBoletos,
    totalRecalculado,
    totalYaLiquidado: entrada.totalYaLiquidado,
    totalAPagar,
    avisos,
  }
}

/**
 * Horas que corresponden a una fecha según el régimen. Reexportado acá porque los
 * formularios de faltas (§4.6) lo usan para validar el tope del día.
 */
export { horasDelDia }

/** Días del período en los que el empleado tiene horas asignadas en el régimen. */
export function diasLaborablesDelPeriodo(
  periodo: Date,
  regimen: { lunes: Decimal; martes: Decimal; miercoles: Decimal; jueves: Decimal; viernes: Decimal; sabado: Decimal; domingo: Decimal },
): string[] {
  const primero = primerDiaDelMes(periodo)
  const total = diasDelMes(periodo)
  const resultado: string[] = []
  for (let i = 0; i < total; i += 1) {
    const f = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth(), 1 + i))
    if (horasDelDia(regimen, f).greaterThan(0)) resultado.push(aISO(f))
  }
  return resultado
}
