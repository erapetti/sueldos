/**
 * Reproduce la conexión igual que la app y muestra la causa real, que el log de Next trunca
 * como `[cause]: [Object]`.
 *
 * Se corre desde el directorio del proyecto en el servidor:
 *     node diag-db.mjs
 *
 * Si no hay DATABASE_URL en el entorno, la toma del proceso del servicio, así prueba
 * exactamente la misma cadena que usa la aplicación y no una tipeada a mano.
 */
import { execSync } from 'node:child_process'
import mariadb from 'mariadb'

function urlDelServicio() {
  try {
    const pid = execSync('systemctl show -p MainPID --value sueldos', { encoding: 'utf8' }).trim()
    if (!pid || pid === '0') return null
    const entorno = execSync(`tr '\\0' '\\n' < /proc/${pid}/environ`, { encoding: 'utf8' })
    return entorno.split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length) ?? null
  } catch {
    return null
  }
}

const crudo = process.env.DATABASE_URL ?? urlDelServicio()
if (!crudo) {
  console.error('No hay DATABASE_URL ni en el entorno ni en el proceso del servicio.')
  console.error('Probá:  sudo -E node diag-db.mjs      (para poder leer /proc del servicio)')
  process.exit(1)
}

console.log('origen    :', process.env.DATABASE_URL ? 'variable de entorno' : 'proceso del servicio')
const u = new URL(crudo)
console.log('usuario   :', u.username || '(vacío)')
console.log('password  :', u.password ? `(${u.password.length} caracteres)` : '(vacía)')
console.log('host      :', u.hostname, 'puerto:', u.port || '3306')
console.log('base      :', u.pathname.replace(/^\//, '') || '(ninguna)')
console.log('opciones  :', u.search || '(ninguna)')
console.log('---')

if (u.protocol === 'mysql:') u.protocol = 'mariadb:'
if (!u.searchParams.has('timezone')) u.searchParams.set('timezone', 'Z')
// Corto: no tiene sentido esperar los 10 s del pool para saber que no conecta.
u.searchParams.set('connectTimeout', '4000')
u.searchParams.set('acquireTimeout', '5000')

const pool = mariadb.createPool(u.toString())
try {
  const conn = await pool.getConnection()
  console.log('CONECTA OK')
  const [info] = await conn.query(
    'SELECT VERSION() version, DATABASE() base, CURRENT_USER() usuario, @@hostname servidor',
  )
  console.log(info)
  const estado = await conn.query(
    "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Aborted_connects','Max_used_connections')",
  )
  const limites = await conn.query(
    "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections','wait_timeout')",
  )
  for (const f of [...estado, ...limites]) console.log(` ${f.Variable_name.padEnd(22)} ${f.Value}`)
  const [{ n }] = await conn.query('SELECT COUNT(*) n FROM usuarios')
  console.log(` usuarios en la tabla   ${Number(n)}`)
  conn.release()
} catch (e) {
  console.error('FALLA:', e.code, e.errno, e.sqlState)
  console.error(e.message.split('\n')[0])
  console.error('--- causa real, que el log de la aplicación oculta ---')
  const causa = e.cause ?? e
  console.error(causa?.code, causa?.errno, '|', causa?.message?.split('\n')[0])
  if (causa?.cause) console.error('  y su causa:', causa.cause?.code, '|', causa.cause?.message)
} finally {
  await pool.end()
}
