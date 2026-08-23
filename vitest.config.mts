import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const raiz = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    /**
     * El alias se declara acá y no se deduce del tsconfig a propósito.
     *
     * `tsconfig.json` excluye `tests/` para que un archivo de prueba no pueda romper el
     * build de producción (ver IMPLEMENTATION_HINTS.md §3), y esa exclusión también deja
     * los tests fuera de la resolución de `paths`. Declararlo explícitamente hace que el
     * alias no dependa de cómo esté recortado el tsconfig.
     */
    alias: {
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname,
      '@': raiz.replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Los tests de integración comparten una única base: no pueden correr en paralelo.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
