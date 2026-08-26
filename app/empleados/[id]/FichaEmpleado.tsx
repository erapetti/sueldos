'use client'

/**
 * §8.4 — ficha del empleado, con sus ocho secciones.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { FormularioSeries } from './FormularioSeries'
import { MovimientosEmpleado } from '@/components/dominio/MovimientosEmpleado'
import { FormularioDatos } from './FormularioDatos'
import { PanelCompartir } from './PanelCompartir'
import { formatearDias, formatearImporte, formatearImporteEntero, todosEnteros } from '@/lib/format/money'
import { NOMBRES_DIAS_CORTOS } from '@/lib/format/dates'
import {
  EncabezadoEmpleada,
  EstadosEmpleada,
} from '@/components/dominio/EncabezadoEmpleada'

type Salario = {
  id: string
  fechaVigencia: string
  fechaVigenciaISO: string
  salario: string
  horasSemanales: string
  valorHora: string
  origen: string
}

type ValorHoraNegro = {
  id: string
  fechaVigencia: string
  fechaVigenciaISO: string
  valor: string
  origen: string
}

type Regimen = {
  id: string
  fechaVigencia: string
  fechaVigenciaISO: string
  dias: string[]
  total: string
}

export type FichaProps = {
  empleadoId: string
  seccionInicial: string
  soloLectura: boolean
  esDueno: boolean
  comoAdministrador: boolean
  duenoNombre: string
  empleado: {
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
    visible: boolean
  }
  salarios: Salario[]
  valoresHoraNegro: ValorHoraNegro[]
  regimenes: Regimen[]
  cuentaCorriente: {
    id: string
    fecha: string
    tipo: string
    concepto: string
    debe: string
    haber: string
    saldoAcumulado: string
    esReversa: boolean
  }[]
  saldo: string
  mesesSinLiquidar: string[]
  cuotas: { id: string; fecha: string; fechaISO: string; monto: string; estado: string }[]
  licencias: {
    id: string
    desde: string
    hasta: string
    diasHabiles: string
    salarioVacacional: string | null
    liquidacionAnulada: boolean
    nota: string | null
  }[]
  licenciaMovimientos: {
    id: string
    fecha: string
    tipo: string
    concepto: string
    debe: string
    haber: string
    saldoAcumulado: string
  }[]
  saldoDias: string
  liquidaciones: {
    id: string
    periodo: string
    periodoISO: string
    tipo: string
    secuencia: number
    estado: string
    totalAPagar: string
    pagada: boolean
  }[]
  totalesPorPeriodo: Record<string, string>
  permisos: { usuarioId: string; nombre: string; email: string; permiso: string }[]
}

/** Las cuatro secciones que cuelgan de «Datos», en el orden en que se muestran. */
const SUBMENU_DATOS = [
  { clave: 'datos', etiqueta: 'Generales' },
  { clave: 'salario', etiqueta: 'Salario' },
  { clave: 'regimen', etiqueta: 'Régimen' },
  { clave: 'compartido', etiqueta: 'Compartido con' },
] as const

