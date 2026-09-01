/**
 * Los límites del vínculo (`lib/validacion/vinculo.ts`): la regla que comparten las acciones
 * que registran novedades y los diálogos que las ofrecen.
 */
import { describe, expect, it } from 'vitest'
import { fechaEnElVinculo, topeConElEgreso, type Vinculo } from '@/lib/validacion/vinculo'

const carla: Vinculo = { fechaIngreso: '2026-03-10', fechaEgreso: '2026-08-14' }
const ana: Vinculo = { fechaIngreso: '2026-01-01', fechaEgreso: null }

describe('fechaEnElVinculo', () => {
  it('el día del medio está adentro', () => {
    expect(fechaEnElVinculo('2026-05-20', carla)).toBe('OK')
  })

  // Los dos extremos son días trabajados: el vínculo los incluye.
  it('el día de ingreso y el de egreso están adentro', () => {
    expect(fechaEnElVinculo('2026-03-10', carla)).toBe('OK')
    expect(fechaEnElVinculo('2026-08-14', carla)).toBe('OK')
  })

  it('la víspera del ingreso está afuera', () => {
    expect(fechaEnElVinculo('2026-03-09', carla)).toBe('ANTES_DEL_INGRESO')
  })

  /* El agujero que motivó la tarea: la hora extra del día siguiente al cese se pagaba. */
  it('el día siguiente al egreso está afuera', () => {
    expect(fechaEnElVinculo('2026-08-15', carla)).toBe('POSTERIOR_AL_EGRESO')
  })

  it('sin egreso no hay techo', () => {
    expect(fechaEnElVinculo('2030-12-31', ana)).toBe('OK')
    expect(fechaEnElVinculo('2025-12-31', ana)).toBe('ANTES_DEL_INGRESO')
  })

  /*
    Comparar como texto es lo que hace que el fin de año o el cambio de mes no dependan de la
    zona horaria: `'2026-09-01' > '2026-08-31'` sin construir una sola fecha.
  */
  it('el cruce de mes y de año se resuelve como texto', () => {
    expect(fechaEnElVinculo('2026-08-31', carla)).toBe('POSTERIOR_AL_EGRESO')
    expect(fechaEnElVinculo('2026-02-28', carla)).toBe('ANTES_DEL_INGRESO')
  })
})

describe('topeConElEgreso', () => {
  it('con el egreso antes del tope propio del campo, gana el egreso', () => {
    expect(topeConElEgreso('2026-09-01', carla)).toBe('2026-08-14')
  })

  it('con el egreso después, el campo conserva su tope', () => {
    expect(topeConElEgreso('2026-05-01', carla)).toBe('2026-05-01')
  })

  it('sin egreso no recorta nada', () => {
    expect(topeConElEgreso('2026-09-01', ana)).toBe('2026-09-01')
  })
})
