'use client'

/**
 * §7.9 — descuentos de BPS. "Nuevo concepto", "Cambiar porcentaje" y "Dar de baja el
 * concepto" son la misma operación: insertar un registro con la vigencia elegida. La baja
 * es un registro con `porcentaje = NULL` (§4.11).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CampoTexto } from '@/components/dominio/CampoMonto'
import { SelectorVigencia, vigenciaPorDefecto } from '@/components/dominio/SelectorVigencia'
import { useAccion } from '@/hooks/useAccion'
import { guardarConceptoBps } from '@/actions/admin'
import { SEGUROS_SALUD } from '@/constants/segurosSalud'
import { formatearPorcentaje } from '@/lib/format/money'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

type Registro = {
  id: string
  fechaVigencia: string
  fechaVigenciaISO: string
  porcentaje: string | null
}

export type GrupoBps = {
  clave: string
  concepto: string
  seguroSalud: string | null
  historico: Registro[]
  vigente: Registro | null
}

const TODOS = 'todos'

export function PantallaBps({ grupos }: { grupos: GrupoBps[]; mesActual: string }) {
  const router = useRouter()
  const { ejecutar, enviando, campos } = useAccion<undefined>()

  const [expandido, setExpandido] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<{
    concepto: string
    seguroSalud: string
    porcentaje: string
    darDeBaja: boolean
  }>({ concepto: '', seguroSalud: TODOS, porcentaje: '', darDeBaja: false })
  const [fechaVigencia, setFechaVigencia] = useState(vigenciaPorDefecto())
  const [reemplazar, setReemplazar] = useState(false)

  // §4.11 — el formulario advierte si el nombre ya existe con otro alcance, sin bloquear.
  const alcancesDelConcepto = grupos
    .filter((g) => g.concepto.toLowerCase() === formulario.concepto.trim().toLowerCase())
    .map((g) => g.seguroSalud)
  const seguroElegido = formulario.seguroSalud === TODOS ? null : formulario.seguroSalud
  const advertenciaAlcance =
    formulario.concepto.trim() !== '' &&
    alcancesDelConcepto.length > 0 &&
    !alcancesDelConcepto.includes(seguroElegido)

  function guardar() {
    ejecutar(
      () =>
        guardarConceptoBps({
          concepto: formulario.concepto,
          porcentaje: formulario.darDeBaja ? null : formulario.porcentaje,
          seguroSalud: seguroElegido,
          fechaVigencia,
          reemplazar,
        }),
      {
        exito: formulario.darDeBaja ? 'Concepto dado de baja.' : 'Concepto guardado.',
        duracionAviso: 14_000,
        onExito: () => {
          setFormulario({ concepto: '', seguroSalud: TODOS, porcentaje: '', darDeBaja: false })
          setReemplazar(false)
          router.refresh()
        },
      },
    )
  }

  function precargar(grupo: GrupoBps, darDeBaja: boolean) {
    setFormulario({
      concepto: grupo.concepto,
      seguroSalud: grupo.seguroSalud ?? TODOS,
      porcentaje: darDeBaja ? '' : (grupo.vigente?.porcentaje ?? ''),
      darDeBaja,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Parámetros"
        titulo="Descuentos de BPS"
        bajada="Los conceptos son disjuntos entre sí: todos los aplicables a un empleado se suman."
      />

      <section className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">
          {formulario.darDeBaja ? 'Dar de baja un concepto' : 'Nuevo concepto o cambio de porcentaje'}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="bps-concepto"
            etiqueta="Concepto"
            valor={formulario.concepto}
            onChange={(v) => setFormulario((f) => ({ ...f, concepto: v }))}
            error={campos.concepto}
            disabled={enviando}
            placeholder="Montepío, FONASA, FRL…"
            maxLength={80}
          />

          <div className="space-y-1.5">
            <Label htmlFor="bps-porcentaje">Porcentaje</Label>
            <div className="relative">
              <Input
                id="bps-porcentaje"
                value={formulario.porcentaje}
                onChange={(e) => setFormulario((f) => ({ ...f, porcentaje: e.target.value }))}
                disabled={enviando || formulario.darDeBaja}
                inputMode="decimal"
                className="tabular pr-7"
              />
              <span
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                aria-hidden
              >
                %
              </span>
            </div>
            {campos.porcentaje ? (
              <p className="text-sm text-destructive">{campos.porcentaje}</p>
            ) : null}
          </div>
        </div>

        {/*
          El alcance va solo en su fila: las descripciones del Anexo A llegan a más de 200
          caracteres y no entran al lado de otro campo.
        */}
        <div className="space-y-1.5">
          <Label htmlFor="bps-seguro">Alcance</Label>
          <Select
            value={formulario.seguroSalud}
            onValueChange={(v) => setFormulario((f) => ({ ...f, seguroSalud: v }))}
            disabled={enviando}
          >
            <SelectTrigger id="bps-seguro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los empleados</SelectItem>
              {SEGUROS_SALUD.map((s) => (
                <SelectItem key={s.codigo} value={s.codigo}>
                  Seguro {s.codigo} — {s.descripcion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {advertenciaAlcance ? (
          <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
            Ya existe un concepto con ese nombre y otro alcance. Se pueden tener los dos: los
            conceptos de BPS se suman entre sí.
          </p>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={formulario.darDeBaja}
            onChange={(e) => setFormulario((f) => ({ ...f, darDeBaja: e.target.checked }))}
            disabled={enviando}
          />
          Dar de baja el concepto desde esa vigencia
        </label>

        <SelectorVigencia valor={fechaVigencia} onChange={setFechaVigencia} disabled={enviando} />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reemplazar}
            onChange={(e) => setReemplazar(e.target.checked)}
            disabled={enviando}
          />
          Reemplazar si ya hay un registro con esa misma vigencia
        </label>

        <Button onClick={guardar} disabled={enviando || !formulario.concepto.trim()}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-[20px]">Conceptos</h2>

        {grupos.length === 0 ? (
          <p className="rounded-card border border-dashed p-8 text-center text-sm text-muted-foreground">
            Todavía no hay conceptos cargados. Sin conceptos vigentes, ninguna liquidación lleva
            descuentos de BPS.
          </p>
        ) : (
          <ul className="divide-y rounded-card bg-card shadow-soft border overflow-hidden">
            {grupos.map((grupo) => {
              const abierto = expandido === grupo.clave
              const deBaja = grupo.vigente === null || grupo.vigente.porcentaje === null

              return (
                <li key={grupo.clave} className="p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandido(abierto ? null : grupo.clave)}
                      className="flex items-center gap-1 text-left"
                      aria-expanded={abierto}
                    >
                      {abierto ? (
                        <ChevronDown className="size-4" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden />
                      )}
                      <span className="font-medium">{grupo.concepto}</span>
                    </button>

                    <Badge variant="outline">
                      {grupo.seguroSalud ? `Seguro ${grupo.seguroSalud}` : 'Todos los empleados'}
                    </Badge>

                    <span className="tabular">
                      {deBaja ? (
                        <span className="text-muted-foreground">Dado de baja</span>
                      ) : (
                        formatearPorcentaje(grupo.vigente!.porcentaje!)
                      )}
                    </span>

                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => precargar(grupo, false)}>
                        Cambiar porcentaje
                      </Button>
                      {!deBaja ? (
                        <Button variant="outline" size="sm" onClick={() => precargar(grupo, true)}>
                          Dar de baja
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {abierto ? (
                    <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                      {grupo.historico.map((h) => (
                        <li key={h.id} className="flex justify-between gap-4">
                          <span className="tabular text-muted-foreground">
                            Desde {h.fechaVigencia}
                          </span>
                          <span className="tabular">
                            {h.porcentaje === null ? 'Baja' : formatearPorcentaje(h.porcentaje)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
