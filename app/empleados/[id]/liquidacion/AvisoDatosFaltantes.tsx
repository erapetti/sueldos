/**
 * §6.8 — si falta un dato obligatorio, la pantalla de cálculo no muestra números parciales:
 * muestra un cartel indicando exactamente qué falta y un enlace para cargarlo.
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DatoFaltante } from '@/lib/calculo/errores'
import { formatearPeriodoCapitalizado, parsePeriodo } from '@/lib/format/dates'

export function AvisoDatosFaltantes({
  empleadoId,
  alias,
  nombreCompleto,
  periodo,
  faltantes,
}: {
  empleadoId: string
  alias: string
  nombreCompleto: string
  periodo: string
  faltantes: DatoFaltante[]
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Cálculo de sueldo</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/empleados/${empleadoId}`} className="hover:underline">
            {alias}
          </Link>{' '}
          — {nombreCompleto} · {formatearPeriodoCapitalizado(parsePeriodo(periodo))}
        </p>
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-destructive">
                No se puede calcular la liquidación
              </h2>
              <p className="text-sm text-muted-foreground">
                Faltan datos obligatorios. Cargalos y volvé a esta pantalla.
              </p>
            </div>

            <ul className="space-y-2">
              {faltantes.map((faltante) => (
                <li key={faltante.codigo} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{faltante.mensaje}.</span>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={
                        faltante.destino.startsWith('/')
                          ? faltante.destino
                          : `/empleados/${empleadoId}?seccion=${faltante.destino}`
                      }
                    >
                      Cargarlo
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
