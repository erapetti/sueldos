'use client'

/** §7.9 — tabla de la serie histórica del valor del boleto y formulario de nuevo valor. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { CampoMonto } from '@/components/dominio/CampoMonto'
import { SelectorVigencia, vigenciaPorDefecto } from '@/components/dominio/SelectorVigencia'
import { useAccion } from '@/hooks/useAccion'
import { borrarValorBoleto, registrarValorBoleto } from '@/actions/admin'
import { formatearImporte } from '@/lib/format/money'
import { aISO, hoy, primerDiaDelMes } from '@/lib/format/dates'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

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

  type FilaValor = (typeof valores)[number]

  const columnasDeValores: Columna<FilaValor>[] = [
    {
      clave: 'vigencia',
      etiqueta: 'Vigente desde',
      className: 'tabular',
      celda: (v) => v.fechaVigencia,
    },
    { clave: 'monto', etiqueta: 'Monto', numerica: true, celda: (v) => formatearImporte(v.monto) },
    { clave: 'cargado-por', etiqueta: 'Cargado por', celda: (v) => v.cargadoPor },
    { clave: 'cargado-el', etiqueta: 'Cargado el', className: 'tabular', celda: (v) => v.cargadoEn },
    {
      clave: 'acciones',
      etiqueta: 'Acciones',
      derecha: true,
      // §5.4 — solo se borran los de vigencia futura.
      celda: (v) =>
        v.fechaVigenciaISO > mesActual ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Borrar el valor vigente desde ${v.fechaVigencia}`}
            disabled={enviando}
            onClick={() =>
              ejecutar(() => borrarValorBoleto(v.id), { onExito: () => router.refresh() })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Parámetros"
        titulo="Costo de boletos"
        bajada={
          <>
            Costo de <strong>un</strong> boleto. Cada día trabajado paga ida y vuelta.
          </>
        }
      />

      <section className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">Nuevo valor</h2>

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

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5"
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
        <h2 className="text-[20px]">Histórico</h2>
        <Tabla
          columnas={columnasDeValores}
          filas={valores}
          vacio="Todavía no hay valores cargados."
        />
      </section>
    </div>
  )
}
