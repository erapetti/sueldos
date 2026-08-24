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
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { CampoTexto } from '@/components/dominio/CampoMonto'
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

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        className="mb-0"
        rotulo="Configuración"
        titulo="Usuarios"
        bajada="El alta se hace con el email de Google. El usuario queda vinculado a su cuenta en el primer ingreso."
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
        <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead className="hidden sm:table-cell">Último acceso</TableHead>
                <TableHead className="text-right">Personal</TableHead>
                <TableHead>Administrador</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => {
                const esUnoMismo = u.id === usuarioActualId
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{u.nombre ?? u.email}</span>
                        {esUnoMismo ? <Badge variant="secondary">Vos</Badge> : null}
                        {!u.reclamado ? <Badge variant="outline">Sin ingresar</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular">
                      {u.ultimoAcceso ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular">{u.empleados}</TableCell>
                    <TableCell>
                      <Switch
                        checked={u.esAdmin}
                        onCheckedChange={(v) => cambiarFlag(u, { esAdmin: v })}
                        // §3.4 — un administrador no puede quitarse a sí mismo el flag.
                        disabled={enviando || (esUnoMismo && u.esAdmin)}
                        aria-label={`Administrador: ${u.nombre ?? u.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.activo}
                        onCheckedChange={(v) => cambiarFlag(u, { activo: v })}
                        disabled={enviando || esUnoMismo}
                        aria-label={`Activo: ${u.nombre ?? u.email}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Borrar a ${u.nombre ?? u.email}`}
                        disabled={enviando || esUnoMismo}
                        onClick={() => {
                          setABorrar(u)
                          setNuevoDuenoId('')
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <AlertDialog open={aBorrar !== null} onOpenChange={(v) => !v && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar a {aBorrar?.nombre ?? aBorrar?.email}</AlertDialogTitle>
            <AlertDialogDescription>
              {aBorrar && aBorrar.empleados > 0
                ? `Es dueño de ${aBorrar.empleados} empleada(s). Elegí a quién transferirlas: sin eso no se puede borrar.`
                : 'Se borra el usuario y sus permisos sobre el personal compartido. La auditoría se conserva.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

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

          {/* Borrar es irreversible: el acento va en «Cancelar». */}
          <AlertDialogFooter>
            <AlertDialogCancel variant="default" disabled={enviando}>
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={borrar}
              disabled={enviando || (aBorrar !== null && aBorrar.empleados > 0 && !nuevoDuenoId)}
            >
              Borrar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
