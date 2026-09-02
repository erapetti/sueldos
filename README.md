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
npm test          # 182 tests: motor de cálculo, licencia, estado derivado, validación
npm run lint
npm run typecheck # la aplicación y los tests; `tsc --noEmit` solo mira la aplicación
npm audit         # tiene que dar 0 vulnerabilidades
```

Los tests de integración **borran todas las tablas** de la base apuntada por `DATABASE_URL`.
Por eso `npm test` no los corre: fallan a propósito, con un mensaje que explica por qué. Para
correr la suite completa, 240 tests, hay que pedirlo por el nombre del script:

```bash
npm run delete_all_data_and_test   # ⚠ CUIDADO: BORRA TODOS LOS DATOS de DATABASE_URL
```

Antes de correrlo, verificar que `DATABASE_URL` **no** apunte a producción. Después de
correrlo la base queda vacía; si se estaba trabajando con datos de ejemplo, recargarlos con
`SEED_DEMO=1 npm run db:seed`.

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
npm run build
```

`npm run build` corre `prisma generate` antes de compilar, y no es opcional: `lib/db/generated/`
está en `.gitignore`, así que sobrevive de un deploy al siguiente y `git pull` no lo actualiza.
Generarlo dentro del build evita compilar contra el cliente del deploy anterior, que falla con
errores de tipos que no corresponden al código.

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
#
# El puerto tiene que ser el mismo que el de los `proxy_pass` del nginx de §5.1.
ExecStart=/usr/bin/node node_modules/.bin/next start --hostname 127.0.0.1 --port 3002

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

Si `PROXY_SHARED_SECRET` falta en producción, la app responde **403 a todo**: cierra en vez
de abrirse. Un 403 en cada request recién desplegado suele ser eso, no un problema del proxy.

### 4.1. Lockfiles fuera del proyecto

`next.config.ts` fija `outputFileTracingRoot` al directorio del proyecto. Sin eso, Next sube
por el árbol de directorios buscando un `package-lock.json` —una heurística para detectar
monorepos— y, si encuentra uno suelto en un directorio padre, avisa en cada arranque:

```
⚠ Warning: Next.js ignored package-lock.json in /home/erapetti because it is outside
  the current Git repository (/home/erapetti/sueldos).
```

Con `outputFileTracingRoot` fijo el aviso desaparece y el rastreo deja de depender de lo que
haya alrededor. Aun así, si aparece ese aviso conviene borrar el lockfile suelto: casi siempre
es la marca de un `npm install` corrido por error fuera del proyecto, que además dejó un
`node_modules` en el home.

### 5. oauth2-proxy

La aplicación **no implementa login** (§3.1): corre detrás de oauth2-proxy contra Google.

oauth2-proxy se puede usar de dos maneras, y acá se usa la segunda:

- **como proxy** —`--upstream=…`—, donde el tráfico lo pasa él y nginx solo lo tiene adelante;
- **como proveedor de autenticación**, donde nginx es el portón, le pregunta por cada request
  con la directiva `auth_request`, y proxea él mismo a la app.

La diferencia no es cosmética: en el segundo modo **las decisiones sobre qué pasa cuando no hay
sesión las toma nginx**, no oauth2-proxy. Buena parte de esta sección es sobre eso.

La configuración de oauth2-proxy entra por **dos lugares distintos**, y conviene no
confundirlos: el YAML de `--alpha-config` —acá, `oauth2-proxy.yaml`— y los flags de siempre. El
YAML **no** es un archivo de configuración completo: solo tiene seis claves posibles
—`upstreamConfig`, `injectRequestHeaders`, `injectResponseHeaders`, `server`, `metricsServer` y
`providers`—, y todo lo que no cae en alguna de esas seis sigue viniendo por flag.

La línea que arranca el servicio es corta, y es exactamente lo que está configurado hoy:

```
ExecStart=/usr/local/bin/oauth2-proxy \
  --alpha-config=/usr/local/etc/oauth2-proxy/oauth2-proxy.yaml \
  --cookie-secret='un-secreto-largo-y-aleatorio' \
  --authenticated-emails-file=/usr/local/etc/oauth2-proxy/users
```

Del resto de lo que hace falta, una parte está en el YAML:

