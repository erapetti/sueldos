# SPECS — Aplicación de Liquidación de Sueldos

Especificación funcional y técnica para la construcción de una aplicación web de cálculo
del total a pagar a empleados (Uruguay).

> Los puntos marcados con **[PENDIENTE]** requieren definición antes de implementarse y están
> listados en §13.

---

## 1. Alcance

Aplicación web de uso interno, hosteada en un servidor propio, para:

- Registrar empleados y sus condiciones laborales (salario, régimen horario, seguro de salud).
- Registrar novedades del mes (horas extras, faltas, pagos adicionales, préstamos).
- Calcular la liquidación mensual de sueldo de cada empleado.
- Calcular el aguinaldo (junio y diciembre).
- Mantener las tablas paramétricas: descuentos BPS, valor del boleto, feriados.
- Llevar la cuenta corriente de cada empleado.

Fuera de alcance en esta etapa: exportación contable, recibos de sueldo en PDF, integración
con BPS o bancos, multi-empresa, multi-moneda.

---

## 2. Stack técnico

| Ítem | Decisión |
|---|---|
| Framework | **Next.js (última versión estable disponible al momento de implementar; mínimo 15)**, App Router, React Server Components |
| Lenguaje | TypeScript, `strict: true` |
| Mutaciones | Server Actions (no se expone API REST pública) |
| Base de datos | **PostgreSQL 16+** |
| ORM | **Prisma** (migraciones versionadas en el repo) |
| Estilos | Tailwind CSS |
| Componentes | shadcn/ui |
| Iconos | lucide-react |
| Formularios | react-hook-form + zod (los mismos esquemas zod se reusan para validar en el servidor) |
| Fechas | date-fns con `TZ=America/Montevideo` |
| Decimales | `decimal.js` en la app, `DECIMAL` en la base. **Nunca usar `float`/`number` de JS para dinero.** |
| Tests | Vitest para la lógica de cálculo (obligatorio: ver §12) |
| Deploy | Docker + docker-compose (app + postgres), detrás de oauth2-proxy |
| Idioma de la UI | **Español (es-UY)**. Formato de fecha `dd/mm/aaaa`, formato de número `1.234,56` |

---

## 3. Autenticación y autorización

### 3.1 Modelo de autenticación

La aplicación **no implementa login**. Se despliega detrás de **oauth2-proxy** configurado
contra Google. oauth2-proxy resuelve el flujo OAuth2/OIDC y reenvía la request al
contenedor de Next.js con headers de identidad.

Headers que la aplicación lee en cada request:

| Header | Contenido | Uso |
|---|---|---|
| `X-Forwarded-User` | `sub` del token de Google | **ID del usuario** (clave primaria en la tabla `usuarios`) |
| `X-Forwarded-Email` | email | Se guarda/actualiza como dato de contacto y para mostrar |
| `X-Forwarded-Preferred-Username` | nombre a mostrar | Se guarda/actualiza |

Configuración esperada de oauth2-proxy (documentar en el README):

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
```

### 3.2 Seguridad del borde

Confiar en headers HTTP es seguro **solo si nadie puede llegar a la app sin pasar por el proxy**.
Requisitos obligatorios:

1. El contenedor de Next.js **no expone puertos al exterior**; solo es alcanzable desde la red
   interna de docker por oauth2-proxy.
2. La app exige además un header secreto compartido `X-Proxy-Auth: <SHARED_SECRET>` inyectado
   por oauth2-proxy (`--set-authorization-header` o vía nginx). Si el header falta o no coincide
   con la variable de entorno `PROXY_SHARED_SECRET`, la app responde **403** sin procesar nada.
3. Toda la lectura de identidad se hace en **un único módulo** `lib/auth/currentUser.ts`.
   Ningún otro archivo lee headers de identidad.
   El middleware excluye el prefijo `/api/cron/`, que tiene su propio control de acceso (§7.12)
   y no pasa por el proxy.
4. En desarrollo local, si `NODE_ENV !== 'production'`, se permite simular identidad con la
   variable de entorno `DEV_IMPERSONATE_USER` (id, email, nombre). Nunca activo en producción.

### 3.3 Alta de usuarios y bootstrap

- Un usuario que se autentica correctamente en Google pero **no existe** en la tabla `usuarios`
  ve una pantalla "Acceso no autorizado — solicitá a un administrador que te dé de alta"
  y no puede operar. **No se auto-registra.**
- Los usuarios los da de alta un administrador, indicando el **email de Google**. El `id` (sub)
  queda `NULL` hasta el primer ingreso: en el primer login, si existe un usuario con ese email
  y sin `id`, se le asigna el `sub` recibido (*claim* del registro). A partir de ahí el match
  siempre es por `id`.
- **Bootstrap:** la variable de entorno `BOOTSTRAP_ADMIN_EMAIL` define el email del primer
  administrador. Al arrancar, si la tabla `usuarios` está vacía, se crea ese usuario con
  `es_admin = true`. Si la tabla no está vacía, la variable se ignora.

### 3.4 Roles y permisos

**Usuario común**
- Ve y opera únicamente los empleados de los que es dueño o que le fueron compartidos.
- Permiso `VER`: puede ver la ficha, la cuenta corriente y las liquidaciones. No modifica nada.
- Permiso `EDITAR`: además puede registrar novedades y modificar los datos del empleado.
- Solo el **dueño** puede: compartir/descompartir el empleado, cambiar el dueño, borrar el empleado.

**Administrador**
- Todo lo anterior sobre *sus* empleados, más:
- ABM de usuarios (alta, modificación del flag admin, baja).
- Acceso a los menús: Costo boletos, Aumento de sueldos, Feriados, Descuentos de BPS.
- En su pantalla "Empleados" (§8.3) ve únicamente sus propios empleados y los compartidos con él,
  igual que cualquier usuario. Accede a los empleados ajenos solo por la opción de menú
  "Todos los empleados" (§8.7).
- El menú "Aumento de sueldos" opera sobre **todos los empleados del sistema**,
  independientemente de quién sea el dueño.

**Reglas transversales**
- Un administrador no puede quitarse a sí mismo el flag de administrador.
- No se puede borrar el último administrador del sistema.
- No se puede borrar un usuario que sea dueño de empleados: primero hay que transferir la
  propiedad (el diálogo de borrado ofrece elegir el nuevo dueño de todos sus empleados).
- **Toda** Server Action valida permisos en el servidor antes de operar. Ocultar un botón en la
  UI no es control de acceso.

### 3.5 Salida

La opción "Salir" del menú redirige a `/oauth2/sign_out` (endpoint de oauth2-proxy), lo que
borra la cookie de sesión del proxy. **No** se agrega `?rd=` hacia el logout de Google, de modo
que la sesión de Google del navegador queda intacta.

---

## 4. Modelo de datos

Convenciones generales:

- Claves primarias `id` tipo `uuid` (salvo `usuarios`, ver abajo).
- Todos los importes: `DECIMAL(14,2)`.
- Todos los porcentajes: `DECIMAL(7,4)` (ej. `18.1000` = 18,1 %).
- Todas las cantidades de horas: `DECIMAL(6,2)`.
- Todas las fechas de negocio: tipo `DATE` (sin hora, sin zona horaria).
- Toda tabla lleva `creado_en TIMESTAMPTZ`, `creado_por` (id de usuario),
  `modificado_en TIMESTAMPTZ`, `modificado_por`.
- **No hay borrado físico** de registros históricos que participen de un cálculo ya realizado
  (ver §4.14 sobre liquidaciones). El resto se borra físicamente.

### 4.1 `usuarios`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | `sub` del token de Google. Nullable hasta el primer login → ver §3.3. Se implementa como `id UUID` interno + `google_sub TEXT UNIQUE NULL` para poder tener usuarios pre-creados sin sub. |
| `google_sub` | `TEXT` UNIQUE NULL | Identificador de Google |
| `email` | `TEXT` UNIQUE NOT NULL | Normalizado a minúsculas |
| `nombre` | `TEXT` | Se refresca en cada login desde el header |
| `es_admin` | `BOOLEAN NOT NULL DEFAULT false` | |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Un usuario inactivo recibe la pantalla de "acceso no autorizado" |
| `ultimo_acceso` | `TIMESTAMPTZ NULL` | |

### 4.2 `empleados`

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | uuid PK | — | |
| `dueno_id` | uuid FK→usuarios | Sí | |
| `alias` | `TEXT` | **Sí** | 1–40 caracteres. Se usa en títulos, selectores y listados. Único por dueño. |
| `nombre_completo` | `TEXT` | **Sí** | 1–120 caracteres. Subtítulo en las páginas de detalle. |
| `banco` | `TEXT` | **Sí** | Nombre del banco de la cuenta preferida |
| `cuenta` | `VARCHAR(32)` | **Sí** | Alfanumérica, exactamente hasta 32 caracteres. Validación: `^[A-Za-z0-9]{1,32}$` |
| `fecha_ingreso` | `DATE` | **Sí** | No puede ser futura |
| `cobra_boletos` | `BOOLEAN` | **Sí** | |
| `aporta_bps` | `BOOLEAN NOT NULL DEFAULT true` | **Sí** | Switch "Aporta BPS", activo por defecto. Si es `false`, al empleado **no se le aplica ningún descuento de BPS** en ninguna liquidación (§6.3) |
| `celular` | `TEXT` | No | |
| `direccion` | `TEXT` | No | |
| `cedula` | `TEXT` | No | Validar dígito verificador de CI uruguaya si viene informada |
| `seguro_salud` | `TEXT` NULL | No | Código de la tabla fija del Anexo A. Solo tiene efecto si `aporta_bps = true`; el formulario deshabilita el campo cuando el switch está apagado |
| `activo` | `BOOLEAN DEFAULT true` | — | Baja lógica (ver §4.2.1) |
| `fecha_egreso` | `DATE NULL` | No | Se pide al dar de baja |
| `visible` | `BOOLEAN NOT NULL DEFAULT true` | — | Si es `false`, el empleado no aparece en la pantalla "Empleados" (§8.3). Sigue apareciendo en "Todos los empleados" (§8.7), que es desde donde se lo puede volver a mostrar |

**4.2.1 Baja de empleado.** Borrar un empleado con liquidaciones o movimientos de cuenta
corriente registrados **no borra**: marca `activo = false` y pide la `fecha_egreso`. Un empleado
sin ningún movimiento sí se borra físicamente.

Dar de baja **no lo saca del listado**: sigue apareciendo en "Empleados" (§8.3) con su estado,
hasta que el usuario lo oculte con la acción "Ocultar del listado" (`visible = false`, §8.3).
Los empleados inactivos quedan excluidos del aumento masivo de sueldos (§7.8).

El salario, las horas semanales, el régimen horario y el valor hora "en negro" **no** son campos
de esta tabla: son series con fecha de vigencia (§4.3, §4.3.1, §4.4).

**4.2.2 Alta de un empleado.** El formulario de alta es único y crea, en una transacción:

1. el registro de `empleados`;
2. el primer registro de `empleado_salarios` (salario + horas semanales);
3. el primer registro de `empleado_regimenes` (horas por día de la semana);
4. el primer registro de `empleado_valor_hora_negro`.

Los cuatro con `fecha_vigencia` = **el 1° del mes de `fecha_ingreso`**. En el alta no se usa el
`<SelectorVigencia>`.

El campo del valor hora "en negro" se pre-carga con el valor hora calculado (§4.3) a partir del
salario y las horas semanales ingresados, y se recalcula en vivo mientras esos campos cambian,
**hasta que el usuario lo edite manualmente** (a partir de ahí queda fijo).

**4.2.3 Estado del empleado (derivado).** El estado **no se persiste**: se calcula a la fecha de
hoy y se muestra en el listado (§8.3).

Definiciones, siempre restringidas a meses en que el empleado tuvo vínculo vigente
(≥ mes de `fecha_ingreso` y ≤ mes de `fecha_egreso` si existe):

```
hoy   = fecha actual
M0    = mes en curso
M-1   = mes anterior

