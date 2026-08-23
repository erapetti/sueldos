# Notas de implementación

Memoria de las decisiones tomadas al construir la aplicación. No repite el
[SPECS.md](SPECS.md) —que es la especificación funcional— ni el [README.md](README.md) —que
es cómo desplegarla—: acá está el **porqué** de lo que no se deduce leyendo el código.

Si vas a cambiar algo, empezá por acá. Está ordenado por lo que más caro sale desconocer.

---

## 1. El SPECS no describe exactamente lo que está construido

`SPECS.md` es normativo pero hay puntos donde la implementación diverge, por decisión
explícita o por imposibilidad técnica. **No se puede editar el SPECS**, así que las
divergencias viven acá.

### 1.1 La base es MySQL 8, no PostgreSQL

El §2 y el §10 dicen PostgreSQL 16+. Se implementó sobre **MySQL 8** por decisión del
proyecto. Las adaptaciones están en el README, sección «Adaptaciones a MySQL». Lo que importa
recordar: hay **tres columnas que no existen en el SPECS** y que están solo para que MySQL
pueda expresar restricciones que en PostgreSQL serían índices parciales.

| Columna | Tabla | Para qué |
|---|---|---|
| `uk_vigente` | `liquidaciones` | Vale `1` mientras la liquidación está vigente y `NULL` cuando se anula. MySQL considera distintos entre sí los `NULL` de un índice único, así que varias anuladas conviven y solo puede haber una vigente. Emula el `WHERE estado <> 'ANULADA'` del §4.14 |
| `seguro_salud_clave` | `bps_conceptos` | `seguro_salud` normalizado a `*` cuando es `NULL`. Sin esta columna el único de §4.11 **no restringiría nada** para los conceptos generales, porque los `NULL` no se comparan |
| `liquidacion_aplicada_id` | `plan_pagos` | Qué liquidación marcó la cuota como `APLICADA`. Permite que anular una complementaria devuelva a `PENDIENTE` exactamente las cuotas que ella aplicó, y no las de una secuencia anterior del mismo período (§7.6.1) |

**Si tocás alguna de estas tres, releé el §4.14, §4.11 o §7.6.1 antes.** Son restricciones de
negocio disfrazadas de detalle técnico.

Las migraciones son cuatro y hay una escrita a mano:

- `20260818000000_init` — generada por Prisma
- `20260818000100_restricciones` — **a mano**: los `CHECK` de §5.1 y las validaciones de §4.x
- `20260818000200_cuota_liquidacion` — `liquidacion_aplicada_id`
- `20260818000300_bps_clave_seguro` — `seguro_salud_clave`

`prisma migrate dev` no conoce los `CHECK` y los reporta como drift. Para cambiar el modelo:
`prisma migrate dev --create-only` y volver a agregarlos si la migración generada recrea
alguna de esas tablas.

### 1.2 El valor hora se calcula distinto de lo que dice el §4.3

El §4.3 escribe `salario / horas_semanales * (52 / 12)`. Leído literal, con $60.000 y 40 h da
**$6.500 la hora**, que es absurdo: una hora extra al 100 % costaría $13.000 y 8 horas de
falta descontarían $52.000 de un sueldo de $60.000.

Se implementó `salario / (horas_semanales × 52/12)` — el salario dividido las ~173,33 horas
del mes—, **confirmado con el usuario**. El §4.3 sigue diciendo lo otro.

### 1.3 Los importes se redondean a pesos enteros, en el cálculo

El §4.3 dice que el valor hora se usa con precisión completa y el §6.7 que cada línea se
redondea a 2 decimales. **Ninguna de las dos se cumple hoy.**

El motivo está medido: redondeando solo al mostrar, la columna de la liquidación no cerraba
en **6 de cada 10 casos** —se despegaba entre 1 y 3 pesos, sobre 5.000 liquidaciones
simuladas con el motor real—. Como la liquidación se controla a mano, se decidió redondear en
el cálculo: lo que se ve es exactamente lo que se suma.

La regla es **una sola**: se redondea al cerrar cada línea, nunca antes. Los pasos intermedios
siguen con precisión completa. La función es `redondearPesos` en `lib/format/money.ts` y ahí
está el detalle.

Lo que **no** se redondea son los importes que tipea el usuario —salario, pagos adicionales,
préstamos, valor del boleto—: se guardan tal cual y el redondeo de la línea los absorbe. Se
ofreció restringir los formularios a pesos enteros y el usuario prefirió dejarlo así.

No se migraron los datos anteriores al cambio. Por eso la pestaña de cuenta corriente decide
sola si muestra centavos: si **todos** los importes de la pantalla son enteros los oculta, y
si alguno los tiene los muestra en toda la columna. Ver `todosEnteros`.