| Qué | Cómo se ve en el YAML |
|---|---|
| Proveedor Google | `providers[0].provider: google`, con `clientID` y `clientSecret` |
| Dirección de escucha | `server.bindAddress: 127.0.0.1:4180` |
| `--set-xauthrequest` | la lista `injectResponseHeaders`, con los claims `user`, `email` y `preferred_username`. El flag legacy no existe en el YAML: **es** esa lista |
| Que Google no pida consentimiento | por **ausencia**: sin bloque `loginURLParameters` no se manda ningún parámetro (más abajo en esta sección) |

Y la otra parte **no está escrita en ningún lado**: son opciones de las que la aplicación
depende y que hoy rigen porque coinciden con el default de oauth2-proxy. Escritas explícitas
serían estas, todas con el valor que ya tienen:

```
--cookie-secure=true          # default. La cookie de sesión solo viaja por HTTPS
--cookie-expire=168h          # default. Es la semana que dura la sesión (§5.5)
--cookie-refresh=0            # default. Sin refresco, que es lo que queremos (§5.5)
--skip-provider-button=false  # default. Es lo que hace que «Salir» termine afuera (§5.2)
```

Que estén tomadas por omisión es cómodo pero frágil: son correctas hoy porque el default
coincide con lo que necesitamos, no porque alguien las haya decidido. Si algún día cambia un
default, cambia el comportamiento sin que nadie toque nada. Están escritas acá para que, si eso
pasa, se sepa dónde mirar. Ponerlas explícitas en el `ExecStart` no cambia nada hoy y las
vuelve inmunes a eso.

Hay una más que **no** está puesta y que conviene tener a mano:

```
--email-domain=*              # el control de acceso lo haría solo la app (§3.3)
```

Es la alternativa a `--authenticated-emails-file`: con `*` entra cualquier email autenticado por
Google y quien filtra es la tabla `usuarios`, así que **el alta de una persona vuelve a ser un
solo paso**. Hoy son dos, y por qué está en §5.6.

`--reverse-proxy` **no está puesto**, y la documentación de oauth2-proxy lo pide para
`auth_request`. En la práctica no rompe nada acá, y conviene entender por qué: el redirect
después del login lo resuelve el encabezado `X-Auth-Request-Redirect`, que oauth2-proxy lee
siempre, sin condicionarlo a que confíe en el proxy. Lo que sí queda inerte es el
`proxy_set_header X-Forwarded-Uri` del `location = /oauth2/auth`, porque esa lectura sí está
condicionada:

```go
func GetRequestURI(req *http.Request) string {
	uri := req.Header.Get(XForwardedURI)
	if !CanTrustForwardedHeaders(req) || uri == "" {
		uri = req.URL.RequestURI()
	}
	return uri
}
```

O sea que ese encabezado es configuración muerta mientras `--reverse-proxy` no esté. Lo que se
gana poniéndolo es tener la IP real del cliente en los logs, en vez de `127.0.0.1`. Si se pone,
va junto con `--trusted-proxy-ip`: sin eso oauth2-proxy confía en los `X-Forwarded-*` de
cualquier origen, que acá está contenido porque escucha solo en loopback, pero no hay razón para
dejarlo abierto.

No hay `--upstream`: en este modo oauth2-proxy no proxea nada.

`--approval-prompt=auto` **no es opcional**. Si no se pone —ni ese ni `--prompt`—, oauth2-proxy
manda `approval_prompt=force` por compatibilidad con sus versiones viejas, y con `force` Google
vuelve a mostrar la pantalla de consentimiento en **cada** ingreso, no solo el primero. Cada vez
que se acepta, Google lo registra como una autorización nueva y le manda al usuario un mail con
asunto «You shared some Google Account data with …». Con `auto` no pide nada a partir del
segundo ingreso.

El valor `auto` es del parámetro viejo de Google, deprecado hoy en favor de `prompt`. Da igual:
si Google lo respeta no pide consentimiento, y si lo ignora tampoco, porque `auto` no fuerza
nada. El equivalente moderno es `--prompt=select_account`, que evita el consentimiento pero
**muestra el selector de cuenta en cada ingreso**, así que no resuelve lo mismo. `--prompt=none`
no sirve: falla con error cuando Google necesita interacción.

