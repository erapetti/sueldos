'use client'

/** §7.9 — tabla de la serie histórica del valor del boleto y formulario de nuevo valor. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CampoMonto } from '@/components/dominio/CampoMonto'
import { SelectorVigencia, vigenciaPorDefecto } from '@/components/dominio/SelectorVigencia'
import { useAccion } from '@/hooks/useAccion'
import { borrarValorBoleto, registrarValorBoleto } from '@/actions/admin'
import { formatearImporte } from '@/lib/format/money'
import { aISO, hoy, primerDiaDelMes } from '@/lib/format/dates'

type Valor = {
  id: string
  monto: string
  fechaVigencia: string
  fechaVigenciaISO: string
  cargadoPor: string
  cargadoEn: string
}

export function PantallaBoletos({ valores }: { valores: Valor[] }) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [monto, setMonto] = useState('')
  const [fechaVigencia, setFechaVigencia] = useState(vigenciaPorDefecto())
  const [reemplazar, setReemplazar] = useState(false)

  const mesActual = aISO(primerDiaDelMes(hoy()))

  function guardar() {
    ejecutar(() => registrarValorBoleto({ monto, fechaVigencia, reemplazar }), {
      exito: 'Valor de boleto guardado.',
      duracionAviso: 14_000,
      onExito: () => {
        setMonto('')
        setReemplazar(false)
        router.refresh()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Costo de boletos</h1>
        <p className="text-sm text-muted-foreground">
          Costo de <strong>un</strong> boleto. Cada día trabajado paga ida y vuelta.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">Nuevo valor</h2>

        <CampoMonto
          id="boleto-monto"
          etiqueta="Monto"
          valor={monto}
          onChange={setMonto}
          error={campos.monto}
          disabled={enviando}
          className="max-w-xs"
        />

        <SelectorVigencia valor={fechaVigencia} onChange={setFechaVigencia} disabled={enviando} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reemplazar}
            onChange={(e) => setReemplazar(e.target.checked)}
            disabled={enviando}
          />
          Reemplazar si ya hay un valor vigente desde ese mes
        </label>

        <Button onClick={guardar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Histórico</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigente desde</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Cargado por</TableHead>
                <TableHead>Cargado el</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Todavía no hay valores cargados.
                  </TableCell>
                </TableRow>
              ) : (
                valores.map((v) => {
                  // §5.4 — solo se borran los de vigencia futura.
                  const futuro = v.fechaVigenciaISO > mesActual
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="tabular">{v.fechaVigencia}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatearImporte(v.monto)}
                      </TableCell>
                      <TableCell>{v.cargadoPor}</TableCell>
                      <TableCell className="tabular">{v.cargadoEn}</TableCell>
                      <TableCell className="text-right">
                        {futuro ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Borrar el valor vigente desde ${v.fechaVigencia}`}
                            disabled={enviando}
                            onClick={() =>
                              ejecutar(() => borrarValorBoleto(v.id), {
                                onExito: () => router.refresh(),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
