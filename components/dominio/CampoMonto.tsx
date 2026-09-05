'use client'

/**
 * Campo de importe con el formato de §8.5. Devuelve siempre el texto tal cual se tipeó; la
 * validación y la normalización de la coma decimal las hace el esquema zod del servidor.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Cómo se ve un campo que no se puede tipear: la misma caja, sin el anillo del foco. */
const CLASES_SOLO_LECTURA = 'bg-muted/60 focus-visible:ring-0 focus-visible:border-input'

export type CampoMontoProps = {
  id: string
  etiqueta: string
  valor: string
  onChange: (valor: string) => void
  error?: string
  disabled?: boolean
  ayuda?: string
  className?: string
  autoFocus?: boolean
  /** El importe lo decide el formulario y no se tipea; ver `CampoFijo`. */
  soloLectura?: boolean
}

export function CampoMonto({
  id,
  etiqueta,
  valor,
  onChange,
  error,
  disabled,
  ayuda,
  className,
  autoFocus,
  soloLectura,
}: CampoMontoProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="relative">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
          aria-hidden
        >
          $
        </span>
        <Input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          readOnly={soloLectura}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className={cn('tabular pl-7', soloLectura && CLASES_SOLO_LECTURA)}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Un dato que el formulario **no deja cambiar**, dibujado como los que sí: con su etiqueta y
 * su caja. Una línea de texto suelta no marca dónde termina un campo y empieza el otro, y en
 * un formulario de cuatro renglones eso se nota.
 *
 * Va `readOnly` y no `disabled` para que se pueda leer, seleccionar y copiar, y para que siga
 * estando en el orden de tabulación: es un dato del formulario, no un control apagado.
 */
export function CampoFijo({
  id,
  etiqueta,
  valor,
  ayuda,
}: {
  id: string
  etiqueta: string
  valor: string
  ayuda?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} value={valor} readOnly className={CLASES_SOLO_LECTURA} />
      {ayuda ? <p className="text-sm text-muted-foreground">{ayuda}</p> : null}
    </div>
  )
}

/** Campo de texto simple con etiqueta y error inline. */
export function CampoTexto({
  id,
  etiqueta,
  valor,
  onChange,
  error,
  disabled,
  ayuda,
  placeholder,
  className,
  maxLength,
}: {
  id: string
  etiqueta: string
  valor: string
  onChange: (valor: string) => void
  error?: string
  disabled?: boolean
  ayuda?: string
  placeholder?: string
  className?: string
  maxLength?: number
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-sm text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  )
}
