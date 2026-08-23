/**
 * Encabezado de página del diseño "webapp": rótulo chico con el acento, título en la
 * serif de display, bajada opcional y un espacio a la derecha para la acción principal.
 */
import { cn } from '@/lib/utils'

export function EncabezadoPagina({
  rotulo,
  titulo,
  bajada,
  acciones,
  className,
}: {
  rotulo?: React.ReactNode
  titulo: React.ReactNode
  bajada?: React.ReactNode
  acciones?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end gap-3.5', className)}>
      <div className="min-w-0 flex-[1_1_240px]">
        {rotulo ? (
          <div className="mb-1.5 text-xs tracking-[0.05em] text-primary-ink">{rotulo}</div>
        ) : null}
        <h1 className="text-[40px] leading-[1.04]">{titulo}</h1>
        {bajada ? (
          <p className="mt-2 max-w-[48ch] text-sm text-pretty text-muted-foreground">{bajada}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  )
}
