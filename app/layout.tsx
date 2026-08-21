/**
 * §8.1 — shell de la aplicación: barra superior fija, menú siempre visible y contenido con
 * ancho máximo. El usuario se resuelve una sola vez por request (§3.2).
 */
import type { Metadata } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { MenuLateral, MenuMobile } from '@/components/layout/Menu'
import { usuarioActual } from '@/lib/auth/currentUser'
import './globals.css'

export const metadata: Metadata = {
  title: 'Liquidación de sueldos',
  description: 'Cálculo del total a pagar a empleados',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual()

  return (
    <html lang="es-UY" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4 no-print">
            {usuario ? <MenuMobile esAdmin={usuario.esAdmin} /> : null}
            <span className="font-semibold">Liquidación de sueldos</span>
            {usuario ? (
              <span className="ml-auto truncate text-sm text-muted-foreground" title={usuario.email}>
                {usuario.nombre ?? usuario.email}
              </span>
            ) : null}
          </header>

          <div className="flex flex-1">
            {usuario ? <MenuLateral esAdmin={usuario.esAdmin} /> : null}
            <main className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 print-full">{children}</div>
            </main>
          </div>

          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  )
}
