/**
 * §7.12 — control de acceso de los endpoints `/api/cron/*`.
 *
 * Estos endpoints no pasan por oauth2-proxy y quedan fuera de la validación de §3.2. En su
 * lugar el SPECS pide dos condiciones a la vez: que la conexión venga de loopback y que el
 * header `X-Cron-Token` coincida con `CRON_TOKEN`. Si falta cualquiera de las dos, la
 * respuesta es **404** sin procesar nada: un 401 o un 403 confirmarían que el endpoint
 * existe.
 *
 * **Cómo se garantiza el loopback.** Next.js no expone la dirección del socket a los route
 * handlers: lo único disponible es `x-forwarded-for`, que Next completa a partir de la
 * conexión pero **respeta si el cliente ya lo mandó**, o sea que es falsificable. Por eso la
 * condición de loopback se hace cumplir en el borde, no acá:
 *
 *   el proceso escucha únicamente en 127.0.0.1 (`next start --hostname 127.0.0.1`)
 *
 * Con eso, toda conexión que llega es por definición local, que es exactamente lo que pide
 * el SPECS. La unidad de systemd del README lo deja configurado así, y es un requisito del
 * deploy, no una opción.
 *
 * La verificación de `x-forwarded-for` que hace este módulo es una segunda línea de defensa:
 * atrapa el caso de que alguien ponga un proxy delante y le reenvíe tráfico externo a
 * `/api/cron/`. No reemplaza al bind.
 */
import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'])

/**
 * Normaliza la dirección quitándole el puerto y los corchetes de IPv6. Hay que distinguir el
 * `:` separador de puerto del `:` interno de una IPv6: `::1` no lleva puerto, `[::1]:54321`
 * sí, y `127.0.0.1:8080` también.
 */
function soloDireccion(valor: string): string {
  const texto = valor.trim()

  // IPv6 entre corchetes, con o sin puerto: [::1] o [::1]:54321
  if (texto.startsWith('[')) {
    const cierre = texto.indexOf(']')
    return cierre === -1 ? texto.slice(1) : texto.slice(1, cierre)
  }

  // IPv6 desnuda: tiene más de un `:` y ningún puerto que separar.
  if (texto.indexOf(':') !== texto.lastIndexOf(':')) return texto

  // IPv4 con puerto: 127.0.0.1:8080
  const separador = texto.lastIndexOf(':')
  if (separador > 0 && /^\d+$/.test(texto.slice(separador + 1))) {
    return texto.slice(0, separador)
  }

  return texto
}

export function esLoopback(direccion: string | null): boolean {
  if (!direccion) return false
  // De una cadena de proxies interesa el primer salto: el cliente original.
  const primera = direccion.split(',')[0]
  return LOOPBACK.has(soloDireccion(primera))
}

function comparacionConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export type ResultadoCronAuth = { ok: true } | { ok: false; motivo: string }

export function verificarAccesoCron(request: NextRequest): ResultadoCronAuth {
  const token = process.env.CRON_TOKEN
  if (!token) return { ok: false, motivo: 'CRON_TOKEN no está definido' }

  const recibido = request.headers.get('x-cron-token')
  if (!recibido || !comparacionConstante(recibido, token)) {
    return { ok: false, motivo: 'token inválido' }
  }

  // Si el header no vino, la única garantía es el bind a 127.0.0.1; si vino, tiene que ser
  // de loopback.
  const reportada = request.headers.get('x-forwarded-for')
  if (reportada !== null && !esLoopback(reportada)) {
    return { ok: false, motivo: 'origen no local' }
  }

  return { ok: true }
}
