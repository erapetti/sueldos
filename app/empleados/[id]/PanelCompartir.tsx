'use client'

/**
 * §7.10 — compartir un empleado. Solo visible para el dueño (§8.4 punto 8).
 */
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { useAccion } from '@/hooks/useAccion'
import {
  buscarUsuariosParaCompartir,
  compartirEmpleado,
  dejarDeCompartirEmpleado,
} from '@/actions/empleados'

type Usuario = { id: string; email: string; nombre: string | null }

export function PanelCompartir({
  empleadoId,
  permisos,
  onCambio,
}: {
  empleadoId: string
  permisos: { usuarioId: string; nombre: string; email: string; permiso: string }[]
  onCambio: () => void
}) {
  const { ejecutar, enviando } = useAccion<undefined>()

  const [busqueda, setBusqueda] = useState('')
  const [candidatos, setCandidatos] = useState<Usuario[]>([])
  const [elegido, setElegido] = useState('')
  const [permiso, setPermiso] = useState<'VER' | 'EDITAR'>('VER')

  useEffect(() => {
    let vigente = true
    buscarUsuariosParaCompartir(empleadoId, busqueda).then((r) => {
      if (vigente && r.ok) setCandidatos(r.datos)
    })
    return () => {
      vigente = false
    }
  }, [empleadoId, busqueda])

  const yaCompartidos = new Set(permisos.map((p) => p.usuarioId))

  function compartir() {
    if (!elegido) return
    ejecutar(() => compartirEmpleado({ empleadoId, usuarioId: elegido, permiso }), {
      onExito: () => {
        setElegido('')
        onCambio()
      },
    })
  }

  /** `Tabla` indexa por `id`; el permiso se identifica por el usuario. */
  const filasDePermisos = permisos.map((p) => ({ ...p, id: p.usuarioId }))
  type FilaPermiso = (typeof filasDePermisos)[number]

  const columnasDePermisos: Columna<FilaPermiso>[] = [
    {
      clave: 'usuario',
      etiqueta: 'Usuario',
      celda: (p) => (
        <>
          {p.nombre}
          <span className="ml-2 text-sm text-muted-foreground">{p.email}</span>
        </>
      ),
    },
    {
      clave: 'permiso',
      etiqueta: 'Permiso',
      celda: (p) => (
        <Select
          value={p.permiso}
          onValueChange={(v) =>
            ejecutar(
              () => compartirEmpleado({ empleadoId, usuarioId: p.usuarioId, permiso: v }),
              { onExito: onCambio },
            )
          }
          disabled={enviando}
        >
          <SelectTrigger className="w-32" aria-label={`Permiso de ${p.nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VER">Ver</SelectItem>
            <SelectItem value="EDITAR">Editar</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      clave: 'acciones',
      etiqueta: 'Acciones',
      derecha: true,
      celda: (p) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar el acceso de ${p.nombre}`}
          disabled={enviando}
          onClick={() =>
            ejecutar(() => dejarDeCompartirEmpleado({ empleadoId, usuarioId: p.usuarioId }), {
              onExito: onCambio,
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">Compartir con otro usuario</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="buscar-usuario">Buscar</Label>
            <Input
              id="buscar-usuario"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Email o nombre"
              disabled={enviando}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usuario-destino">Usuario</Label>
            <Select value={elegido} onValueChange={setElegido} disabled={enviando}>
              <SelectTrigger id="usuario-destino">
                <SelectValue placeholder="Elegí un usuario" />
              </SelectTrigger>
              <SelectContent>
                {candidatos
                  .filter((u) => !yaCompartidos.has(u.id))
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre ?? u.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="permiso-nuevo">Permiso</Label>
            <Select
              value={permiso}
              onValueChange={(v) => setPermiso(v as 'VER' | 'EDITAR')}
              disabled={enviando}
            >
              <SelectTrigger id="permiso-nuevo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VER">Ver</SelectItem>
                <SelectItem value="EDITAR">Editar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={compartir} disabled={enviando || !elegido}>
          Compartir
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-[20px]">Ya compartido con</h2>
        {permisos.length === 0 ? (
          <p className="rounded-card border border-dashed p-6 text-center text-sm text-muted-foreground">
            Todavía no lo compartiste con nadie.
          </p>
        ) : (
          <Tabla columnas={columnasDePermisos} filas={filasDePermisos} />
        )}
      </section>
    </div>
  )
}