falta_liquidacion =
      ( día_del_mes(hoy) >= 23  AND  no existe liquidación MENSUAL confirmada de M0 )
   OR ( no existe liquidación MENSUAL confirmada de M-1 )

falta_pago =
      existe alguna liquidación confirmada, de cualquier período, sin ningún movimiento
      de cuenta corriente tipo PAGO vinculado (§4.14)
```

El estado resultante es el **primero** que se cumple:

| Orden | Condición | Estado | Chip |
|---|---|---|---|
| 1 | `falta_pago` | **Falta pagar** | rojo |
| 2 | `falta_liquidacion` | **Falta liquidación** | ámbar |
| 3 | `fecha_egreso` informada | **Baja** | gris |
| 4 | resto | **Activo** | verde |

El orden de la tabla es normativo:

- Un empleado dado de baja con la liquidación final impaga muestra **Falta pagar**, no **Baja**.
  Pasa a **Baja** recién cuando no queda nada pendiente.
- El día **23** es únicamente el umbral a partir del cual se espera tener liquidado el mes en
  curso. No restringe la operación: se puede liquidar cualquier mes cualquier día (§6.10).

### 4.3 `empleado_salarios` (serie)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `salario` | `DECIMAL(14,2)` | Salario mensual nominal, > 0 |
| `horas_semanales` | `DECIMAL(6,2)` | > 0 y ≤ 60 |
| `fecha_vigencia` | `DATE` | **Siempre el día 1 de un mes** (ver §5) |
| `origen` | `ENUM('MANUAL','AUMENTO_MASIVO')` | Trazabilidad del aumento por decreto |

Único: `(empleado_id, fecha_vigencia)`.

**Valor hora calculado** (no se persiste, es derivado):

```
valor_hora_calculado = salario / horas_semanales * (52 / 12)
```

Se redondea a 2 decimales **solo al mostrarlo**; en los cálculos intermedios se usa la
precisión completa (ver §6.7).

### 4.3.1 `empleado_valor_hora_negro` (serie)

Valor hora usado para pagar las horas extras **sin descuento BPS** (§6.6). Serie con fecha de
vigencia, con las mismas reglas que el salario (§5).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `valor` | `DECIMAL(14,2)` | > 0 |
| `fecha_vigencia` | `DATE` | **Siempre el día 1 de un mes** (ver §5) |
| `origen` | `ENUM('MANUAL','AUMENTO_MASIVO')` | Trazabilidad del aumento |

Único: `(empleado_id, fecha_vigencia)`.

### 4.4 `empleado_regimenes` (serie)

Régimen horario semanal: cuántas horas trabaja el empleado cada día de la semana.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha_vigencia` | `DATE` | **Siempre el día 1 de un mes** (ver §5) |
| `horas_lunes` … `horas_domingo` | `DECIMAL(4,2)` ×7 | ≥ 0, múltiplos de 0,5, ≤ 24 |

Único: `(empleado_id, fecha_vigencia)`.

**Validación:** la suma de los 7 días **debe** ser igual a `horas_semanales` del registro de
salario vigente a esa misma fecha. Si no coincide, el formulario muestra la diferencia y
**bloquea** el guardado.

### 4.5 `horas_extras`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha` | `DATE` | |
| `horas` | `DECIMAL(6,2)` | > 0, múltiplos de 0,5 |
| `con_bps` | `BOOLEAN` | `true` = lleva descuento BPS |
| `recargo_pct` | `ENUM/INT` | Uno de: `0, 20, 100, 120, 150, 170, 200, 220` |
| `nota` | `TEXT NULL` | |

Se admiten **varios registros** para la misma fecha (p. ej. tramos con distinto recargo).

### 4.6 `faltas`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha` | `DATE` | |
| `horas` | `DECIMAL(4,2)` | > 0, múltiplo de 0,5 |
| `causal` | `ENUM('CON_AVISO','SIN_AVISO','ENFERMEDAD','MATERNIDAD')` | |
| `descuenta` | `BOOLEAN NOT NULL DEFAULT true` | Ver §4.6.1 |
| `nota` | `TEXT NULL` | |

**Validación:** la suma de horas de falta de un empleado en una misma fecha no puede superar
las horas que le corresponden a ese día según el régimen vigente. El formulario muestra
"Corresponden X horas ese día" y valida contra ese tope.

**4.6.1 Campo `descuenta`.** El subsidio por enfermedad de BPS cubre a partir del 4° día, por lo
que las licencias médicas de 1 a 3 días pueden quedar a cargo del empleador. El campo permite
decidirlo caso por caso:

- `causal = ENFERMEDAD` → el campo es **editable**, con valor por defecto `true`.
  `descuenta = false` significa que el día se paga: la falta queda registrada en el historial
  pero **no resta horas** en el paso 2 del cálculo (§6.2).
- Cualquier otra causal —`CON_AVISO`, `SIN_AVISO`, `MATERNIDAD`— → el campo se fuerza a `true` y
  no se muestra en el formulario. La licencia por maternidad la paga siempre BPS, nunca el
  empleador, así que descuenta sin excepción.
- `descuenta` **no** afecta el conteo de boletos (§6.4), en ninguna causal.

### 4.7 `pagos_adicionales`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha` | `DATE` | Determina en qué mes se liquida |
| `monto` | `DECIMAL(14,2)` | > 0 |
| `concepto` | `TEXT NULL` | |

No lleva descuentos de ningún tipo.

### 4.8 `plan_pagos` (cuotas previstas de devolución de préstamos)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `prestamo_id` | uuid FK→`cuenta_corriente` | Préstamo que originó el plan |
| `fecha` | `DATE` | Mes en el que se descuenta (se usa año-mes) |
| `monto` | `DECIMAL(14,2)` | > 0 |
| `estado` | `ENUM('PENDIENTE','APLICADA','CANCELADA')` | |

Se genera junto con el préstamo (§7.4). Las cuotas pendientes pueden editarse o cancelarse
individualmente mientras no estén aplicadas.

### 4.9 `cuenta_corriente`

