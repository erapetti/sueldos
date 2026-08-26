/**
 * §8.3, §8.7 y §11 — listados de empleados.
 *
 * Los dos listados se resuelven en **una única consulta** cada uno, sin N+1. El estado
 * derivado (§4.2.3), que depende de las liquidaciones de dos períodos y de los pagos
 * vinculados, se calcula en esa misma consulta, no con una consulta por fila ni en el
 * cliente.
 */
import 'server-only'
import { Prisma } from '@/lib/db/generated/client'
import { prisma } from '@/lib/db/prisma'
import type { EstadoEmpleado } from '@/lib/calculo/estado'
import { DIA_UMBRAL_LIQUIDACION } from '@/lib/calculo/estado'
import { aISO, dia, hoy, primerDiaDelMes, sumarMeses } from '@/lib/format/dates'
import type { NivelAcceso } from '@/lib/auth/guards'

export type FilaEmpleado = {
  id: string
  alias: string
  nombreCompleto: string
  duenoId: string
  duenoNombre: string
  activo: boolean
  visible: boolean
  fechaIngreso: Date
  fechaEgreso: Date | null
  nivel: NivelAcceso
  estado: EstadoEmpleado
  /** Con quiénes está compartido, para §8.7. */
  compartidoCon: string[]
}

type FilaCruda = {
  id: string
  alias: string
  nombre_completo: string
  dueno_id: string
  dueno_nombre: string
  activo: number
  visible: number
  fecha_ingreso: Date
  fecha_egreso: Date | null
  nivel: string
  estado: string
  /** Array JSON: se agrega en SQL para no hacer una consulta por fila. */
  compartido_con: string | string[] | null
}

/**
 * El driver puede devolver la columna JSON ya parseada o como texto, según el servidor. Se
 * contemplan las dos formas.
 */
function leerNombres(valor: string | string[] | null): string[] {
  if (!valor) return []
  const lista: unknown = typeof valor === 'string' ? JSON.parse(valor) : valor
  if (!Array.isArray(lista)) return []
  return lista
    .filter((n): n is string => typeof n === 'string')
    .sort((a, b) => a.localeCompare(b, 'es'))
}

function mapear(fila: FilaCruda): FilaEmpleado {
  return {
    id: fila.id,
    alias: fila.alias,
    nombreCompleto: fila.nombre_completo,
    duenoId: fila.dueno_id,
    duenoNombre: fila.dueno_nombre,
    activo: Boolean(fila.activo),
    visible: Boolean(fila.visible),
    fechaIngreso: fila.fecha_ingreso,
    fechaEgreso: fila.fecha_egreso,
    nivel: fila.nivel as NivelAcceso,
    estado: fila.estado as EstadoEmpleado,
    compartidoCon: leerNombres(fila.compartido_con),
  }
}

/**
 * Estado derivado (§4.2.3), resuelto en SQL.
 *
 * El orden de la tabla es normativo: `falta_pago` gana sobre `falta_liquidacion`, y esta
 * sobre `Baja`. Los dos períodos que se miran (M0 y M-1) solo cuentan si el empleado tuvo
 * vínculo vigente en ese mes.
 */
function sqlEstado(m0: string, m1: string, diaDeHoy: number) {
  const mesIngreso = Prisma.sql`DATE_FORMAT(e.fecha_ingreso, '%Y-%m-01')`
  const mesEgreso = Prisma.sql`DATE_FORMAT(e.fecha_egreso, '%Y-%m-01')`

  const vinculoM0 = Prisma.sql`
    (${m0} >= ${mesIngreso} AND (e.fecha_egreso IS NULL OR ${m0} <= ${mesEgreso}))`
  const vinculoM1 = Prisma.sql`
    (${m1} >= ${mesIngreso} AND (e.fecha_egreso IS NULL OR ${m1} <= ${mesEgreso}))`

  return Prisma.sql`
    CASE
      WHEN liq.hay_impaga = 1 THEN 'FALTA_PAGAR'
      WHEN (${diaDeHoy} >= ${DIA_UMBRAL_LIQUIDACION} AND ${vinculoM0} AND COALESCE(liq.tiene_m0, 0) = 0)
        OR (${vinculoM1} AND COALESCE(liq.tiene_m1, 0) = 0)
        THEN 'FALTA_LIQUIDACION'
      WHEN e.fecha_egreso IS NOT NULL THEN 'BAJA'
      ELSE 'ACTIVO'
    END`
}

/**
 * Subconsulta agregada de liquidaciones por empleado: si hay liquidación confirmada de M0 y
 * de M-1, y si queda algo por pagar.
 *
 * §4.9 — «impaga» se mira **libro por libro**, igual que `estadoDePago`: una liquidación con el
 * sueldo formal ya transferido y las horas en negro pendientes sigue debiendo algo, así que la
 * empleada tiene que seguir apareciendo en «Falta pagar». Cuentan solo los libros con importe
 * positivo: una diferencia negativa se compensa contra el saldo de su libro, no con un pago.
 */
