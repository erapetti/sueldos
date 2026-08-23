/**
 * Pantalla de las funcionalidades cuya definición sigue pendiente en el SPECS (§13).
 * La estructura del caso de uso está construida; falta la fórmula.
 */
import Link from 'next/link'
import { Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

export function NoImplementado({
  titulo,
  subtitulo,
  motivo,
  volverA,
  volverTexto = 'Volver',
}: {
  titulo: string
  subtitulo?: string
  motivo: string
  volverA: string
  volverTexto?: string
}) {
  return (
    <div className="space-y-5">
      <EncabezadoPagina className="mb-0" titulo={titulo} bajada={subtitulo} />

      <div className="rounded-card border border-dashed p-10 text-center">
        <Construction className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-lg font-medium">Funcionalidad no implementada aún</p>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{motivo}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href={volverA}>{volverTexto}</Link>
        </Button>
      </div>
    </div>
  )
}
