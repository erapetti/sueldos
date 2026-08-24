/**
 * §3.2 — seguridad del borde.
 *
 * (Next.js 16 llama `proxy.ts` a lo que hasta la versión 15 era `middleware.ts`. No tiene
 * relación con oauth2-proxy: es el interceptor de requests del framework.)
 *
 * Confiar en headers de identidad es seguro solo si nadie puede llegar a la aplicación sin
 * pasar por oauth2-proxy. Además de no exponer el puerto al exterior, la app exige el header
 * secreto compartido `X-Proxy-Auth`. Si falta o no coincide con `PROXY_SHARED_SECRET`,
 * responde **403** sin procesar nada.
 *
 * El prefijo `/api/cron/` queda excluido: tiene su propio control de acceso (§7.12) y no
 * pasa por el proxy.
 */
import { NextResponse, type NextRequest } from 'next/server'

const PREFIJO_CRON = '/api/cron/'

/** Comparación de longitud constante, sin depender de módulos de Node (corre en el edge). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferencia === 0
}

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(PREFIJO_CRON)) {
    return NextResponse.next()
  }

  const esperado = process.env.PROXY_SHARED_SECRET

  // En desarrollo se puede trabajar sin proxy delante mientras no se defina el secreto.
  if (!esperado) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    return new NextResponse('Forbidden', { status: 403 })
  }

  const recibido = request.headers.get('x-proxy-auth')
  if (!recibido || !iguales(recibido, esperado)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  /**
   * Se excluyen los assets estáticos: no llevan datos y no vale la pena el costo por request.
   *
   * Los iconos y el manifest están en la lista porque el navegador los pide **sin sesión**.
   * El manifest es el caso que obliga: se busca con `credentials: omit`, así que detrás de
   * oauth2-proxy llega sin cookie. Los iconos aparecen además en contextos donde todavía no
   * hay sesión, como la propia pantalla de login.
   *
   * Sacarlos del control no debilita el §3.2: devuelven bytes estáticos y no leen ningún
   * header de identidad. Quién puede alcanzarlos se sigue decidiendo en el borde —el proceso
   * escucha solo en 127.0.0.1—, no acá.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon1\\.png|icon2\\.png|apple-icon\\.png|manifest\\.webmanifest).*)',
  ],
}