Libro de movimientos de dinero entre la empresa y el empleado.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha` | `DATE` | |
| `tipo` | `ENUM('LIQUIDACION','PAGO','PRESTAMO','AJUSTE')` | |
| `debe` | `DECIMAL(14,2) DEFAULT 0` | |
| `haber` | `DECIMAL(14,2) DEFAULT 0` | |
| `concepto` | `TEXT` | |
| `liquidacion_id` | uuid FK NULL | Si el movimiento nace de una liquidación |
| `reversa_de_id` | uuid FK NULL | Contra-asiento (anulación) |

**Convención de signos.** Se lee desde el punto de vista del empleado como acreedor:

| Tipo | Lado | Monto | Origen |
|---|---|---|---|
| `LIQUIDACION` | **haber** | Total a pagar **+** cuotas del plan descontadas en esa liquidación (es decir, el devengado del mes *antes* del descuento de cuotas) | Se genera al confirmar una liquidación (§7.6) |
| `PAGO` | **debe** | Monto transferido | Pago bancario (§7.5) |
| `PRESTAMO` | **debe** | Monto entregado | Préstamo en mano (§7.4) |
| `AJUSTE` | cualquiera | — | Corrección manual con concepto obligatorio |

```
saldo = Σ haber − Σ debe
```

- **saldo > 0** → la empresa le debe al empleado (liquidación devengada y aún no pagada).
- **saldo = 0** → al día.
- **saldo < 0** → el empleado adeuda: es el **saldo pendiente de préstamos**.

**No hay movimiento propio para la cuota del plan de pagos.** La liquidación acredita el
devengado bruto y el pago bancario debita el neto, que ya viene con la cuota descontada; la
diferencia amortiza el préstamo.

**Ejemplo.** Préstamo de $10.000 en enero, a devolver en 5 cuotas de $2.000.
Liquidación de febrero: total a pagar $48.000, ya con la cuota de $2.000 descontada.

| Fecha | Concepto | Debe | Haber | Saldo |
|---|---|---:|---:|---:|
| 15/01 | Préstamo | 10.000 | | −10.000 |
| 28/02 | Liquidación febrero (devengado) | | 50.000 | 40.000 |
| 05/03 | Pago bancario sueldo febrero | 48.000 | | −8.000 |

El saldo final, −8.000, es el préstamo pendiente.

**Anulación:** anular una liquidación confirmada inserta un contra-asiento (mismo monto al lado
opuesto, `reversa_de_id` apuntando al original). Nunca se borran movimientos.

### 4.10 `empleado_permisos` (compartir)

| Campo | Tipo | Notas |
|---|---|---|
| `empleado_id` | uuid FK | PK compuesta |
| `usuario_id` | uuid FK | PK compuesta |
| `permiso` | `ENUM('VER','EDITAR')` | |

El dueño no figura en esta tabla; su permiso es implícito y total.

### 4.11 `bps_conceptos` (serie de descuentos)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `concepto` | `TEXT` | Nombre del descuento (ej. "Montepío", "FONASA", "FRL") |
| `porcentaje` | `DECIMAL(7,4) NULL` | `NULL` = el concepto deja de aplicarse desde esa fecha |
| `seguro_salud` | `TEXT NULL` | `NULL` = aplica a todos los empleados; con valor = solo a empleados con ese código |
| `fecha_vigencia` | `DATE` | **Siempre el día 1 de un mes** (ver §5) |

Único: `(concepto, seguro_salud, fecha_vigencia)`.

**Resolución de conceptos aplicables a un empleado en un período P:**

1. Tomar todas las filas con `fecha_vigencia <= primer día de P`.
2. Filtrar: `seguro_salud IS NULL` **OR** `seguro_salud = empleado.seguro_salud`.
3. Agrupar por `(concepto, seguro_salud)` y quedarse con la de `fecha_vigencia` máxima.
4. Descartar las que quedaron con `porcentaje IS NULL`.
5. **Todos los conceptos resultantes se suman.** Los conceptos de BPS son disjuntos entre sí: no
   hay desempate ni prioridad por especificidad.

El formulario de alta advierte si el nombre de concepto ingresado ya existe con otro alcance,
pero no lo bloquea.

El total de descuentos BPS es la suma de los porcentajes resultantes aplicada sobre la
materia gravada (§6.3).

### 4.12 `valor_boleto` (serie)

| Campo | Tipo |
|---|---|
| `id` | uuid PK |
| `monto` | `DECIMAL(14,2)` — costo de **un** boleto |
| `fecha_vigencia` | `DATE` UNIQUE — **siempre el día 1 de un mes** (ver §5) |

### 4.13 `feriados`

| Campo | Tipo | Notas |
|---|---|---|
| `fecha` | `DATE` PK | |
| `descripcion` | `TEXT` | |
| `no_laborable` | `BOOLEAN DEFAULT true` | `true` = feriado pago en el que no se trabaja: descuenta boletos (§6.4). `false` = feriado laborable (ej. Carnaval, Turismo): se trabaja normalmente y no afecta ni el sueldo ni los boletos |

### 4.14 `liquidaciones` y `liquidacion_lineas`

Cuando una liquidación se **confirma**, se persiste con todos sus valores calculados y sus
parámetros de entrada, de modo que reimprimirla en el futuro dé exactamente el mismo resultado
aunque cambien los parámetros.

`liquidaciones`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `periodo` | `DATE` | Primer día del mes liquidado |
| `tipo` | `ENUM('MENSUAL','AGUINALDO','SALARIO_VACACIONAL')` | |
| `secuencia` | `INT NOT NULL DEFAULT 1` | 1 = liquidación original; ≥ 2 = **complementaria** (§7.6.1) |
| `estado` | `ENUM('BORRADOR','CONFIRMADA','ANULADA')` | |
| `total_recalculado` | `DECIMAL(14,2)` | Total del período según el cálculo completo de §6.2 |
| `total_ya_liquidado` | `DECIMAL(14,2)` | Suma de `total_a_pagar` de las liquidaciones vigentes anteriores del mismo `(empleado, periodo, tipo)`. Es 0 en la secuencia 1 |
| `total_a_pagar` | `DECIMAL(14,2)` | `total_recalculado − total_ya_liquidado`. **Puede ser negativo** en una complementaria |
| `snapshot` | `JSONB` | Entradas y resultados completos del cálculo |
| `confirmada_en/por` | | |

Único parcial: `(empleado_id, periodo, tipo, secuencia)` donde `estado <> 'ANULADA'`.

Una liquidación se considera **pagada** si existe al menos un movimiento de cuenta corriente de
tipo `PAGO` con `liquidacion_id` apuntando a ella (§7.5).

`liquidacion_lineas`: `orden`, `codigo`, `descripcion`, `cantidad`, `valor_unitario`,
`importe`, `signo`. Es lo que se renderiza en la pantalla de cálculo.

### 4.15 Licencia

Cada empleado tiene una **cuenta corriente de días de licencia**, con la misma mecánica de libro
que la cuenta corriente de dinero (§4.9): eventos que generan días al **haber** y licencias
gozadas que consumen días al **debe**.

Los días de licencia gozada **no son faltas**: no descuentan sueldo pero sí descuentan boletos
(§6.4). Se modelan como entidad propia, no como una causal de `faltas`.

**4.15.1 `licencia_movimientos`** — cuenta corriente de días.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha` | `DATE` | Fecha del asiento |
| `tipo` | `ENUM('GENERACION_ANUAL','GOCE','AJUSTE')` | |
| `debe` | `DECIMAL(6,2) DEFAULT 0` | Días consumidos |
| `haber` | `DECIMAL(6,2) DEFAULT 0` | Días generados |
| `concepto` | `TEXT` | |
| `licencia_id` | uuid FK NULL | Presente en los movimientos de tipo `GOCE` |
| `anio_aniversario` | `INT NULL` | Años de antigüedad cumplidos, en los de tipo `GENERACION_ANUAL` |

```
saldo_dias = Σ haber − Σ debe
```

Único parcial: `(empleado_id, anio_aniversario)` donde `tipo = 'GENERACION_ANUAL'`. Es lo que
hace idempotente al proceso de generación (§7.12).

El saldo **puede quedar negativo** si se registra una licencia mayor al saldo disponible
(licencia adelantada). El formulario avisa pero no lo bloquea.

**4.15.2 `licencias`** — períodos de licencia gozados.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | uuid FK | |
| `fecha_desde` | `DATE` | |
| `fecha_hasta` | `DATE` | ≥ `fecha_desde` |
| `dias_habiles` | `DECIMAL(6,2)` | Calculado según §4.15.3 y persistido |
| `nota` | `TEXT NULL` | |

No se admiten períodos **superpuestos** para el mismo empleado.

**4.15.3 Días hábiles de un período de licencia.**

```
dias_habiles = días corridos entre fecha_desde y fecha_hasta (ambos inclusive)
             − domingos
             − feriados con no_laborable = true
```

Los sábados **sí** cuentan como hábiles. El cálculo **no** depende del régimen horario del
empleado (§4.4): es la definición legal del período, no los días que efectivamente iba a
trabajar. Un domingo que además es feriado se descuenta una sola vez.

**4.15.4 Antigüedad y generación anual de días.**

```
antigüedad(fecha) = años enteros completos entre fecha_ingreso y fecha
```

Es **0** durante el primer año de trabajo, y pasa a 1 el día del primer aniversario.

En cada aniversario `n` (n ≥ 1) el empleado genera al haber:

```
dias_generados = 20 + ( n > 4 ? int(n / 4) : 0 )
```

| Aniversario `n` | Días |
|---|---|
| 1 a 4 | 20 |
| 5 a 7 | 21 |
| 8 a 11 | 22 |
| 12 a 15 | 23 |

La generación la ejecuta el proceso de §7.12. Nótese que en `n = 4` la condición `n > 4` no se
cumple y corresponden 20 días, aunque `int(4/4)` sea 1.

**Empleados con fecha de ingreso 29/02:** en los años no bisiestos el aniversario se toma el
28/02.

---

## 5. Resolución de series con fecha de vigencia

Aplica a **todas** las series: `empleado_salarios`, `empleado_valor_hora_negro`,
`empleado_regimenes`, `bps_conceptos`, `valor_boleto`.

### 5.1 Regla de granularidad mensual

**No existen cambios de parámetros a mitad de mes.** Toda `fecha_vigencia` es, obligatoriamente,
**el día 1 de un mes**. Esto se valida en el esquema (`CHECK (EXTRACT(DAY FROM fecha_vigencia) = 1)`),
en los esquemas zod y en los formularios.

### 5.2 Regla de resolución

> El registro vigente para el período **P** (mes/año que se liquida) es aquel con la mayor
> `fecha_vigencia` que sea `<= primer día de P`.
> Si no existe ninguno, el dato no está definido y el cálculo **falla con un error explícito**
> (nunca asume cero — ver §6.8).

Como consecuencia, todo el mes se liquida con un único juego de valores: un mismo salario,
un mismo régimen, un mismo valor de boleto y un mismo conjunto de porcentajes de BPS.
No hay prorrateo por cambio de parámetros.

### 5.3 Elección de la vigencia al registrar un cambio

Al dar de alta cualquier registro de serie, el usuario **elige explícitamente desde qué mes rige**.
El control es siempre el mismo componente (`<SelectorVigencia>`), con tres opciones:

| Opción | Valor resultante | Efecto |
|---|---|---|
| **Este mes** (`{mes actual}`) | 1° del mes en curso | El cambio **impacta la liquidación del mes actual**, aunque se registre a mitad de mes |
| **Mes siguiente** (`{mes siguiente}`) — *opción por defecto* | 1° del mes siguiente | El cambio recién impacta desde la próxima liquidación |
| **Otro mes** | 1° del mes elegido en un selector mes/año | Permite cargar cambios retroactivos o anticipados |

Reglas del selector:

- La opción por defecto es **Mes siguiente**.
- Al elegir **Este mes**, si el empleado ya tiene una liquidación **confirmada** para ese
  período, la UI advierte: *"Ya existe una liquidación confirmada de {mes}. El cambio no la
  modifica; para aplicarlo hay que recalcular el período."* (la liquidación confirmada guarda su
  snapshot — §4.14). Según esté pagada o no, recalcular significa anularla y rehacerla, o
  generar una complementaria (§7.6.1).
- Al elegir un mes **retroactivo**, la advertencia es la misma, extendida a todas las
  liquidaciones confirmadas iguales o posteriores a esa fecha, listándolas.