### 1.4 El loopback del cron no se puede implementar como está escrito

El §7.12 pide que `/api/cron/*` verifique que la conexión viene de loopback. **Next 16 no
expone la dirección del socket a los route handlers.** Lo único disponible es
`x-forwarded-for`, y está verificado que es falsificable: mandando
`X-Forwarded-For: 10.0.0.7` desde localhost, Next respeta el valor del cliente.

La condición se hace cumplir en el borde, no en la app: **el proceso escucha solo en
127.0.0.1** (`next start --hostname 127.0.0.1`), y nginx bloquea `/api/cron/` hacia afuera.
La verificación del header queda como segunda línea de defensa. Está explicado en
`lib/auth/cronAuth.ts` y en el README.

Si algún día Next expone la dirección real, ese es el lugar a cambiar.

### 1.5 Funcionalidad pendiente de definición (§13)

Aguinaldo (§13.3) y Aumento de sueldos (§13.4) muestran **«funcionalidad no implementada
aún»**, por pedido del usuario. Pero no están vacíos:

- El aumento masivo tiene **toda la parte transaccional implementada y testeada** en
  `actions/aumento.ts`. Cuando se defina el criterio, lo único que falta es producir el
  salario nuevo de cada empleado; la inserción del salario y del valor hora «en negro» con la
  misma vigencia y el mismo porcentaje ya funciona.
- El aguinaldo solo tiene `esMesDeAguinaldo` y el semestre, que es lo único que el §7.7 deja
  cerrado.

---

## 2. Reglas de arquitectura que conviene no romper

### 2.1 `lib/calculo` es código puro

Recibe un objeto de entrada ya resuelto y devuelve las líneas. **No accede a la base ni a la
sesión** (§9). Es lo que permite testear las 46 pruebas del §12 sin infraestructura.

El puente entre la base y el motor es `lib/liquidacion/datos.ts`: resuelve las series
vigentes (§5.2), los conceptos de BPS aplicables (§4.11) y las novedades del período. Si
necesitás un dato nuevo en el cálculo, se agrega **ahí**, no dentro del motor.

### 2.2 Un solo lugar lee la identidad

`lib/auth/currentUser.ts` es el **único** archivo que lee `x-forwarded-user`,
`x-forwarded-email` y `x-forwarded-preferred-username` (§3.2). No lo repliques: si otro
archivo empieza a leer headers de identidad, la superficie de ataque se multiplica y deja de
ser auditable.

### 2.3 Toda Server Action valida permisos en el servidor

Ocultar un botón no es control de acceso (§3.4). Los guards están en `lib/auth/guards.ts` y
cada acción arranca con uno: `exigirEdicion`, `exigirDueno`, `exigirAdmin`…

Ojo con la distinción del nivel `ADMIN`: un administrador sobre un empleado **ajeno** puede
ver la ficha, cambiar el dueño y compartírselo a sí mismo, pero **no** registrar novedades ni
liquidar hasta compartírselo (§8.7). Está en `exigirEdicion`.

### 2.4 Las fechas de negocio son medianoche UTC

Todas las fechas del SPECS son `DATE`: sin hora, sin zona. Se representan como un `Date` a la
**medianoche UTC** y se leen con los getters `UTC*`. `America/Montevideo` interviene en un
solo lugar: `hoy()`.

La conexión a MySQL se abre con `timezone=Z` (ver `lib/db/prisma.ts`), verificado: los
timestamps se guardan en UTC aunque el proceso corra con `TZ=America/Montevideo`.

**No uses `new Date()` ni `getMonth()` en código de negocio.** Todo pasa por
`lib/format/dates.ts`.

### 2.5 Los Decimal de Prisma no son los de decimal.js

Prisma devuelve una clase propia. Se convierte **siempre por `toString()`**, con los helpers
de `lib/db/mapeo.ts` (`aDecimal`, `aColumnaImporte`…). No pases un Decimal de Prisma a una
función que espera uno de decimal.js.

### 2.6 `components/ui` vs `components/dominio`

shadcn **no es una dependencia**: es un generador que copia el código, así que
`components/ui/` es nuestro. El criterio para decidir dónde va un cambio:

- **Corrección de un default equivocado** → va en `ui/`. Hoy hay **una sola divergencia**,
  documentada en el README: `SelectTrigger` pasó de `w-fit` a `w-full min-w-0` porque crecía
  sin tope con el texto de la opción y rompía el layout.
- **Comportamiento propio del dominio** → va en `dominio/`. Por eso `SelectorFecha` y
  `SelectorVigencia` envuelven a los de shadcn en vez de modificarlos: la semana que empieza
  en lunes o los feriados resaltados no son cosas que shadcn deba saber.