Con la configuración alpha —el YAML de `--alpha-config`— el parámetro no tiene valor por
defecto, así que el equivalente es borrar el bloque `loginURLParameters` del proveedor en vez de
poner `auto`. Ojo con `--convert-config-to-alpha`: el YAML que genera trae el bloque escrito con
`force`, porque la conversión aplica el default legacy.

#### 5.1. La configuración de nginx

Está en `nginx-sueldos.conf`, fuera del repositorio porque lleva el secreto compartido. Lo que
sigue es el bloque de TLS con el secreto reemplazado por un placeholder:

```nginx
server {
    listen 443 ssl http2;
    server_name sueldos.rapetti.name;

    # La planilla mensual (§7.1) postea un mes entero de renglones en una sola operación.
    client_max_body_size 2m;

    # El endpoint del cron no se expone nunca hacia afuera (§7.12). Se responde 404 y no
    # 403, para no confirmar que existe.
    location ^~ /api/cron/ {
        return 404;
    }

    # La salida necesita su propio location. Ver §5.2.
    location = /oauth2/sign_out {
        proxy_pass       http://127.0.0.1:4180;
        proxy_set_header Host      $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Scheme  $scheme;
        proxy_set_header X-Auth-Request-Redirect "";
    }

    # Login y callback: no protegidos.
    location /oauth2/ {
        proxy_pass       http://127.0.0.1:4180;
        proxy_set_header Host      $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Scheme  $scheme;
        proxy_set_header X-Auth-Request-Redirect $request_uri;
    }

    # El oráculo de sesión, solo para la subrequest. `internal` no es opcional: ver §5.3.
    location = /oauth2/auth {
        internal;
        proxy_pass       http://127.0.0.1:4180;
        proxy_set_header Host             $host;
        proxy_set_header X-Real-IP        $remote_addr;
        proxy_set_header X-Forwarded-Uri  $request_uri;
        proxy_pass_request_body off;
        proxy_set_header Content-Length   "";
    }

    # Iconos y manifest, sin sesión. Ver §5.4.
    location ~ ^/(favicon\.ico|icon1\.png|icon2\.png|apple-icon\.png|manifest\.webmanifest)$ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-User "";
        proxy_set_header X-Forwarded-Email "";
        proxy_set_header X-Forwarded-Preferred-Username "";
        access_log off;
    }

    # La sonda que consulta el cliente: 401 sin sesión. Ver §5.3.
    location = /sesion/estado {
        auth_request /oauth2/auth;
        empty_gif;
    }

    # Qué hacer sin sesión, según el método. Ver §5.3.
    location @sin_sesion {
        if ($request_method = POST) {
            return 401;
        }
        rewrite ^ /oauth2/sign_in last;
    }

    location / {
        auth_request /oauth2/auth;
        error_page 401 = @sin_sesion;

        auth_request_set $email $upstream_http_x_auth_request_email;
        auth_request_set $user  $upstream_http_x_auth_request_user;
        auth_request_set $name  $upstream_http_x_auth_request_preferred_username;

        # Fijarlos acá pisa cualquier X-Forwarded-* que mande el cliente (§3.2).
        proxy_set_header X-Forwarded-Email               $email;
        proxy_set_header X-Forwarded-User                $user;
        proxy_set_header X-Forwarded-Preferred-Username  $name;

        # §3.2 — tiene que coincidir con el PROXY_SHARED_SECRET de la unidad de systemd.
        proxy_set_header X-Proxy-Auth "un-secreto-largo-y-aleatorio";

        # Todo lo demás que oauth2-proxy podría inyectar se neutraliza.
        proxy_set_header X-Auth-Request-Email              "";
        proxy_set_header X-Auth-Request-User               "";
        proxy_set_header X-Auth-Request-Preferred-Username "";
        proxy_set_header X-Auth-Request-Groups             "";
        proxy_set_header X-Auth-Request-Access-Token       "";
        proxy_set_header X-Forwarded-Groups                "";
        proxy_set_header X-Forwarded-Access-Token          "";
        proxy_set_header Authorization                     "";

        # Las Server Actions de liquidación hacen varias escrituras en una transacción.
        proxy_read_timeout 120s;

        proxy_pass http://127.0.0.1:3002;
    }
}
```

