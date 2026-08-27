/**
 * Los dos listados de personal: «Mi Personal» (§8.3) y «Todo el Personal» (§8.7).
 *
 * Son las dos opciones «Generales» del menú (§8.1) y el destino del breadcrumb del encabezado
 * de la empleada. El breadcrumb tiene que decir **exactamente** lo que dice el menú de donde
 * se vino, así que la etiqueta y la ruta se deciden acá y no en cada pantalla.
 */
export type ListadoDePersonal = 'MI_PERSONAL' | 'TODO_EL_PERSONAL'

export const LISTADOS_DE_PERSONAL = {
  MI_PERSONAL: { etiqueta: 'Mi Personal', ruta: '/empleados' },
  TODO_EL_PERSONAL: { etiqueta: 'Todo el Personal', ruta: '/empleados/todos' },
} as const satisfies Record<ListadoDePersonal, { etiqueta: string; ruta: string }>