- Para cambios paramétricos de administrador (boleto, BPS) la advertencia enumera **cuántos
  empleados** tienen liquidaciones confirmadas afectadas, sin listarlos.

### 5.4 Sustitución vs. inserción

Registrar un cambio **nunca** actualiza un registro existente: siempre **inserta** un registro
nuevo. La única excepción es que ya exista un registro de esa misma serie con exactamente la
misma `fecha_vigencia`, en cuyo caso la UI pregunta *"Ya hay un valor vigente desde {mes}
(${monto}). ¿Reemplazarlo?"* y, si se confirma, lo sobrescribe.

Los registros de una serie se pueden **borrar** únicamente si su `fecha_vigencia` es futura y
no participaron de ninguna liquidación confirmada.

---

## 6. Cálculo de la liquidación mensual

### 6.1 Entradas

Para un empleado E y un período P (mes/año):

- `salario`, `horas_semanales` vigentes (§5) → `valor_hora_calculado = salario / horas_semanales * 52/12`
- `regimen` vigente → horas por día de la semana
- `valor_hora_negro` vigente (§4.3.1)
- Faltas con `fecha` dentro de P
- Horas extras con `fecha` dentro de P
- Pagos adicionales con `fecha` dentro de P
- Cuotas del plan de pagos con `fecha` dentro de P y estado `PENDIENTE`
- Conceptos BPS aplicables (§4.11), **solo si `aporta_bps = true`**
- Valor del boleto vigente
- Feriados dentro de P

### 6.2 Orden de cálculo

```
 1.  SALARIO BASE                       = salario mensual vigente × factor_prorrateo (§6.10)
 2.  − FALTAS                           = valor_hora_calculado × Σ horas_falta_del_mes
                                          (solo faltas con descuenta = true, §4.6.1)
 3.  + HORAS EXTRAS CON BPS             = Σ ( horas × valor_hora_calculado × (1 + recargo/100) )
     ────────────────────────────────────────────────────────────────
 4.  = MATERIA GRAVADA                  = 1 − 2 + 3
 5.  − DESCUENTOS BPS                   = MATERIA GRAVADA × Σ porcentajes aplicables
                                          (una línea por concepto)
                                          0 si el empleado tiene aporta_bps = false
     ────────────────────────────────────────────────────────────────
 6.  = SUBTOTAL                         = 4 − 5
 7.  + PAGOS ADICIONALES                = Σ montos del mes (sin descuentos de ningún tipo)
 8.  − PLAN DE PAGOS                    = Σ cuotas PENDIENTES del mes
 9.  + BOLETOS                          = (días_a_trabajar + días_extra_con_boleto)
                                          × 2 × valor_boleto
10.  + HORAS EXTRAS SIN BPS             = Σ ( horas × valor_hora_negro × (1 + recargo/100) )
     ════════════════════════════════════════════════════════════════
11.  = TOTAL A PAGAR
```

El orden es también el orden de presentación en pantalla y en la impresión. Los pasos 6 y 11
se muestran destacados.

### 6.3 Descuentos BPS

**`aporta_bps = false`** → no se aplica **ningún** descuento de BPS. Esto rige para **todas** las
liquidaciones del empleado: mensual, salario vacacional (§7.11) y aguinaldo (§7.7). El empleado
cobra el importe entero. En pantalla no se renderizan ni las líneas de descuento ni la línea
`MATERIA GRAVADA`: el paso 4 pasa directamente al paso 6, y el encabezado de la liquidación
muestra la leyenda *"Empleado sin aportes al BPS"*. El `seguro_salud` se ignora.

**`aporta_bps = true`** → cada concepto aplicable (§4.11) genera su propia línea:
`importe_concepto = MATERIA_GRAVADA × porcentaje / 100`, redondeado a 2 decimales.
El total de descuentos es la **suma de las líneas ya redondeadas**, no el porcentaje agregado.

En ambos casos, el campo `con_bps` de una hora extra (§4.5) conserva su significado propio: solo
determina el valor hora con el que se paga y en qué paso del cálculo entra (§6.6). Las horas
extras **sin** descuento BPS se pagan enteras siempre, para cualquier empleado.

### 6.4 Boletos — días a trabajar

`cobra_boletos = false` → la línea de boletos no existe (importe 0, no se muestra).

`cobra_boletos = true`:

```
días_a_trabajar =
    (días del mes cuyo día de semana tiene horas > 0 en el régimen vigente)
  − (feriados no_laborable = true que caen en esos días)
  − (días comprendidos en un período de licencia, §4.15.2)
  − (días en los que la suma de horas de falta iguala las horas del régimen de ese día)
```

Criterio: **se paga ida y vuelta por cada día que el empleado fue a trabajar.** De ahí:

- Solo la falta de **jornada completa** descuenta el boleto. Una falta **parcial** —por ejemplo,
  se retiró antes— **no** lo descuenta.
- Los días de licencia descuentan el boleto: el empleado no viajó. No descuentan sueldo.
- Una falta de jornada completa descuenta el boleto **aunque no descuente sueldo**
  (`descuenta = false`, §4.6.1).
- Un día alcanzado por más de una de esas causas se descuenta **una sola vez**.
- No se cuentan días anteriores a `fecha_ingreso` ni posteriores a `fecha_egreso`.

### 6.5 Boletos por horas extras

```
días_extra_con_boleto =
    cantidad de fechas distintas del mes con horas extras registradas,
    tales que el día de la semana de esa fecha tiene 0 horas en el régimen vigente,
    y que no estén ya contadas en días_a_trabajar
```

Aplica **si el empleado tiene `cobra_boletos = true`**; no depende de `con_bps` ni de ningún
atributo del registro de horas extras. Cada uno de esos días suma 2 boletos, igual que un día
normal.

### 6.6 Horas extras — resumen

| `con_bps` | Valor hora usado | Dónde entra |
|---|---|---|
| `true` | `valor_hora_calculado` | Paso 3, **antes** de los descuentos BPS (suma a la materia gravada) |
| `false` | `valor_hora_negro` vigente (§4.3.1) | Paso 10, **al final**, después de boletos |

En ambos casos el importe es `horas × valor_hora × (1 + recargo_pct/100)`.

Las del primer caso quedan alcanzadas por los descuentos de BPS **solo si el empleado tiene
`aporta_bps = true`** (§6.3). Las del segundo se pagan enteras siempre.

### 6.7 Redondeo

- Los cálculos intermedios se hacen con `decimal.js` sin redondeo.
- Cada **línea** de la liquidación se redondea a 2 decimales con `ROUND_HALF_UP`.
- Los subtotales y el total son la **suma de las líneas redondeadas**.
- El `valor_hora_calculado` se muestra con 2 decimales pero se usa con precisión completa.

### 6.8 Meses sin datos / errores

Si falta un dato obligatorio, la pantalla de cálculo **no muestra números parciales**: muestra
un cartel de error indicando exactamente qué falta y un enlace para cargarlo. Los casos son:

- no hay salario vigente para el período;
- no hay régimen vigente para el período;
- no hay valor hora "en negro" vigente **y** el período tiene horas extras sin BPS;
- no hay valor de boleto vigente **y** el empleado cobra boletos.

### 6.9 Prorrateo del primer y último mes

```
factor_prorrateo = días_del_período_con_vínculo_vigente / días_del_mes
```

donde `días_del_período_con_vínculo_vigente` cuenta los días corridos (no los laborables) entre:

- el mayor entre `fecha_ingreso` y el primer día del mes, y
- el menor entre `fecha_egreso` (si existe) y el último día del mes,

ambos extremos inclusive. En cualquier mes intermedio el factor da exactamente `1` y la línea
de prorrateo no se muestra.

**Ejemplo.** Ingreso el 12/03, salario $60.000. Marzo tiene 31 días; con vínculo vigente hay
20 días (12 al 31). `factor = 20/31 = 0,645161…` → salario base de marzo = **$38.709,68**.

- El prorrateo se aplica **solo al salario base** (paso 1). Horas extras, faltas, pagos
  adicionales y boletos ya son proporcionales a lo efectivamente ocurrido.
- Los descuentos de BPS se calculan sobre la materia gravada ya prorrateada, sin ajuste extra.
- La línea de la liquidación muestra el detalle: `Salario base (20/31 días) …… $38.709,68`.
- **Liquidación final por egreso: [PENDIENTE — §13.1].** El último mes se prorratea con esta
  misma fórmula, pero además hay que sumar el despido y la licencia no gozada. Hasta que se
  especifiquen, la liquidación de un mes con `fecha_egreso` muestra el aviso
  *"Liquidación final: falta calcular despido y licencia no gozada."*

### 6.10 Selección de período

La pantalla de cálculo abre por defecto en el **mes en curso**, con un selector de mes/año.
**No se permiten períodos futuros**: el selector no ofrece meses posteriores al actual.

Dentro de ese límite **se puede liquidar cualquier mes en cualquier momento**, sin importar el
día ni el estado del empleado (§4.2.3): el mes en curso se puede liquidar cualquier día, y un
mes ya liquidado se puede volver a liquidar.

Si el período ya tiene una liquidación confirmada y pagada, el recálculo no la modifica: genera
una **liquidación complementaria** por la diferencia (§7.6.1).

### 6.11 Novedades de períodos anteriores

Las novedades —horas extras, faltas y pagos adicionales— se registran con su **fecha real** y
pertenecen siempre al período de esa fecha. **Se pueden cargar con fecha de un mes anterior.**

- Se valorizan con los parámetros vigentes en **su propio período**, no en el mes de carga. Las
  horas extras se pagan al valor hora —calculado (§4.3) o "en negro" (§4.3.1)— vigente **en el
  mes en que se hicieron**.
- Nunca se arrastran ni se acumulan en el mes en curso: entran en la liquidación de su período.
- Si ese período ya tiene una liquidación confirmada, al guardar la novedad la UI avisa —
  *"Esta novedad corresponde a {mes}, que ya tiene una liquidación confirmada. Para que se
  refleje hay que recalcular el período."*— con un enlace directo a la pantalla de cálculo de
  ese mes. Si la liquidación ya estaba pagada, el recálculo genera la complementaria por la
  diferencia (§7.6.1) y después se registra el pago de esa diferencia (§7.5).
  El aviso es **uno por lote guardado**, no uno por renglón (§7.1).
