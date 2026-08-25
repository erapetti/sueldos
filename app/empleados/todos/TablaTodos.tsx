'use client'

/**
 * §8.7 — tabla de "Todos los empleados", con buscador por alias, nombre y dueño, y filtros
 * por dueño, por estado y por visibilidad.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

      <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alias</TableHead>
              <TableHead className="hidden md:table-cell">Nombre completo</TableHead>
              <TableHead>Dueño</TableHead>
              <TableHead className="hidden lg:table-cell">Compartido con</TableHead>
              <TableHead className="hidden sm:table-cell">Ingreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Ninguna empleada coincide con el filtro.
                </TableCell>
              </TableRow>
            ) : (
              visibles.map((fila) => {
                const ajeno = fila.nivel === 'ADMIN'
                return (
                  <TableRow key={fila.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/empleados/${fila.id}/faltas`} className="font-medium hover:underline">
                          {fila.alias}
                        </Link>
                        {!fila.visible ? (
                          <Badge variant="outline" className="gap-1">
                            <EyeOff className="size-3" aria-hidden />
                            Oculto
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground md:hidden">
                        {fila.nombreCompleto}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{fila.nombreCompleto}</TableCell>
                    <TableCell>
                      {fila.duenoNombre}
                      {fila.duenoId === usuarioId ? (
                        <span className="ml-1 text-muted-foreground">(vos)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {fila.compartidoCon.length > 0 ? fila.compartidoCon.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular">
                      {fila.fechaIngresoTexto}
                    </TableCell>
                    <TableCell>
                      <ChipEstado estado={fila.estado} empleadoId={fila.id} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {ajeno ? (
                          // §8.7 — sobre un empleado ajeno el administrador solo puede ver la
                          // ficha, cambiar el dueño y compartírselo a sí mismo.
                          <DialogoCambiarDueno
                            empleadoId={fila.id}
                            alias={fila.alias}
                            duenoActualId={fila.duenoId}
                            puedeAutocompartirse={esAdmin}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export { formatearFecha }
