'use client'

/**
 * §7.9 — feriados. No son una serie con vigencia: son fechas puntuales, se cargan con su
 * fecha real. Solo se dan de baja los futuros.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CampoTexto } from '@/components/dominio/CampoMonto'
import { SelectorFecha } from '@/components/dominio/SelectorFecha'
import { useAccion } from '@/hooks/useAccion'
import { borrarFeriado, guardarFeriado } from '@/actions/admin'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

type Feriado = {
  fechaISO: string
  fecha: string
  descripcion: string
  noLaborable: boolean
}

export function PantallaFeriados({
  anio,
  hoyISO,
  feriados,
}: {
  anio: number
  hoyISO: string
  feriados: Feriado[]
}) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [fecha, setFecha] = useState<string | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [noLaborable, setNoLaborable] = useState(true)

  function guardar() {
    ejecutar(() => guardarFeriado({ fecha, descripcion, noLaborable }), {
      exito: 'Feriado guardado.',
      onExito: () => {
        setFecha(null)
        setDescripcion('')
        router.refresh()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EncabezadoPagina
          className="mb-0 flex-1"
          rotulo="Calendario"
          titulo="Feriados"
          bajada="Los no laborables descuentan boletos; los laborables no afectan ni el sueldo ni los boletos."
        />

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/admin/feriados?anio=${anio - 1}`)}
            aria-label="Año anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center font-medium tabular">{anio}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/admin/feriados?anio=${anio + 1}`)}
            aria-label="Año siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <section className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">Nuevo feriado</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="feriado-fecha">Fecha</Label>
            <SelectorFecha
              id="feriado-fecha"
              valor={fecha}
              onChange={setFecha}
              disabled={enviando}
              aria-label="Fecha del feriado"
            />
            {campos.fecha ? <p className="text-sm text-destructive">{campos.fecha}</p> : null}
          </div>

          <CampoTexto
            id="feriado-descripcion"
            etiqueta="Descripción"
            valor={descripcion}
            onChange={setDescripcion}
            error={campos.descripcion}
            disabled={enviando}
            maxLength={120}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3 sm:max-w-md">
          <div>
            <Label htmlFor="feriado-no-laborable">No laborable</Label>
            <p className="text-sm text-muted-foreground">
              Feriado pago en el que no se trabaja. Apagalo para Carnaval o Turismo.
            </p>
          </div>
          <Switch
            id="feriado-no-laborable"
            checked={noLaborable}
            onCheckedChange={setNoLaborable}
            disabled={enviando}
          />
        </div>

        <Button onClick={guardar} disabled={enviando || !fecha}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-[20px]">Feriados de {anio}</h2>
        <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feriados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No hay feriados cargados en {anio}.
                  </TableCell>
                </TableRow>
              ) : (
                feriados.map((f) => (
                  <TableRow key={f.fechaISO}>
                    <TableCell className="tabular">{f.fecha}</TableCell>
                    <TableCell>{f.descripcion}</TableCell>
                    <TableCell>
                      <Badge variant={f.noLaborable ? 'secondary' : 'outline'}>
                        {f.noLaborable ? 'No laborable' : 'Laborable'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {f.fechaISO > hoyISO ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Borrar el feriado del ${f.fecha}`}
                          disabled={enviando}
                          onClick={() =>
                            ejecutar(() => borrarFeriado(f.fechaISO), {
                              onExito: () => router.refresh(),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
