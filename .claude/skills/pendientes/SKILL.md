---
name: pendientes
description: Gestiona el inventario de tareas de PENDIENTES.md en el proyecto de sueldos — agrega un pendiente nuevo, toma una tarea para trabajarla y registra el resultado cuando se resolvió. Úsala cuando el usuario pida anotar o agregar un pendiente, ver qué hay pendiente, tomar o retomar una tarea, o cerrar y registrar una tarea ya hecha.
---

# Gestión de los pendientes

`PENDIENTES.md`, en la raíz del proyecto, lleva el inventario de tareas independientes y su
estado. Este skill lo administra: **agregar**, **tomar** y **registrar**. La resolución en sí no
es parte del skill — se trabaja como cualquier otro pedido, con el contexto que devuelve el flujo
de tomar.

## Invariantes del archivo

Antes de escribir nada, estas seis cosas no se negocian:

1. **Cada tarea abre con el encabezado de cinco campos** —`Número`, `Nombre`,
   `Fecha de solicitud`, `Estado`, `Fecha de realización`— y **cierra con una línea horizontal**
   (`---` sola en su renglón).
2. **`---` no se usa dentro del cuerpo de una tarea**, porque es el delimitador con el que se la
   recorta. Para separar, usar encabezados `###`.
3. **Las tareas nuevas van al final**, con el número siguiente. Los números no se reciclan.
4. **Nada se borra.** Al resolver una tarea se completan el estado y la fecha de realización; el
   cuerpo queda como quedó registro de lo que se pidió.
5. **Cada tarea se lee sola.** Tiene que alcanzar para retomarla en una sesión nueva, sin la
   conversación en la que se detectó: archivos con su ruta, secciones del `SPECS.md` que
   aplican, y qué hay que decidir con el dueño del proyecto si algo quedó abierto.
6. **`PENDIENTES.md` está en `.gitignore`** (son notas locales). Nunca hacerle `git add` ni
   incluirlo en el commit de una tarea.

## Estados

Vocabulario cerrado de tres valores:

| Estado | Cuándo |
|---|---|
| `Pendiente` | Anotada, nadie la está trabajando |
| `En curso` | Reservada por una sesión, con su rama abierta |
| `Hecha, commit <sha>` | Resuelta y commiteada, con el sha corto del commit que la resuelve |

`Fecha de realización` se completa **solo** al pasar a `Hecha`, en formato `dd/mm/aaaa`. La fecha
de hoy sale de `date +%d/%m/%Y`, no de tu memoria.

## Acceso concurrente

El archivo es compartido: otra sesión puede estar tocándolo. **Toda modificación va bajo `flock`**
y **con `sed` cuando se pueda**, para no reescribir el archivo entero.

El candado es `.claude/pendientes.lock` — un archivo estable, dentro de un directorio ignorado.
No usar `PENDIENTES.md` como candado: `sed -i` lo reemplaza por otro inodo y el candado se pierde
a mitad de camino.

```bash
flock .claude/pendientes.lock -c '<comando que toca PENDIENTES.md>'
```

`flock` crea el archivo si no existe. Cuando la decisión depende de lo que dice el archivo
—el número siguiente, o si la tarea sigue `Pendiente`— **leer y escribir en el mismo `-c`**, o
volver a leer bajo el candado antes de escribir: entre un `grep` suelto y el `sed` de después
entra otra sesión.

## Cada tarea se trabaja en su worktree

**No se trabaja en el directorio compartido.** `/home/erapetti/claude/sueldos` es el directorio de
todos: ahí hay un `next dev` levantado, y otra sesión puede tener su rama y su trabajo a medio
hacer. La rama que está activa **cambia bajo tus pies**, así que:

- un `git commit` cae en la rama de la tarea de otro —pasó el 27/08/2026: el commit del skill
  terminó en `breadcrumb-encabezado-empleada`, que era la rama que otra sesión había abierto ahí
  mientras tanto—;
- un `git add -A` se lleva archivos ajenos al commit;
- un `git switch` le mueve el checkout al que está trabajando.

Ninguna de las tres se arregla con cuidado: se arreglan trabajando en otro directorio.

### Crearlo

Con la rama derivada del campo `Nombre` de la tarea: minúsculas, sin acentos, palabras con
guiones, tres o cuatro palabras (`Corregir el hover de los botones activos` → `hover-boton-activo`).

```bash
git worktree add .claude/worktrees/<slug> -b <slug> main
```

Después, entrar con la herramienta **`EnterWorktree` pasándole `path`**, que mueve la sesión al
directorio nuevo. Este skill es la instrucción de proyecto que la habilita: no hace falta volver a
pedir permiso para usarla.