Si agregás una modificación a `ui/`, **listala en el README**. Un comentario dentro del
archivo no sirve: nadie lee un archivo que está por sobrescribir.

---

## 3. Trampas que ya costaron tiempo

| Síntoma | Causa | Dónde |
|---|---|---|
| `Only async functions are allowed to be exported in a "use server" file` | Un archivo de acciones exportaba una constante | Las constantes van a `lib/`, no al archivo de acciones. Pasó con `AUMENTO_NO_IMPLEMENTADO` |
| El middleware no se ejecuta | Next 16 renombró `middleware.ts` a **`proxy.ts`** | `proxy.ts` en la raíz. No tiene relación con oauth2-proxy |
| `The datasource property url is no longer supported` | Prisma 7 sacó la URL del schema | Va en `prisma.config.ts`, y el cliente necesita un **driver adapter** (`@prisma/adapter-mariadb`) |
| Warning de `package-lock.json` ignorado al arrancar | Next sube por el árbol buscando lockfiles | `outputFileTracingRoot` fijo en `next.config.ts` |
| `npm audit` en rojo por `deepmerge-ts` | Llega por el CLI de Prisma, que es devDependency | `overrides` en `package.json`. **Nunca `npm audit fix --force`**: baja a Prisma 6 y rompe todo |
| ESLint: `set-state-in-effect` | Estado derivado sincronizado con un efecto | Patrón «comparar contra el valor anterior durante el render», o montar el componente solo cuando hace falta. Los diálogos usan lo segundo |
| Un test de integración deja la base vacía | `limpiarBase()` **borra todas las tablas** de `DATABASE_URL` | Nunca apuntar los tests a una base con datos reales. Si desarrollás y corrés tests, tenés que volver a sembrar |

---

## 4. Cómo están armados los tests

226 tests en 8 archivos. La división importa:

- **Puros** (`liquidacion`, `licencias`, `estado`, `cuentaCorriente`, `formato`) — no tocan la
  base, corren en milisegundos. Acá va todo lo que se pueda.
- **De integración** (`integracion`, `cron-aumento`, `listados`) — contra la base real.
  Cubren lo que solo se puede verificar con transacciones: complementarias, idempotencia del
  cron, permisos, y el conteo de queries del §11.

Los de integración mockean `@/lib/auth/currentUser` y usan `actuarComo()` para cambiar de
usuario. El stub de `server-only` y los mocks de `next/cache` están en `tests/setup.ts` y
`tests/stubs/`.

**Los casos del §12 están numerados en los `describe`.** Si agregás un caso del SPECS, seguí
la numeración: hace que se pueda auditar la cobertura contra la especificación.

### El calendario de referencia

Casi todos los tests usan **abril de 2026**: 30 días, arranca miércoles, 22 días de lunes a
viernes, 4 sábados. Y el empleado base es **$65.000 por 30 h semanales**, elegido para que el
valor hora dé exacto: `65.000 / (30 × 52/12) = $500`. Si cambiás la base, se rompen decenas de
aserciones.

---

## 5. Lo que quedó sin verificar

Sé honesto sobre esto antes de poner la aplicación en producción.

**Todo se probó contra MariaDB 10.11, no contra MySQL 8.** El MySQL de la máquina de
desarrollo no permitía `ALTER` ni `INSERT`, así que se levantó una instancia propia de MariaDB
en un directorio temporal. Es buen proxy pero no es lo mismo. Lo que más podría diferir son
los `CHECK` de la migración `20260818000100_restricciones`.

**Antes de dar esto por bueno: correr `prisma migrate deploy` y la suite completa contra un
MySQL 8 real.**

Tampoco se probó contra un **oauth2-proxy real**. La configuración de nginx del README está
razonada pero no ejecutada; el punto más frágil es que los `$upstream_http_x_auth_request_*`
dependen de que `--set-xauthrequest=true` esté puesto.

---

## 6. Decisiones de presentación que el SPECS no fijaba

- **Agrupación de líneas.** Las horas extras se agrupan por porcentaje de recargo y emiten una
  línea por recargo; los pagos adicionales y las cuotas emiten una línea cada uno. El §6.7
  fija la línea como unidad de redondeo, así que la suma cierra igual.
- **Estados vacíos y toasts.** Cada acción devuelve un `Resultado` (`lib/acciones/resultado.ts`)
  que el hook `useAccion` traduce a toast de éxito, aviso o error, y a errores por campo. Si
  agregás una acción, seguí ese contrato: la UI ya sabe qué hacer con él.
- **Los avisos del §5.3 y del §6.11** viajan en el campo `aviso` del resultado, no como
  excepción. Son informativos: la operación se guardó igual.
