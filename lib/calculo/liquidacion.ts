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
import { formatearDias, redondearPesos } from '@/lib/format/money'
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
  type Libro,
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
  /*
    La empleada sin régimen horario: salario y horas semanales van los dos en cero (§4.3 con
    la divergencia anotada en IMPLEMENTATION_HINTS §1.2), así que no hay valor hora que
    calcular y la fórmula sería una división por cero. El cero es inocuo donde se usa: las
    faltas quedan topeadas en 0 h por §4.6 —no falta quien no tiene jornada— y sin aporte a
    BPS no puede tener horas extras «con BPS» (§1.7.4).
  */
  if (salario.horasSemanales.isZero()) return new Decimal(0)

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
  /*
    §4.4.1 — el aporte a BPS es una serie, así que puede faltar, y faltar no es «no aporta»:
    tomarlo como `false` liquidaría sin aportes a alguien que sí los tiene, y le mandaría
    todas las líneas al libro informal.
  */
  if (!entrada.aporteBps) {
    faltantes.push({
      codigo: 'APORTE_BPS',
      mensaje: `No hay aporte a BPS vigente para ${formatearPeriodo(entrada.periodo)}`,
      destino: 'salario',
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

/**
 * El rótulo de una línea de horas extras. Dos cosas que **no** dice, por decisión del usuario:
 *
 * - **«con BPS» / «sin BPS»**: se deduce de la tabla en la que cayó la línea, que es justamente
 *   lo que separa a las dos (§6.2). Decirlo era repetir el título de la tabla en cada renglón.
 * - **«recargo 0 %»**: no hay recargo, así que no hay nada que informar.
 *
 * Queda un caso en el que las dos clases caen en la **misma** tabla y el rótulo no las
 * distingue: una empleada con `aporta_bps = false` liquida todo en la informal, y si tiene
 * renglones viejos marcados «con BPS» con el mismo recargo, se ven dos líneas iguales con
 * valores unitarios distintos —el calculado y el «en negro»—. Ese dato ya no se puede cargar
 * desde la UI (§1.7.4 de IMPLEMENTATION_HINTS), así que solo aparece en datos anteriores a esa
 * restricción, y el primer guardado de la planilla lo normaliza.
 */
function descripcionDeHorasExtras(recargoPct: number): string {
  return recargoPct === 0 ? 'Horas extras' : `Horas extras (recargo ${recargoPct} %)`
}

export function calcularLiquidacionMensual(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  verificarDatos(entrada)

  // verificarDatos ya garantizó que estos no son null.
  const salario = entrada.salario!
  const regimen = entrada.regimen!
  const aportaBps = entrada.aporteBps!.aportaBps

  const { empleado, periodo } = entrada
  const avisos: string[] = []

  /**
   * §6.2 — las líneas se juntan en una sola lista y sin `orden`; al final se separan por
   * tabla —la formal primero, la informal después— y ahí se numeran. Así cada tabla se lee
   * en su propio orden sin tener que llevar un contador global mientras se calcula.
   */
  const lineas: Omit<LineaLiquidacion, 'orden'>[] = []

  /**
   * La tabla de todo lo que no es específicamente informal. Sin aporte a BPS no hay
   * tabla formal: el salario, sus descuentos, sus cuotas y sus boletos son todos informales.
   */
  const tablaBase: Libro = aportaBps ? 'FORMAL' : 'INFORMAL'

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
    tabla: tablaBase,
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
      tabla: tablaBase,
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
      tabla: tablaBase,
      codigo: CODIGOS.HORAS_EXTRAS_CON_BPS,
      descripcion: descripcionDeHorasExtras(grupo.recargoPct),
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
      tabla: tablaBase,
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

  // §6.3 — sin aporte a BPS no se renderiza ni la materia gravada ni los descuentos:
  // el paso 4 pasa directamente al paso 6.
  if (aportaBps) {
    lineas.push({
      tabla: tablaBase,
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

  if (aportaBps) {
    for (const concepto of entrada.conceptosBps) {
      const importe = redondearPesos(materiaGravada.times(concepto.porcentaje).dividedBy(100))
      totalDescuentosBps = totalDescuentosBps.plus(importe)
      lineas.push({
        tabla: tablaBase,
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
    tabla: tablaBase,
    codigo: CODIGOS.SUBTOTAL,
    descripcion: 'Subtotal',
    cantidad: null,
    valorUnitario: null,
    importe: subtotal,
    signo: 0,
    destacada: true,
  })

  // ── Paso 7: cuotas del plan de pagos del mes (§4.8) ──────────────────────────────────
  //
  // La cuota descuenta en la tabla del libro donde quedó el préstamo (§4.9), que no siempre
  // es el que le toca hoy a la empleada: si pidió el préstamo antes de empezar a aportar, lo
  // sigue devolviendo contra el informal. Es lo que hace que el préstamo amortice dentro de su
  // propio libro, en vez de dejar un saldo que no baja nunca.
  //
  // Por eso una empleada sin aportes puede tener tabla formal con una sola línea, la cuota.
  for (const cuota of entrada.cuotasPlan) {
    lineas.push({
      tabla: cuota.libro,
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
      importe: redondearPesos(cuota.monto),
      signo: -1,
    })
  }

  // ── Paso 8: boletos (§6.4, §6.5) ─────────────────────────────────────────────────────
  //
  // El boleto no lleva BPS, pero viaja con el pago del trabajo que lo generó: los días del
  // régimen y los días que la empleada fue a hacer horas extras **con** BPS van en la tabla
  // formal, y los días cuyas horas extras son todas sin BPS, en la informal. Sin aporte a
  // BPS no hay tabla formal y los boletos del mes son una sola línea.
  //
  // Cada línea se emite solo si tiene días: un renglón de «0 días» por $0 no dice nada.
  let detalleBoletos = null

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
    const { diasATrabajar, diasExtraConBps, diasExtraSinBps } = detalleBoletos

    /** Un día de trabajo son dos boletos: ida y vuelta. */
    const lineaBoletos = (tabla: Libro, dias: number, diasExtra: number) => {
      const boletos = (dias + diasExtra) * 2
      if (boletos === 0) return

      const detalleDias =
        dias > 0 && diasExtra > 0
          ? `${formatearDias(dias)} + ${diasExtra} por horas extras`
          : diasExtra > 0
            ? `${formatearDias(diasExtra)} por horas extras`
            : formatearDias(dias)

      lineas.push({
        tabla,
        codigo: CODIGOS.BOLETOS,
        descripcion: `Boletos (${detalleDias}, ida y vuelta)`,
        cantidad: new Decimal(boletos),
        valorUnitario: valorBoleto,
        importe: redondearPesos(new Decimal(boletos).times(valorBoleto)),
        signo: 1,
      })
    }

    if (aportaBps) {
      lineaBoletos('FORMAL', diasATrabajar, diasExtraConBps)
    } else {
      lineaBoletos(tablaBase, diasATrabajar, diasExtraConBps + diasExtraSinBps)
    }
  }

  // ── Paso 9: horas extras sin BPS, al valor hora "en negro" (§6.6) ────────────────────
  const extrasSinBps = agruparPorRecargo(entrada.horasExtras.filter((h) => !h.conBps))

  for (const grupo of extrasSinBps) {
    const vhn = entrada.valorHoraNegro!
    const unitario = vhn.times(new Decimal(1).plus(new Decimal(grupo.recargoPct).dividedBy(100)))
    lineas.push({
      tabla: 'INFORMAL',
      codigo: CODIGOS.HORAS_EXTRAS_SIN_BPS,
      descripcion: descripcionDeHorasExtras(grupo.recargoPct),
      cantidad: grupo.horas,
      valorUnitario: unitario,
      importe: redondearPesos(grupo.horas.times(unitario)),
      signo: 1,
    })
  }

  // ── Paso 9 bis: los boletos de esas horas extras, atrás de ellas ─────────────────────
  //
  // Se emite después del paso 9 y no junto con los otros boletos, para que la tabla informal
  // se lea en orden: primero las horas que se fueron a hacer, después el viaje que costaron.
  if (detalleBoletos && aportaBps) {
    const boletos = detalleBoletos.diasExtraSinBps * 2
    if (boletos > 0) {
      const valorBoleto = entrada.valorBoleto!
      lineas.push({
        tabla: 'INFORMAL',
        codigo: CODIGOS.BOLETOS,
        descripcion: `Boletos (${formatearDias(detalleBoletos.diasExtraSinBps)} por horas extras, ida y vuelta)`,
        cantidad: new Decimal(boletos),
        valorUnitario: valorBoleto,
        importe: redondearPesos(new Decimal(boletos).times(valorBoleto)),
        signo: 1,
      })
    }
  }

  // ── Paso 10: pagos adicionales, sin descuentos de ningún tipo (§4.7) ─────────────────
  //
  // Al final de su tabla, por decisión del usuario: es lo último que se agrega al pago.
  for (const pago of entrada.pagosAdicionales) {
    lineas.push({
      tabla: tablaBase,
      codigo: CODIGOS.PAGO_ADICIONAL,
      descripcion: pago.concepto ? `Pago adicional: ${pago.concepto}` : 'Pago adicional',
      cantidad: null,
      valorUnitario: null,
      importe: redondearPesos(pago.monto),
      signo: 1,
    })
  }

  // ── Paso 11: un total a pagar por tabla ──────────────────────────────────────────────
  //
  // Cada total es la suma **con signo** de las líneas de su tabla. Las de signo 0 —materia
  // gravada y subtotal— no suman: son informativas, y su importe ya está en las líneas que
  // las componen.
  const sumarTabla = (tabla: Libro) =>
    lineas
      .filter((l) => l.tabla === tabla)
      .reduce((acc, l) => acc.plus(l.importe.times(l.signo)), new Decimal(0))

  const totalRecalculadoFormal = sumarTabla('FORMAL')
  const totalRecalculadoInformal = sumarTabla('INFORMAL')

  // Cada tabla cierra en su total si tiene alguna línea. La formal existe siempre que la
  // empleada aporte —como mínimo tiene el salario base— y también, sin aportes, cuando queda
  // una cuota de un préstamo formal. La informal, solo si algo cayó en ella.
  for (const tabla of ['FORMAL', 'INFORMAL'] as const) {
    if (!lineas.some((l) => l.tabla === tabla)) continue
    lineas.push({
      tabla,
      codigo: CODIGOS.TOTAL,
      descripcion: 'Total a pagar',
      cantidad: null,
      valorUnitario: null,
      importe: tabla === 'FORMAL' ? totalRecalculadoFormal : totalRecalculadoInformal,
      signo: 0,
      destacada: true,
    })
  }

  const totalRecalculado = totalRecalculadoFormal.plus(totalRecalculadoInformal)

  // §6.9 / §13.1 — la liquidación del mes de egreso está incompleta hasta que se especifique
  // el cálculo del despido y de la licencia no gozada.
  if (
    empleado.fechaEgreso &&
    empleado.fechaEgreso.getTime() >= primerDiaDelMes(periodo).getTime() &&
    empleado.fechaEgreso.getTime() <= ultimoDiaDelMes(periodo).getTime()
  ) {
    avisos.push('Liquidación final: falta calcular despido y licencia no gozada.')
  }

  /*
    §7.6.1 — lo que se paga en cada libro es su recalculado menos lo ya liquidado **de ese
    libro**. Así una complementaria que solo cambia el informal da diferencia cero en el
    formal, y el asiento del libro ya pagado no se toca.
  */
  const totalAPagarFormal = totalRecalculadoFormal.minus(entrada.totalYaLiquidadoFormal)
  const totalAPagarInformal = totalRecalculadoInformal.minus(entrada.totalYaLiquidadoInformal)
  const totalYaLiquidado = entrada.totalYaLiquidadoFormal.plus(entrada.totalYaLiquidadoInformal)
  const totalAPagar = totalAPagarFormal.plus(totalAPagarInformal)

  /**
   * El `orden` se asigna acá: numera la tabla formal y sigue con la informal. Es el orden de
   * presentación y el que se persiste, así que las líneas se releen siempre igual (§4.14).
   */
  const ordenadas: LineaLiquidacion[] = [
    ...lineas.filter((l) => l.tabla === 'FORMAL'),
    ...lineas.filter((l) => l.tabla === 'INFORMAL'),
  ].map((linea, i) => ({ ...linea, orden: i + 1 }))

  return {
    periodo,
    lineas: ordenadas,
    valorHoraCalculado: vhc,
    factorProrrateo: prorrateo.factor,
    diasConVinculo: prorrateo.diasConVinculo,
    diasDelMes: prorrateo.diasDelMes,
    materiaGravada,
    totalDescuentosBps,
    subtotal,
    boletos: detalleBoletos,
    totalRecalculadoFormal,
    totalRecalculadoInformal,
    totalRecalculado,
    totalYaLiquidadoFormal: entrada.totalYaLiquidadoFormal,
    totalYaLiquidadoInformal: entrada.totalYaLiquidadoInformal,
    totalYaLiquidado,
    totalAPagarFormal,
    totalAPagarInformal,
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
