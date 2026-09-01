/**
 * Encabezado y menú de una empleada, compartido por todas sus pantallas.
 *
 * Las novedades y la liquidación son páginas propias —no pestañas de la ficha— pero tienen que
 * verse dentro de la misma empleada: mismo título, mismo menú, y el ítem donde estás marcado.
 * Por eso el bloque vive acá y no dentro de la ficha.
 *
 * El menú es **navegación**, no estado local: cada ítem es un link. Las secciones que viven en
 * la ficha viajan en `?seccion=`, y las que son páginas propias tienen su ruta. Así el ítem
 * activo se puede deducir de la URL en cualquiera de las cinco pantallas.
 */
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'
import { MemoriaDePeriodo } from '@/components/dominio/MemoriaDePeriodo'
import { LISTADOS_DE_PERSONAL, type ListadoDePersonal } from '@/constants/listados'
import { cn } from '@/lib/utils'

/** Ítem del menú. `seccion` es el valor de `?seccion=` cuando la sección vive en la ficha. */
export type ItemMenu = {
  clave: string
  etiqueta: string
  href: string
}

/**
 * Los ítems del menú. Las tres pantallas con selector de mes se llevan el mes puesto: pasar de
 * inasistencias a horas extras no cambia de mes, y el botón «atrás» del navegador vuelve al
 * que se estaba mirando y no al que diga la cookie en ese momento.
 *
 * Sin `periodo` —la ficha, que no tiene selector— los enlaces van pelados y cada pantalla
 * resuelve el mes por su cuenta.
 */
export function itemsDeMenu(empleadoId: string, periodo?: string): ItemMenu[] {
  const base = `/empleados/${empleadoId}`
  const mes = periodo ? `?periodo=${periodo}` : ''
  return [
    { clave: 'datos', etiqueta: 'Datos', href: `${base}?seccion=datos` },
    { clave: 'horas-extras', etiqueta: 'Horas extras', href: `${base}/horas-extras${mes}` },
    { clave: 'faltas', etiqueta: 'Inasistencias', href: `${base}/faltas${mes}` },
    { clave: 'liquidaciones', etiqueta: 'Liquidaciones', href: `${base}/liquidacion${mes}` },
    { clave: 'cuenta', etiqueta: 'Cuenta corriente', href: `${base}?seccion=cuenta` },
    { clave: 'movimientos', etiqueta: 'Movimientos', href: `${base}?seccion=movimientos` },
  ]
}

/**
 * Secciones que se abren desde la tarjeta de Datos y no desde el menú, para no llenar la
 * barra con siete ítems más. Marcan «Datos» como activo.
 */
export const SECCIONES_DE_DATOS = ['datos', 'salario', 'regimen', 'compartido'] as const

/**
 * Todas las secciones que viven en la ficha: las de la tarjeta de Datos más las dos del menú
 * que no tienen ruta propia. La ficha no tiene `else`, así que un `?seccion=` que no esté acá
 * dibujaría el encabezado con el cuerpo vacío; con la lista, da 404.
 *
 * `licencia` **salió**: se la llevó entera `Movimientos/Licencias`, con el estado de cuenta de
 * días adentro (§4.15.1). Un `?seccion=licencia` guardado en favoritos ahora da 404, que es
 * mejor que un cuerpo vacío.
 */
export const SECCIONES_DE_FICHA = [...SECCIONES_DE_DATOS, 'cuenta', 'movimientos'] as const

