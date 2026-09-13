/**
 * Ajustes que la aplicación le agrega a `DATABASE_URL` antes de abrir el pool.
 *
 * Vive aparte de `prisma.ts` —que instancia el cliente al importarse— para poder probarlo sin
 * levantar una conexión.
 */

/** Sin red en el medio: el tráfico no sale de la máquina. */
function esLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function urlDeConexion(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }

  /*
    UTC. Todas las fechas de negocio son `DATE` y se manejan como medianoche UTC (ver
    lib/format/dates), así que ninguna conversión de zona debe intervenir entre la base y la
    aplicación. `America/Montevideo` solo se usa para saber qué día es hoy.
  */
  if (!u.searchParams.has('timezone')) u.searchParams.set('timezone', 'Z')

  /*
    MySQL 8 autentica con `caching_sha2_password`. Sobre TCP sin TLS, la primera autenticación
    de un usuario **después de cada arranque del servidor** necesita la clave pública RSA del
    servidor para cifrar la contraseña; recién ahí MySQL guarda el hash en su caché y las
    conexiones siguientes usan el camino rápido, sin RSA.

    El conector de MariaDB no le pide esa clave al servidor salvo que se lo autoricen, porque
    en una red hostil el intercambio se puede interceptar. Sin autorizarlo, la aplicación queda
    rota **después de cada reinicio de MySQL** —una actualización automática alcanza— hasta que
    alguien se conecte por el socket Unix, que no necesita RSA y llena la caché. Eso hace que
    el síntoma parezca intermitente y sin causa: el `mysql` de la consola entra siempre.

    El fallo tampoco se explica solo: el pool reintenta y lo informa como
    `pool timeout: failed to retrieve a connection from pool`, con el motivo real escondido en
    la causa del error. Ver `scripts/diag-db.mjs`.

    Se habilita **solo contra loopback**, que es donde el ataque del que protege no existe. Con
    la base en otra máquina hay que resolverlo con TLS o con `cachingRsaPublicKey`, y para eso
    la opción tiene que ponerse a mano en la cadena de conexión.
  */
  if (esLoopback(u.hostname) && !u.searchParams.has('allowPublicKeyRetrieval')) {
    u.searchParams.set('allowPublicKeyRetrieval', 'true')
  }

  return u.toString()
}