Los tres `auth_request_set` son el corazón del asunto: la subrequest devuelve la identidad en
encabezados `X-Auth-Request-*`, y hay que copiarla a los `X-Forwarded-*` que lee
`lib/auth/currentUser.ts` (§3.2). Si `--set-xauthrequest` no está puesto, esas variables vienen
vacías y **la app no rompe: te manda a la pantalla de acceso no autorizado**, que es un síntoma
que no señala hacia el proxy.

Si el header `X-Proxy-Auth` falta o no coincide con `PROXY_SHARED_SECRET`, la app responde
**403** sin procesar nada. El prefijo `/api/cron/` queda excluido de esa validación porque tiene
su propio control (§7.12).

#### 5.2. La salida entra en bucle si nginx manda `X-Auth-Request-Redirect`

Síntoma: «Salir» borra la sesión —eso funciona— y después el navegador queda dando vueltas
sobre `/oauth2/sign_out` para siempre.

La causa es una asimetría en oauth2-proxy. Para decidir a dónde mandarte después del logout usa
tres estrategias, por orden de prioridad: el parámetro `rd`, el encabezado
`X-Auth-Request-Redirect`, y la URI de la request. Las dos últimas se protegen de los bucles:

```go
if a.hasProxyPrefix(redirect) {
    return "/"
}
```

La del encabezado **no** —solo valida que el destino sea un dominio permitido— y es la que tiene
más prioridad. Así que un `proxy_set_header X-Auth-Request-Redirect $request_uri` en el
`location /oauth2/`, que es lo correcto para el login, le dice a `sign_out` que después de
cerrar sesión vaya a `/oauth2/sign_out`. Que cierra sesión y vuelve a ir a `/oauth2/sign_out`.

El arreglo es el `location = /oauth2/sign_out` de §5.1, que vacía ese encabezado. Vaciarlo y no
fijarlo a mano es a propósito: caen las otras dos estrategias, que sí traen la protección
adentro.

Con el bucle resuelto, la salida aterriza en `/`, que exige sesión, así que se muestra la
pantalla de login de oauth2-proxy —la del botón «Sign in with Google»— y ahí termina. El usuario
quedó afuera, que es lo que se esperaba.

**Que termine ahí depende de que `--skip-provider-button` esté en falso**, y por eso no está en
la lista de flags de arriba. Con ese flag prendido, `/oauth2/sign_in` no dibuja nada: manda
derecho a Google, que con la sesión del navegador viva (§3.5) devuelve al usuario adentro sin
preguntarle nada. O sea que prenderlo ahorra un clic por ingreso y a cambio **deja «Salir» sin
efecto visible**. La diferencia está en una sola bifurcación de oauth2-proxy:

```go
if p.SkipProviderButton {
    p.OAuthStart(rw, req)              // derecho a Google
} else {
    p.SignInPage(rw, req, statusCode)  // la pantalla con el botón
}
```

#### 5.3. Un POST sin sesión se contesta 401, no se redirige

Todas las mutaciones de la app son Server Actions, que **postean a la URL de la página**. Si a
un POST sin sesión se le contesta un 302, el navegador lo degrada a GET y le tira el cuerpo —lo
dice el spec de Fetch para 301 y 302—, sigue el redirect hasta `accounts.google.com` y ahí el
`fetch` interno de Next muere por CORS. El cuerpo nunca llega a Google, pero el envío se pierde.

La documentación de oauth2-proxy recomienda separar rutas de navegador de rutas de API y no
redirigir a estas últimas. Acá esa separación **no se puede hacer por path**, porque las Server
Actions comparten la URL de la página: hay que hacerla por método, que es lo que hace el
`location @sin_sesion`.

El `if` adentro de un `location` es uno de los dos usos que la documentación de nginx considera
seguros, porque lo único que hay adentro es un `return`.

Para lo que no es POST se conserva lo de siempre: la pantalla de login servida en el lugar, sin
redirect. El `if` con un `return` adentro es uno de los dos usos que la documentación de nginx
considera seguros.

**Dos trampas de nginx que este par de `location` esquiva, y que no se parecen entre sí.**