- Guardar la novedad **no** dispara nada automáticamente: recalcular y pagar son siempre
  acciones explícitas del usuario.

Validación de fecha, común a las tres novedades: no anterior a `fecha_ingreso` ni posterior al
día de hoy.

---

## 7. Casos de uso

### 7.1 Registrar horas extras — planilla mensual

La acción abre una **página propia**, `/empleados/[id]/horas-extras?periodo=AAAA-MM`, que permite
cargar un mes entero y guardarlo en una sola operación. No es un diálogo modal.

**Encabezado.** Alias y nombre del empleado, selector de mes con flechas ← →, valor hora
calculado y valor hora "en negro" **vigentes en ese mes**, y estado de la liquidación del período
(sin liquidar / liquidada / liquidada y pagada).

**Cuerpo — calendario del mes.** Grilla de 7 columnas (lunes a domingo) con todos los días del
mes. Cada celda muestra el número de día y, si tiene horas cargadas, el total de horas y un punto
de color por tipo. Se distinguen visualmente:

- los días en que el empleado **no trabaja** según el régimen vigente (fondo tenue), que son los
  que generan boletos adicionales (§6.5);
- los **feriados**, con su nombre;
- **hoy**;
- las horas extras **ya guardadas** vs. las **de esta sesión**, todavía sin guardar.

**Carga.** Un clic o tap en un día abre un popover pegado a la celda con:

- **horas**, con botones rápidos `+0,5` `1` `2` `4` además del campo numérico;
- **recargo**, como chips con los 8 valores;
- **¿lleva descuento BPS?**, switch;
- nota opcional.

`Enter` confirma y cierra el popover; el foco queda en el calendario y las flechas del teclado
mueven de día, de modo que se puede cargar todo sin usar el mouse. **El recargo y el switch de
BPS son persistentes entre cargas**: el día siguiente arranca con los mismos valores que el
anterior. Un mismo día admite varios renglones con distinto recargo: el popover los lista y
permite agregar otro.

**Modo lista rápida.** Un toggle en el encabezado cambia el calendario por una tabla de tipeo:
una fila por renglón, `Enter` agrega la siguiente, y el campo de día acepta `12 3,5` en un solo
tipeo (día 12, 3,5 horas).

**Pie fijo.** Resumen en vivo de lo cargado en la sesión: cantidad de renglones, total de horas,
**importe estimado** desglosado en "con BPS" y "sin BPS", y boletos adicionales que se van a
generar (§6.5). Botones **Guardar** y **Descartar**.

**Guardado.** Un solo botón guarda **todos** los renglones en una transacción. El aviso de §6.11,
si el período ya estaba liquidado, aparece **una sola vez para todo el lote**, con tres opciones:
*Ir a recalcular {mes}* / *Seguir cargando* / *Volver a Empleados*. La página no navega sola:
queda en el mismo mes con lo guardado ya reflejado.

**Cierre con cambios sin guardar** (navegar, cerrar la pestaña): pide confirmación.

### 7.2 Registrar inasistencias (day off)

Misma planilla mensual que §7.1, en `/empleados/[id]/faltas?periodo=AAAA-MM`, con el mismo
calendario, el mismo modo lista, el mismo pie y el mismo guardado en lote. Cambia el popover del
día, que trae:

- **horas**, con el tope del día precargado y un botón **"día completo"** que lo llena de una;
- **causal**, con los cuatro valores del Anexo B;
- nota.

La celda del calendario muestra las horas que corresponden a ese día según el régimen, para
distinguir a simple vista si la falta es total o parcial (§6.4).

Si la causal es **Enfermedad**, aparece además el switch **"Se descuenta del sueldo"**
(§4.6.1), activado por defecto, con la ayuda: *"El subsidio de BPS cubre desde el 4° día.
Desactivá esta opción si vas a pagar los días a tu cargo."* Con cualquier otra causal el switch
no se muestra y el descuento se aplica siempre.

El calendario permite **arrastrar o hacer shift+clic** para seleccionar un rango de días
consecutivos y cargarlos con los mismos valores en una sola operación: crea un registro por día,
salteando los días sin horas en el régimen. Es el camino para cargar períodos largos como una
licencia médica o una licencia por maternidad, que pueden abarcar varios meses: en ese caso hay
que cargarlos mes a mes, ya que la planilla opera sobre un período (§7.1).

### 7.3 Registrar pago adicional
Diálogo con: fecha, monto, concepto.

### 7.4 Registrar préstamo (pago en mano)
Diálogo con:
- fecha, monto, concepto
- **Plan de devolución**, en el mismo formulario: cantidad de cuotas, mes de la primera cuota
  (por defecto el mes siguiente), y monto por cuota (autocalculado = monto / cuotas, con el
  ajuste del redondeo en la última cuota). Se muestra una grilla editable de las cuotas
  generadas antes de confirmar.
- Opción "sin plan de pagos" para registrar el préstamo sin cuotas previstas.

Al confirmar: se crea el movimiento `PRESTAMO` en cuenta corriente y las filas de `plan_pagos`
en una única transacción.

### 7.5 Registrar pago bancario
Diálogo con: fecha, monto, concepto (por defecto "Sueldo <mes> <año>"), y opcionalmente
vincularlo a una liquidación confirmada del empleado (precarga el monto con el total a pagar).
Crea el movimiento en cuenta corriente.

### 7.6 Cálculo de sueldo
Pantalla de detalle con el desglose línea por línea del §6.2, el selector de mes, y los botones:
- **Confirmar liquidación** → en una transacción: persiste la liquidación con su snapshot,
  marca como `APLICADA` las cuotas del plan de pagos del período, y crea el movimiento
  `LIQUIDACION` en cuenta corriente por el **devengado bruto** (total a pagar + cuotas
  aplicadas, §4.9).
- **Anular** (sobre una confirmada **no pagada**) → revierte lo anterior: las cuotas vuelven a
  `PENDIENTE` y el movimiento de cuenta corriente se revierte con un contra-asiento.
  Si la liquidación está **pagada**, el botón Anular no está disponible: el camino es la
  liquidación complementaria (§7.6.1).
- **Imprimir** (usa `window.print()` con una hoja de estilos de impresión).

Una liquidación confirmada se muestra en modo lectura con sus valores persistidos, con un
aviso si los parámetros actuales darían un resultado distinto.

### 7.6.1 Recálculo de un mes anterior y liquidación complementaria

Se puede recalcular cualquier período pasado. El comportamiento depende del estado del período:

| Situación del período | Acción |
|---|---|
| Sin liquidación confirmada | Se calcula y confirma normalmente (secuencia 1) |
| Con liquidación confirmada **no pagada** | Se puede **anular** y volver a confirmar. Alternativamente, generar una complementaria |
| Con liquidación confirmada **pagada** | **No se puede modificar.** Único camino: **liquidación complementaria** |

**Liquidación complementaria.** Es una liquidación nueva del mismo `(empleado, período, tipo)`
con `secuencia = N+1`. La aplicación recalcula el mes completo con las novedades y parámetros
actuales, y liquida **solo la diferencia**:

```
total_recalculado   = cálculo completo del período según §6.2, con los datos de hoy
total_ya_liquidado  = Σ total_a_pagar de las liquidaciones vigentes (estado <> ANULADA)
                      del mismo empleado, período y tipo
total_a_pagar       = total_recalculado − total_ya_liquidado        ← puede ser negativo
```

En pantalla se muestra el desglose completo del recálculo (los 11 pasos de §6.2) y, debajo,
un bloque de cierre destacado:

```
  Total recalculado del período ................  $ 52.400,00
  − Ya liquidado (liquidación #1) ..............  $ 50.000,00
  ══════════════════════════════════════════════════════════
  = DIFERENCIA A PAGAR .........................  $  2.400,00
```

Si la diferencia es negativa, la etiqueta cambia a **DIFERENCIA A DESCONTAR**, se muestra en rojo
y se aclara que queda como saldo a favor de la empresa en la cuenta corriente del empleado hasta
que se compense.

**Confirmación obligatoria.** Antes de generar una complementaria, un diálogo modal exige
confirmación explícita e informa: *"La liquidación de {mes} ya fue pagada el {fecha} por
${monto}. No se puede modificar. Se generará una liquidación complementaria por la diferencia
de ${diferencia}."* con botones **Cancelar** / **Generar complementaria**.

**Efectos al confirmar**, en una transacción:

- Se inserta la liquidación con su `secuencia` y su snapshot.
- Se inserta **un único asiento en cuenta corriente por la diferencia** del devengado bruto
  (§4.9): al `haber` si es positiva, al `debe` si es negativa. No se toca el asiento original.
- Las cuotas del plan de pagos del período que ya estaban `APLICADA` por una liquidación previa
  del mismo período **no se vuelven a aplicar**: el recálculo las considera dentro del paso 8
  pero no cambia su estado. Solo se marcan `APLICADA` las que aún estaban `PENDIENTE`.
- Una complementaria **no pagada** se puede anular con contra-asiento, como cualquier otra.

**Presentación.** La pestaña "Liquidaciones" de la ficha (§8.4) agrupa por período y muestra
las secuencias anidadas, con el total del período y el total de cada liquidación.

### 7.7 Aguinaldo (junio y diciembre)
El icono está deshabilitado (gris) fuera de junio y diciembre.
**[PENDIENTE — §13.3]** Fórmula de base (ley uruguaya):

```
aguinaldo = ( Σ remuneraciones nominales del semestre ) / 12
semestre de junio     = 1/dic del año anterior … 31/may
semestre de diciembre = 1/jun … 30/nov
```
sujeto a descuentos BPS **si el empleado tiene `aporta_bps = true`** (§6.3). Los boletos **no**
integran la base de cálculo.

### 7.8 Aumento de sueldos (admin)
**[PENDIENTE — §13.4]** El criterio del gobierno se define más adelante. El resto del caso de
uso está definido:
- Pantalla con: parámetros del aumento (a definir), previsualización en tabla con
  `empleado | salario actual | salario nuevo | % | valor hora negro actual | valor hora negro nuevo`,
  checkbox por empleado para excluir, y `<SelectorVigencia>` (§5.3, por defecto "Mes siguiente").
