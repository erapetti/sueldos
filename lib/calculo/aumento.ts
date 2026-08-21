/**
 * §7.8 — aumento masivo de sueldos.
 *
 * El criterio del gobierno está **pendiente de definición** (§13.4): falta resolver qué
 * parámetros entran (IPC, porcentaje por franja salarial, correctivo, tope). Hasta entonces
 * la pantalla muestra "funcionalidad no implementada aún".
 *
 * La parte transaccional del caso de uso sí está resuelta en `actions/aumento.ts`: dado el
 * salario nuevo de cada empleado, inserta el registro de salario y el de valor hora "en
 * negro" con la misma fecha de vigencia y el mismo porcentaje de aumento.
 */
export const AUMENTO_NO_IMPLEMENTADO =
  'El criterio del aumento de sueldos está pendiente de definición (SPECS §13.4).'