function sqlLiquidaciones(m0: string, m1: string) {
  return Prisma.sql`
    SELECT
      l.empleado_id,
      MAX(CASE WHEN l.tipo = 'MENSUAL' AND l.periodo = ${m0} THEN 1 ELSE 0 END) AS tiene_m0,
      MAX(CASE WHEN l.tipo = 'MENSUAL' AND l.periodo = ${m1} THEN 1 ELSE 0 END) AS tiene_m1,
      MAX(
        CASE
          WHEN l.total_a_pagar_formal > 0 AND COALESCE(pagos.pago_formal, 0) = 0 THEN 1
          WHEN l.total_a_pagar_informal > 0 AND COALESCE(pagos.pago_informal, 0) = 0 THEN 1
          ELSE 0
        END
      ) AS hay_impaga
    FROM liquidaciones l
    LEFT JOIN (
      SELECT
        liquidacion_id,
        MAX(libro = 'FORMAL')   AS pago_formal,
        MAX(libro = 'INFORMAL') AS pago_informal
      FROM cuenta_corriente
      WHERE tipo = 'PAGO' AND liquidacion_id IS NOT NULL
      GROUP BY liquidacion_id
    ) pagos ON pagos.liquidacion_id = l.id
    WHERE l.estado = 'CONFIRMADA'
    GROUP BY l.empleado_id`
}

/** Nombres de los usuarios con los que está compartido cada empleado, como array JSON. */
const SQL_COMPARTIDOS = Prisma.sql`
  SELECT
    p.empleado_id,
    JSON_ARRAYAGG(COALESCE(u.nombre, u.email)) AS nombres
  FROM empleado_permisos p
  JOIN usuarios u ON u.id = p.usuario_id
  GROUP BY p.empleado_id`

/**
 * §8.3 — empleados propios y compartidos con el usuario, **con `visible = true`**, en una
 * sola página ordenados por alias. Para un administrador el contenido es el mismo que para
 * cualquier usuario: los ajenos se ven en §8.7.
 */
export async function listarEmpleadosVisibles(usuarioId: string): Promise<FilaEmpleado[]> {
  const referencia = hoy()
  const m0 = aISO(primerDiaDelMes(referencia))
  const m1 = aISO(sumarMeses(primerDiaDelMes(referencia), -1))

  const filas = await prisma.$queryRaw<FilaCruda[]>`
    SELECT
      e.id,
      e.alias,
      e.nombre_completo,
      e.dueno_id,
      COALESCE(d.nombre, d.email) AS dueno_nombre,
      e.activo,
      e.visible,
      e.fecha_ingreso,
      e.fecha_egreso,
      CASE WHEN e.dueno_id = ${usuarioId} THEN 'DUENO' ELSE perm.permiso END AS nivel,
      ${sqlEstado(m0, m1, dia(referencia))} AS estado,
      comp.nombres AS compartido_con
    FROM empleados e
    JOIN usuarios d ON d.id = e.dueno_id
    LEFT JOIN empleado_permisos perm ON perm.empleado_id = e.id AND perm.usuario_id = ${usuarioId}
    LEFT JOIN (${sqlLiquidaciones(m0, m1)}) liq ON liq.empleado_id = e.id
    LEFT JOIN (${SQL_COMPARTIDOS}) comp ON comp.empleado_id = e.id
    WHERE e.visible = TRUE
      AND (e.dueno_id = ${usuarioId} OR perm.usuario_id IS NOT NULL)
    ORDER BY e.alias`

  return filas.map(mapear)
}

/**
 * §8.7 — todos los empleados accesibles, estén visibles o no.
 *
 *  - usuario común: los propios y los compartidos con él, incluidos los ocultos y los dados
 *    de baja;
 *  - administrador: además, todos los empleados del sistema.
 */
export async function listarTodosLosEmpleados(
  usuarioId: string,
  esAdmin: boolean,
): Promise<FilaEmpleado[]> {
  const referencia = hoy()
  const m0 = aISO(primerDiaDelMes(referencia))
  const m1 = aISO(sumarMeses(primerDiaDelMes(referencia), -1))

  // Un administrador ve todo; el resto, solo lo propio y lo compartido.
  const filtro = esAdmin
    ? Prisma.sql`TRUE`
    : Prisma.sql`(e.dueno_id = ${usuarioId} OR perm.usuario_id IS NOT NULL)`

  const filas = await prisma.$queryRaw<FilaCruda[]>`
    SELECT
      e.id,
      e.alias,
      e.nombre_completo,
      e.dueno_id,
      COALESCE(d.nombre, d.email) AS dueno_nombre,
      e.activo,
      e.visible,
      e.fecha_ingreso,
      e.fecha_egreso,
      CASE
        WHEN e.dueno_id = ${usuarioId} THEN 'DUENO'
        WHEN perm.permiso IS NOT NULL THEN perm.permiso
        ELSE 'ADMIN'
      END AS nivel,
      ${sqlEstado(m0, m1, dia(referencia))} AS estado,
      comp.nombres AS compartido_con
    FROM empleados e
    JOIN usuarios d ON d.id = e.dueno_id
    LEFT JOIN empleado_permisos perm ON perm.empleado_id = e.id AND perm.usuario_id = ${usuarioId}
    LEFT JOIN (${sqlLiquidaciones(m0, m1)}) liq ON liq.empleado_id = e.id
    LEFT JOIN (${SQL_COMPARTIDOS}) comp ON comp.empleado_id = e.id
    WHERE ${filtro}
    ORDER BY e.alias`

  return filas.map(mapear)
}
