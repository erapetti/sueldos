/**
 * Anexo A — Códigos de seguro de salud.
 * Tabla fija: no es editable por el usuario.
 */
export const SEGUROS_SALUD = [
  { codigo: '1', descripcion: 'Beneficiarios con hijos sin cónyuge o concubino a cargo' },
  { codigo: '2', descripcion: 'Con afiliación mutual por otra empresa con hijos sin cónyuge o concubino a cargo' },
  { codigo: '3', descripcion: 'Sin Fonasa, ni prestaciones de actividad (ex seguro convencional)' },
  { codigo: '4', descripcion: 'Otro (cobertura externa o socio vitalicio de mutualistas)' },
  { codigo: '5', descripcion: 'Acumulación de actividades con hijos menores/discapacitado a cargo (complemento de cuota porcentual)' },
  { codigo: '6', descripcion: 'Empleado en subsidio (enfermedad, maternidad, desempleo)' },
  { codigo: '7', descripcion: 'Empleado en subsidio a cargo del Seguro Convencional o Caja de Auxilio' },
  { codigo: '8', descripcion: 'Empleado amparado al Banco de Seguros del Estado (indemnizado)' },
  { codigo: '9', descripcion: 'Contribuyente no beneficiario de afiliación mutual (Socios de sociedades personales, patronos de unipersonal con más de un empleado, sin cuota mutual por cumplir menos de 13 jornales o percibir menos de 1,25 BPC)' },
  { codigo: '10', descripcion: 'Contribuyente rural hasta 500 hás., con hijos sin cónyuge o concubino a cargo' },
  { codigo: '11', descripcion: 'Afiliación Mutual por Convenio' },
  { codigo: '12', descripcion: 'Cobertura por MSP - Decreto 231/2003' },
  { codigo: '14', descripcion: 'Afiliados sin beneficios de actividad' },
  { codigo: '15', descripcion: 'Beneficiarios SIN hijos SIN cónyuge o concubino a cargo' },
  { codigo: '16', descripcion: 'Beneficiarios CON hijos CON cónyuge o concubino a cargo' },
  { codigo: '17', descripcion: 'Beneficiarios SIN hijos CON cónyuge o concubino a cargo' },
  { codigo: '18', descripcion: 'Contribuyente rural hasta 500 has sin hijos sin cónyuge o concubino a cargo' },
  { codigo: '19', descripcion: 'Contribuyente rural hasta 500 has con hijos y cónyuge o concubino a cargo' },
  { codigo: '20', descripcion: 'Contribuyente rural hasta 500 has sin hijos con cónyuge o concubino a cargo' },
  { codigo: '21', descripcion: 'Socios vitalicios con hijos sin cónyuge o concubino a cargo' },
  { codigo: '22', descripcion: 'Socios vitalicios sin hijos sin cónyuge o concubino a cargo' },
  { codigo: '23', descripcion: 'Socios vitalicios con hijos y cónyuge o concubino a cargo' },
  { codigo: '24', descripcion: 'Socios vitalicios sin hijos con cónyuge o concubino a cargo' },
  { codigo: '25', descripcion: 'Acumulación de actividades, sin hijos a cargo' },
  { codigo: '26', descripcion: 'Acumulación de actividades con hijos y cónyuge o concubino a cargo' },
  { codigo: '27', descripcion: 'Acumulación de actividades sin hijos con cónyuge o concubino a cargo' },
  { codigo: '28', descripcion: 'Con afiliación mutual por otra empresa, sin hijos sin cónyuge o concubino a cargo' },
  { codigo: '29', descripcion: 'Con afiliación mutual por otra empresa con hijos y cónyuge o concubino a cargo' },
  { codigo: '30', descripcion: 'Con afiliación mutual por otra empresa sin hijos con cónyuge o concubino a cargo' },
  { codigo: '42', descripcion: 'Servicios personales sin SNIS con prestaciones actividad (Alta cód. vigencia 01/2012)' },
  { codigo: '99', descripcion: 'Tributa SNS por Servicio Personal' },
] as const

export type CodigoSeguroSalud = (typeof SEGUROS_SALUD)[number]['codigo']

export const CODIGOS_SEGURO_SALUD = SEGUROS_SALUD.map((s) => s.codigo) as readonly string[]

export function descripcionSeguroSalud(codigo: string | null | undefined): string | null {
  if (!codigo) return null
  return SEGUROS_SALUD.find((s) => s.codigo === codigo)?.descripcion ?? null
}
