/**
 * Datos iniciales.
 *
 * Crea el administrador de `BOOTSTRAP_ADMIN_EMAIL` si la tabla `usuarios` está vacía (§3.3)
 * y, en desarrollo, un juego de datos de ejemplo con `SEED_DEMO=1`.
 */
import 'dotenv/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../lib/db/generated/client'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta la variable de entorno DATABASE_URL')

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) })

function fecha(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia))
}

async function bootstrap() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.log('Sin BOOTSTRAP_ADMIN_EMAIL: no se crea el administrador inicial.')
    return null
  }

  const cantidad = await prisma.usuario.count()
  if (cantidad > 0) {
    console.log(`La tabla usuarios ya tiene ${cantidad} registros: se ignora BOOTSTRAP_ADMIN_EMAIL.`)
    return prisma.usuario.findFirst({ where: { esAdmin: true } })
  }

  const admin = await prisma.usuario.create({
    // Sin `nombre`: lo trae el claim `name` de Google en el primer ingreso (README §5.7).
    data: { email, esAdmin: true, activo: true },
  })
  console.log(`Administrador inicial creado: ${admin.email}`)
  return admin
}

/** Feriados nacionales fijos del Uruguay. Los movibles se cargan desde la pantalla. */
async function feriadosFijos(anio: number) {
  const fijos: [number, number, string, boolean][] = [
    [1, 1, 'Año Nuevo', true],
    [5, 1, 'Día de los Trabajadores', true],
    [7, 18, 'Jura de la Constitución', true],
    [8, 19, 'Día de la Trabajadora Doméstica', true],
    [8, 25, 'Declaratoria de la Independencia', true],
    [12, 25, 'Día de la Familia', true],
    [1, 6, 'Día de los Niños', false],
    [5, 18, 'Batalla de Las Piedras', false],
    [6, 19, 'Natalicio de Artigas', false],
    [10, 12, 'Día de la Raza', false],
    [11, 2, 'Día de los Difuntos', false],
  ]

  for (const [mes, dia, descripcion, noLaborable] of fijos) {
    await prisma.feriado.upsert({
      where: { fecha: fecha(anio, mes, dia) },
      create: { fecha: fecha(anio, mes, dia), descripcion, noLaborable },
      update: {},
    })
  }
  console.log(`Feriados fijos de ${anio} cargados.`)
}


// ─────────────────────────────────────────────────────────────────────────────
// Juego de datos de ejemplo (SEED_DEMO=1). Solo desarrollo.
// ─────────────────────────────────────────────────────────────────────────────

type EmpleadoDemo = {
  alias: string
  nombreCompleto: string
  banco: string
  cuenta: string
  salario: string
  horasSemanales: number
  horasPorDia: number
  valorHoraNegro: string
  cobraBoletos: boolean
  aportaBps: boolean
  seguroSalud: string | null
  activo?: boolean
  visible?: boolean
}

/** Cuatro casos distintos, para que las pantallas muestren variedad real. */
const EMPLEADOS_DEMO: EmpleadoDemo[] = [
  {
    alias: 'Ana',
    nombreCompleto: 'Ana Pereyra Gómez',
    banco: 'BROU',
    cuenta: '001234567',
    salario: '68500.00',
    horasSemanales: 40,
    horasPorDia: 8,
    valorHoraNegro: '420.00',
    cobraBoletos: true,
    aportaBps: true,
    // Anexo A — «Beneficiarios con hijos sin cónyuge o concubino a cargo». Tiene que ser un
    // código de la tabla fija: los esquemas zod son un `z.enum` sobre ella, así que un código
    // inventado es un valor que la aplicación nunca habría dejado cargar.
    seguroSalud: '1',
  },
  // Sin boletos: su liquidación no lleva la línea de boletos.
  {
    alias: 'Bruno',
    nombreCompleto: 'Bruno Lemos Ferreira',
    banco: 'Itaú',
    cuenta: '99887766',
    salario: '52000.00',
    horasSemanales: 30,
    horasPorDia: 6,
    valorHoraNegro: '350.00',
    cobraBoletos: false,
    aportaBps: true,
    seguroSalud: null,
  },
  // Sin aportes al BPS (§6.3): no se le aplica ningún descuento.
  {
    alias: 'Carla',
    nombreCompleto: 'Carla Suárez Méndez',
    banco: 'Santander',
    cuenta: 'AB4455661',
    salario: '81000.00',
    horasSemanales: 44,
    horasPorDia: 8,
    valorHoraNegro: '510.00',
    cobraBoletos: true,
    aportaBps: false,
    seguroSalud: null,
  },
  // Dado de baja y oculto: aparece en «Todos los empleados», no en el listado (§8.3, §8.7).
  {
    alias: 'Rodrigo',
    nombreCompleto: 'Rodrigo Díaz Antúnez',
    banco: 'BROU',
    cuenta: '007766554',
    salario: '45000.00',
    horasSemanales: 20,
    horasPorDia: 4,
    valorHoraNegro: '300.00',
    cobraBoletos: true,
    aportaBps: true,
    seguroSalud: null,
    activo: false,
    visible: false,
  },
]

