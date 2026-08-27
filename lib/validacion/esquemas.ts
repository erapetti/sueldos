/**
 * Esquemas zod compartidos entre el formulario (react-hook-form) y el servidor (§2).
 *
 * El servidor **siempre** vuelve a validar con el mismo esquema: la validación del cliente
 * es comodidad, no control.
 */
import { z } from 'zod'
import { CODIGOS_SEGURO_SALUD } from '@/constants/segurosSalud'
import { RECARGOS } from '@/constants/recargos'
import { dia, hoy, parseFechaISO } from '@/lib/format/dates'

// ── Primitivos ───────────────────────────────────────────────────────────────

/** Fecha de negocio en formato `AAAA-MM-DD`, tal como viaja en los formularios. */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((v) => !Number.isNaN(parseFechaISO(v).getTime()), 'Fecha inválida')

/** Período en formato `AAAA-MM`. */
export const periodoISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Período inválido')

/** §5.1 — toda fecha de vigencia es el día 1 de un mes. */
export const fechaVigenciaISO = fechaISO.refine(
  (v) => dia(parseFechaISO(v)) === 1,
  'La vigencia tiene que ser el primer día de un mes',
)

/** Importe que llega como texto del formulario. */
export const importe = z
  .string()
  .trim()
  .regex(/^\d{1,12}([.,]\d{1,2})?$/, 'Importe inválido')
  .transform((v) => v.replace(',', '.'))

export const importePositivo = importe.refine((v) => Number(v) > 0, 'Tiene que ser mayor que cero')

/** Cantidad de horas: múltiplo de 0,5. */
export const horasMultiploMedio = z
  .number()
  .positive('Tiene que ser mayor que cero')
  .refine((v) => Number.isInteger(v * 2), 'Las horas se cargan de a media hora')

/**
 * §6.5 — las horas extras admiten el cero. Un renglón en cero no paga nada: marca que ese día
 * fue a trabajar, que es lo que hace que el día entre en el cálculo de boletos.
 */
export const horasCeroOMultiploMedio = z
  .number()
  .min(0, 'No puede ser negativo')
  .refine((v) => Number.isInteger(v * 2), 'Las horas se cargan de a media hora')

export const idUuid = z.string().min(1, 'Falta el identificador')

/** No posterior a hoy (§6.11). */
export const fechaNoFutura = fechaISO.refine(
  (v) => parseFechaISO(v).getTime() <= hoy().getTime(),
  'La fecha no puede ser posterior a hoy',
)

// ── §4.2 empleados ───────────────────────────────────────────────────────────

/**
 * Dígito verificador de la cédula uruguaya. Se valida solo si viene informada (§4.2).
 */
export function cedulaValida(cedula: string): boolean {
  const digitos = cedula.replace(/\D/g, '')
  if (digitos.length < 7 || digitos.length > 8) return false

  const cuerpo = digitos.slice(0, -1).padStart(7, '0')
  const verificador = Number(digitos.slice(-1))
  const pesos = [2, 9, 8, 7, 6, 3, 4]

  const suma = cuerpo
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * pesos[i], 0)
  const esperado = (10 - (suma % 10)) % 10

  return esperado === verificador
}

export const datosEmpleado = z.object({
  alias: z.string().trim().min(1, 'El alias es obligatorio').max(40, 'Máximo 40 caracteres'),
  nombreCompleto: z
    .string()
    .trim()
    .min(1, 'El nombre completo es obligatorio')
    .max(120, 'Máximo 120 caracteres'),
  banco: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  // Opcional. Hay bancos que numeran cuenta-subcuenta, así que se admite el guion
  // como separador: no al principio ni al final, y sin guiones consecutivos.
  cuenta: z
    .string()
    .trim()
    .max(32, 'Máximo 32 caracteres')
    .regex(
      /^([A-Za-z0-9]+(-[A-Za-z0-9]+)*)?$/,
      'La cuenta es alfanumérica; el guion solo separa cuenta de subcuenta',
    )
    .optional(),
  fechaIngreso: fechaNoFutura,
  cobraBoletos: z.boolean(),
  celular: z.string().trim().max(60).optional().or(z.literal('')),
  direccion: z.string().trim().max(255).optional().or(z.literal('')),
  cedula: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || cedulaValida(v), 'El dígito verificador de la cédula no cierra'),
})

/**
 * §4.2.2 — el alta crea el empleado y los cuatro primeros registros de serie en una
 * transacción, todos con vigencia el 1° del mes de `fechaIngreso`.
 *
 * El aporte a BPS y el seguro de salud entran acá y no en `datosEmpleado` porque no son
 * columnas de `empleados`: son el primer registro de su serie (§4.4.1).
 */
