'use client'

/**
 * §8.7 — menú de acciones de cada fila de «Todo el Personal»: cambiar el dueño, compartírselo
 * a sí mismo y cambiar la visibilidad.
 *
 * **No lleva «abrir la ficha»**: la fila entera ya enlaza a la empleada desde que las tablas
 * siguen el criterio de `FilaConDetalle`, así que era ofrecer dos caminos a lo mismo —y el
 * peor de los dos, escondido dentro de un menú—.
 *
 * Los tres diálogos son el mismo `DialogoDeAccion` con distinto contenido.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, MoreVertical, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { DialogoDeAccion } from './DialogoDeAccion'
import { DialogoOcultar } from './DialogoOcultar'

type Usuario = { id: string; email: string; nombre: string | null }

type Dialogo = 'DUENO' | 'COMPARTIR' | 'VISIBILIDAD' | null

export function DialogoCambiarDueno({
  empleadoId,
  alias,
  duenoActualId,
  puedeAutocompartirse,
  esAjena,
  activa,
  visible,
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
  /** §8.3 — solo se oculta a una empleada dada de baja. */
  activa: boolean
  visible: boolean
}) {
  const router = useRouter()
  const { ejecutar, enviando } = useAccion<undefined>()

  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nuevoDuenoId, setNuevoDuenoId] = useState('')
  const [permiso, setPermiso] = useState<'VER' | 'EDITAR'>('EDITAR')

  useEffect(() => {
    if (dialogo !== 'DUENO' && dialogo !== 'COMPARTIR') return
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

  const ocultando = visible

  const opciones = [
    {
      clave: 'dueno',
      etiqueta: 'Cambiar el dueño',
      icono: Users,
      dialogo: 'DUENO' as const,
      habilitada: true,
    },
    ...(puedeAutocompartirse
      ? [
          {
            clave: 'compartir',
            etiqueta: 'Compartírmelo',
            icono: UserPlus,
            dialogo: 'COMPARTIR' as const,
            habilitada: true,
          },
        ]
      : []),
    {
      clave: 'visibilidad',
      etiqueta: ocultando ? 'Ocultar del listado' : 'Volver a mostrar en el listado',
      icono: ocultando ? EyeOff : Eye,
      dialogo: 'VISIBILIDAD' as const,
      /*
        `cambiarVisibilidad` pasa por `exigirEdicion`, así que un administrador sobre una
        empleada ajena no puede: primero tiene que compartírsela (§8.7). Y ocultar pide que
        esté dada de baja (§8.3); volver a mostrar, no.
      */
      habilitada: !esAjena && (ocultando ? !activa : true),
    },
  ]

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
          {opciones.map((opcion) => {
            const Icono = opcion.icono
            return (
              <DropdownMenuItem
                key={opcion.clave}
                disabled={!opcion.habilitada}
                onSelect={() => setDialogo(opcion.dialogo)}
              >
                <Icono className="size-4" aria-hidden />
                {opcion.etiqueta}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoDeAccion
        abierto={dialogo === 'DUENO'}
        onCerrar={() => setDialogo(null)}
        titulo={`Cambiar el dueño de ${alias}`}
        descripcion="El dueño tiene permiso total y es el único que puede compartir o borrar a la empleada. La acción queda registrada en la auditoría."
        etiquetaConfirmar="Transferir"
        onConfirmar={transferir}
        enviando={enviando}
        confirmarDeshabilitado={!nuevoDuenoId}
      >
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
      </DialogoDeAccion>

      <DialogoDeAccion
        abierto={dialogo === 'COMPARTIR'}
        onCerrar={() => setDialogo(null)}
        titulo={`Compartirme ${alias}`}
        descripcion="A partir de acá la empleada aparece en tu pantalla «Mi Personal» y podés operarla con el permiso elegido. La acción queda registrada en la auditoría."
        etiquetaConfirmar="Compartírmelo"
        onConfirmar={autocompartirse}
        enviando={enviando}
      >
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
      </DialogoDeAccion>

      {/* El mismo diálogo que usa la hoja «Movimientos» de la ficha. */}
      <DialogoOcultar
        abierto={dialogo === 'VISIBILIDAD'}
        onCerrar={() => setDialogo(null)}
        empleadoId={empleadoId}
        alias={alias}
        visible={visible}
      />
    </>
  )
}