**La base se pone explícita: `main` local.** Acá no se hace push, así que `origin/main` queda atrás
de `main` en cuanto se mergea la primera tarea. `EnterWorktree` creando el worktree por su cuenta
—con `name` en vez de `path`— parte de `origin/main`, y la rama arrancaría sobre código viejo.

El worktree queda en `.claude/worktrees/`, que está ignorado: no aparece en `git status` del
directorio compartido.

### Prepararlo

Un worktree nuevo no trae nada de lo que está ignorado, y sin eso el `typecheck` miente:

```bash
cp /home/erapetti/claude/sueldos/.env .env
npm ci
npx prisma generate
```

Para verificar en el navegador, el servidor va en **su propio puerto** —el 3000 es del directorio
compartido—:

```bash
npx next dev -p <puerto>
```

### La base de datos sí es compartida

El `.env` copiado apunta a la misma base. Dos consecuencias que no se ven venir:

- **`npm run delete_all_data_and_test` borra la base de todos**, no la tuya. Avisar antes de
  correrlo, y resembrar después con `SEED_DEMO=1 npm run db:seed`.
- Un dato que cargás para probar aparece en la pantalla del que está al lado.

El clon que está documentado al principio de `PENDIENTES.md` **no cambia esto**: copia el mismo
`.env`, así que también cae en la base compartida. Aislarla pide apuntar el `.env` a otra base, y
eso no está documentado ni probado: si la tarea lo necesita, plantearlo en vez de improvisarlo.

### Al terminar

El worktree se conserva hasta que el trabajo esté mergeado a `main`: `ExitWorktree` con
`action: "keep"`. Con `remove` se borra el directorio **y la rama**, así que recién va cuando la
tarea ya está mergeada o se abandona.

## Flujo 1 — Agregar un pendiente

1. **Número siguiente**, siempre desde el archivo:

   ```bash
   flock .claude/pendientes.lock -c "grep -oP '^- \*\*Número:\*\* \K[0-9]+' PENDIENTES.md | sort -n | tail -1"
   ```

2. **Escribir el bloque en un archivo aparte** (en el scratchpad), no en un heredoc dentro del
   `-c`: los cuerpos llevan backticks, comillas y `$`, y el anidado de quoting se rompe.
   Plantilla:

   ```markdown

   ## Tarea N — <título, una línea, lo que pasa o lo que falta>

   - **Número:** N
   - **Nombre:** <nombre corto, del que se deriva la rama>
   - **Fecha de solicitud:** dd/mm/aaaa
   - **Estado:** Pendiente
   - **Fecha de realización:**

   ### Qué existe hoy

   ### Qué hay que hacer

   ### A tener en cuenta

   ### Cómo verificar

   ### Al terminar

   ---
   ```

   El bloque **empieza con un renglón vacío** y **termina con `---`**, que es lo que lo separa
   del anterior y lo cierra.

   De las cinco secciones, **«Qué hay que hacer» y «Cómo verificar» son obligatorias**; las otras
   tres van si tienen algo que decir. Lo que se espera de cada una:

   - **Qué existe hoy** —o **De dónde viene**, si es un problema y no un faltante— el estado de
     las cosas y por qué se pide el cambio.
     Componentes y archivos con su ruta; si hay una decisión del dueño del proyecto detrás,
     escribirla, que es lo que evita que la próxima sesión la vuelva a discutir.
   - **Qué hay que hacer** — el alcance. Cuando toca varios archivos, una tabla
     «Dónde | Qué» sale mejor que la prosa.
   - **A tener en cuenta** — las trampas: lo que parece un caso más y no lo es, lo que **no** hay
     que hacer, y lo que queda afuera a propósito.
   - **Cómo verificar** — qué mirar en el navegador, y el comando de checks en un bloque `bash`.
     Compilar no alcanza; si hay que ver una pantalla, decir cuál y con qué empleada de ejemplo.
     Si los checks incluyen `npm run delete_all_data_and_test`, avisar que después hay que
     resembrar con `SEED_DEMO=1 npm run db:seed`.
   - **Al terminar** — las notas de `IMPLEMENTATION_HINTS.md` o `README.md` que quedan
     desactualizadas cuando la tarea se resuelva. Si la tarea diverge del `SPECS.md`, acá va que
     la divergencia se documenta y se le plantea al dueño del proyecto: **el `SPECS.md` no se
     edita sin su permiso**.

3. **Agregar bajo el candado**, verificando que el número no se lo ganó otra sesión:

   ```bash
   flock .claude/pendientes.lock -c '
     grep -q "^- \*\*Número:\*\* N$" PENDIENTES.md && { echo "el número N ya existe"; exit 1; }
     cat <ruta-del-bloque> >> PENDIENTES.md
   '
   ```

