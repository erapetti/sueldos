/**
 * §8.3 — pantalla principal. Empleados propios y compartidos con el usuario, con
 * `visible = true`, en una sola página ordenados por alias.
 *
 * No se muestra el salario: está en la ficha del empleado.
 */
import Link from 'next/link'
import { Eye, Plus, Share2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChipEstado } from '@/components/dominio/ChipEstado'
import { TextoDeChip } from '@/components/dominio/TextoDeChip'
import { exigirUsuario } from '@/lib/auth/guards'
import { listarEmpleadosVisibles } from '@/lib/consultas/empleados'
import { EncabezadoPagina } from '@/components/layout/EncabezadoPagina'

export const dynamic = 'force-dynamic'

export default async function PantallaEmpleados() {
  const usuario = await exigirUsuario()
  const empleados = await listarEmpleadosVisibles(usuario.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EncabezadoPagina className="mb-0 flex-1" rotulo="Espacio de trabajo" titulo="Mi Personal" />
        <Button asChild>
          <Link href="/empleados/nuevo">
            <Plus className="size-4" aria-hidden />
            Nueva empleada
          </Link>
        </Button>
      </div>

      {empleados.length === 0 ? (
        <div className="rounded-card border border-dashed p-10 text-center">
          <Users className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Todavía no tenés personal en el listado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá el primero, o revisá «Todo el Personal» por si alguno está oculto.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild>
              <Link href="/empleados/nuevo">Nueva empleada</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/empleados/todos">Todo el Personal</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-card border bg-card shadow-soft [&>li:first-child]:pt-4 [&>li:last-child]:pb-4">
          {empleados.map((empleado) => {
            const compartidoConmigo = empleado.duenoId !== usuario.id
            const soloLectura = empleado.nivel === 'VER'

            return (
              <li
                key={empleado.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-[22px]"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/empleados/${empleado.id}/faltas`}
                    className="text-lg font-medium hover:underline"
                  >
                    {empleado.alias}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {empleado.nombreCompleto}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ChipEstado estado={empleado.estado} empleadoId={empleado.id} />
                  {compartidoConmigo ? (
                    <Badge variant="secondary">
                      <TextoDeChip icono={Share2}>Compartido conmigo</TextoDeChip>
                    </Badge>
                  ) : null}
                  {soloLectura ? (
                    <Badge variant="outline" className="gap-1">
                      <TextoDeChip icono={Eye}>Solo lectura</TextoDeChip>
                    </Badge>
                  ) : null}
                </div>

              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