- Al confirmar, en una única transacción y para cada empleado incluido:
  - inserta un registro en `empleado_salarios` con el salario nuevo, `origen = 'AUMENTO_MASIVO'`
    y las **mismas** `horas_semanales` (el aumento no cambia la carga horaria);
  - inserta un registro en `empleado_valor_hora_negro` (§4.3.1) con `origen = 'AUMENTO_MASIVO'`
    y **la misma `fecha_vigencia`** que el salario, aplicándole **el mismo porcentaje de aumento**:
    ```
    pct_aumento            = salario_nuevo / salario_actual − 1
    valor_hora_negro_nuevo = redondear2( valor_hora_negro_vigente × (1 + pct_aumento) )
    ```
    El porcentaje es **por empleado**: si el criterio del gobierno da porcentajes distintos por
    franja salarial, cada empleado recibe el suyo. El `valor_hora_negro_vigente` de referencia es
    el que rige a la `fecha_vigencia` elegida.
- Un empleado excluido con el checkbox no recibe ninguno de los dos registros.
- Solo alcanza a empleados `activo = true`.

Ambos registros comparten la `fecha_vigencia`, de modo que el salario y el valor hora "en negro"
cambian juntos.

### 7.9 Parámetros de administrador
- **Costo boletos:** tabla de la serie histórica (monto, vigencia, quién y cuándo lo cargó) +
  formulario "Nuevo valor" con monto y `<SelectorVigencia>` (§5.3).
- **Feriados:** listado por año con navegación de años, alta (fecha + descripción + no_laborable)
  y baja de feriados **futuros**. Los feriados de fechas ya liquidadas no se pueden borrar.
  Los feriados **no** son una serie con vigencia: son fechas puntuales, se cargan con su fecha real.
- **Descuentos de BPS:** tabla agrupada por concepto y seguro de salud, mostrando el valor
  vigente y el histórico expandible. Acciones: "Nuevo concepto", "Cambiar porcentaje" y
  "Dar de baja el concepto" (inserta registro con `porcentaje = NULL`). Las tres insertan un
  registro nuevo usando el `<SelectorVigencia>` (§5.3).

### 7.10 Compartir un empleado
Desde la ficha del empleado, el dueño abre "Compartir": buscador de usuarios por email/nombre,
selector de permiso (Ver / Editar), lista de los ya compartidos con opción de cambiar el permiso
o quitar el acceso.

### 7.11 Registrar una licencia

Diálogo desde la pestaña "Licencia" de la ficha (§8.4) o desde el listado. Contiene:

- **fecha desde** y **fecha hasta**, con `<SelectorFecha>` (§8.6);
- **días hábiles** calculados en vivo (§4.15.3), con el desglose *"X días corridos − Y domingos −
  Z feriados = N días hábiles"*;
- **saldo de días** antes y después de la licencia. Si queda negativo, se muestra la advertencia
  *"El saldo de licencia queda en −N días"*, sin bloquear el guardado;
- **salario vacacional** que se va a generar, con su cálculo a la vista.

**Salario vacacional.**

```
salario_vacacional = salario_mensual_vigente / 30 × dias_habiles
```

El salario vigente se resuelve según §5 para el **mes de `fecha_desde`**.

**Efectos al confirmar**, en una única transacción:

1. Se inserta el registro en `licencias` (§4.15.2) con sus `dias_habiles` persistidos.
2. Se inserta el movimiento `GOCE` en `licencia_movimientos`, al **debe**, por `dias_habiles`.
3. Se crea una liquidación de `tipo = 'SALARIO_VACACIONAL'` en estado `CONFIRMADA`, con
   `periodo` = 1° del mes de `fecha_desde` y `secuencia` según el índice único de §4.14 (una
   segunda licencia en el mismo mes genera la secuencia 2).
4. Se inserta el asiento `LIQUIDACION` en la cuenta corriente de dinero, al **haber**, por el
   monto del salario vacacional (§4.9).

El salario vacacional se paga como cualquier otra liquidación, con "Registrar pago bancario"
(§7.5), y se lo puede anular con contra-asiento mientras no esté pagado. Anular la liquidación
**no** revierte la licencia; borrar la licencia sí exige anular antes su salario vacacional.

Los días de licencia no descuentan sueldo en la liquidación mensual, pero sí descuentan boletos
(§6.4).

Si el empleado tiene `aporta_bps = false`, el salario vacacional se paga entero (§6.3).

**[PENDIENTE — §13.2]** Si el salario vacacional lleva descuentos de BPS en los empleados con
`aporta_bps = true`. Hoy se liquida por el monto bruto, sin descuentos.

### 7.12 Generación anual de días de licencia (proceso cron)

Endpoint `POST /api/cron/licencias`, pensado para invocarse desde el propio servidor:

```bash
curl -X POST -H "X-Cron-Token: $CRON_TOKEN" http://localhost:3000/api/cron/licencias
```

**Acceso.** El endpoint **no pasa por oauth2-proxy** y por lo tanto queda fuera de la validación
de §3.2. En su lugar exige las dos condiciones a la vez:

1. la dirección remota de la conexión es de loopback (`127.0.0.1` o `::1`);
2. el header `X-Cron-Token` coincide con la variable de entorno `CRON_TOKEN`.

Si falta cualquiera de las dos, responde **404** sin procesar nada. El middleware que valida
`X-Proxy-Auth` excluye explícitamente el prefijo `/api/cron/`.

**Comportamiento.** Para cada empleado con `activo = true`, calcula todos los aniversarios
`n ≥ 1` cuya fecha sea **menor o igual a hoy** y que **no tengan** ya un movimiento
`GENERACION_ANUAL` con ese `anio_aniversario` (§4.15.1), y los acredita:

- un movimiento por aniversario faltante, al **haber**, por `20 + (n > 4 ? int(n/4) : 0)` días
  (§4.15.4), con `fecha` = la del aniversario y `concepto` = `"Generación anual — {n} años"`;
- todo en una única transacción.

Recuperar los aniversarios pendientes, y no solamente los de hoy, hace que el proceso se
recupere solo si un día no llegó a ejecutarse.

**Idempotencia.** Ejecutarlo dos veces el mismo día no duplica nada: el índice único
`(empleado_id, anio_aniversario)` de §4.15.1 lo garantiza a nivel de base, no solo a nivel de
código.

**Respuesta.** `200` con un JSON de resumen:

```json
{ "ejecutado": "2026-08-10", "empleados_procesados": 12, "movimientos_creados": 2,
  "detalle": [ { "empleado": "alias", "aniversario": 5, "dias": 21 } ] }
```

Cada ejecución con movimientos creados se registra en la tabla `auditoria` (§11) con
`usuario_id = NULL` y `accion = 'CRON_LICENCIAS'`.

**Programación.** El README documenta la entrada de crontab sugerida, diaria y de madrugada:

```
0 3 * * * curl -sS -X POST -H "X-Cron-Token: ..." http://localhost:3000/api/cron/licencias
```


---

## 8. Interfaz de usuario

### 8.1 Layout general
- Barra superior fija: nombre de la app, y a la derecha el avatar/email del usuario.
- **Menú siempre visible**: sidebar en desktop (≥1024 px), drawer con botón hamburguesa en
  mobile. Las opciones de administrador solo se renderizan si `es_admin`.
- Contenido principal con ancho máximo y padding consistente.
- Diseño **responsive**: la app debe ser usable desde un celular.

### 8.2 Menú
| Opción | Ruta | Visibilidad |
|---|---|---|
| Empleados | `/empleados` | Todos |
| Todos los empleados | `/empleados/todos` | Todos |
| Costo boletos | `/admin/boletos` | Admin |
| Aumento de sueldos | `/admin/aumento` | Admin |
| Feriados | `/admin/feriados` | Admin |
| Descuentos de BPS | `/admin/bps` | Admin |
| Usuarios | `/admin/usuarios` | Admin |
| Salir | `/oauth2/sign_out` | Todos |

### 8.3 Pantalla principal — Empleados (`/empleados`)

Es la **pantalla de inicio**: al ingresar a la aplicación, `/` redirige acá.

Contiene los empleados propios y los compartidos con el usuario **con `visible = true`**, en
**una sola página** (sin paginación), ordenados por alias. Para un administrador el contenido es
el mismo que para cualquier usuario; los empleados ajenos se ven en §8.7.

**Contenido de cada fila:**

- **alias** (grande) y nombre completo (chico, gris);
- **estado** (§4.2.3), como chip de color: Activo / Falta liquidación / Falta pagar / Baja;
- indicadores de "compartido conmigo" y de solo lectura;
- la botonera de acciones.

**No se muestra el salario**, ni acá ni en §8.7. Está en la ficha del empleado.

| Icono (lucide) | Acción | Ruta / comportamiento |
|---|---|---|
| `Eye` | Ver hoja de detalles | `/empleados/[id]` |
| `Timer` | Registrar horas extras | `/empleados/[id]/horas-extras` — planilla mensual (§7.1) |
| `CalendarOff` | Registrar inasistencias | `/empleados/[id]/faltas` — planilla mensual (§7.2) |
| `HandCoins` | Registrar préstamo | diálogo (§7.4) |
| `PlusCircle` | Registrar pago adicional | diálogo (§7.3) |
| `Calculator` | Cálculo de sueldo del mes | `/empleados/[id]/liquidacion` |
| `Palmtree` | Registrar licencia | diálogo (§7.11) |
| `Landmark` | Registrar pago bancario | diálogo (§7.5) |
| `Gift` | Aguinaldo | `/empleados/[id]/aguinaldo` — **deshabilitado salvo en junio y diciembre** |
| `EyeOff` | Ocultar del listado | **solo si el empleado está dado de baja** (§4.2.1). Pone `visible = false` y lo saca de esta pantalla |

Cada icono lleva `tooltip` con el nombre de la acción y `aria-label`. En mobile, la botonera
pasa a un menú de tres puntos.
Si el usuario tiene permiso `VER`, los iconos de registro quedan deshabilitados; el de detalle
y el de cálculo siguen activos. "Ocultar del listado" requiere permiso `EDITAR`.