export function EncabezadoEmpleada({
  empleadoId,
  alias,
  nombreCompleto,
  activa,
  listadoDeOrigen,
  periodo,
  estados,
  aviso,
}: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  /** Clave del ítem del menú donde estás. */
  activa: string
  /**
   * `AAAA-MM` de la pantalla, en las tres que tienen selector de mes. Viaja a los enlaces del
   * menú y se recuerda para la próxima pantalla.
   */
  periodo?: string
  /**
   * De qué listado se vino, que es a dónde vuelve el breadcrumb. Lo deduce del permiso
   * `listadoDeOrigen` (`lib/auth/guards.ts`) y viaja prop por prop porque no está en la URL.
   */
  listadoDeOrigen: ListadoDePersonal
  /** Chips de estado: dado de baja, oculto, sin aportes. */
  estados?: React.ReactNode
  /** Aviso de §8.7, cuando un administrador mira una empleada ajena. */
  aviso?: React.ReactNode
}) {
  const items = itemsDeMenu(empleadoId, periodo)
  const listado = LISTADOS_DE_PERSONAL[listadoDeOrigen]
  const activaNormalizada = (SECCIONES_DE_DATOS as readonly string[]).includes(activa)
    ? 'datos'
    : activa

  return (
    /*
      El `mb-6` fija el aire debajo del menú **acá y no en cada pantalla**: las cinco lo
      envuelven con un `space-y-*` distinto y quedaban de 12px en las planillas contra 36 en
      la ficha. Como el margen propio le gana al del `space-y` del contenedor, este es el
      único lugar donde se decide, y 24px es cómodo para tocar sin acertarle al ítem de al lado.
    */
    <div className="mb-6 space-y-5">
      {periodo ? <MemoriaDePeriodo periodo={periodo} /> : null}

      {aviso}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <EncabezadoPagina
          className="mb-0 flex-1"
          /*
            El rótulo decía «Empleada», que era repetir lo que ya dice el título. En su lugar
            va el breadcrumb al listado de donde se vino: el enlace no trae estilo propio y
            hereda el del rótulo —chico, con el color de acento—, así que la única diferencia
            visible es el subrayado al pasar por encima.
          */
          rotulo={
            <Link href={listado.ruta} className="hover:underline">
              {listado.etiqueta}
            </Link>
          }
          titulo={alias}
          bajada={nombreCompleto}
        />
        {estados ? <div className="flex flex-wrap gap-2">{estados}</div> : null}
      </div>

      {/*
        Se dibuja como la barra de pestañas de shadcn pero con links, así el aspecto no cambia
        y la navegación es real. `aria-current` es lo que le dice al lector de pantalla dónde
        está parado; `role="tab"` sería mentira en un link.

        Abajo de `sm` los ítems envuelven en varios renglones y la píldora quedaba como
        una elipse enorme. Ahí se convierte en un listón recto de borde a borde de la pantalla:
        los márgenes negativos compensan el padding del contenido, y el padding propio devuelve
        los ítems a la misma alineación que el resto de la página.
      */}
      <nav aria-label={`Secciones de ${alias}`}>
        <ul
          className={cn(
            'flex w-full flex-wrap items-center justify-start gap-1 bg-muted',
            '-mx-[var(--padding-contenido)] w-auto rounded-none px-[var(--padding-contenido)] py-1',
            'sm:mx-0 sm:w-full sm:rounded-full sm:p-1',
          )}
        >
          {items.map((item) => {
            const esActiva = item.clave === activaNormalizada
            return (
              <li key={item.clave}>
                <Link
                  href={item.href}
                  aria-current={esActiva ? 'page' : undefined}
                  className={cn(
                    // 44px de alto: es el mínimo cómodo para tocar con el dedo sin acertarle
                    // al ítem de al lado. El `px-4` acompaña para que la píldora no quede alta
                    // y angosta.
                    'inline-flex h-11 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    esActiva
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.etiqueta}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

/**
 * Chips de estado. El §8.4 no pide ninguno —solo título y subtítulo— así que acá van los dos
 * que cambian lo que se puede hacer con la empleada y no se ven en ninguna otra parte de la
 * pantalla. «Sin aportes al BPS» se sacó: es un dato de Datos/Generales, no un estado.
 *
 * Los dos son links a donde se cambia el dato: la baja sale de la fecha de egreso, en los
 * datos generales, y la visibilidad se cambia desde la hoja Acciones.
 */
export function EstadosEmpleada({
  empleadoId,
  activo,
  visible,
}: {
  empleadoId: string
  activo: boolean
  visible: boolean
}) {
  return (
    <>
      {!activo ? (
        <Badge asChild variant="secondary" className="transition-opacity hover:opacity-80">
          <Link href={`/empleados/${empleadoId}?seccion=datos`}>Dado de baja</Link>
        </Badge>
      ) : null}
      {!visible ? (
        <Badge asChild variant="outline" className="transition-opacity hover:opacity-80">
          <Link href={`/empleados/${empleadoId}?seccion=movimientos`}>Oculto del listado</Link>
        </Badge>
      ) : null}
    </>
  )
}
