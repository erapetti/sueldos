'use client'

/**
 * §8.7 — acciones del administrador sobre un empleado **ajeno**: ver la ficha en modo
 * lectura, cambiar el dueño y compartírselo a sí mismo. No puede registrar novedades,
 * liquidar, borrar ni cambiar la visibilidad hasta compartírselo.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, MoreVertical, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccion } from '@/hooks/useAccion'
import {
  buscarUsuariosParaCompartir,
  cambiarDuenoEmpleado,
  compartirmeEmpleado,
} from '@/actions/empleados'

type Usuario = { id: string; email: string; nombre: string | null }

export function DialogoCambiarDueno({
  empleadoId,
  alias,
  duenoActualId,
  puedeAutocompartirse,
  esAjena,
}: {
  empleadoId: string
  alias: string
  duenoActualId: string
  puedeAutocompartirse: boolean
  /**
   * Sobre una empleada ajena el administrador solo mira (§8.7). Sobre una propia el menú es
   * el mismo pero las etiquetas cambian: decir «solo lectura» donde tenés permiso total, o
   * «acciones de administrador» sobre la tuya, sería mentira.
   */
  esAjena: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<undefined>()

  const [dialogo, setDialogo] = useState<'DUENO' | 'COMPARTIR' | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nuevoDuenoId, setNuevoDuenoId] = useState('')
  const [permiso, setPermiso] = useState<'VER' | 'EDITAR'>('EDITAR')

  useEffect(() => {
    if (!dialogo) return
    buscarUsuariosParaCompartir(empleadoId, '').then((r) => {
      if (r.ok) setUsuarios(r.datos)
    })
  }, [dialogo, empleadoId])

  function transferir() {
    ejecutar(() => cambiarDuenoEmpleado({ empleadoId, nuevoDuenoId }), {
      onExito: () => {
        setDialogo(null)
        router.refresh()
      },
    })
  }

  function autocompartirse() {
    // El id del usuario lo resuelve el servidor: la acción valida que un administrador solo
    // pueda compartirse el empleado a sí mismo (§8.7).
    ejecutar(() => compartirmeEmpleado(empleadoId, permiso), {
      onExito: () => {
        setDialogo(null)
        router.refresh()
      },
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              esAjena ? `Acciones de administrador sobre ${alias}` : `Acciones sobre ${alias}`
            }
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/empleados/${empleadoId}/faltas`}>
              <Eye className="size-4" aria-hidden />
              {esAjena ? 'Ver la ficha (solo lectura)' : 'Abrir la ficha'}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialogo('DUENO')}>
            <Users className="size-4" aria-hidden />
            Cambiar el dueño
          </DropdownMenuItem>
          {puedeAutocompartirse ? (
            <DropdownMenuItem onSelect={() => setDialogo('COMPARTIR')}>
              <UserPlus className="size-4" aria-hidden />
              Compartírmelo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogo === 'DUENO'} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar el dueño de {alias}</DialogTitle>
            <DialogDescription>
              El dueño tiene permiso total y es el único que puede compartir o borrar a la empleada.
              La acción queda registrada en la auditoría.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="nuevo-dueno">Nuevo dueño</Label>
            <Select value={nuevoDuenoId} onValueChange={setNuevoDuenoId} disabled={enviando}>
              <SelectTrigger id="nuevo-dueno">
                <SelectValue placeholder="Elegí un usuario" />
              </SelectTrigger>
              <SelectContent>
                {usuarios
                  .filter((u) => u.id !== duenoActualId)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre ?? u.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={transferir} disabled={enviando || !nuevoDuenoId}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo === 'COMPARTIR'} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Compartirme {alias}</DialogTitle>
            <DialogDescription>
              A partir de acá la empleada aparece en tu pantalla «Mi Personal» y podés operarla con
              el permiso elegido. La acción queda registrada en la auditoría.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="permiso-auto">Permiso</Label>
            <Select
              value={permiso}
              onValueChange={(v) => setPermiso(v as 'VER' | 'EDITAR')}
              disabled={enviando}
            >
              <SelectTrigger id="permiso-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VER">Ver</SelectItem>
                <SelectItem value="EDITAR">Editar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={autocompartirse} disabled={enviando}>
              Compartírmelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