Al ocultar, el toast de confirmación incluye **Deshacer**, y aclara dónde volver a encontrarlo:
*"{alias} ya no aparece en el listado. Está en «Todos los empleados»."*

Botón destacado **"Nuevo empleado"** arriba a la derecha.

**Una sola consulta.** Empleados accesibles, permiso y estado derivado se resuelven en **una
única operación de base de datos**, no en una consulta por empleado (§11).

### 8.4 Ficha del empleado (`/empleados/[id]`)
Título = alias, subtítulo = nombre completo. Pestañas o secciones:
1. **Datos** — todos los campos de §4.2, editables (si tiene permiso).
2. **Salario** — dos series con su histórico y su alta de nuevo registro (ambas con
   `<SelectorVigencia>`, §5.3):
   - salario y horas semanales, mostrando el valor hora calculado de cada tramo;
   - valor hora "en negro" (§4.3.1), con el valor hora calculado como referencia al lado.
3. **Régimen** — serie histórica + alta, con el validador de suma de horas.
4. **Novedades** — horas extras, faltas y pagos adicionales del mes seleccionado, con edición
   y borrado.
5. **Cuenta corriente** — movimientos con saldo acumulado + plan de pagos pendiente. El saldo
   (§4.9) solo es correcto si las liquidaciones están confirmadas: si hay meses sin liquidación
   confirmada desde el ingreso, muestra el aviso *"El saldo puede estar incompleto: faltan
   confirmar las liquidaciones de …"*.
6. **Licencia** (§4.15) — saldo de días destacado arriba, libro de movimientos con saldo
   acumulado, histórico de períodos de licencia gozados con sus días hábiles y el salario
   vacacional que generó cada uno, y botón "Registrar licencia" (§7.11).
7. **Liquidaciones** — histórico de liquidaciones confirmadas.
8. **Compartido con** — solo visible para el dueño.

### 8.5 Convenciones de presentación
- Los importes se muestran siempre con `$` adelante y separador de miles: `$ 12.345,67`.
  **No se muestra código de moneda.** En la base solo se guarda el número.
- Las horas se muestran como `7,5 h`.
- Los porcentajes como `18,1 %`.
- Los importes negativos (restas) se muestran en rojo y con signo `−`.
- Toasts de confirmación en cada acción; errores de validación inline en el formulario.
- Estados vacíos con texto explicativo y acción sugerida.
- Toda fecha se ingresa con el `<SelectorFecha>` de §8.6. Nunca con combos de día/mes/año.
- Las cargas repetitivas se resuelven **en lote y en una sola pantalla** (§7.1).

### 8.6 Selección de fechas — `<SelectorFecha>`

**Toda** fecha del sistema se ingresa con un **calendario**, nunca con campos separados de
día / mes / año: el **día de la semana** es un dato de negocio —determina si el empleado trabaja
ese día, si la hora extra genera boletos adicionales (§6.5) y cuántas horas puede tener una falta
(§4.6)— y se pierde en un ingreso numérico.

Componente único `<SelectorFecha>` (shadcn `Calendar` + `Popover`), usado en todos los
formularios y diálogos. Requisitos:

- **La semana empieza en lunes** y los encabezados de columna muestran el día (L M M J V S D).
- Resalta: **hoy**, los **feriados** (con el nombre en el tooltip) y los **días sin horas** en el
  régimen vigente del empleado, cuando el contexto tiene un empleado asociado.
- Permite además **tipear** `dd/mm/aaaa` en el campo; el calendario se sincroniza mientras se
  escribe.
- Aplica los límites del contexto (§6.11: no anterior a `fecha_ingreso`, no posterior a hoy)
  **deshabilitando** los días fuera de rango en vez de rechazarlos al guardar.
- Navegación por teclado completa: flechas para moverse, `PageUp`/`PageDown` para cambiar de mes,
  `Enter` para elegir, `Esc` para cerrar.
- En mobile, ancho completo y objetivos táctiles de al menos 44 px.

**Excepción: `<SelectorVigencia>`** (§5.3). Su granularidad es mensual: es un selector de
**mes/año** con las opciones rápidas *Este mes* / *Mes siguiente*. Nunca se pide un día en una
fecha de vigencia.

### 8.7 Todos los empleados (`/empleados/todos`)

Disponible para **todos los usuarios**. Muestra **todos los empleados accesibles por el usuario,
estén visibles o no**:

| Usuario | Alcance |
|---|---|
| Común | Los propios y los compartidos con él, **incluidos los ocultos** (`visible = false`) y los dados de baja |
| Administrador | Además, **todos los empleados del sistema**, sean de quien sean |

Es el único lugar desde donde se puede **volver a mostrar** un empleado oculto, y el único punto
de acceso del administrador a los empleados ajenos.

Tabla con: alias, nombre completo, **dueño**, con quiénes está compartido, fecha de ingreso,
estado (§4.2.3) y si está oculto. Buscador por alias, nombre y dueño; filtros por dueño, por
estado y por visibilidad.

Acciones sobre un empleado **propio o compartido**:

- **Volver a mostrar en el listado** (`visible = true`, icono `Eye`) u **ocultar**
  (`visible = false`, icono `EyeOff`) — requiere permiso `EDITAR`.
- Las mismas acciones que en §8.3, según el permiso.

Acciones adicionales del administrador sobre un empleado **ajeno**:

