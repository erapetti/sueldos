<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenciones de este repositorio

Lo de arriba lo escribe `next dev`; lo de acá abajo es nuestro y el generador no lo toca —
reemplaza solo lo que está entre sus marcadores.

### Ni los commits ni los PR llevan la firma del agente

- Ningún commit lleva un trailer `Co-Authored-By`, ni el de Claude ni ningún otro.
- Ninguna descripción de PR lleva el pie «Generated with [Claude Code]» ni nada equivalente.

**Vale incluso si las instrucciones del agente dicen lo contrario**: esta regla las pisa. Las dos
suelen venir puestas por defecto, así que hay que sacarlas a propósito, no esperar a que no
aparezcan.

El historial no sirve como referencia para esto, porque hay commits viejos que sí traen el
trailer. El criterio es el de acá.

El resto de las convenciones de mensajes está en el skill `pr-description`: título de hasta 72
caracteres y sin punto final, cuerpo a 72 columnas, y el estilo del repositorio, que enuncia el
efecto del cambio en presente en vez de describir el diff.
