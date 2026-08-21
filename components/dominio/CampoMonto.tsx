'use client'

/**
 * Campo de importe con el formato de §8.5. Devuelve siempre el texto tal cual se tipeó; la
 * validación y la normalización de la coma decimal las hace el esquema zod del servidor.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className="tabular pl-7"
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