export function FichaEmpleado(props: FichaProps) {
  const router = useRouter()
  // La sección viene de la URL: el menú son links, no pestañas con estado.
  const seccion = props.seccionInicial
  const esDeDatos = SUBMENU_DATOS.some((sub) => sub.clave === seccion)

  /**
   * Los importes que se mueven se registran en pesos enteros, así que el `,00` sobra. Pero
   * puede haber movimientos viejos con centavos —no se migraron—, y ahí conviene mostrarlos:
   * si **todos** los montos de la pestaña son enteros se ocultan los decimales, y si alguno
   * tiene centavos se muestran en todos, para que la columna se lea pareja.
   */
  const importesDeCuenta = [
    props.saldo,
    ...props.cuentaCorriente.flatMap((m) => [m.debe, m.haber, m.saldoAcumulado]),
    ...props.cuotas.map((c) => c.monto),
  ]
  const cuentaSinCentavos = todosEnteros(importesDeCuenta)
  const importeCuenta = cuentaSinCentavos ? formatearImporteEntero : formatearImporte

  return (
    <div className="space-y-5">
      <EncabezadoEmpleada
        empleadoId={props.empleadoId}
        alias={props.empleado.alias}
        nombreCompleto={props.empleado.nombreCompleto}
        activa={seccion}
        estados={
          <EstadosEmpleada
            empleadoId={props.empleadoId}
            activo={props.empleado.activo}
            visible={props.empleado.visible}
          />
        }
        aviso={
          props.comoAdministrador ? (
            <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
              Estás viendo una empleada de {props.duenoNombre} como administradora. Para operarla
              tenés que compartírtelo desde «Todos los empleados».
            </p>
          ) : null
        }
      />

      <div className="space-y-4">

        {/* 1 — Datos */}
        {/*
          Submenú de Datos. Se muestra en las cuatro secciones y no solo en «Generales», así
          se puede saltar entre ellas sin volver atrás; el botón de la sección actual queda
          marcado. Estas cuatro no están en el menú de arriba para no dejarlo con diez ítems.
        */}
        {esDeDatos ? (
          <div className="flex flex-wrap gap-2">
            {SUBMENU_DATOS.filter((sub) => sub.clave !== 'compartido' || props.esDueno).map(
              (sub) => (
                <Button
                  key={sub.clave}
                  asChild
                  variant={seccion === sub.clave ? 'default' : 'outline'}
                  size="sm"
                >
                  <Link
                    href={`/empleados/${props.empleadoId}?seccion=${sub.clave}`}
                    aria-current={seccion === sub.clave ? 'page' : undefined}
                  >
                    {sub.etiqueta}
                  </Link>
                </Button>
              ),
            )}
          </div>
        ) : null}

        {seccion === 'datos' ? (
          <div>
            <div className="rounded-card border bg-card px-[22px] py-5 shadow-soft">
              <FormularioDatos
                empleadoId={props.empleadoId}
                valores={props.empleado}
                soloLectura={props.soloLectura}
                esDueno={props.esDueno}
              />
            </div>
          </div>
        ) : null}

        {/* 2 — Salario */}
        {seccion === 'salario' ? (
          <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-[20px]">Salario y horas semanales</h2>
            <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vigente desde</TableHead>
                    <TableHead className="text-right">Salario</TableHead>
                    <TableHead className="text-right">Horas semanales</TableHead>
                    <TableHead className="text-right">Valor hora calculado</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.salarios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular">{s.fechaVigencia}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatearImporte(s.salario)}
                      </TableCell>
                      <TableCell className="text-right tabular">{s.horasSemanales} h</TableCell>
                      <TableCell className="text-right tabular">
                        {formatearImporte(s.valorHora)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.origen === 'AUMENTO_MASIVO' ? 'Aumento masivo' : 'Manual'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!props.soloLectura ? (
              <FormularioSeries
                tipo="SALARIO"
                empleadoId={props.empleadoId}
                onGuardado={() => router.refresh()}
              />
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-[20px]">Valor hora sin aportes</h2>
            <p className="text-sm text-muted-foreground">
              Con el que se pagan las horas extras sin descuento de BPS (§4.3.1).
            </p>
            <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vigente desde</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Valor hora calculado</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.valoresHoraNegro.map((v) => {
                    // El valor hora calculado vigente a esa fecha, como referencia.
                    const referencia = props.salarios.find(
                      (s) => s.fechaVigenciaISO <= v.fechaVigenciaISO,
                    )
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="tabular">{v.fechaVigencia}</TableCell>
                        <TableCell className="text-right tabular">
                          {formatearImporte(v.valor)}
                        </TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">
                          {referencia ? formatearImporte(referencia.valorHora) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {v.origen === 'AUMENTO_MASIVO' ? 'Aumento masivo' : 'Manual'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {!props.soloLectura ? (
              <FormularioSeries
                tipo="VALOR_HORA_NEGRO"
                empleadoId={props.empleadoId}
                onGuardado={() => router.refresh()}
              />
            ) : null}
          </section>
          </div>
        ) : null}

        {/* 3 — Régimen */}
        {seccion === 'regimen' ? (
          <div className="space-y-4">
          <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigente desde</TableHead>
                  {NOMBRES_DIAS_CORTOS.map((d) => (
                    <TableHead key={d} className="text-right">
                      {d}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.regimenes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular">{r.fechaVigencia}</TableCell>
                    {r.dias.map((horas, i) => (
                      <TableCell key={i} className="text-right tabular">
                        {Number(horas) > 0 ? horas : '—'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular font-medium">{r.total} h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!props.soloLectura ? (
            <FormularioSeries
              tipo="REGIMEN"
              empleadoId={props.empleadoId}
              onGuardado={() => router.refresh()}
            />
          ) : null}
          </div>
        ) : null}

        {/*
          4 — Movimientos: el índice de las cuatro cosas que se cargan de a una. Se llamaba
          «Acciones» y era solo botonera; ahora cada una lleva a su listado, donde además se
          da de alta.
        */}
        {seccion === 'movimientos' ? (
          <div>
            <div className="space-y-3 rounded-card border bg-card px-[22px] py-5 shadow-soft">
              <p className="text-sm text-muted-foreground">
                Movimientos que no se cargan en planilla: se registran de a uno, con su fecha.
              </p>
              <MovimientosEmpleado
                empleadoId={props.empleadoId}
                alias={props.empleado.alias}
                fechaIngreso={props.empleado.fechaIngreso}
                puedeEditar={!props.soloLectura}
                dadoDeBaja={!props.empleado.activo}
                // Oculta se puede volver a mostrar siempre; ocultar, solo si está de baja
                // (§8.3), que es lo que resuelve el fallback a `dadoDeBaja`.
                mostrarVisibilidad={!props.empleado.visible}
                visible={props.empleado.visible}
              />
            </div>
          </div>
        ) : null}

        {/* 5 — Cuenta corriente */}
        {seccion === 'cuenta' ? (
          <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-sm text-muted-foreground">Saldo</span>
            <span
              className={cn(
                'text-2xl font-semibold tabular',
                Number(props.saldo) < 0 && 'text-destructive',
              )}
            >
              {importeCuenta(props.saldo)}
            </span>
            <span className="text-sm text-muted-foreground">
              {Number(props.saldo) > 0
                ? 'la empresa le debe a la empleada'
                : Number(props.saldo) < 0
                  ? 'saldo pendiente de préstamos'
                  : 'al día'}
            </span>
          </div>

          {props.mesesSinLiquidar.length > 0 ? (
            <p className="rounded-md border border-warn/35 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
              El saldo puede estar incompleto: faltan confirmar las liquidaciones de{' '}
              {props.mesesSinLiquidar.slice(0, 8).join(', ')}
              {props.mesesSinLiquidar.length > 8
                ? ` y ${props.mesesSinLiquidar.length - 8} meses más`
                : ''}
              .
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.cuentaCorriente.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Todavía no hay movimientos.
                    </TableCell>
                  </TableRow>
                ) : (
                  props.cuentaCorriente.map((m) => (
                    <TableRow key={m.id} className={cn(m.esReversa && 'text-muted-foreground')}>
                      <TableCell className="tabular">{m.fecha}</TableCell>
                      <TableCell>{m.concepto}</TableCell>
                      <TableCell className="text-right tabular">
                        {Number(m.debe) > 0 ? importeCuenta(m.debe) : ''}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {Number(m.haber) > 0 ? importeCuenta(m.haber) : ''}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular',
                          Number(m.saldoAcumulado) < 0 && 'text-destructive',
                        )}
                      >
                        {importeCuenta(m.saldoAcumulado)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {props.cuotas.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[20px]">Plan de pagos</h2>
              <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.cuotas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="tabular">{c.fecha}</TableCell>
                        <TableCell className="text-right tabular">
                          {importeCuenta(c.monto)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.estado === 'APLICADA' ? 'secondary' : 'outline'}>
                            {c.estado === 'APLICADA' ? 'Aplicada' : 'Pendiente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}
          </div>
        ) : null}

        {/* 6 — Licencia */}
        {seccion === 'licencia' ? (
          <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-sm text-muted-foreground">Saldo de días</span>
            <span
              className={cn(
                'text-2xl font-semibold tabular',
                Number(props.saldoDias) < 0 && 'text-destructive',
              )}
            >
              {formatearDias(props.saldoDias)}
            </span>
          </div>

          <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Consumidos</TableHead>
                  <TableHead className="text-right">Generados</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.licenciaMovimientos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Todavía no hay movimientos de licencia.
                    </TableCell>
                  </TableRow>
                ) : (
                  props.licenciaMovimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="tabular">{m.fecha}</TableCell>
                      <TableCell>{m.concepto}</TableCell>
                      <TableCell className="text-right tabular">
                        {Number(m.debe) > 0 ? m.debe : ''}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {Number(m.haber) > 0 ? m.haber : ''}
                      </TableCell>
                      <TableCell className="text-right tabular">{m.saldoAcumulado}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {props.licencias.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[20px]">Períodos gozados</h2>
              <div className="overflow-x-auto rounded-card bg-card shadow-soft border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Desde</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead className="text-right">Días hábiles</TableHead>
                      <TableHead className="text-right">Salario vacacional</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.licencias.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="tabular">{l.desde}</TableCell>
                        <TableCell className="tabular">{l.hasta}</TableCell>
                        <TableCell className="text-right tabular">{l.diasHabiles}</TableCell>
                        <TableCell className="text-right tabular">
                          {l.salarioVacacional ? formatearImporte(l.salarioVacacional) : '—'}
                          {l.liquidacionAnulada ? (
                            <span className="ml-1 text-muted-foreground">(anulada)</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}
          </div>
        ) : null}

        {/* 8 — Compartido con */}
        {props.esDueno && seccion === 'compartido' ? (
          <div>
            <PanelCompartir
              empleadoId={props.empleadoId}
              permisos={props.permisos}
              onCambio={() => router.refresh()}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
