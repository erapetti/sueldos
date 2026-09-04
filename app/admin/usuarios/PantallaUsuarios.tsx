'use client'

/**
 * §3.4 — alta, modificación del flag admin y baja de usuarios.
 *
 * Reglas transversales: un administrador no puede quitarse a sí mismo el flag, no se puede
 * borrar el último administrador, y no se puede borrar un usuario dueño de empleados sin
 * transferir antes la propiedad.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { CampoTexto } from '@/components/dominio/CampoMonto'
import { DialogoDeAccion } from '@/components/dominio/DialogoDeAccion'
import { useAccion } from '@/hooks/useAccion'
import { actualizarUsuario, borrarUsuario, crearUsuario } from '@/actions/admin'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

type Usuario = {
  id: string
  email: string
  nombre: string | null
  esAdmin: boolean
  activo: boolean
  reclamado: boolean
  ultimoAcceso: string | null
  empleados: number
}

export function PantallaUsuarios({
  usuarioActualId,
  usuarios,
}: {
  usuarioActualId: string
  usuarios: Usuario[]
}) {
  const router = useRouter()
  const alta = useAccion<{ id: string }>()
  const cambio = useAccion<undefined>()

  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [esAdmin, setEsAdmin] = useState(false)

  const [aBorrar, setABorrar] = useState<Usuario | null>(null)
  const [nuevoDuenoId, setNuevoDuenoId] = useState('')

  function crear() {
    alta.ejecutar(() => crearUsuario({ email, nombre, esAdmin }), {
      onExito: () => {
        setEmail('')
        setNombre('')
        setEsAdmin(false)
        router.refresh()
      },
    })
  }

  function cambiarFlag(usuario: Usuario, cambios: Partial<Pick<Usuario, 'esAdmin' | 'activo'>>) {
    cambio.ejecutar(
      () =>
        actualizarUsuario({
          usuarioId: usuario.id,
          nombre: usuario.nombre ?? '',
          esAdmin: cambios.esAdmin ?? usuario.esAdmin,
          activo: cambios.activo ?? usuario.activo,
        }),
      { onExito: () => router.refresh() },
    )
  }

  function borrar() {
    if (!aBorrar) return
    cambio.ejecutar(
      () =>
        borrarUsuario({
          usuarioId: aBorrar.id,
          nuevoDuenoId: nuevoDuenoId || null,
        }),
      {
        onExito: () => {
          setABorrar(null)
          setNuevoDuenoId('')
          router.refresh()
        },
      },
    )
  }

  const enviando = alta.enviando || cambio.enviando

  type FilaUsuario = (typeof usuarios)[number]
  const esElActual = (u: FilaUsuario) => u.id === usuarioActualId

  const columnasDeUsuarios: Columna<FilaUsuario>[] = [
    {
      clave: 'usuario',
      etiqueta: 'Usuario',
      celda: (u) => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{u.nombre ?? u.email}</span>
            {esElActual(u) ? <Badge variant="secondary">Vos</Badge> : null}
            {!u.reclamado ? <Badge variant="outline">Sin ingresar</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{u.email}</p>
        </>
      ),
    },
    {
      clave: 'ultimo-acceso',
      etiqueta: 'Último acceso',
      desde: 'sm',
      className: 'tabular',
      celda: (u) => u.ultimoAcceso ?? '—',
    },
    { clave: 'personal', etiqueta: 'Personal', numerica: true, celda: (u) => u.empleados },
    {
      clave: 'admin',
      etiqueta: 'Administrador',
      celda: (u) => (
        <Switch
          checked={u.esAdmin}
          onCheckedChange={(v) => cambiarFlag(u, { esAdmin: v })}
          // §3.4 — un administrador no puede quitarse a sí mismo el flag.
          disabled={enviando || (esElActual(u) && u.esAdmin)}
          aria-label={`Administrador: ${u.nombre ?? u.email}`}
        />
      ),
    },
    {
      clave: 'activo',
      etiqueta: 'Activo',
      celda: (u) => (
        <Switch
          checked={u.activo}
          onCheckedChange={(v) => cambiarFlag(u, { activo: v })}
          disabled={enviando || esElActual(u)}
          aria-label={`Activo: ${u.nombre ?? u.email}`}
        />
      ),
    },
    {
      clave: 'acciones',
      etiqueta: 'Acciones',
      derecha: true,
      celda: (u) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Borrar a ${u.nombre ?? u.email}`}
          disabled={enviando || esElActual(u)}
          onClick={() => {
            setABorrar(u)
            setNuevoDuenoId('')
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Configuración"
        titulo="Usuarios"
        bajada="El alta se hace con el email de Google, que es con lo que la persona entra. Hasta su primer ingreso queda marcada como «Sin ingresar»."
      />

      <section className="space-y-4 rounded-card bg-card shadow-soft border px-[22px] py-5">
        <h2 className="text-[20px]">Nuevo usuario</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="usuario-email"
            etiqueta="Email de Google"
            valor={email}
            onChange={setEmail}
            error={alta.campos.email}
            disabled={enviando}
            placeholder="persona@empresa.com"
          />
          <CampoTexto
            id="usuario-nombre"
            etiqueta="Nombre"
            valor={nombre}
            onChange={setNombre}
            error={alta.campos.nombre}
            disabled={enviando}
            ayuda="Se refresca en cada ingreso desde Google."
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="usuario-admin"
            checked={esAdmin}
            onCheckedChange={setEsAdmin}
            disabled={enviando}
          />
          <Label htmlFor="usuario-admin">Administrador</Label>
        </div>

        <Button onClick={crear} disabled={enviando || !email.trim()}>
          {alta.enviando ? 'Creando…' : 'Dar de alta'}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-[20px]">Usuarios del sistema</h2>
        <Tabla columnas={columnasDeUsuarios} filas={usuarios} />
      </section>

      {/* Borrar es irreversible: el acento va en «Cancelar». */}
      <DialogoDeAccion
        abierto={aBorrar !== null}
        onCerrar={() => setABorrar(null)}
        titulo={`Borrar a ${aBorrar?.nombre ?? aBorrar?.email}`}
        descripcion={
          aBorrar && aBorrar.empleados > 0
            ? `Es dueño de ${aBorrar.empleados} empleada(s). Elegí a quién transferirlas: sin eso no se puede borrar.`
            : 'Se borra el usuario y sus permisos sobre el personal compartido. La auditoría se conserva.'
        }
        etiquetaConfirmar="Borrar"
        onConfirmar={borrar}
        enviando={enviando}
        confirmarDeshabilitado={aBorrar !== null && aBorrar.empleados > 0 && !nuevoDuenoId}
        peligrosa
      >
        {aBorrar && aBorrar.empleados > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="nuevo-dueno">Nuevo dueño de su personal</Label>
            <Select value={nuevoDuenoId} onValueChange={setNuevoDuenoId} disabled={enviando}>
              <SelectTrigger id="nuevo-dueno">
                <SelectValue placeholder="Elegí un usuario" />
              </SelectTrigger>
              <SelectContent>
                {usuarios
                  .filter((u) => u.id !== aBorrar.id && u.activo)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre ?? u.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {cambio.campos.nuevoDuenoId ? (
              <p className="text-sm text-destructive">{cambio.campos.nuevoDuenoId}</p>
            ) : null}
          </div>
        ) : null}
      </DialogoDeAccion>
    </div>
  )
}
