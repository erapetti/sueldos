'use client'

/**
 * §8.4 punto 1 — todos los campos de §4.2, editables si el usuario tiene permiso.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CampoTexto } from '@/components/dominio/CampoMonto'
import { SelectorFecha } from '@/components/dominio/SelectorFecha'
import { useAccion } from '@/hooks/useAccion'
import {
  actualizarEmpleado,
  darDeBajaEmpleado,
  reactivarEmpleado,
} from '@/actions/empleados'
import { SEGUROS_SALUD } from '@/constants/segurosSalud'
import { aISO, hoy } from '@/lib/format/dates'

const SIN_SEGURO = 'ninguno'

export function FormularioDatos({
  empleadoId,
  valores,
  soloLectura,
  esDueno,
}: {
  empleadoId: string
  valores: {
    alias: string
    nombreCompleto: string
    banco: string | null
    cuenta: string | null
    fechaIngreso: string
    fechaEgreso: string | null
    cobraBoletos: boolean
    aportaBps: boolean
    celular: string | null
    direccion: string | null
    cedula: string | null
    seguroSalud: string | null
    seguroSaludDescripcion: string | null
    activo: boolean
  }
  soloLectura: boolean
  esDueno: boolean
}) {
  const router = useRouter()
  const guardado = useAccion<undefined>()
  const baja = useAccion<undefined>()

  const [datos, setDatos] = useState({
    alias: valores.alias,
    nombreCompleto: valores.nombreCompleto,
    banco: valores.banco ?? '',
    cuenta: valores.cuenta ?? '',
    fechaIngreso: valores.fechaIngreso as string | null,
    cobraBoletos: valores.cobraBoletos,
    aportaBps: valores.aportaBps,
    celular: valores.celular ?? '',
    direccion: valores.direccion ?? '',
    cedula: valores.cedula ?? '',
    seguroSalud: valores.seguroSalud ?? SIN_SEGURO,
  })

  const [dialogoBaja, setDialogoBaja] = useState(false)
  const [fechaEgreso, setFechaEgreso] = useState<string | null>(aISO(hoy()))

  function cambiar<K extends keyof typeof datos>(clave: K, valor: (typeof datos)[K]) {
    setDatos((previos) => ({ ...previos, [clave]: valor }))
  }

  function guardar() {
    guardado.ejecutar(
      () =>
        actualizarEmpleado(empleadoId, {
          ...datos,
          seguroSalud: datos.seguroSalud === SIN_SEGURO ? null : datos.seguroSalud,
        }),
      { exito: 'Datos guardados.', onExito: () => router.refresh() },
    )
  }

  const campos = guardado.campos
  const deshabilitado = soloLectura || guardado.enviando

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="alias"
          etiqueta="Alias"
          valor={datos.alias}
          onChange={(v) => cambiar('alias', v)}
          error={campos.alias}
          disabled={deshabilitado}
          maxLength={40}
          ayuda="Se usa en títulos, selectores y listados."
        />
        <CampoTexto
          id="nombre-completo"
          etiqueta="Nombre completo"
          valor={datos.nombreCompleto}
          onChange={(v) => cambiar('nombreCompleto', v)}
          error={campos.nombreCompleto}
          disabled={deshabilitado}
          maxLength={120}
        />
        <CampoTexto
          id="banco"
          etiqueta="Banco"
          valor={datos.banco}
          onChange={(v) => cambiar('banco', v)}
          error={campos.banco}
          disabled={deshabilitado}
          ayuda="Opcional."
        />
        <CampoTexto
          id="cuenta"
          etiqueta="Cuenta"
          valor={datos.cuenta}
          onChange={(v) => cambiar('cuenta', v)}
          error={campos.cuenta}
          disabled={deshabilitado}
          maxLength={32}
          ayuda="Opcional. Alfanumérica, hasta 32 caracteres. Se admite guion para cuenta-subcuenta."
        />

        <div className="space-y-1.5">
          <Label htmlFor="fecha-ingreso">Fecha de ingreso</Label>
          <SelectorFecha
            id="fecha-ingreso"
            valor={datos.fechaIngreso}
            onChange={(v) => cambiar('fechaIngreso', v)}
            maximo={aISO(hoy())}
            disabled={deshabilitado}
            aria-label="Fecha de ingreso"
          />
          {campos.fechaIngreso ? (
            <p className="text-sm text-destructive">{campos.fechaIngreso}</p>
          ) : null}
        </div>

        <CampoTexto
          id="cedula"
          etiqueta="Cédula"
          valor={datos.cedula}
          onChange={(v) => cambiar('cedula', v)}
          error={campos.cedula}
          disabled={deshabilitado}
          ayuda="Opcional. Se valida el dígito verificador."
        />
        <CampoTexto
          id="celular"
          etiqueta="Celular"
          valor={datos.celular}
          onChange={(v) => cambiar('celular', v)}
          error={campos.celular}
          disabled={deshabilitado}
        />
        <CampoTexto
          id="direccion"
          etiqueta="Dirección"
          valor={datos.direccion}
          onChange={(v) => cambiar('direccion', v)}
          error={campos.direccion}
          disabled={deshabilitado}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="cobra-boletos">Cobra boletos</Label>
          <Switch
            id="cobra-boletos"
            checked={datos.cobraBoletos}
            onCheckedChange={(v) => cambiar('cobraBoletos', v)}
            disabled={deshabilitado}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="aporta-bps">Aporta BPS</Label>
            <p className="text-sm text-muted-foreground">
              Si se apaga, no se le aplica ningún descuento de BPS.
            </p>
          </div>
          <Switch
            id="aporta-bps"
            checked={datos.aportaBps}
            onCheckedChange={(v) => cambiar('aportaBps', v)}
            disabled={deshabilitado}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seguro-salud">Seguro de salud</Label>
        <Select
          value={datos.seguroSalud}
          onValueChange={(v) => cambiar('seguroSalud', v)}
          // §4.2 — el campo se deshabilita cuando el switch de BPS está apagado.
          disabled={deshabilitado || !datos.aportaBps}
        >
          <SelectTrigger id="seguro-salud">
            <SelectValue placeholder="Sin seguro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_SEGURO}>Sin seguro</SelectItem>
            {SEGUROS_SALUD.map((s) => (
              <SelectItem key={s.codigo} value={s.codigo}>
                {s.codigo} — {s.descripcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!datos.aportaBps ? (
          <p className="text-sm text-muted-foreground">
            La empleada no aporta al BPS: el seguro de salud no tiene efecto.
          </p>
        ) : null}
      </div>

      {!soloLectura ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={guardar} disabled={guardado.enviando}>
            {guardado.enviando ? 'Guardando…' : 'Guardar cambios'}
          </Button>

          {esDueno ? (
            valores.activo ? (
              <Button variant="outline" onClick={() => setDialogoBaja(true)}>
                Dar de baja
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  baja.ejecutar(() => reactivarEmpleado(empleadoId), {
                    onExito: () => router.refresh(),
                  })
                }
                disabled={baja.enviando}
              >
                Reactivar
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={dialogoBaja} onOpenChange={setDialogoBaja}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja a {valores.alias}</AlertDialogTitle>
            <AlertDialogDescription>
              No se borra nada. La empleada sigue apareciendo en el listado con su estado hasta
              que lo ocultes, y queda excluido del aumento masivo de sueldos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="fecha-egreso">Fecha de egreso</Label>
            <SelectorFecha
              id="fecha-egreso"
              valor={fechaEgreso}
              onChange={setFechaEgreso}
              minimo={valores.fechaIngreso}
              disabled={baja.enviando}
              aria-label="Fecha de egreso"
            />
            {baja.campos.fechaEgreso ? (
              <p className="text-sm text-destructive">{baja.campos.fechaEgreso}</p>
            ) : null}
          </div>

          {/* La baja cierra el vínculo laboral: el acento va en «Cancelar». */}
          <AlertDialogFooter>
            <AlertDialogCancel variant="default" disabled={baja.enviando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                baja.ejecutar(() => darDeBajaEmpleado({ empleadoId, fechaEgreso }), {
                  onExito: () => {
                    setDialogoBaja(false)
                    router.refresh()
                  },
                })
              }}
              disabled={baja.enviando}
            >
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
