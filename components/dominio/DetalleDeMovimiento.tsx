'use client'

/**
 * §7.3, §7.4 y §7.5 — el detalle de un movimiento registrado, que es la misma pantalla para
 * los cuatro: lo que quedó grabado arriba, el concepto editable, y abajo lo propio de cada uno.
 *
 * Las tres reglas que fijó préstamos y valen para todos, y que son de negocio y no de diseño:
 *
 * - **La fecha y el monto no se editan.** El movimiento puede tener liquidaciones confirmadas
 *   encima; corregirlo sería mover un saldo hacia atrás. El camino es anular —o borrar, en el
 *   pago adicional, que no es un asiento— y registrar de nuevo. Lo editable es el concepto.
 * - **Se muestran como dato, no como campo deshabilitado.** Un input en gris invita a intentar
 *   escribirlo y después no explica por qué no se puede; para eso está `nota`.
 * - **Anular deja su contra-asiento**, nunca se borra nada (§4.9). El movimiento anulado se
 *   sigue mostrando para consulta, atenuado y sin poder modificarse.
 */
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarcoDeMovimientos, type EmpleadaDelMarco } from './MarcoDeMovimientos'

/** Uno de los datos que quedaron grabados y no se editan. */
export type DatoDeMovimiento = {
  etiqueta: string
  valor: React.ReactNode
}

/** El único campo editable. Sin esto, el detalle es solo de consulta. */
export type CampoConcepto = {
  etiqueta: string
  valor: string
  onChange: (valor: string) => void
  placeholder?: string
  error?: string
  disabled?: boolean
}

export function DetalleDeMovimiento({
  empleada,
  activo,
  titulo,
  volverA,
  volverHref,
  etiquetas,
  aviso,
  datos,
  nota,
  concepto,
  pie,
  children,
}: {
  empleada: EmpleadaDelMarco
  /** Clave del ítem del submenú donde estás parado. */
  activo: string
  titulo: string
  /** Nombre del listado del que se vino, para la flecha de volver. */
  volverA: string
  volverHref: string
  /** Chips al lado del título: anulado, el libro, lo que distinga a este movimiento. */
  etiquetas?: React.ReactNode
  /** Lo que hay que saber antes de tocarlo: que está anulado, que el mes ya se liquidó. */
  aviso?: React.ReactNode
  datos: DatoDeMovimiento[]
  /** Por qué esos datos no se editan. */
  nota?: React.ReactNode
  concepto?: CampoConcepto
  /** Los botones de guardar y de anular. */
  pie?: React.ReactNode
  /** Lo propio de cada movimiento: el plan de cuotas, el libro de días. */
  children?: React.ReactNode
}) {
  return (
    <MarcoDeMovimientos empleada={empleada} activo={activo}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label={`Volver a ${volverA}`}>
            <Link href={volverHref}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <h2 className="text-[28px] leading-tight">{titulo}</h2>
          {etiquetas}
        </div>

        {aviso ? (
          <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
            {aviso}
          </p>
        ) : null}

        <div className="space-y-4 rounded-card border bg-card px-[22px] py-5 shadow-soft">
          <div className="grid gap-4 sm:grid-cols-3">
            {datos.map((dato) => (
              <div key={dato.etiqueta}>
                <p className="text-sm text-muted-foreground">{dato.etiqueta}</p>
                <p className="tabular text-lg">{dato.valor}</p>
              </div>
            ))}
          </div>

          {nota ? <p className="text-sm text-muted-foreground">{nota}</p> : null}

          {concepto ? (
            <div className="space-y-1.5">
              <Label htmlFor="movimiento-concepto">{concepto.etiqueta}</Label>
              <Input
                id="movimiento-concepto"
                value={concepto.valor}
                onChange={(e) => concepto.onChange(e.target.value)}
                disabled={concepto.disabled}
                maxLength={255}
                placeholder={concepto.placeholder}
              />
              {concepto.error ? (
                <p className="text-sm text-destructive">{concepto.error}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {children}

        {pie}
      </div>
    </MarcoDeMovimientos>
  )
}