export const altaEmpleado = datosEmpleado.extend({
  aportaBps: z.boolean(),
  seguroSalud: z
    .enum(CODIGOS_SEGURO_SALUD as [string, ...string[]])
    .nullable()
    .optional(),
  salario: importePositivo,
  horasSemanales: z
    .number()
    .positive('Tiene que ser mayor que cero')
    .max(60, 'No puede superar las 60 horas'),
  valorHoraNegro: importePositivo,
  regimen: z.object({
    lunes: z.number().min(0).max(24),
    martes: z.number().min(0).max(24),
    miercoles: z.number().min(0).max(24),
    jueves: z.number().min(0).max(24),
    viernes: z.number().min(0).max(24),
    sabado: z.number().min(0).max(24),
    domingo: z.number().min(0).max(24),
  }),
})

export const bajaEmpleado = z.object({
  empleadoId: idUuid,
  fechaEgreso: fechaISO,
})

// ── §4.3 / §4.3.1 / §4.4 / §4.4.1 series del empleado ────────────────────────

export const nuevoSalario = z.object({
  empleadoId: idUuid,
  salario: importePositivo,
  horasSemanales: z.number().positive().max(60),
  fechaVigencia: fechaVigenciaISO,
  reemplazar: z.boolean().default(false),
})

export const nuevoValorHoraNegro = z.object({
  empleadoId: idUuid,
  valor: importePositivo,
  fechaVigencia: fechaVigenciaISO,
  reemplazar: z.boolean().default(false),
})

export const nuevoAporteBps = z.object({
  empleadoId: idUuid,
  fechaVigencia: fechaVigenciaISO,
  aportaBps: z.boolean(),
  /** Solo tiene efecto si se aporta (§4.2); la acción lo guarda en `null` si no. */
  seguroSalud: z
    .enum(CODIGOS_SEGURO_SALUD as [string, ...string[]])
    .nullable()
    .optional(),
  reemplazar: z.boolean().default(false),
})

const horasDelDia = z
  .number()
  .min(0, 'No puede ser negativo')
  .max(24, 'No puede superar las 24 horas')
  .refine((v) => Number.isInteger(v * 2), 'Las horas se cargan de a media hora')

export const nuevoRegimen = z.object({
  empleadoId: idUuid,
  fechaVigencia: fechaVigenciaISO,
  lunes: horasDelDia,
  martes: horasDelDia,
  miercoles: horasDelDia,
  jueves: horasDelDia,
  viernes: horasDelDia,
  sabado: horasDelDia,
  domingo: horasDelDia,
  reemplazar: z.boolean().default(false),
})

// ── §4.5 / §4.6 / §4.7 novedades ─────────────────────────────────────────────

export const renglonHoraExtra = z.object({
  id: idUuid.optional(),
  fecha: fechaISO,
  horas: horasCeroOMultiploMedio,
  conBps: z.boolean(),
  recargoPct: z.union(
    RECARGOS.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<number>, z.ZodLiteral<number>],
  ),
  nota: z.string().trim().max(500).optional().or(z.literal('')),
})

export const loteHorasExtras = z.object({
  empleadoId: idUuid,
  periodo: periodoISO,
  renglones: z.array(renglonHoraExtra),
  /** Ids de renglones ya guardados que hay que borrar en el mismo lote. */
  borrar: z.array(idUuid).default([]),
})

export const CAUSALES = [
  'CON_AVISO',
  'SIN_AVISO',
  'ENFERMEDAD',
  'MATERNIDAD',
  'RECUPERA_OTRO_DIA',
] as const

export const renglonFalta = z.object({
  id: idUuid.optional(),
  fecha: fechaISO,
  horas: horasMultiploMedio,
  causal: z.enum(CAUSALES),
  descuenta: z.boolean(),
  nota: z.string().trim().max(500).optional().or(z.literal('')),
})

export const loteFaltas = z.object({
  empleadoId: idUuid,
  periodo: periodoISO,
  renglones: z.array(renglonFalta),
  borrar: z.array(idUuid).default([]),
})

export const pagoAdicional = z.object({
  empleadoId: idUuid,
  id: idUuid.optional(),
  fecha: fechaNoFutura,
  monto: importePositivo,
  concepto: z.string().trim().max(255).optional().or(z.literal('')),
})

// ── §7.4 / §7.5 cuenta corriente ─────────────────────────────────────────────

export const prestamo = z
  .object({
    empleadoId: idUuid,
    fecha: fechaNoFutura,
    monto: importePositivo,
    concepto: z.string().trim().max(255).optional().or(z.literal('')),
    conPlan: z.boolean(),
    cuotas: z
      .array(z.object({ fecha: fechaVigenciaISO, monto: importePositivo }))
      .default([]),
  })
  .refine((v) => !v.conPlan || v.cuotas.length > 0, {
    message: 'Definí al menos una cuota o marcá "sin plan de pagos"',
    path: ['cuotas'],
  })