4. Confirmar con el número y el nombre asignados. **No commitear**: el archivo está ignorado.

## Flujo 2 — Tomar una tarea

1. **Mostrar el inventario** y que el usuario elija, si no dijo cuál:

   ```bash
   awk '/^## Tarea /{t=$0} /^- \*\*Estado:\*\*/{print t"  ||  "substr($0,15)}' PENDIENTES.md
   ```

2. **Reservarla**: pasar el estado a `En curso` en la misma operación que verifica que estaba
   `Pendiente`. El rango de `sed` va del `Número` de la tarea a su `Fecha de realización`, así el
   reemplazo no puede escapar al bloque de otra:

   ```bash
   flock .claude/pendientes.lock -c '
     sed -n "/^- \*\*Número:\*\* N$/,/^- \*\*Fecha de realización:/p" PENDIENTES.md | grep -q "^- \*\*Estado:\*\* Pendiente$" || { echo "la tarea N no está Pendiente"; exit 1; }
     sed -i "/^- \*\*Número:\*\* N\$/,/^- \*\*Fecha de realización:/{s|^- \*\*Estado:\*\*.*|- **Estado:** En curso|}" PENDIENTES.md
   '
   ```

   Si ya está `En curso`, **no la pises**: avisá al usuario y preguntá si la retoma igual —puede
   ser una rama suya que quedó a medias— o si prefiere otra.

3. **Abrir el worktree de la tarea** y entrar, como está arriba en «Cada tarea se trabaja en su
   worktree». Es el paso que no se saltea: sin él, el commit del final termina en la rama de
   otro. Si el worktree ya existe —porque se retoma algo que quedó a medias— entrar al que hay
   en vez de crear otro:

   ```bash
   git worktree list
   ```

4. **Devolver el contexto**: leer el bloque completo y trabajarlo desde ahí, no desde el resumen.

   ```bash
   sed -n '/^## Tarea N —/,/^---$/p' PENDIENTES.md
   ```

   Si la tarea deja algo a decidir con el dueño del proyecto, esa pregunta va **antes** de
   escribir código.

## Flujo 3 — Registrar el resultado

En orden, porque el sha del commit es lo último que aparece:

1. **Correr los checks de «Cómo verificar»** de esa tarea, y verificar en el navegador lo que la
   tarea pida mirar. Si algo falla, no se registra: se arregla o se informa como está.
2. **Hacer lo de «Al terminar»** — las notas de `IMPLEMENTATION_HINTS.md` / `README.md`— en el
   mismo commit que la solución.
3. **Antes de commitear, verificar dónde estás.** Tres líneas, y las tres tienen que dar lo
   esperado: el directorio es el worktree de la tarea, la rama es su slug, y lo modificado es
   tuyo y nada más.

   ```bash
   git rev-parse --show-toplevel && git rev-parse --abbrev-ref HEAD && git status --short
   ```

   Si el directorio es el compartido, o aparecen archivos que no tocaste, **pará**: estás en el
   checkout de otra tarea y el commit va a caer en su rama.

4. **Commitear en la rama de la tarea. No se hace push.** El mensaje va en español, en presente,
   describiendo el efecto y no el diff, como el resto del `git log`. Agregar los archivos por
   nombre, no con `-A`. `PENDIENTES.md` queda afuera del commit —está ignorado— y también las
   notas de `IMPLEMENTATION_HINTS.md` van adentro, no aparte.
5. **Tomar el sha corto** y escribirlo en el archivo:

   ```bash
   SHA=$(git rev-parse --short HEAD)
   HOY=$(date +%d/%m/%Y)
   flock .claude/pendientes.lock -c "sed -i '/^- \*\*Número:\*\* N\$/,/^- \*\*Fecha de realización:/{s|^- \*\*Estado:\*\*.*|- **Estado:** Hecha, commit $SHA|; s|^- \*\*Fecha de realización:\*\*.*|- **Fecha de realización:** $HOY|}' PENDIENTES.md"
   ```

   El sha es el del commit que **resuelve** la tarea, no el del merge a `main`.

6. Si al resolverla apareció trabajo que quedó afuera del alcance, **es una tarea nueva**: volver
   al flujo 1. El cuerpo de la tarea vieja no se reescribe para meterlo.

## Después de tocar el archivo

Verificá que la estructura quedó sana — un número por tarea y el archivo cerrado con `---`:

```bash
grep -c '^## Tarea ' PENDIENTES.md && grep -c '^- \*\*Número:\*\*' PENDIENTES.md && tail -1 PENDIENTES.md
```
