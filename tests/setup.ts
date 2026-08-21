/**
 * Preparación de los tests de integración: las Server Actions importan APIs de Next que
 * fuera de una request no existen. Se reemplazan por stubs inertes.
 */
import 'dotenv/config'
import { vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T>(fn: T) => fn,
}))

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect(${destino})`)
  },
  notFound: () => {
    throw new Error('notFound()')
  },
}))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>()
  // `cache()` de React solo funciona dentro de un render; acá alcanza con la identidad.
  return { ...real, cache: <T>(fn: T) => fn }
})
