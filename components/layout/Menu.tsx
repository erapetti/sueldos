'use client'

/**
 * §8.1 y §8.2 — menú siempre visible: sidebar en desktop (>= 1024 px) y drawer con botón
 * hamburguesa en mobile. Las opciones de administrador solo se renderizan si `esAdmin`.
 *
 * Estética del componente "App Shell" del diseño "webapp": ítems en píldora, activo con
 * el acento suave, secciones rotuladas y drawer que entra deslizándose con la esquina
 * derecha redondeada.
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
import { cn } from '@/lib/utils'

type OpcionMenu = {
  etiqueta: string
  ruta: string
  icono: React.ComponentType<{ className?: string }>
  soloAdmin?: boolean
  /** "Salir" apunta al endpoint de oauth2-proxy, fuera del router de Next (§3.5). */
  externa?: boolean
}

const GENERALES: OpcionMenu[] = [
  { etiqueta: 'Mi Personal', ruta: '/empleados', icono: Users },
  { etiqueta: 'Todo el Personal', ruta: '/empleados/todos', icono: UsersRound },
]

const ADMINISTRACION: OpcionMenu[] = [
  { etiqueta: 'Costo boletos', ruta: '/admin/boletos', icono: Banknote, soloAdmin: true },
  { etiqueta: 'Aumento de sueldos', ruta: '/admin/aumento', icono: TrendingUp, soloAdmin: true },
  { etiqueta: 'Feriados', ruta: '/admin/feriados', icono: CalendarDays, soloAdmin: true },
  { etiqueta: 'Descuentos de BPS', ruta: '/admin/bps', icono: Percent, soloAdmin: true },
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', icono: Landmark, soloAdmin: true },
]

const SALIR: OpcionMenu = {
  etiqueta: 'Salir',
  ruta: '/oauth2/sign_out',
  icono: LogOut,
  externa: true,
}

/** `lg` = sidebar (ítems compactos); `drawer` = menú mobile (ítems más altos). */
type Tamano = 'lg' | 'drawer'

const MEDIDAS = {
  lg: {
    item: 'min-h-11 gap-3 px-3.5 py-2.5 text-sm',
    icono: 'size-[17px]',
  },
  drawer: {
    item: 'min-h-[54px] gap-3.5 px-4.5 py-3 text-[16.5px]',
    icono: 'size-[19px]',
  },
} satisfies Record<Tamano, { item: string; icono: string }>

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3.5 pt-1 pb-2.5 text-[11px] tracking-[0.06em] text-muted-foreground-soft">
      {children}
    </div>
  )
}

function Opcion({
  opcion,
  tamano,
  alNavegar,
}: {
  opcion: OpcionMenu
  tamano: Tamano
  alNavegar?: () => void
}) {
  const ruta = usePathname()
  const Icono = opcion.icono
  const medidas = MEDIDAS[tamano]

  const activa =
    !opcion.externa &&
    (ruta === opcion.ruta ||
      (opcion.ruta !== '/empleados' && ruta.startsWith(`${opcion.ruta}/`)))

  const clases = cn(
    'flex items-center rounded-full transition-colors',
    medidas.item,
    activa
      ? 'bg-primary-soft font-medium text-primary-ink'
      : 'text-foreground/75 hover:bg-accent hover:text-accent-foreground',
    opcion.externa && 'text-muted-foreground-soft',
  )

  const contenido = (
    <>
      <Icono className={cn('shrink-0 opacity-90', medidas.icono)} />
      {opcion.etiqueta}
    </>
  )

  if (opcion.externa) {
    return (
      <a href={opcion.ruta} className={clases} onClick={alNavegar}>
        {contenido}
      </a>
    )
  }

  return (
    <Link
      href={opcion.ruta}
      className={clases}
      onClick={alNavegar}
      aria-current={activa ? 'page' : undefined}
    >
      {contenido}
    </Link>
  )
}

function Opciones({
  esAdmin,
  tamano,
  alNavegar,
}: {
  esAdmin: boolean
  tamano: Tamano
  alNavegar?: () => void
}) {
  return (
    <nav
      className={cn('flex flex-col gap-0.5', tamano === 'lg' ? 'p-3.5 pt-4.5' : 'px-3.5 py-2.5')}
      aria-label="Menú principal"
    >
      <Rotulo>Espacio de trabajo</Rotulo>
      {GENERALES.map((opcion) => (
        <Opcion key={opcion.ruta} opcion={opcion} tamano={tamano} alNavegar={alNavegar} />
      ))}

      {esAdmin ? (
        <>
          <Rotulo>
            <span className="mt-3 block">Administración</span>
          </Rotulo>
          {ADMINISTRACION.map((opcion) => (
            <Opcion key={opcion.ruta} opcion={opcion} tamano={tamano} alNavegar={alNavegar} />
          ))}
        </>
      ) : null}
    </nav>
  )
}

export function MenuLateral({ esAdmin }: { esAdmin: boolean }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card lg:block no-print">
      <div className="sticky top-[62px]">
        <Opciones esAdmin={esAdmin} tamano="lg" />
        <div className="mx-3.5 mt-0.5 mb-4.5 border-t pt-3.5">
          <Opcion opcion={SALIR} tamano="lg" />
        </div>
      </div>
    </aside>
  )
}

export function MenuMobile({ esAdmin, email }: { esAdmin: boolean; email: string }) {
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
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el menú"
        aria-expanded={abierto}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent"
      >
        <MenuIcon className="size-5" />
      </button>

      {/* Scrim y drawer quedan montados para poder animar la entrada, como en el diseño. */}
      <button
        type="button"
        tabIndex={abierto ? 0 : -1}
        aria-label="Cerrar el menú"
        onClick={() => setAbierto(false)}
        className={cn(
          'fixed inset-0 z-50 bg-[#26241f]/40 backdrop-blur-[2px] transition-opacity duration-200',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        inert={!abierto}
        aria-label="Menú principal"
        className={cn(
          'fixed inset-y-0 left-0 z-60 flex w-[296px] max-w-[86vw] flex-col rounded-r-[32px] bg-card shadow-drawer',
          'transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]',
          abierto ? 'translate-x-0' : '-translate-x-[104%]',
        )}
      >
        <div className="flex h-[62px] shrink-0 items-center gap-2.5 pr-2.5 pl-5.5">
          <span aria-hidden className="size-5 shrink-0 rounded-full rounded-bl-[4px] bg-primary" />
          <span className="font-serif text-[19px] leading-none">Menú</span>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar el menú"
            className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Opciones esAdmin={esAdmin} tamano="drawer" alNavegar={() => setAbierto(false)} />
        </div>

        <div className="shrink-0 border-t px-3.5 pt-2.5 pb-4.5">
          <Opcion opcion={SALIR} tamano="drawer" alNavegar={() => setAbierto(false)} />
          <div className="truncate px-4.5 pt-2 text-xs text-muted-foreground-soft">{email}</div>
        </div>
      </aside>
    </div>
  )
}
