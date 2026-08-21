'use client'

/**
 * §8.1 y §8.2 — menú siempre visible: sidebar en desktop (>= 1024 px) y drawer con botón
 * hamburguesa en mobile. Las opciones de administrador solo se renderizan si `esAdmin`.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote,
  CalendarDays,
  Landmark,
  LogOut,
  Menu as MenuIcon,
  Percent,
  TrendingUp,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type OpcionMenu = {
  etiqueta: string
  ruta: string
  icono: React.ComponentType<{ className?: string }>
  soloAdmin?: boolean
  /** "Salir" apunta al endpoint de oauth2-proxy, fuera del router de Next (§3.5). */
  externa?: boolean
}

const OPCIONES: OpcionMenu[] = [
  { etiqueta: 'Empleados', ruta: '/empleados', icono: Users },
  { etiqueta: 'Todos los empleados', ruta: '/empleados/todos', icono: UsersRound },
  { etiqueta: 'Costo boletos', ruta: '/admin/boletos', icono: Banknote, soloAdmin: true },
  { etiqueta: 'Aumento de sueldos', ruta: '/admin/aumento', icono: TrendingUp, soloAdmin: true },
  { etiqueta: 'Feriados', ruta: '/admin/feriados', icono: CalendarDays, soloAdmin: true },
  { etiqueta: 'Descuentos de BPS', ruta: '/admin/bps', icono: Percent, soloAdmin: true },
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', icono: Landmark, soloAdmin: true },
  { etiqueta: 'Salir', ruta: '/oauth2/sign_out', icono: LogOut, externa: true },
]

function Opciones({ esAdmin, alNavegar }: { esAdmin: boolean; alNavegar?: () => void }) {
  const ruta = usePathname()

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Menú principal">
      {OPCIONES.filter((o) => !o.soloAdmin || esAdmin).map((opcion) => {
        const Icono = opcion.icono
        const activa =
          !opcion.externa &&
          (ruta === opcion.ruta ||
            (opcion.ruta !== '/empleados' && ruta.startsWith(`${opcion.ruta}/`)))

        const clases = cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          activa
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
        )

        if (opcion.externa) {
          return (
            <a key={opcion.ruta} href={opcion.ruta} className={clases} onClick={alNavegar}>
              <Icono className="size-4 shrink-0" />
              {opcion.etiqueta}
            </a>
          )
        }

        return (
          <Link
            key={opcion.ruta}
            href={opcion.ruta}
            className={clases}
            onClick={alNavegar}
            aria-current={activa ? 'page' : undefined}
          >
            <Icono className="size-4 shrink-0" />
            {opcion.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}

export function MenuLateral({ esAdmin }: { esAdmin: boolean }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card lg:block no-print">
      <div className="sticky top-14">
        <Opciones esAdmin={esAdmin} />
      </div>
    </aside>
  )
}

export function MenuMobile({ esAdmin }: { esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    function alEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', alEscape)
    return () => document.removeEventListener('keydown', alEscape)
  }, [])

  return (
    <div className="lg:hidden no-print">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el menú"
        aria-expanded={abierto}
      >
        <MenuIcon className="size-5" />
      </Button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar el menú"
            onClick={() => setAbierto(false)}
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-semibold">Menú</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar el menú"
              >
                <X className="size-5" />
              </Button>
            </div>
            <Opciones esAdmin={esAdmin} alNavegar={() => setAbierto(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
