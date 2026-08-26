'use client'

/**
 * §8.4 — ficha del empleado, con sus ocho secciones.
 */
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Tabla, type Columna } from '@/components/dominio/Tabla'
import { cn } from '@/lib/utils'
import { FormularioSeries } from './FormularioSeries'
import { MovimientosEmpleado } from '@/components/dominio/MovimientosEmpleado'
import { ItemSubmenu, SubmenuSeccion } from '@/components/dominio/SubmenuSeccion'
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

  const columnasDeSalarios: Columna<Salario>[] = [
    { clave: 'vigencia', etiqueta: 'Vigente desde', className: 'tabular', celda: (s) => s.fechaVigencia },
    { clave: 'salario', etiqueta: 'Salario', numerica: true, celda: (s) => formatearImporte(s.salario) },
    { clave: 'horas', etiqueta: 'Horas semanales', numerica: true, celda: (s) => `${s.horasSemanales} h` },
    { clave: 'valor-hora', etiqueta: 'Valor hora calculado', numerica: true, celda: (s) => formatearImporte(s.valorHora) },
    {
      clave: 'origen',
      etiqueta: 'Origen',
      className: 'text-sm text-muted-foreground',
      celda: (s) => (s.origen === 'AUMENTO_MASIVO' ? 'Aumento masivo' : 'Manual'),
    },
  ]

  const columnasDeValorHora: Columna<ValorHoraNegro>[] = [
    { clave: 'vigencia', etiqueta: 'Vigente desde', className: 'tabular', celda: (v) => v.fechaVigencia },
    { clave: 'valor', etiqueta: 'Valor', numerica: true, celda: (v) => formatearImporte(v.valor) },
    {
      clave: 'referencia',
      etiqueta: 'Valor hora calculado',
      numerica: true,
      className: 'text-muted-foreground',
      // El valor hora calculado vigente a esa fecha, como referencia.
      celda: (v) => {
        const referencia = props.salarios.find((s) => s.fechaVigenciaISO <= v.fechaVigenciaISO)
        return referencia ? formatearImporte(referencia.valorHora) : '—'
      },
    },
    {
      clave: 'origen',
      etiqueta: 'Origen',
      className: 'text-sm text-muted-foreground',
      celda: (v) => (v.origen === 'AUMENTO_MASIVO' ? 'Aumento masivo' : 'Manual'),
    },
  ]

  const columnasDeRegimen: Columna<Regimen>[] = [
    { clave: 'vigencia', etiqueta: 'Vigente desde', className: 'tabular', celda: (r) => r.fechaVigencia },
    // Un día por columna, en el orden de la semana.
    ...NOMBRES_DIAS_CORTOS.map((dia, i) => ({
      clave: dia,
      etiqueta: dia,
      numerica: true,
      celda: (r: Regimen) => (Number(r.dias[i]) > 0 ? r.dias[i] : '—'),
    })),
    { clave: 'total', etiqueta: 'Total', numerica: true, className: 'font-medium', celda: (r) => `${r.total} h` },
  ]

  const columnasDeCuenta: Columna<FichaProps['cuentaCorriente'][number]>[] = [
    { clave: 'fecha', etiqueta: 'Fecha', className: 'tabular', celda: (m) => m.fecha },
    { clave: 'concepto', etiqueta: 'Concepto', celda: (m) => m.concepto },
    { clave: 'debe', etiqueta: 'Debe', numerica: true, celda: (m) => (Number(m.debe) > 0 ? importeCuenta(m.debe) : '') },
    { clave: 'haber', etiqueta: 'Haber', numerica: true, celda: (m) => (Number(m.haber) > 0 ? importeCuenta(m.haber) : '') },
    {
      clave: 'saldo',
      etiqueta: 'Saldo',
      numerica: true,
      celda: (m) => (
        <span className={cn(Number(m.saldoAcumulado) < 0 && 'text-destructive')}>
          {importeCuenta(m.saldoAcumulado)}
        </span>
      ),
    },
  ]

  const columnasDeCuotas: Columna<FichaProps['cuotas'][number]>[] = [
    { clave: 'mes', etiqueta: 'Mes', className: 'tabular', celda: (c) => c.fecha },
    { clave: 'monto', etiqueta: 'Monto', numerica: true, celda: (c) => importeCuenta(c.monto) },
    {
      clave: 'estado',
      etiqueta: 'Estado',
      celda: (c) => (
        <Badge variant={c.estado === 'APLICADA' ? 'secondary' : 'outline'}>
          {c.estado === 'APLICADA' ? 'Aplicada' : 'Pendiente'}
        </Badge>
      ),
    },
  ]

  const columnasDeLicenciaMovimientos: Columna<FichaProps['licenciaMovimientos'][number]>[] = [
    { clave: 'fecha', etiqueta: 'Fecha', className: 'tabular', celda: (m) => m.fecha },
    { clave: 'concepto', etiqueta: 'Concepto', celda: (m) => m.concepto },
    { clave: 'consumidos', etiqueta: 'Consumidos', numerica: true, celda: (m) => (Number(m.debe) > 0 ? m.debe : '') },
    { clave: 'generados', etiqueta: 'Generados', numerica: true, celda: (m) => (Number(m.haber) > 0 ? m.haber : '') },
    { clave: 'saldo', etiqueta: 'Saldo', numerica: true, celda: (m) => m.saldoAcumulado },
  ]

  const columnasDeLicencias: Columna<FichaProps['licencias'][number]>[] = [
    { clave: 'desde', etiqueta: 'Desde', className: 'tabular', celda: (l) => l.desde },
    { clave: 'hasta', etiqueta: 'Hasta', className: 'tabular', celda: (l) => l.hasta },
    { clave: 'dias', etiqueta: 'Días hábiles', numerica: true, celda: (l) => l.diasHabiles },
    {
      clave: 'vacacional',
      etiqueta: 'Salario vacacional',
      numerica: true,
      celda: (l) => (
        <>
          {l.salarioVacacional ? formatearImporte(l.salarioVacacional) : '—'}
          {l.liquidacionAnulada ? <span className="ml-1 text-muted-foreground">(anulada)</span> : null}
        </>
      ),
    },
  ]

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
          <SubmenuSeccion etiqueta="Datos">
            {SUBMENU_DATOS.filter((sub) => sub.clave !== 'compartido' || props.esDueno).map(
              (sub) => (
                <ItemSubmenu
                  key={sub.clave}
                  activo={seccion === sub.clave}
                  href={`/empleados/${props.empleadoId}?seccion=${sub.clave}`}
                >
                  {sub.etiqueta}
                </ItemSubmenu>
              ),
            )}
          </SubmenuSeccion>
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
            <Tabla columnas={columnasDeSalarios} filas={props.salarios} />

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
            <Tabla columnas={columnasDeValorHora} filas={props.valoresHoraNegro} />

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
          <Tabla columnas={columnasDeRegimen} filas={props.regimenes} />

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

          <Tabla
            columnas={columnasDeCuenta}
            filas={props.cuentaCorriente}
            claseDeFila={(m) => (m.esReversa ? 'text-muted-foreground' : undefined)}
            vacio="Todavía no hay movimientos."
          />

          {props.cuotas.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[20px]">Plan de pagos</h2>
              <Tabla columnas={columnasDeCuotas} filas={props.cuotas} />
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

          <Tabla
            columnas={columnasDeLicenciaMovimientos}
            filas={props.licenciaMovimientos}
            vacio="Todavía no hay movimientos de licencia."
          />

          {props.licencias.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-[20px]">Períodos gozados</h2>
              <Tabla columnas={columnasDeLicencias} filas={props.licencias} />
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