/** Serializa horas para las columnas `DECIMAL(n,2)`, como hace `lib/db/mapeo`. */
function horas(valor: number) {
  return valor.toFixed(2)
}

/**
 * Dueño de los datos de ejemplo. Se usa el administrador de `BOOTSTRAP_ADMIN_EMAIL`,
 * y si no existe se crea: unos datos de demostración cuyo dueño no puede entrar a la
 * aplicación no sirven de nada. Si no hay email configurado, cae en el primer
 * administrador que encuentre.
 */
async function duenoDemo() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (email) {
    const existente = await prisma.usuario.findUnique({ where: { email } })
    if (existente) return existente
    const creado = await prisma.usuario.create({
      // Sin `nombre`: lo trae el claim `name` de Google en el primer ingreso (README §5.7).
      data: { email, esAdmin: true, activo: true },
    })
    console.log(`Administrador ${creado.email} creado para ser dueño de los datos de ejemplo.`)
    return creado
  }
  const admin = await prisma.usuario.findFirst({ where: { esAdmin: true } })
  if (!admin) throw new Error('No hay ningún administrador: configurá BOOTSTRAP_ADMIN_EMAIL.')
  return admin
}

async function datosDemo() {
  const dueno = await duenoDemo()
  const aud = { creadoPor: dueno.id, modificadoPor: dueno.id }
  const hoy = new Date()
  const anio = hoy.getUTCFullYear()
  const mes = hoy.getUTCMonth() + 1
  // Las series arrancan en enero para que cualquier mes del año tenga vigencia.
  const vigencia = fecha(anio, 1, 1)

  // Es idempotente: se borran y se recrean, así se puede correr muchas veces.
  const borrados = await prisma.empleado.deleteMany({
    where: { duenoId: dueno.id, alias: { in: EMPLEADOS_DEMO.map((e) => e.alias) } },
  })
  if (borrados.count > 0) console.log(`Se reemplazan ${borrados.count} empleados de ejemplo.`)

  for (const demo of EMPLEADOS_DEMO) {
    const empleado = await prisma.empleado.create({
      data: {
        duenoId: dueno.id,
        alias: demo.alias,
        nombreCompleto: demo.nombreCompleto,
        banco: demo.banco,
        cuenta: demo.cuenta,
        fechaIngreso: vigencia,
        activo: demo.activo ?? true,
        visible: demo.visible ?? true,
        celular: '099 123 456',
        direccion: 'Av. 18 de Julio 1234, Montevideo',
        ...aud,
      },
    })

    // §4.2.2 — el primer registro de cada serie, con vigencia el 1° del mes de ingreso.
    await prisma.empleadoCobraBoletos.create({
      data: {
        empleadoId: empleado.id,
        fechaVigencia: vigencia,
        cobraBoletos: demo.cobraBoletos,
        ...aud,
      },
    })
    await prisma.empleadoAporteBps.create({
      data: {
        empleadoId: empleado.id,
        fechaVigencia: vigencia,
        aportaBps: demo.aportaBps,
        // §4.2 — el seguro de salud solo tiene efecto si aporta BPS.
        seguroSalud: demo.aportaBps ? demo.seguroSalud : null,
        ...aud,
      },
    })
    await prisma.empleadoSalario.create({
      data: {
        empleadoId: empleado.id,
        salario: demo.salario,
        horasSemanales: horas(demo.horasSemanales),
        fechaVigencia: vigencia,
        origen: 'MANUAL',
        ...aud,
      },
    })
    await prisma.empleadoValorHoraNegro.create({
      data: {
        empleadoId: empleado.id,
        valor: demo.valorHoraNegro,
        fechaVigencia: vigencia,
        origen: 'MANUAL',
        ...aud,
      },
    })
    const h = horas(demo.horasPorDia)
    const cero = horas(0)
    await prisma.empleadoRegimen.create({
      data: {
        empleadoId: empleado.id,
        fechaVigencia: vigencia,
        horasLunes: h,
        horasMartes: h,
        horasMiercoles: h,
        horasJueves: h,
        horasViernes: h,
        horasSabado: cero,
        horasDomingo: cero,
        ...aud,
      },
    })

    // Novedades del mes en curso, solo para el primero, para que la planilla mensual y
    // la liquidación tengan renglones que mostrar.
    if (demo.alias === 'Ana') {
      await prisma.falta.create({
        data: {
          empleadoId: empleado.id,
          fecha: fecha(anio, mes, 4),
          horas: horas(8),
          // §4.6.1 — la enfermedad es la única causal que puede no descontar.
          causal: 'ENFERMEDAD',
          descuenta: false,
          nota: 'Certificado médico',
          ...aud,
        },
      })
      await prisma.falta.create({
        data: {
          empleadoId: empleado.id,
          fecha: fecha(anio, mes, 11),
          horas: horas(4),
          causal: 'CON_AVISO',
          descuenta: true,
          ...aud,
        },
      })
      await prisma.horaExtra.create({
        data: {
          empleadoId: empleado.id,
          fecha: fecha(anio, mes, 6),
          horas: horas(3),
          conBps: true,
          recargoPct: 100,
          nota: 'Cierre de mes',
          ...aud,
        },
      })
      await prisma.horaExtra.create({
        data: {
          empleadoId: empleado.id,
          fecha: fecha(anio, mes, 20),
          horas: horas(2.5),
          conBps: false,
          recargoPct: 0,
          ...aud,
        },
      })
    }
  }
  console.log(`${EMPLEADOS_DEMO.length} empleados de ejemplo cargados (dueño: ${dueno.email}).`)

  // §4.12 — sin valor de boleto vigente la liquidación no se puede calcular.
  await prisma.valorBoleto.upsert({
    where: { fechaVigencia: vigencia },
    create: { monto: '55.00', fechaVigencia: vigencia, ...aud },
    update: { monto: '55.00', modificadoPor: dueno.id },
  })

  /**
   * §4.11 — los tres generales, que aplican a todo el que aporte, y uno atado al seguro de
   * salud de Ana, para que la demo ejercite también ese camino.
   *
   * Los específicos **se suman** a los generales: la resolución agrupa por
   * `(concepto, seguro)` y no desempata por especificidad, así que el del seguro es un
   * adicional y no un reemplazo del FONASA general. Por eso lleva nombre propio.
   */
  const CONCEPTOS: { concepto: string; porcentaje: string; seguroSalud: string | null }[] = [
    { concepto: 'Jubilación', porcentaje: '15.0000', seguroSalud: null },
    { concepto: 'FONASA', porcentaje: '4.5000', seguroSalud: null },
    { concepto: 'FRL', porcentaje: '0.1000', seguroSalud: null },
    { concepto: 'FONASA adicional por hijos', porcentaje: '1.5000', seguroSalud: '1' },
  ]
  for (const { concepto, porcentaje, seguroSalud } of CONCEPTOS) {
    await prisma.bpsConcepto.upsert({
      where: {
        concepto_seguroSaludClave_fechaVigencia: {
          concepto,
          // §4.11 — MySQL no compara NULL entre sí, así que el índice único va por la
          // columna clave y el general se guarda como '*'.
          seguroSaludClave: seguroSalud ?? '*',
          fechaVigencia: vigencia,
        },
      },
      create: {
        concepto,
        porcentaje,
        seguroSalud,
        seguroSaludClave: seguroSalud ?? '*',
        fechaVigencia: vigencia,
        ...aud,
      },
      update: { porcentaje, modificadoPor: dueno.id },
    })
  }
  console.log('Valor de boleto y conceptos de BPS de ejemplo cargados.')
}

async function main() {
  await bootstrap()
  const anio = new Date().getUTCFullYear()
  await feriadosFijos(anio)
  await feriadosFijos(anio + 1)

  if (process.env.SEED_DEMO === '1') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_DEMO no se puede usar en producción.')
    }
    await datosDemo()
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
