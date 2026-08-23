/**
 * §8.1 — shell de la aplicación: barra superior fija, menú siempre visible y contenido con
 * ancho máximo. El usuario se resuelve una sola vez por request (§3.2).
 *
 * La estética sigue el componente "App Shell" del diseño "webapp" de Claude Design:
 * fondo cálido con halos radiales, superficies crema, tipografía serif de display para
 * los títulos y geometría de píldora.
 */
import type { Metadata } from 'next'
import { Instrument_Sans, Instrument_Serif } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { MenuLateral, MenuMobile } from '@/components/layout/Menu'
import { usuarioActual } from '@/lib/auth/currentUser'
import './globals.css'

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Liquidación de sueldos',
  description: 'Cálculo del total a pagar a empleados',
}

/** Iniciales para el avatar de la barra superior (dos palabras como máximo). */
function iniciales(nombre: string | null, email: string) {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length > 0) {
    return partes
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual()

  return (
    <html lang="es-UY" className={`h-full antialiased ${sans.variable} ${serif.variable}`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>
          <header className="sticky top-0 z-40 flex h-[62px] items-center gap-2.5 border-b bg-card pr-3.5 pl-2.5 no-print">
            {usuario ? <MenuMobile esAdmin={usuario.esAdmin} email={usuario.email} /> : null}

            <div className="flex min-w-0 items-center gap-2.5 pl-1">
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-full rounded-bl-[4px] bg-primary"
              />
              <span className="truncate font-serif text-[21px] leading-none">
                Liquidación de sueldos
              </span>
            </div>

            {usuario ? (
              <div className="ml-auto flex items-center gap-2.5">
                <span className="hidden truncate text-sm text-muted-foreground md:inline">
                  {usuario.nombre ?? usuario.email}
                </span>
                <span
                  title={usuario.email}
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold tracking-wide text-primary-ink"
                >
                  {iniciales(usuario.nombre, usuario.email)}
                </span>
              </div>
            ) : null}
          </header>

          <div className="flex flex-1">
            {usuario ? <MenuLateral esAdmin={usuario.esAdmin} /> : null}
            <main className="canvas-app min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1080px] px-[18px] pt-[26px] pb-[60px] print-full">
                {children}
              </div>
            </main>
          </div>

          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  )
}