- **Ver la ficha en modo lectura** (misma pantalla de §8.4, sin ningún botón de edición ni de
  registro de novedades, con un cartel superior: *"Estás viendo un empleado de {dueño} como
  administrador"*).
- **Cambiar el dueño** (necesario también para borrar usuarios, §3.4).
- **Compartirse el empleado a sí mismo**, con permiso Ver o Editar. A partir de ahí el empleado
  aparece en su pantalla "Empleados" y puede operarlo con ese permiso.

Sobre un empleado ajeno, el administrador **no** puede registrar novedades, liquidar, borrar ni
cambiar la visibilidad: primero tiene que compartírselo. Las tres acciones anteriores se
registran en la tabla `auditoria` (§11).

---

## 9. Estructura del proyecto

```
/app
  layout.tsx                     # shell, menú, provider de usuario
  page.tsx                       # redirect → /empleados
  /empleados
    page.tsx                     # listado (§8.3)
    /todos/page.tsx              # todos los accesibles, visibles u ocultos (§8.7)
    /[id]
      page.tsx                   # ficha
      /horas-extras/page.tsx     # planilla mensual (§7.1)
      /faltas/page.tsx           # planilla mensual (§7.2)
      /liquidacion/page.tsx
      /aguinaldo/page.tsx
  /admin
    /boletos /aumento /feriados /bps /usuarios
  /api/cron/licencias/route.ts   # §7.12
  /sin-acceso/page.tsx
/lib
  /auth      currentUser.ts, guards.ts, cronAuth.ts
  /db        prisma.ts
  /calculo   liquidacion.ts, aguinaldo.ts, boletos.ts, bps.ts, licencias.ts, series.ts
  /format    money.ts, dates.ts
/actions     empleados.ts, novedades.ts, prestamos.ts, licencias.ts, admin.ts, ...
/components
  ui/                            # shadcn
  dominio/                       # SelectorFecha (§8.6), SelectorVigencia (§5.3),
                                 # PlanillaMensual (base compartida de §7.1 y §7.2), ...
/prisma      schema.prisma, migrations/, seed.ts
/constants   segurosSalud.ts, recargos.ts, causales.ts
```

**El motor de cálculo (`/lib/calculo`) es código puro**: recibe un objeto de entrada ya
resuelto y devuelve las líneas de la liquidación. No accede a la base ni a la sesión.

---

## 10. Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `PROXY_SHARED_SECRET` | Secreto que debe traer el header `X-Proxy-Auth` |
| `BOOTSTRAP_ADMIN_EMAIL` | Email del primer administrador |
| `CRON_TOKEN` | Token que debe traer el header `X-Cron-Token` en `/api/cron/*` (§7.12) |
| `TZ` | `America/Montevideo` |
| `DEV_IMPERSONATE_USER` | Solo desarrollo: `email|nombre|admin` |

---

## 11. No funcionales

- **Auditoría:** toda escritura registra `creado_por` / `modificado_por` y timestamp.
  Adicionalmente, tabla `auditoria` con `(usuario_id, fecha, entidad, entidad_id, accion, datos_antes, datos_despues)` en JSONB para las operaciones de administrador y las liquidaciones.
- **Transaccionalidad:** préstamo + plan de pagos, confirmación de liquidación, aumento masivo,
  registro de licencia (§7.11) y generación anual de días (§7.12) se ejecutan en una única
  transacción de base de datos.
- **Concurrencia:** las liquidaciones usan el índice único de §4.14 para evitar duplicados.
- **Backups:** documentar en el README el comando de `pg_dump` sugerido y su periodicidad.
- **Accesibilidad:** navegación completa por teclado, `aria-label` en todos los iconos-botón,
  contraste AA.
- **Rendimiento:** el listado de empleados (§8.3) y el de §8.7 se resuelven en **una única
  consulta**, sin N+1. El estado derivado (§4.2.3), que depende de las liquidaciones de dos
  períodos y de los pagos vinculados, se calcula en esa misma consulta con CTEs /
  `LEFT JOIN LATERAL`, no con una consulta por fila ni en el cliente.
- **Logs:** cada Server Action loguea `usuario, acción, entidad, resultado`. No se loguean
  datos personales ni números de cuenta.

---

## 12. Pruebas obligatorias

Tests unitarios de `/lib/calculo` que cubran, como mínimo:

1. Liquidación simple sin novedades.
2. Con faltas parciales y con faltas de día completo (verificando el impacto en boletos).
3. Con horas extras con BPS (afectan materia gravada) y sin BPS (van al final).
4. Con cada uno de los 8 porcentajes de recargo.
5. Con horas extras en un día no laborable del régimen → boletos adicionales.
6. Empleado con seguro de salud que tiene un concepto BPS específico + conceptos generales:
   **se suman todos**.
7. Concepto BPS dado de baja (`porcentaje = NULL`) → no se aplica.
8. Empleado con `aporta_bps = false` (§6.3): la liquidación mensual no tiene ninguna línea de
    descuento BPS aunque existan conceptos vigentes que le aplicarían, y el total es exactamente
    la materia gravada; el `seguro_salud` se ignora. Lo mismo en el salario vacacional y en el
    aguinaldo. Las horas extras con `con_bps = true` se pagan al valor hora calculado, enteras.
9. Cambio de salario, de régimen y de valor de boleto con vigencia el 1° del mes liquidado
   (aplica) y el 1° del mes siguiente (no aplica) → regla de §5.2.
10. Mes con feriados que caen en día laborable y en día no laborable del régimen.
11. Plan de pagos con cuota del mes / sin cuota del mes.
12. Empleado que no cobra boletos.
13. Redondeo: las líneas suman exactamente el total.
14. Datos faltantes → error explícito, no cálculo parcial.
15. Falta por enfermedad con `descuenta = false`: no resta sueldo, pero si es de jornada
    completa sí descuenta el boleto. En `CON_AVISO`, `SIN_AVISO` y `MATERNIDAD` el campo se
    fuerza a `true` aunque llegue en `false` desde el cliente (§4.6.1).
16. Prorrateo del primer mes (§6.9): ingreso a mitad de mes, incluyendo el caso borde de
    ingreso el día 1 (factor = 1) y el último día del mes.
17. Mes intermedio → `factor_prorrateo = 1` y sin línea de prorrateo.
18. Cuenta corriente (§4.9): préstamo + liquidación confirmada + pago bancario dan el saldo
    esperado; anular la liquidación deja el saldo como antes de confirmarla.
19. Liquidación complementaria (§7.6.1) con diferencia **positiva** y con diferencia
    **negativa**: `total_a_pagar` correcto, un único asiento por la diferencia, y el saldo de
    cuenta corriente igual al que habría dado liquidar el mes bien de entrada.
20. Complementaria sobre un período con cuotas de plan de pagos ya `APLICADA`: no se descuentan
    ni se marcan dos veces.
21. Dos complementarias sucesivas sobre el mismo período: `total_ya_liquidado` acumula bien.
22. Aumento masivo (§7.8): el valor hora "en negro" sube el mismo porcentaje que el salario, con
    porcentajes distintos por empleado, y se inserta con la **misma** `fecha_vigencia` que el
    salario; los empleados excluidos no reciben ninguno de los dos registros.
23. Horas extras sin BPS liquidadas en un mes anterior a un aumento → se pagan al valor hora
    "en negro" viejo (§4.3.1 + §5.2).

Tests de licencia (§4.15, §7.11, §7.12):

24. Días hábiles (§4.15.3): período que incluye domingos, sábados y feriados; feriado
    `no_laborable = false` → cuenta como hábil; domingo que además es feriado → se descuenta una
    sola vez.
25. Salario vacacional = `salario / 30 × días hábiles`, con el salario vigente del mes de
    `fecha_desde`.
26. Registrar licencia crea las cuatro cosas de §7.11 en una transacción, y el saldo de días baja
    exactamente en `dias_habiles`.
27. Licencia mayor al saldo → advertencia, saldo negativo, guardado permitido.
28. Períodos superpuestos → rechazado.
29. Los días de licencia descuentan boletos y no descuentan sueldo en la liquidación mensual
    (§6.4).
30. Generación anual (§4.15.4): aniversarios 1, 4, 5, 8 y 12 → 20, 20, 21, 22 y 23 días.
    El aniversario 4 da 20, no 21.
31. Antigüedad = 0 durante el primer año.
32. Ingreso el 29/02 → aniversario el 28/02 en años no bisiestos.
33. Cron (§7.12): ejecutarlo dos veces el mismo día no duplica movimientos; con aniversarios
    atrasados los acredita todos; sin token o desde una IP no loopback responde 404; ignora
    empleados con `activo = false`.

Tests del estado derivado (§4.2.3):

34. Día 10, mes anterior liquidado y pagado, mes en curso sin liquidar → **Activo**.
35. Día 23, mismo escenario → **Falta liquidación**.
36. Día 5 y mes anterior sin liquidar → **Falta liquidación** (el umbral del 23 no interviene).
37. Mes anterior liquidado sin pago registrado → **Falta pagar**, aunque además falte liquidar
    el mes en curso (precedencia).
38. Empleado dado de baja con la liquidación final impaga → **Falta pagar**, no "Baja".
39. Empleado dado de baja con todo liquidado y pagado → **Baja**.
40. Empleado que ingresó este mes → no se le exige liquidación del mes anterior.
41. Empleado dado de baja hace tres meses → no se le exigen liquidaciones posteriores al egreso.

Tests de reglas de acceso y de consulta:

42. Un administrador no ve empleados ajenos en `/empleados`, sí en `/empleados/todos`, y no
    puede registrar novedades sobre ellos hasta compartírselos (§8.7).
43. No se puede anular una liquidación pagada (§7.6.1).
44. No se puede liquidar un período futuro (§6.10), y sí se puede liquidar el mes en curso
    cualquier día del mes.
45. Un empleado oculto (`visible = false`) no aparece en `/empleados` y sí en
    `/empleados/todos`, para su dueño y para quienes lo tienen compartido.
46. El listado completo se resuelve en una sola consulta (test de conteo de queries).

Además: tests de autorización sobre las Server Actions (usuario sin permiso, con `VER`, con
`EDITAR`, dueño, admin).

---

## 13. Puntos pendientes de definición

**13.1 Liquidación final por egreso.** El prorrateo del último mes está especificado (§6.9),
pero falta el cálculo de **despido** y de la **indemnización por licencia no gozada** a partir
del saldo de días de §4.15.1. Hasta entonces, la liquidación del mes de egreso muestra un aviso
de que está incompleta.

**13.2 Descuentos sobre el salario vacacional (§7.11).** Falta definir si lleva descuentos de
BPS en los empleados con `aporta_bps = true`. Hoy se liquida por el monto bruto, sin descuentos.
En los empleados con `aporta_bps = false` ya está resuelto: se paga entero (§6.3).

**13.3 Fórmula del aguinaldo (§7.7).** Definido: los pagos adicionales **no** integran la base.
Falta definir si la base es el promedio del semestre (nominal/12), qué conceptos la integran
(salario, horas extras con BPS, horas extras sin BPS, salario vacacional), si lleva descuentos de
BPS, y si los semestres son dic–may / jun–nov.

**13.4 Fórmula del aumento de sueldos (§7.8).** Falta definir qué parámetros entran: IPC,
porcentaje por franja salarial, correctivo, tope. El resto del caso de uso está especificado.

**13.5 Otros eventos que generan días de licencia (§4.15.1).** Hoy el único es la generación
anual por aniversario (§7.12). Falta definir si existen otros —por ejemplo, generación
proporcional al egresar antes de cumplir el año— y el ajuste manual del saldo, que el modelo ya
contempla con el tipo `AJUSTE`.

---

## Anexo A — Códigos de seguro de salud

Tabla fija (constante en código, `constants/segurosSalud.ts`). No es editable por el usuario.

| Código | Descripción |
|---|---|
| 1 | Beneficiarios con hijos sin cónyuge o concubino a cargo |
| 2 | Con afiliación mutual por otra empresa con hijos sin cónyuge o concubino a cargo |
| 3 | Sin Fonasa, ni prestaciones de actividad (ex seguro convencional) |
| 4 | Otro (cobertura externa o socio vitalicio de mutualistas) |
| 5 | Acumulación de actividades con hijos menores/discapacitado a cargo (complemento de cuota porcentual) |
| 6 | Empleado en subsidio (enfermedad, maternidad, desempleo) |
| 7 | Empleado en subsidio a cargo del Seguro Convencional o Caja de Auxilio |
| 8 | Empleado amparado al Banco de Seguros del Estado (indemnizado) |
| 9 | Contribuyente no beneficiario de afiliación mutual (Socios de sociedades personales, patronos de unipersonal con más de un empleado, sin cuota mutual por cumplir menos de 13 jornales o percibir menos de 1,25 BPC) |
| 10 | Contribuyente rural hasta 500 hás., con hijos sin cónyuge o concubino a cargo |
| 11 | Afiliación Mutual por Convenio |
| 12 | Cobertura por MSP - Decreto 231/2003 |
| 14 | Afiliados sin beneficios de actividad |
| 15 | Beneficiarios SIN hijos SIN cónyuge o concubino a cargo |
| 16 | Beneficiarios CON hijos CON cónyuge o concubino a cargo |
| 17 | Beneficiarios SIN hijos CON cónyuge o concubino a cargo |
| 18 | Contribuyente rural hasta 500 has sin hijos sin cónyuge o concubino a cargo |
| 19 | Contribuyente rural hasta 500 has con hijos y cónyuge o concubino a cargo |
| 20 | Contribuyente rural hasta 500 has sin hijos con cónyuge o concubino a cargo |
| 21 | Socios vitalicios con hijos sin cónyuge o concubino a cargo |
| 22 | Socios vitalicios sin hijos sin cónyuge o concubino a cargo |
| 23 | Socios vitalicios con hijos y cónyuge o concubino a cargo |
| 24 | Socios vitalicios sin hijos con cónyuge o concubino a cargo |
| 25 | Acumulación de actividades, sin hijos a cargo |
| 26 | Acumulación de actividades con hijos y cónyuge o concubino a cargo |
| 27 | Acumulación de actividades sin hijos con cónyuge o concubino a cargo |
| 28 | Con afiliación mutual por otra empresa, sin hijos sin cónyuge o concubino a cargo |
| 29 | Con afiliación mutual por otra empresa con hijos y cónyuge o concubino a cargo |
| 30 | Con afiliación mutual por otra empresa sin hijos con cónyuge o concubino a cargo |
| 42 | Servicios personales sin SNIS con prestaciones actividad (Alta cód. vigencia 01/2012) |
| 99 | Tributa SNS por Servicio Personal |

## Anexo B — Enumeraciones

**Recargo de horas extras:** 0 %, 20 %, 100 %, 120 %, 150 %, 170 %, 200 %, 220 %

**Causales de falta:** Con aviso, Sin aviso, Enfermedad, Maternidad

**Permisos de empleado compartido:** Ver, Editar
