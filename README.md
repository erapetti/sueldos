# Liquidación de sueldos

Aplicación web interna para calcular el total a pagar a empleados (Uruguay), según
[SPECS.md](SPECS.md).

## Stack

| Ítem | Versión |
|---|---|
| Node | 24 |
| Next.js | 16 (App Router, React Server Components, Server Actions) |
| TypeScript | 5, `strict: true` |
| Base de datos | **MySQL 8** |
| ORM | Prisma 7 con el driver adapter `@prisma/adapter-mariadb` |
| Estilos | Tailwind CSS 4 + shadcn/ui + lucide-react |
| Decimales | `decimal.js` en la app, `DECIMAL` en la base |
| Tests | Vitest |

> **Diferencia con el SPECS.** El §2 y el §10 dicen PostgreSQL; la implementación usa
> **MySQL 8** por decisión del proyecto. Las adaptaciones están documentadas en
> [Adaptaciones a MySQL](#adaptaciones-a-mysql).

## Puesta en marcha (desarrollo)

```bash
npm install
cp .env.example .env    # y completar los valores
npx prisma migrate deploy
npx prisma generate
npm run db:seed         # administrador inicial + feriados fijos
npm run dev
```

En desarrollo, dejar `PROXY_SHARED_SECRET` **sin definir** en `.env` para poder abrir la app
sin oauth2-proxy delante, y usar `DEV_IMPERSONATE_USER` para simular identidad (§3.2).

```bash
npm test          # 217 tests: motor de cálculo, licencia, estado derivado, integración
npm run lint
npx tsc --noEmit
npm audit         # tiene que dar 0 vulnerabilidades
```

Los tests de integración **borran todas las tablas** de la base apuntada por `DATABASE_URL`.
Nunca apuntarlos a la base de producción.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a MySQL. Se le fuerza `timezone=Z` si no viene puesta |
| `PROXY_SHARED_SECRET` | Secreto que debe traer el header `X-Proxy-Auth` (§3.2). **Obligatorio en producción** |
| `BOOTSTRAP_ADMIN_EMAIL` | Email del primer administrador. Solo se usa si la tabla `usuarios` está vacía (§3.3) |
| `CRON_TOKEN` | Token que debe traer el header `X-Cron-Token` en `/api/cron/*` (§7.12) |
| `TZ` | `America/Montevideo` |
| `DEV_IMPERSONATE_USER` | Solo desarrollo: `email\|nombre\|admin`. Se ignora si `NODE_ENV=production` |

## Deploy

El deploy es por copia de archivos al servidor, sin contenedores.

### 1. Base de datos

```sql
CREATE DATABASE sueldos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sueldos'@'localhost' IDENTIFIED BY 'una-clave-larga';
GRANT ALL PRIVILEGES ON sueldos.* TO 'sueldos'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Build y copia

El build se hace donde haya red (`next build` descarga dependencias y compila) y se copia el
resultado al servidor:

```bash
npm ci
npx prisma generate
npm run build
```

Al servidor hay que copiar: `.next/`, `public/`, `node_modules/`, `package.json`,
`prisma/`, `prisma.config.ts` y `lib/db/generated/`.

### 3. Migraciones

En cada deploy, antes de arrancar el servicio:

```bash
npx prisma migrate deploy
```

### 4. Servicio systemd

Las credenciales van en la definición del servicio con `Environment=`. El archivo de unidad
tiene que ser legible solo por root (`chmod 600`), porque contiene secretos.

`/etc/systemd/system/sueldos.service`:

```ini
[Unit]
Description=Liquidación de sueldos
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
User=sueldos
WorkingDirectory=/opt/sueldos

# El bind a 127.0.0.1 es un requisito de seguridad, no una preferencia:
#  - §3.2: la app no debe ser alcanzable sin pasar por oauth2-proxy;
#  - §7.12: es lo que garantiza que /api/cron/ solo se pueda invocar desde el propio servidor.
ExecStart=/usr/bin/node node_modules/.bin/next start --hostname 127.0.0.1 --port 3000

Environment=NODE_ENV=production
Environment=TZ=America/Montevideo
Environment=DATABASE_URL=mysql://sueldos:una-clave-larga@127.0.0.1:3306/sueldos
Environment=PROXY_SHARED_SECRET=un-secreto-largo-y-aleatorio
Environment=CRON_TOKEN=otro-token-largo-y-aleatorio
Environment=BOOTSTRAP_ADMIN_EMAIL=admin@empresa.com

Restart=always
RestartSec=5

# Endurecimiento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/sueldos/.next/cache

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 600 /etc/systemd/system/sueldos.service
sudo systemctl daemon-reload
sudo systemctl enable --now sueldos
sudo journalctl -u sueldos -f
```

Para generar los secretos: `openssl rand -hex 32`.

### 5. oauth2-proxy

La aplicación **no implementa login** (§3.1): corre detrás de oauth2-proxy contra Google.

```
--provider=google
--pass-user-headers=true
--set-xauthrequest=true
--prefer-email-to-user=false      # para que X-Forwarded-User traiga el sub, no el email
--email-domain=*                  # el control de acceso lo hace la app, no el proxy
--skip-provider-button=true
--cookie-secure=true
--cookie-refresh=1h
--cookie-expire=8h
--upstream=http://127.0.0.1:3000
```

Además hay que inyectar el header secreto compartido. Con nginx delante del proxy:

```nginx
proxy_set_header X-Proxy-Auth "un-secreto-largo-y-aleatorio";
```

Si el header falta o no coincide con `PROXY_SHARED_SECRET`, la app responde **403** sin
procesar nada. El prefijo `/api/cron/` queda excluido de esa validación porque tiene su
propio control (§7.12).

La opción «Salir» del menú apunta a `/oauth2/sign_out`, que borra la cookie del proxy sin
tocar la sesión de Google del navegador (§3.5).

### 6. Alta del primer usuario

Al arrancar, si la tabla `usuarios` está vacía, se crea el usuario de
`BOOTSTRAP_ADMIN_EMAIL` con `es_admin = true`. Si la tabla no está vacía, la variable se
ignora. El resto de los usuarios los da de alta ese administrador desde **Usuarios**,
indicando el email de Google; el vínculo con la cuenta se completa en el primer ingreso.

### 7. Cron de generación anual de licencia

El proceso de §7.12 acredita los días de licencia de cada aniversario. Recupera **todos** los
aniversarios pendientes, no solo los de hoy, así que se recupera solo si un día no llega a
ejecutarse. Es idempotente: ejecutarlo dos veces no duplica nada.

```cron
0 3 * * * curl -sS -X POST -H "X-Cron-Token: otro-token-largo-y-aleatorio" http://localhost:3000/api/cron/licencias
```

Responde `404` —no `401` ni `403`— si el token falta o no coincide, para no confirmar que el
endpoint existe.

### 8. Backups

```bash
mysqldump --single-transaction --routines --triggers \
  -u sueldos -p sueldos | gzip > /var/backups/sueldos-$(date +\%F).sql.gz
```

`--single-transaction` toma la copia sin bloquear las tablas InnoDB.

Periodicidad sugerida: **diaria**, de madrugada y antes del cron de licencias, conservando
30 días.

```cron
0 2 * * * /usr/local/bin/backup-sueldos.sh
0 3 * * * curl -sS -X POST -H "X-Cron-Token: ..." http://localhost:3000/api/cron/licencias
```

Conviene probar la restauración cada tanto: un backup que nunca se restauró no es un backup.

```bash
gunzip < /var/backups/sueldos-2026-08-18.sql.gz | mysql -u sueldos -p sueldos_restore
```

## Estructura

```
/app                      páginas y rutas (App Router)
  /empleados              listado, ficha, planillas, liquidación, aguinaldo
  /admin                  boletos, aumento, feriados, bps, usuarios
  /api/cron/licencias     §7.12
  /sin-acceso             §3.3
/actions                  Server Actions, con validación zod y control de permisos
/components
  /ui                     shadcn/ui
  /dominio                SelectorFecha, SelectorVigencia, PlanillaMensual, diálogos
  /layout                 menú lateral y drawer
/lib
  /auth                   currentUser, guards, cronAuth
  /calculo                motor de cálculo — código puro, sin base ni sesión
  /consultas              consultas de listados y de ficha
  /db                     cliente Prisma y mapeo de tipos
  /format                 dinero, fechas
  /liquidacion            puente entre la base y el motor de cálculo
  /validacion             esquemas zod compartidos cliente/servidor
/constants                seguros de salud, recargos, causales
/prisma                   schema, migraciones, seed
/tests                    Vitest
proxy.ts                  §3.2 (Next 16 llama `proxy.ts` al ex `middleware.ts`)
```

El motor de cálculo (`/lib/calculo`) es **código puro**: recibe un objeto de entrada ya
resuelto y devuelve las líneas de la liquidación. No accede a la base ni a la sesión, que es
lo que lo hace testeable sin infraestructura.

## Adaptaciones a MySQL

El SPECS está escrito para PostgreSQL. Al implementar sobre MySQL 8 hubo que resolver:

| SPECS | MySQL 8 |
|---|---|
| `TIMESTAMPTZ` | `DATETIME(3)` en UTC. La conexión se abre con `timezone=Z` |
| `JSONB` | `JSON` |
| `uuid` | `CHAR(36)`, con UUIDv7 generado por Prisma |
| Índice único parcial de §4.14 | Columna `uk_vigente` que vale `1` mientras la liquidación está vigente y `NULL` cuando se anula. MySQL considera distintos entre sí los `NULL` de un índice único, así que varias anuladas conviven y solo puede haber una vigente |
| Índice único parcial de §4.15.1 | Sale gratis: `anio_aniversario` es `NULL` fuera de `GENERACION_ANUAL`, y los `NULL` no se comparan |
| Único `(concepto, seguro_salud, fecha_vigencia)` de §4.11 | Columna `seguro_salud_clave`, que normaliza el `NULL` a `*`. Sin ella el índice no restringiría los conceptos generales |
| `CHECK` de §5.1 y validaciones de §4.x | En la migración `20260818000100_restricciones`, escrita a mano |
| `LEFT JOIN LATERAL` de §11 | Subconsultas agregadas: los dos listados siguen resolviéndose en **una única consulta** |

Las restricciones escritas a mano viven en su propia migración. `prisma migrate dev` no las
conoce y las reporta como drift: para cambiar el modelo conviene usar
`prisma migrate dev --create-only` y volver a agregarlas si la migración generada recrea
alguna de esas tablas.

## Funcionalidad pendiente

Los puntos del §13 del SPECS que todavía no están definidos se muestran en pantalla como
**«funcionalidad no implementada aún»**:

- **Aguinaldo** (§7.7 / §13.3) — falta la fórmula: si la base es el promedio del semestre,
  qué conceptos la integran y si lleva descuentos de BPS. Definido: los pagos adicionales y
  los boletos no integran la base.
- **Aumento de sueldos** (§7.8 / §13.4) — falta el criterio: IPC, porcentaje por franja
  salarial, correctivo y tope. El resto del caso de uso **sí está implementado y testeado**
  en `actions/aumento.ts`: dado el salario nuevo de cada empleado, inserta en una única
  transacción el registro de salario y el de valor hora «en negro» ajustado por el mismo
  porcentaje, ambos con la misma fecha de vigencia.

Otros pendientes que no bloquean pantallas:

- **Liquidación final por egreso** (§13.1) — la liquidación del mes de egreso se prorratea
  correctamente y muestra el aviso *«Liquidación final: falta calcular despido y licencia no
  gozada»*.
- **Descuentos sobre el salario vacacional** (§13.2) — hoy se liquida por el monto bruto.
- **Otros eventos que generan días de licencia** (§13.5) — el modelo ya contempla el tipo
  `AJUSTE`.

## Overrides de dependencias

`package.json` fuerza `deepmerge-ts` a `^8` con un `overrides`.

El motivo es [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), un
agotamiento de pila al mergear grafos recursivos. La dependencia entra por `prisma` —el CLI,
que está en `devDependencies`— a través de `@prisma/config`, que es lo que lee
`prisma.config.ts`. Prisma 7.9.1, la última al 18/08/2026, sigue trayendo la 7.1.5.

**El runtime nunca la carga**: `@prisma/client`, que es lo único que va a producción, solo
depende de `@prisma/client-runtime-utils`. Aun así conviene sacarla del árbol, porque un
`npm audit` en rojo permanente hace que se dejen de leer los hallazgos nuevos.

Lo que **no** hay que hacer es `npm audit fix --force`: baja a `prisma@6.12.0`, que no
soporta el generador `prisma-client`, los driver adapters ni `prisma.config.ts`. Rompe todo
el acceso a datos para arreglar algo que no afecta a producción.

Con el override, `prisma validate`, `generate`, `migrate status`, `migrate diff` y el seed
siguen funcionando: `@prisma/config` solo usa la función `deepmerge`, que v8 mantiene.
**Sacar el override cuando Prisma actualice la dependencia de fábrica**, verificando con
`npm ls deepmerge-ts` que ya resuelva a 8 sin ayuda.

## Decisiones que el SPECS no fijaba

- **Valor hora calculado (§4.3).** El texto dice
  `salario / horas_semanales * (52 / 12)`, que leído literalmente daría $6.500 la hora para
  un sueldo de $60.000 por 40 h. Se implementó
  `salario / (horas_semanales × 52/12)` —el salario dividido las ~173,33 horas del mes—, que
  es la lectura acordada con el usuario.
- **Agrupación de líneas.** Las horas extras se agrupan por porcentaje de recargo y emiten
  una línea por recargo; los pagos adicionales y las cuotas del plan emiten una línea cada
  uno. El §6.7 fija la línea como unidad de redondeo, así que la suma sigue cerrando exacta.
- **Loopback del cron (§7.12).** Next 16 no expone la dirección del socket a los route
  handlers, y `x-forwarded-for` es falsificable. La condición de loopback se hace cumplir
  con el bind a `127.0.0.1` de la unidad de systemd; la verificación del header queda como
  segunda línea de defensa. Está explicado en `lib/auth/cronAuth.ts`.