/**
 * Lo único editable de un movimiento ya registrado —préstamo, pago bancario, pago adicional—:
 * el concepto. La fecha y el monto no se tocan, y es la misma regla en los tres. En los
 * asientos, porque el movimiento ya está en su libro (§4.9) y corregirlo sería mover un saldo
 * hacia atrás; en el pago adicional, porque su mes ya puede estar liquidado (§6.11). El camino
 * para corregirlos es anular —o borrar— y registrar de nuevo.
 */
export const edicionConcepto = z.object({
  id: idUuid,
  concepto: z.string().trim().max(255).optional().or(z.literal('')),
})

/** §4.9 — el libro al que va el movimiento. */
export const libro = z.enum(['FORMAL', 'INFORMAL'])

export const pagoBancario = z.object({
  empleadoId: idUuid,
  fecha: fechaNoFutura,
  monto: importePositivo,
  libro,
  concepto: z.string().trim().min(1, 'El concepto es obligatorio').max(255),
  liquidacionId: idUuid.nullable().optional(),
})

export const ajusteCuentaCorriente = z.object({
  empleadoId: idUuid,
  fecha: fechaNoFutura,
  monto: importePositivo,
  libro,
  lado: z.enum(['DEBE', 'HABER']),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio').max(255),
})

// ── §7.11 licencia ───────────────────────────────────────────────────────────

export const registrarLicencia = z
  .object({
    empleadoId: idUuid,
    fechaDesde: fechaISO,
    fechaHasta: fechaISO,
    nota: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((v) => parseFechaISO(v.fechaHasta) >= parseFechaISO(v.fechaDesde), {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['fechaHasta'],
  })

// ── §7.6 liquidación ─────────────────────────────────────────────────────────

export const confirmarLiquidacion = z.object({
  empleadoId: idUuid,
  periodo: periodoISO,
  /** Confirmación explícita del diálogo de §7.6.1 antes de generar una complementaria. */
  aceptaComplementaria: z.boolean().default(false),
})

export const anularLiquidacion = z.object({
  liquidacionId: idUuid,
})

// ── §7.9 parámetros de administrador ─────────────────────────────────────────

export const nuevoValorBoleto = z.object({
  monto: importePositivo,
  fechaVigencia: fechaVigenciaISO,
  reemplazar: z.boolean().default(false),
})

export const nuevoFeriado = z.object({
  fecha: fechaISO,
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria').max(120),
  noLaborable: z.boolean(),
})

export const nuevoConceptoBps = z.object({
  concepto: z.string().trim().min(1, 'El concepto es obligatorio').max(80),
  /** `null` da de baja el concepto desde esa vigencia (§7.9). */
  porcentaje: z
    .string()
    .trim()
    .regex(/^\d{1,3}([.,]\d{1,4})?$/, 'Porcentaje inválido')
    .transform((v) => v.replace(',', '.'))
    .nullable(),
  seguroSalud: z
    .enum(CODIGOS_SEGURO_SALUD as [string, ...string[]])
    .nullable(),
  fechaVigencia: fechaVigenciaISO,
  reemplazar: z.boolean().default(false),
})

// ── §3.4 usuarios y compartir ────────────────────────────────────────────────

export const altaUsuario = z.object({
  email: z.email('Email inválido').transform((v) => v.trim().toLowerCase()),
  nombre: z.string().trim().max(255).optional().or(z.literal('')),
  esAdmin: z.boolean().default(false),
})

export const modificarUsuario = z.object({
  usuarioId: idUuid,
  nombre: z.string().trim().max(255).optional().or(z.literal('')),
  esAdmin: z.boolean(),
  activo: z.boolean(),
})

export const bajaUsuario = z.object({
  usuarioId: idUuid,
  /** Nuevo dueño de todos sus empleados; obligatorio si tiene alguno (§3.4). */
  nuevoDuenoId: idUuid.nullable().optional(),
})

export const compartirEmpleado = z.object({
  empleadoId: idUuid,
  usuarioId: idUuid,
  permiso: z.enum(['VER', 'EDITAR']),
})

export const dejarDeCompartir = z.object({
  empleadoId: idUuid,
  usuarioId: idUuid,
})

export const cambiarDueno = z.object({
  empleadoId: idUuid,
  nuevoDuenoId: idUuid,
})

export const cambiarVisibilidad = z.object({
  empleadoId: idUuid,
  visible: z.boolean(),
})

export type DatosEmpleado = z.infer<typeof datosEmpleado>
export type AltaEmpleado = z.infer<typeof altaEmpleado>
export type RenglonHoraExtra = z.infer<typeof renglonHoraExtra>
export type RenglonFalta = z.infer<typeof renglonFalta>
export type LoteHorasExtras = z.infer<typeof loteHorasExtras>
export type LoteFaltas = z.infer<typeof loteFaltas>