La primera se ve al arrancar. Dentro de una location con nombre, `proxy_pass` **no admite parte
de URI**: `proxy_pass http://127.0.0.1:4180/oauth2/sign_in` no compila, y nginx lo dice sin
ambigüedad —«cannot have URI part in location given by regular expression, or inside named
location…»—. El destino se fija con `rewrite ^ /oauth2/sign_in last`, que vuelve a buscar
location y cae en el `location /oauth2/`, que ya tiene el `proxy_pass` y el
`X-Auth-Request-Redirect`. Es exactamente lo que hacía el `error_page 401 = /oauth2/sign_in`
original, y `$request_uri` no cambia con el rewrite.

La segunda **no se ve nunca**, y es la peligrosa. En la sonda hay `empty_gif` y no `return 204`
porque `return` es del módulo rewrite y corre en la **fase de rewrite**, que va antes de la
**fase de access**, que es donde corre `auth_request`. Con un `return`, la sonda contestaría
siempre lo mismo sin haber consultado la sesión: nginx arranca, la ruta responde, y el aviso de
«se venció la sesión» no sale jamás porque el 401 nunca llega. `empty_gif` es un handler de la
fase de content, así que espera el veredicto del `auth_request`.

Del lado de la app, `hooks/useAccion.ts` atrapa el rechazo y consulta **`/sesion/estado`** para
saber si fue la sesión o la red. Lo único que mira es el 401.

Esa sonda existe en vez de consultar `/oauth2/auth` directamente, y no es una vuelta de más.
`/oauth2/auth` tiene que quedar `internal`, porque su respuesta 202 pasa por el `headersChain`
de oauth2-proxy y sale con los `X-Auth-Request-*` puestos —los mismos que nginx copia con
`auth_request_set`—, y ahí adentro va el **access token de Google**. Un `fetch` mismo-origen
puede leer todos los encabezados de la respuesta, así que exponer esa ruta al navegador le
regalaría el token a cualquier XSS. `/sesion/estado` da exactamente la misma información —hay
sesión o no la hay— y nada más: no tiene ningún `auth_request_set`, así que sale sin ningún
encabezado de identidad.

#### 5.4. Iconos y manifest sin autenticación

Cinco rutas tienen que poder verse **sin sesión**, y por eso tienen su propio `location` que
saltea `auth_request`. El que **obliga** es el manifest: el navegador lo pide con
`credentials: omit`, así que detrás del login llega sin cookie, nginx contesta el redirect y
Chrome descarta la instalación sin decir por qué. Los iconos, además, se piden en contextos
donde todavía no hay sesión, como la propia pantalla de login.

Vaciar los tres encabezados de identidad no es decorativo: la app confía en ellos para saber
quién sos (§3.2), y esa confianza se sostiene porque nadie llega sin pasar por el portón. Este
`location` es una excepción a esa regla, así que tiene que cerrar la puerta que abre.

Para verificarlo después del deploy, sin cookie:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://tu-dominio/manifest.webmanifest
```

Tiene que dar `200`, y la raíz tiene que seguir redirigiendo al login.

#### 5.5. Cuánto dura la sesión, y por qué no va `--cookie-refresh`

Hay tres relojes y conviene no confundirlos:

| Reloj | De dónde sale | Cuánto |
|---|---|---|
| Access token de Google | `expires_in` del canje | ~1 h |
| Refresh token | solo la **primera** autorización, ahora que el consentimiento no se fuerza | — |
| Cookie `_oauth2_proxy` | `--cookie-expire` | 168 h por defecto |

El que manda es el tercero, y los otros dos no intervienen. En `stored_session.go`, la
validación del vencimiento del token solo se alcanza a través de la decisión de refrescar:

```go
if !needsRefresh(s.refreshPeriod, session) {
    // Refresh is disabled or the session is not old enough, do nothing
    return nil
}
...
return s.validateSession(req.Context(), session)

