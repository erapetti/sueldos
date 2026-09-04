'use client'

/**
 * §8.7 — tabla de "Todos los empleados", con buscador por alias, nombre y dueño, y filtros
 * por dueño, por estado y por visibilidad.
 */
import { useMemo, useState } from 'react'
import { EyeOff, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { TextoDeChip } from '@/components/dominio/TextoDeChip'
import { ChipEstado } from '@/components/dominio/ChipEstado'
import { DialogoCambiarDueno } from '@/components/dominio/DialogoCambiarDueno'
import { ETIQUETAS_ESTADO, type EstadoEmpleado } from '@/lib/calculo/estado'
import { formatearFecha } from '@/lib/format/dates'

export type FilaTabla = {
  id: string
  alias: string
  nombreCompleto: string
  duenoId: string
  duenoNombre: string
  activo: boolean
  visible: boolean
  fechaIngreso: string
  fechaIngresoTexto: string
  nivel: string
  estado: EstadoEmpleado
  /** `AAAA-MM` del mes que el estado reclama, para el enlace del chip. */
  periodoDelEstado: string | null
  compartidoCon: string[]
}

const TODOS = 'todos'

export function TablaTodos({
  filas,
  usuarioId,
  esAdmin,
}: {
  filas: FilaTabla[]
  usuarioId: string
  esAdmin: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [dueno, setDueno] = useState(TODOS)
  const [estado, setEstado] = useState(TODOS)
  const [visibilidad, setVisibilidad] = useState(TODOS)

  const duenos = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const f of filas) mapa.set(f.duenoId, f.duenoNombre)
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [filas])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return filas.filter((f) => {
      if (dueno !== TODOS && f.duenoId !== dueno) return false
      if (estado !== TODOS && f.estado !== estado) return false
      if (visibilidad === 'visibles' && !f.visible) return false
      if (visibilidad === 'ocultos' && f.visible) return false
      if (!texto) return true
      return (
        f.alias.toLowerCase().includes(texto) ||
        f.nombreCompleto.toLowerCase().includes(texto) ||
        f.duenoNombre.toLowerCase().includes(texto)
      )
    })
  }, [filas, busqueda, dueno, estado, visibilidad])

  const columnas: Columna<FilaTabla>[] = [
    {
      clave: 'alias',
      etiqueta: 'Alias',
      celda: (fila) => fila.alias,
      /*
        El nombre va fuera del enlace: si no, el enlace se llamaría «Ana Ana Pereyra Gómez».
        Abajo de `md` la columna del nombre completo no está, así que baja acá.
      */
      debajo: (fila) => (
        <p className="text-sm text-muted-foreground md:hidden">{fila.nombreCompleto}</p>
      ),
    },
    { clave: 'nombre', etiqueta: 'Nombre completo', desde: 'md', celda: (f) => f.nombreCompleto },
    {
      clave: 'dueno',
      etiqueta: 'Dueño',
      celda: (fila) => (
        <>
          {fila.duenoNombre}
          {fila.duenoId === usuarioId ? (
            <span className="ml-1 text-muted-foreground">(vos)</span>
          ) : null}
        </>
      ),
    },
    {
      clave: 'compartido',
      etiqueta: 'Compartido con',
      desde: 'lg',
      className: 'text-sm text-muted-foreground',
      celda: (f) => (f.compartidoCon.length > 0 ? f.compartidoCon.join(', ') : '—'),
    },
    {
      clave: 'ingreso',
      etiqueta: 'Ingreso',
      desde: 'sm',
      className: 'tabular',
      celda: (f) => f.fechaIngresoTexto,
    },
    {
      clave: 'estado',
      etiqueta: 'Estado',
      /*
        «Oculto» estaba al lado del alias y en pantallas angostas quedaba encajado entre el
        alias y el nombre, partiendo en dos lo que es un solo dato. Acá va con el otro chip,
        que es lo que en definitiva es: parte del estado de la empleada.
      */
      celda: (f) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={f.estado} empleadoId={f.id} periodo={f.periodoDelEstado} />
          {!f.visible ? (
            <Badge variant="outline" className="gap-1">
              <TextoDeChip icono={EyeOff}>Oculto</TextoDeChip>
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      clave: 'acciones',
      etiqueta: 'Acciones',
      derecha: true,
      /*
        Transferir la propiedad lo puede hacer el dueño o un administrador
        (`exigirDuenoOAdmin`), así que el menú va en todas las filas donde alguna de las dos
        cosas se cumple. «Compartírmelo a mí» solo tiene sentido sobre una ajena: sobre las
        propias ya tenés permiso total (§8.7).
      */
      celda: (fila) => {
        const ajeno = fila.nivel === 'ADMIN'
        return fila.nivel === 'DUENO' || ajeno ? (
          <DialogoCambiarDueno
            empleadoId={fila.id}
            alias={fila.alias}
            duenoActualId={fila.duenoId}
            puedeAutocompartirse={ajeno && esAdmin}
            esAjena={ajeno}
            activa={fila.activo}
            visible={fila.visible}
          />
        ) : null
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="buscador">Buscar</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="buscador"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Alias, nombre o dueño"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filtro-dueno">Dueño</Label>
          <Select value={dueno} onValueChange={setDueno}>
            <SelectTrigger id="filtro-dueno">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {duenos.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filtro-estado">Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger id="filtro-estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {Object.entries(ETIQUETAS_ESTADO).map(([clave, etiqueta]) => (
                <SelectItem key={clave} value={clave}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filtro-visibilidad">Visibilidad</Label>
          <Select value={visibilidad} onValueChange={setVisibilidad}>
            <SelectTrigger id="filtro-visibilidad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              <SelectItem value="visibles">En el listado</SelectItem>
              <SelectItem value="ocultos">Ocultos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {visibles.length} de {filas.length} en el personal
      </p>

      <Tabla
        columnas={columnas}
        filas={visibles}
        hrefDetalle={(fila) => `/empleados/${fila.id}/faltas`}
        vacio="Ninguna empleada coincide con el filtro."
      />
    </div>
  )
}

export { formatearFecha }
