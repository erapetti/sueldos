import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Raíz para el rastreo de archivos del build.
   *
   * Por defecto Next sube por el árbol de directorios buscando un lockfile, como heurística
   * para detectar monorepos. En este deploy la app vive en el home del usuario, así que si
   * queda un `package-lock.json` suelto en un directorio padre —por ejemplo, de un
   * `npm install` corrido por error fuera del proyecto— Next lo encuentra, lo descarta por
   * estar fuera del repo y avisa en cada arranque.
   *
   * Fijarla en el directorio del proyecto hace que el rastreo sea determinístico y no
   * dependa de lo que haya alrededor.
   */
  outputFileTracingRoot: path.resolve(import.meta.dirname),
}

export default nextConfig
