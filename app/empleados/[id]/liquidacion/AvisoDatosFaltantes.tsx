/**
 * §6.8 — si falta un dato obligatorio, la pantalla de cálculo no muestra números parciales:
 * muestra un cartel indicando exactamente qué falta y un enlace para cargarlo.
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DatoFaltante } from '@/lib/calculo/errores'
import { formatearPeriodoCapitalizado, parsePeriodo } from '@/lib/format/dates'
import { EncabezadoEmpleada } from '@/components/dominio/EncabezadoEmpleada'

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
      {/* El mismo encabezado y menú que el resto de las pantallas de la empleada. */}
      <EncabezadoEmpleada
        empleadoId={empleadoId}
        alias={alias}
        nombreCompleto={nombreCompleto}
        activa="liquidaciones"
      />

      <p className="text-sm text-muted-foreground">
        {formatearPeriodoCapitalizado(parsePeriodo(periodo))}
      </p>

      <div className="rounded-card border border-destructive/40 bg-destructive/5 px-[22px] py-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-3">
            <div>
              <h2 className="text-[20px] text-destructive">
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
