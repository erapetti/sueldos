# Actualizar dependencias

Procedimiento para subir versiones de npm sin arriesgar la working copy ni
descubrir los problemas en producción. Escrito después de subir Prisma de
7.9.1 a 7.10.0; los ejemplos usan ese caso.

La idea de fondo: **probar la actualización en un worktree descartable con su
propio `node_modules`**, y recién cuando pasa todo, llevar los dos archivos
—`package.json` y `package-lock.json`— a una rama.

## 1 — Una rama propia para la actualización

Aunque estés en medio de otro trabajo, la actualización va en su **propia
rama**, salida de `main`:

```bash
git switch main
git switch -c actualizacion-dependencias
```

No la mezcles con la rama en la que venías laburando. Un bump de dependencias
se revisa, se mergea y —si hace falta— se revierte por separado del código: si
comparte rama con una refactorización, revertir uno arrastra al otro.

## 2 — Worktree descartable, fuera del repo

```bash
git worktree add --detach /tmp/deps HEAD
```

**Tiene que estar fuera del árbol del repositorio**, y por eso `/tmp` y no
`.claude/worktrees/`. Node busca `node_modules` subiendo por los directorios
padre: un worktree que cuelgue de `/home/erapetti/claude/sueldos/` encuentra el
`node_modules` del repo principal y usa **las dependencias viejas** sin decir
nada. Toda la prueba te daría verde sin haber ejercitado las versiones nuevas.

Si querés probar la actualización junto con cambios que todavía no commiteaste,
llevalos con un patch:

```bash
git diff HEAD --binary > /tmp/cambios.patch
git -C /tmp/deps apply /tmp/cambios.patch
```

## 3 — El `.env` no se copia

El worktree no tiene `.env` —está en `.gitignore`—, y `prisma.config.ts` hace
`import 'dotenv/config'`, así que sin él `env('DATABASE_URL')` explota. Cargalo
en el entorno del shell en vez de copiar el archivo:

```bash
set -a; . /home/erapetti/claude/sueldos/.env; set +a
```

`prisma generate` **no se conecta a la base**: solo lee el schema. El error
`PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`
engaña — alcanza con que la variable exista.

## 4 — Antes de tocar nada: mirá qué es «latest»

```bash
npm view <paquete> dist-tags
```

**No confíes en el cartel del update notifier ni en `@latest`.** Prisma llegó a
publicar `8.0.0-rc.10` bajo el dist-tag `latest`, así que
`npm i prisma@latest` te instalaba una release candidate. Compará contra la
lista de estables antes de decidir:

```bash
npm view <paquete> versions --json
```

Las majors se prueban aparte y nunca se estrenan en producción.

## 5 — Subir los rangos y actualizar el resto

En `package.json`, cambiá el rango de lo que querés subir —**todos** los
paquetes de la misma familia, que se mueven juntos: `prisma`,
`@prisma/client` y `@prisma/adapter-mariadb`— y después:

```bash
npm install   # aplica los rangos nuevos
npm update    # sube el resto dentro de los rangos ya declarados
```

## 6 — `allowScripts`: el paso que es fácil olvidarse

`package.json` tiene un campo `allowScripts` con las aprobaciones de install
scripts **fijadas a versiones exactas**:

```json
"allowScripts": {
  "@prisma/engines@7.10.0": true,
  "prisma@7.10.0": true
}
```

Al subir de versión esas claves dejan de aplicar y **los install scripts pasan
a no ejecutarse**, con un `npm warn allow-scripts` como única señal. Actualizá
las claves a las versiones nuevas y volvé a instalar hasta que el warning
desaparezca. Con Prisma no rompe —los motores vienen en el paquete, no se
bajan— pero con otro paquete sí puede.

## 7 — Revisá lo que documenta versiones

Un bump deja mentiras en la documentación. Buscá la versión vieja en todo el
repo y arreglá lo que corresponda:

```bash
grep -rn "7\.9\.1" --include="*.md" --include="*.json" .
```

En particular, `comentarioOverrides` en `package.json` y el README describen
por qué existe cada `overrides`, con una condición para sacarlo. **Verificá si
la condición se cumplió** en vez de suponerlo:

```bash
npm view @prisma/config@7.10.0 dependencies.deepmerge-ts
```

Si sigue devolviendo `7.1.5`, el override de `deepmerge-ts` se queda y solo se
refresca la versión mencionada.

## 8 — Verificar, en el worktree

```bash
npx prisma generate
npm run typecheck
npx eslint app components lib actions hooks
npm run build
```

Y los tests. Ojo:

> `npm test` **no corre la suite completa**: tres archivos
> (`cron-aumento`, `integracion`, `listados`) se traban a propósito y quedan
> como «failed». Son los que tocan la base.

Para correrlos hay que pedirlo explícitamente, y **eso borra todas las tablas
de la base que apunte `DATABASE_URL`**. Verificá adónde apunta antes:

```bash
node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.pathname)"
npm run delete_all_data_and_test
```

Son 275 tests en 12 archivos. Después, `npm run db:seed` repone datos de
desarrollo.

## 9 — Llevar el resultado a la rama y limpiar

Solo viajan dos archivos; el `node_modules` y el cliente generado no se
commitean:

```bash
cp /tmp/deps/package.json /tmp/deps/package-lock.json .
git add package.json package-lock.json
git commit
```

Y **borrá el worktree**, que ocupa más de 1 GB entre `node_modules` y `.next`:

```bash
git worktree remove --force /tmp/deps
git worktree prune
rm -f /tmp/cambios.patch
```

## 10 — Después del merge

```bash
npm ci
```

`npm ci` y no `npm install`: instala exactamente lo que dice el lock y no lo
reescribe. Lo mismo vale para el pipeline de producción — si ahí corre
`npm install`, un rango con caret te puede subir de versión sin que nadie lo
haya decidido.

## Resumen de las trampas

| Trampa | Qué pasa | Cómo se evita |
|---|---|---|
| Worktree dentro del repo | Usa el `node_modules` del padre y probás las versiones viejas | Worktree en `/tmp` |
| `@latest` | Puede ser una release candidate | `npm view <pkg> dist-tags` |
| `allowScripts` | Fijado a versiones exactas; al subir, los install scripts no corren | Actualizar las claves |
| `npm test` | Deja 3 archivos sin correr y los marca como failed | `npm run delete_all_data_and_test` |
| `delete_all_data_and_test` | Vacía la base de `DATABASE_URL` | Verificar el host antes |
| `npm install` en producción | Puede subir versiones dentro del caret | `npm ci` |
| Versiones en la documentación | Quedan desactualizadas y mienten | `grep` de la versión vieja |
