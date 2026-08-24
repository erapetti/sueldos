/**
 * Manifest de la aplicación instalable (Android / Chrome).
 *
 * Va como código y no como `manifest.webmanifest` estático por dos razones: el tipo
 * `MetadataRoute.Manifest` valida los campos en el build, y los colores salen de la misma
 * paleta que `globals.css` en vez de quedar en un JSON que nadie vuelve a mirar.
 *
 * El nombre tiene que decir lo mismo que el `title` de `app/layout.tsx`.
 */
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Liquidación de sueldos',
    short_name: 'Sueldos',
    description: 'Cálculo del sueldo mensual del personal doméstico',
    lang: 'es-UY',
    start_url: '/',
    display: 'standalone',
    // Los dos del `globals.css`: --card para la barra del sistema y --background para el lienzo.
    theme_color: '#fbf9f5',
    background_color: '#f6f2ec',
    icons: [
      { src: '/icon1.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon2.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