func needsRefresh(refreshPeriod time.Duration, session *sessionsapi.SessionState) bool {
    return refreshPeriod > time.Duration(0) && session.Age() > refreshPeriod
}
```

Sin `--cookie-refresh`, `needsRefresh` es siempre falso y **el vencimiento del access token no
se mira nunca**. A la app le da igual: `lib/auth/currentUser.ts` lee tres encabezados que salen
de la sesión, no de una llamada a Google, y el access token no se usa en ninguna parte del
código.

Poner `--cookie-refresh` en este modo, además, casi no sirve: la subrequest de `auth_request`
descarta la respuesta de oauth2-proxy, así que el `Set-Cookie` con la sesión renovada **no llega
al navegador** salvo que se lo copie a mano con `auth_request_set $auth_cookie
$upstream_http_set_cookie`. Y eso copia un solo `Set-Cookie`: si la sesión pasa los 4 KB,
oauth2-proxy la parte en `_oauth2_proxy_0` y `_1`, y hay que copiar las dos. Sin refresh token
—que es lo normal desde el segundo ingreso— no hay nada que renovar de todos modos.

La consecuencia práctica es que **cada usuario vuelve a autenticarse una vez por semana**, y ese
momento puede caer arriba de un POST. La red de contención es el §5.3 más el `catch` de
`useAccion`: el aviso sale, y lo cargado sigue en pantalla.

#### 5.6. El alta de un usuario son **dos** altas

El §3.3 dice que el control de acceso lo hace la app: el administrador da de alta el email desde
**Usuarios**, y el vínculo con la cuenta de Google se completa en el primer ingreso. En este
despliegue eso **no alcanza**, porque hay una segunda lista antes, en oauth2-proxy.

`--authenticated-emails-file=/usr/local/etc/oauth2-proxy/users` y la ausencia de
`--email-domain` se combinan así:

```go
valid = isEmailValidWithDomains(email, domains)  // domains está vacío: siempre false
if !valid {
    valid = validUsers.IsValid(email)            // el archivo decide todo
}
if allowAll { valid = true }                     // allowAll es false: no hay "*"
```

Con `domains` vacío, la primera línea nunca da verdadero y `allowAll` nunca se activa, así que
**el archivo es la única puerta del proxy**. Quien no esté ahí no llega a la app.

Y no llega de una forma que no se parece a lo que el §3.3 describe. La validación ocurre en el
callback de OAuth, antes de que exista sesión:

```go
if p.Validator(session.Email) && authorized {
    ...
} else {
    p.ErrorPage(rw, req, http.StatusForbidden, "Invalid session: unauthorized")
}
```

Es decir: la persona hace clic en el botón, elige su cuenta de Google, acepta, y aterriza en una
página **403 de oauth2-proxy** que dice «Invalid session: unauthorized». Nunca ve la pantalla de
acceso no autorizado de la app (`app/sin-acceso/page.tsx`), que es la que explica qué pasó y a
quién reclamarle, porque la request no llega hasta Next.

**Consecuencia operativa: dar de alta a alguien son dos pasos.** El email va en la pantalla de
Usuarios *y* en `/usr/local/etc/oauth2-proxy/users`. El archivo se relee solo cuando cambia
—oauth2-proxy lo vigila—, así que no hace falta reiniciar el servicio, pero sí acordarse. Si
falta el segundo paso, el síntoma es el 403 de arriba, que no menciona ni a la app ni a la lista.

**Esto es una divergencia del §3.3 y no está resuelta acá.** Las dos salidas razonables son
sacar el archivo y poner `--email-domain=*`, que deja el control donde el SPECS lo pone y ahorra
el paso doble; o conservarlo como defensa en profundidad y asumir el paso doble, documentándolo
en el instructivo de alta. Es una decisión del dueño del proyecto, porque toca lo que el §3.3
fija.

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

## Modificaciones a shadcn/ui

shadcn no es una dependencia: es un generador que copia el código a `components/ui/`, así que
esos archivos son nuestros. Aun así conviene mantenerlos lo más cerca posible del original,
para poder regenerarlos sin pensar. **Hoy hay dos divergencias**, y si algún día corrés
`npx shadcn@latest add <componente> --overwrite` hay que volver a aplicarlas:

### `components/ui/select.tsx`

`SelectTrigger`: `w-fit` → `w-full min-w-0`, y el valor trunca con elipsis.

El original crece con el texto de la opción elegida y no tiene tope. Con las descripciones de
seguro de salud del Anexo A, que pasan los 200 caracteres, el disparador llegaba a 1562 px:
en `/admin/bps` se solapaba con los campos vecinos y, ya solo en su fila, hacía scrollear la
página entera en horizontal. También afectaba al selector de seguro del alta y de la ficha.

Se corrigió en el componente y no en cada uso, ni con un wrapper, porque el problema había
aparecido en tres pantallas escritas en momentos distintos: un default correcto cubre también
los usos que todavía no existen. Los selects que necesitan un ancho propio lo pasan por
`className` y siguen ganando, porque tailwind-merge se queda con la última clase de ancho.

Para comprobar que sigue bien después de tocar algo: elegir el seguro 9 en `/admin/bps` y
verificar que `document.documentElement.scrollWidth` no supere al `clientWidth`.

### `components/ui/table.tsx`

`TableRow`: se saca `hover:bg-muted/50`. El resaltado al pasar por encima queda como algo que
la tabla **pide**, no como default.

El criterio de la aplicación es que el resaltado promete que hay algo del otro lado: una fila
se resalta solo si además lleva a un detalle. Con el default de shadcn se resaltaban todas —las
líneas de la liquidación, la cuenta corriente, los listados de administración—, y ahí la fila
se pintaba como clickeable sin tener a dónde ir.

Se corrigió en el componente y no fila por fila porque las tablas sin detalle son la mayoría:
siete de las diez. Las tres que sí lo tienen usan `FilaConDetalle` (`components/dominio/`), que
agrega el resaltado junto con el clic que lo justifica.

Ninguna pantalla usa `components/ui/table` directamente: las diez tablas pasan por
`components/dominio/Tabla`, que es la única que lo importa junto con `FilaConDetalle`.

Para comprobarlo: en `/empleados/todos` la fila se resalta y lleva a la empleada; en la cuenta
corriente de una ficha, no se resalta.

## Overrides de dependencias

`package.json` fuerza `deepmerge-ts` a `^8` con un `overrides`.

El motivo es [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), un
agotamiento de pila al mergear grafos recursivos. La dependencia entra por `prisma` —el CLI,
que está en `devDependencies`— a través de `@prisma/config`, que es lo que lee
`prisma.config.ts`. Prisma 7.10.0, la última al 26/08/2026, sigue trayendo la 7.1.5.

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

El procedimiento para subir versiones, con sus trampas, está en
[NPM_UPDATE.md](NPM_UPDATE.md).

## Redondeo: pesos enteros

**Divergencia deliberada del SPECS.** El §4.3 dice que el valor hora se usa con precisión
completa y el §6.7 que cada línea se redondea a 2 decimales. Por decisión del proyecto los
importes se llevan a **pesos enteros en el cálculo**, no solo al mostrarlos.

El motivo: la liquidación se controla a mano. Redondeando solo en la presentación, la columna
no cerraba en 6 de cada 10 casos —se despegaba entre 1 y 3 pesos, medido sobre 5.000
liquidaciones simuladas—. Redondeando en el cálculo, lo que se ve es exactamente lo que se
suma.

Se redondea al **cerrar cada línea**; los pasos intermedios siguen con precisión completa.
Los puntos son:

| Qué | Dónde |
|---|---|
| Valor hora calculado | `valorHoraCalculado`, en `lib/calculo/liquidacion.ts` |
| Valor hora «en negro» del aumento masivo | `actions/aumento.ts` |
| Las 8 líneas de la liquidación | `lib/calculo/liquidacion.ts` |
| Salario vacacional | `lib/calculo/licencias.ts` |
| Cuotas de un préstamo | `repartirEnCuotas`, en `lib/calculo/cuentaCorriente.ts` |

El valor del boleto se carga en pesos enteros, así que la línea de boletos sale entera sola.

Lo que **no** se toca son los importes que tipea el usuario: salario, pagos adicionales,
préstamos y valor del boleto se guardan tal cual. Si alguno viene con centavos, el redondeo
de la línea lo absorbe y la columna cierra igual.

Las columnas siguen siendo `DECIMAL(14,2)` y no se migraron los datos anteriores al cambio.
Por eso la pestaña de cuenta corriente decide sola: si **todos** los importes de la pantalla
son enteros no muestra los centavos, y si alguno los tiene los muestra en toda la columna
para que se lea pareja.

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
