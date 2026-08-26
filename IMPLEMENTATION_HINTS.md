# Notas de implementación

Memoria de las decisiones tomadas al construir la aplicación. No repite el
[SPECS.md](SPECS.md) —que es la especificación funcional— ni el [README.md](README.md) —que
es cómo desplegarla—: acá está el **porqué** de lo que no se deduce leyendo el código.

Si vas a cambiar algo, empezá por acá. Está ordenado por lo que más caro sale desconocer.

---

## 1. El SPECS no describe exactamente lo que está construido

`SPECS.md` es normativo pero hay puntos donde la implementación diverge, por decisión
explícita o por imposibilidad técnica. **No se puede editar el SPECS**, así que las
divergencias viven acá.

### 1.1 La base es MySQL 8, no PostgreSQL

El §2 y el §10 dicen PostgreSQL 16+. Se implementó sobre **MySQL 8** por decisión del
proyecto. Las adaptaciones están en el README, sección «Adaptaciones a MySQL». Lo que importa
recordar: hay **tres columnas que no existen en el SPECS** y que están solo para que MySQL
pueda expresar restricciones que en PostgreSQL serían índices parciales.

| Columna | Tabla | Para qué |
|---|---|---|
| `uk_vigente` | `liquidaciones` | Vale `1` mientras la liquidación está vigente y `NULL` cuando se anula. MySQL considera distintos entre sí los `NULL` de un índice único, así que varias anuladas conviven y solo puede haber una vigente. Emula el `WHERE estado <> 'ANULADA'` del §4.14 |
| `seguro_salud_clave` | `bps_conceptos` | `seguro_salud` normalizado a `*` cuando es `NULL`. Sin esta columna el único de §4.11 **no restringiría nada** para los conceptos generales, porque los `NULL` no se comparan |
| `liquidacion_aplicada_id` | `plan_pagos` | Qué liquidación marcó la cuota como `APLICADA`. Permite que anular una complementaria devuelva a `PENDIENTE` exactamente las cuotas que ella aplicó, y no las de una secuencia anterior del mismo período (§7.6.1) |

**Si tocás alguna de estas tres, releé el §4.14, §4.11 o §7.6.1 antes.** Son restricciones de
negocio disfrazadas de detalle técnico.

Las migraciones son cuatro y hay una escrita a mano:

- `20260818000000_init` — generada por Prisma
- `20260818000100_restricciones` — **a mano**: los `CHECK` de §5.1 y las validaciones de §4.x
- `20260818000200_cuota_liquidacion` — `liquidacion_aplicada_id`
- `20260818000300_bps_clave_seguro` — `seguro_salud_clave`
- `20260823000000_cuenta_opcional` y `20260823000100_banco_opcional`
- `20260824000000_recupera_otro_dia` — **a mano**: la quinta causal y el CHECK de horas
  extras relajado a `>= 0` (§1.6)

`prisma migrate dev` no conoce los `CHECK` y los reporta como drift. Para cambiar el modelo:
`prisma migrate dev --create-only` y volver a agregarlos si la migración generada recrea
alguna de esas tablas.

### 1.2 El valor hora se calcula distinto de lo que dice el §4.3

El §4.3 escribe `salario / horas_semanales * (52 / 12)`. Leído literal, con $60.000 y 40 h da
**$6.500 la hora**, que es absurdo: una hora extra al 100 % costaría $13.000 y 8 horas de
falta descontarían $52.000 de un sueldo de $60.000.

Se implementó `salario / (horas_semanales × 52/12)` — el salario dividido las ~173,33 horas
del mes—, **confirmado con el usuario**. El §4.3 sigue diciendo lo otro.

### 1.3 Los importes se redondean a pesos enteros, en el cálculo

El §4.3 dice que el valor hora se usa con precisión completa y el §6.7 que cada línea se
redondea a 2 decimales. **Ninguna de las dos se cumple hoy.**

El motivo está medido: redondeando solo al mostrar, la columna de la liquidación no cerraba
en **6 de cada 10 casos** —se despegaba entre 1 y 3 pesos, sobre 5.000 liquidaciones
simuladas con el motor real—. Como la liquidación se controla a mano, se decidió redondear en
el cálculo: lo que se ve es exactamente lo que se suma.

La regla es **una sola**: se redondea al cerrar cada línea, nunca antes. Los pasos intermedios
siguen con precisión completa. La función es `redondearPesos` en `lib/format/money.ts` y ahí
está el detalle.

Lo que **no** se redondea son los importes que tipea el usuario —salario, pagos adicionales,
préstamos, valor del boleto—: se guardan tal cual y el redondeo de la línea los absorbe. Se
ofreció restringir los formularios a pesos enteros y el usuario prefirió dejarlo así.

No se migraron los datos anteriores al cambio. Por eso la pestaña de cuenta corriente decide
sola si muestra centavos: si **todos** los importes de la pantalla son enteros los oculta, y
si alguno los tiene los muestra en toda la columna. Ver `todosEnteros`.

El mismo criterio rige las cuotas que genera «Registrar préstamo»: `repartirEnCuotas` reparte
en enteros y el único resto posible son los centavos del monto tipeado, que caen en la última.
**Cuando hay que escribir decimales en un campo de importe, el separador es la coma**, que es
lo que se tipea y lo único que `parsearNumero` lee como decimal: el punto lo interpreta como
separador de miles, al estilo es-UY. Generarlas con `toFixed(2)` hacía que `1000.00` se
releyera como `100000` y el diálogo avisara de un descuadre en préstamos que cerraban bien.

### 1.4 No se muestra la leyenda «Empleado sin aportes al BPS»

El §6.3 pide que, con `aporta_bps = false`, «el encabezado de la liquidación muestra la leyenda
*"Empleado sin aportes al BPS"*». **No se muestra**, por decisión del usuario: el dato se deduce
de las propias líneas —no hay línea `MATERIA GRAVADA` ni ningún descuento de BPS, que es lo
mismo que el §6.3 manda hacer— y en la pantalla aparecía dos veces, en el cuadro de datos y en
la lista de avisos.

Se sacó **en el motor** (`lib/calculo/liquidacion.ts`, paso 5) y no filtrando el aviso en la
pantalla, para que no haya dos comportamientos posibles según quién consuma `avisos`. El test
del §12 quedó invertido —verifica que el aviso **no** se emita— para que no vuelva sin que
nadie lo note.

La ficha del empleado **sí** conserva el chip «Sin aportes al BPS» (`FichaEmpleado`): ahí no
hay liquidación de la cual deducirlo.

### 1.5 Las planillas aceptan todo el mes en curso, no solo hasta hoy

El §6.11 cierra con: «Validación de fecha, común a las tres novedades: no anterior a
`fecha_ingreso` ni posterior al día de hoy». Las planillas mensuales de §7.1 y §7.2 aceptan
**cualquier día del mes en curso**, incluidos los que todavía no pasaron, por pedido del
usuario: se cargan sobre la marcha y hay ausencias y horas que se saben antes de que ocurran.

Lo que se sigue impidiendo es cargar en un **mes posterior al actual**, y ese control es el
que importa: sin él, una novedad caería en un período que todavía no existe para la
liquidación. Vive en `verificarFechaDeNovedad` (`actions/novedades.ts`), que toma el límite
por parámetro, y lo respalda el `noPuedeAvanzar` de la flecha de mes en la planilla.

**El pago adicional (§7.3) conserva el tope de hoy**, aunque comparte la misma función: es un
hecho consumado, no algo que se anticipe, y su selector de fecha tampoco ofrece días futuros.
Lo mismo vale para los movimientos de cuenta corriente (§7.4 y §7.5), que validan con
`fechaNoFutura` en el esquema zod.

### 1.6 Hay una causal de falta más, y las horas extras admiten el cero

Dos agregados pedidos por el usuario que el SPECS no contempla. Van juntos porque resuelven
el mismo caso: **el día que se recupera trabajando otro día**.

**Causal `RECUPERA_OTRO_DIA`.** El Anexo B lista cuatro causales —Con aviso, Sin aviso,
Enfermedad, Maternidad— y el §7.2 habla de «los cuatro valores del Anexo B». La quinta se
llama «Recupera otro día» y es la única que **nunca descuenta**: las horas se trabajan otro
día, así que el sueldo no se toca. El día sí pierde el boleto, y eso no hizo falta
programarlo: la regla del §6.4 saca del conteo cualquier día con falta de jornada completa y
no mira `descuenta`. Una falta *parcial* con esta causal conserva el boleto, que es lo
correcto: si estuvo medio día, viajó.

`normalizarDescuenta` es el único lugar que decide el valor, y el cliente lo usa en vez de
repetir la regla. La migración `20260824000000_recupera_otro_dia` agrega el valor al enum.

**Horas extras en cero.** El §4.5 pide `horas > 0`, y había un CHECK que lo hacía cumplir. Se
relajó a `>= 0` porque un renglón en cero es la forma de decir «ese día fue a trabajar»
cuando no le corresponde por régimen —va especialmente a recuperar—, y así el §6.5 le paga el
boleto. No paga nada más: `agruparPorRecargo` descarta los grupos en cero, así que no genera
línea de liquidación. Las **inasistencias** siguen exigiendo `> 0`: una falta de cero horas no
significa nada.

Al guardar un lote con renglones en cero la planilla pide confirmación, porque es una carga
que de otro modo parece un error de tipeo. En el calendario el renglón se ve como `+0 h`: si
no se mostrara no habría manera de saber que está ni de abrirlo para borrarlo.

### 1.7 El feriado no laborable trabajado: línea propia y boleto

Dos cambios pedidos por el usuario. El **doble pago no es uno de ellos**: trabajar un feriado
se carga como hora extra con recargo de 100 %, y eso ya lo pagaba al doble.

**La línea «Horas en feriados no laborables»**, entre las horas extras con BPS y la materia
gravada. Lleva las horas con `con_bps = true` y recargo de **0 %** que caen en un feriado no
laborable, **topeadas por las horas que el régimen le asigna a ese día**, valorizadas al valor
hora calculado.

El 0 % no es un descuido: el día ya viene pago adentro del salario base —es mensual y el
feriado no se descuenta—, así que trabajarlo agrega otro valor hora por hora y termina
pagándose doble sin necesidad de recargo.

El tope **reparte, no recorta**. Con un régimen de 6 h y 8 h cargadas, 6 van a la línea del
feriado y 2 quedan como hora extra común al 0 %: las 8 se pagan enteras. Y si el régimen le
da 0 horas a ese día —un feriado en domingo— no se desglosa nada, porque no hay jornada ya
pagada en el salario base que reflejar.

Es **solo presentación**: esas horas se **sacan** de la línea genérica en vez de sumarse
aparte. Si se sumaran, se pagarían dos veces. La materia gravada y el total no cambian, y la
regla de cálculo del §6.2 sigue siendo la misma; lo único que cambia es que la hoja informa
que el mes incluyó un feriado trabajado. Hay un test que fija justamente eso: mismo total con
y sin desglose.

**El boleto del feriado trabajado.** Antes no se pagaba: el §6.4 saltea el día por ser
feriado, y la regla del §6.5 que recupera días solo miraba los que tienen 0 horas en el
régimen —un feriado en día hábil tiene las del régimen—, así que el día no volvía nunca.
Ahora un feriado no laborable con horas extras registradas cuenta como día con boleto.

El criterio del boleto es **«fue a trabajar, viajó»**: no mira `con_bps` ni el recargo, y le
alcanza con que haya un registro de horas extras, aunque sea de cero horas (§1.6). Es a
propósito más amplio que el del desglose.

**Lo que quedó afuera.** Al pedir esto el usuario dijo que los feriados «tienen 0 horas en
régimen». Tomado al pie de la letra eso valdría para todo —el tope de horas de una falta
(§4.6), lo que muestra la celda del calendario— y no solo para el boleto. Se implementó
**solo dentro del cálculo de boletos**, que es lo que cubren los dos casos de uso que pidió.
Si alguna vez se quiere la lectura amplia, hay que pasarle los feriados a `horasDelDia` y
revisar sus tres usos.

### 1.7.1 La liquidación se presenta en dos tablas

Pedido del usuario, y el §6.2 quedó reescrito con esto: la liquidación se lee en dos tablas
—**formal** e **informal**—, cada una con su propio total a pagar, más un total general cuando
existen las dos. Los importes y el total del mes no cambian: es el mismo cálculo repartido.

**Cómo está implementado.** Cada `LineaLiquidacion` tiene `tabla: 'FORMAL' | 'INFORMAL'`, y la
columna `tabla` de `liquidacion_lineas` la persiste. El motor junta las líneas en una sola lista
sin `orden`, y al final las separa por tabla —formal primero— y las numera. Por eso el `orden`
es correlativo entre las dos tablas y no arranca de nuevo en la segunda: es el que se guarda y
el que ordena la relectura de una liquidación confirmada (§4.14).

Los totales son la **suma con signo de las líneas de cada tabla**; las de signo 0 —materia
gravada y subtotal— no suman. `totalRecalculado` pasó a ser `totalFormal + totalInformal`, que
da exactamente lo mismo que la fórmula anterior.

**La tabla base.** Todo lo que no es específicamente informal —salario, faltas, horas extras con
BPS, descuentos, subtotal, cuotas, pagos adicionales— va a `tablaBase`, que es la formal si el
empleado aporta y la informal si no. Con `aporta_bps = false` no hay tabla formal: la pantalla
muestra una sola tabla y no rotula ninguna, porque el título sobraría.

**Los boletos se parten en dos líneas** (§6.5.1): los días del régimen y los días con alguna
hora extra con BPS van a la formal; el resto, a la informal. `calcularBoletos` devuelve
`diasExtraConBps` y `diasExtraSinBps` en vez del viejo `diasExtraConBoleto`. Un día con horas de
los dos tipos cuenta una vez y como día con BPS.

Dos consecuencias menores, las dos deliberadas:

- Una línea de boletos **sin días no se emite**. Antes, un mes sin días trabajados —período
  anterior al ingreso— mostraba «Boletos (0 días) $0»; ahora no aparece.
- Los **pagos adicionales** bajaron del paso 7 al final de su tabla, después de los boletos, por
  pedido del usuario. No cambia ningún total.

**Los boletos informales van después de las horas extras sin BPS**, no junto con los otros
boletos: la tabla informal se lee «las horas que fue a hacer, y el viaje que costaron».

**El salario vacacional** (§7.11) no se parte: cae entero en la tabla que le corresponde al
empleado, la formal si aporta y la informal si no.

**Lo que todavía no está: los dos libros.** La contabilidad sigue con un solo asiento
`LIQUIDACION` por el devengado bruto y un solo `total_a_pagar` (§4.9). El plan acordado con el
usuario es una segunda etapa: una columna `libro: FORMAL | INFORMAL` en `cuenta_corriente`, dos
asientos por liquidación, cada `PAGO` con su libro, y el estado «pagada» por libro. Cuando eso
exista hay dos cosas que cambian acá:

- la **cuota** del plan de pagos va a descontar en la tabla del libro donde quedó el préstamo,
  no en la del aporte actual del empleado. Hoy es lo mismo salvo que el empleado haya cambiado
  de régimen de aporte con cuotas pendientes. El libro sale de `plan_pagos.prestamo_id`, que ya
  apunta al movimiento del préstamo: no hace falta guardarlo aparte;
- la **complementaria** va a poder ser parcial: si un libro está pagado y el otro no, la
  diferencia se calcula por libro y el libro que no cambió no emite asiento.

### 1.8 «Con aviso» también puede no descontar

El §4.6.1 hace editable el campo `descuenta` **solo** con `ENFERMEDAD` y lista `CON_AVISO`,
`SIN_AVISO` y `MATERNIDAD` entre las que se fuerzan a `true` sin mostrar el interruptor. Por
pedido del usuario `CON_AVISO` pasa a ser editable, por flexibilidad. La tabla que rige es:

| Causal | Arranca | Se puede cambiar |
|---|---|---|
| Con aviso | descuenta | **sí** (divergencia) |
| Sin aviso | descuenta | no |
| Enfermedad | descuenta | sí (§4.6.1) |
| Maternidad | descuenta | no — esa licencia la paga BPS, nunca el empleador |
| Recupera otro día | no descuenta | no (§1.6) |

Dos cosas más que cambian respecto del §4.6.1, y son de presentación: el interruptor **se
muestra siempre**, deshabilitado donde la causal lo fija —así el efecto de la causal se lee
sin recordarlo—, y **cambiar de causal lo devuelve al valor inicial de la causal nueva**,
aunque se lo haya movido a mano.

La tabla vive en `constants/causales.ts`, en dos funciones —`descuentaInicial` y
`descuentaEsEditable`— que usan la UI y el servidor. `tests/causales.test.ts` la fija fila por
fila: si se agrega una causal, ese test falla hasta que se decida su comportamiento.

### 1.9 El aguinaldo es un período más, no una pantalla aparte

El §7.7 lo trata como un cálculo propio y el §8.4 lo dejaba fuera de las secciones de la
ficha; estaba como una acción suelta —«Aguinaldo»— que abría `/empleados/[id]/aguinaldo`. Por
pedido del usuario pasa a ser **un período de la secuencia de Liquidaciones**, así que el año
tiene catorce paradas en vez de doce:

    … Mayo · Junio · ½ Aguinaldo Junio · Julio … Diciembre · ½ Aguinaldo Diciembre · Enero …

La secuencia vive en `lib/calculo/periodos.ts`, con `siguientePeriodo` y `anteriorPeriodo` como
única fuente: las flechas de la pantalla no saben de meses, solo piden el que sigue. El tipo
viaja en la URL como `?tipo=aguinaldo`, y `MENSUAL` no viaja porque es el valor por defecto.
`tests/periodos.test.ts` fija el recorrido completo del año y la simetría ir/volver en los seis
bordes.

La ruta `/empleados/[id]/aguinaldo` y `lib/format/aguinaldo.ts` se borraron: la primera solo se
alcanzaba desde la acción que ya no existe, y el segundo solo servía para habilitarla.

**El cuerpo de la pantalla sigue pendiente** (§13.3): el ½ aguinaldo muestra qué falta definir
—si la base es el promedio del semestre, qué conceptos la integran, si lleva descuentos de
BPS— con el mismo encabezado y el mismo navegador que la liquidación mensual.

**La flecha de atrás pide historia.** Se habilita solo si existe una liquidación no anulada en
un período anterior, por pedido del usuario. Tiene una consecuencia que conviene tener
presente: si un mes quedó sin liquidar y no hay ninguna liquidación anterior, a ese mes no se
llega con las flechas —hay que escribir el `?periodo=` a mano—. La vista «Lista» tampoco lo
muestra, porque solo lista las confirmadas.

### 1.10 Los movimientos de a uno tienen listado y detalle, y no hay tabla de préstamos

El §7.4 y el §7.5 describen las cuatro acciones que se cargan de a una —préstamo, pago
adicional, licencia y pago bancario— **solo como diálogos de alta**. Con eso, lo registrado no
se podía volver a mirar ni corregir: el préstamo quedaba como un asiento en la cuenta corriente
y sus cuotas en el plan de pagos, sin ninguna pantalla que las juntara. Por pedido del usuario
cada una pasa a tener **listado y detalle**, empezando por préstamos.

**No se creó una tabla `prestamos`, y no hace falta.** Un préstamo *es* el asiento `PRESTAMO`
de `cuenta_corriente` (§4.9): `plan_pagos.prestamo_id` ya es FK a esa tabla y el §4.8 la
describe como «préstamo que originó el plan». Darle tabla propia duplicaría la identidad del
movimiento y obligaría a migrar esa FK. El listado se arma leyendo el asiento con sus cuotas,
en `lib/consultas/movimientos.ts`, que está partido para que las otras tres entren al lado.

**El menú de fila de «Todo el Personal» no ofrece «abrir la ficha».** La fila entera ya enlaza
a la empleada desde que las tablas siguen el criterio de arriba, así que era ofrecer dos
caminos a lo mismo, y el peor de los dos: escondido dentro de un menú. Sí ofrece cambiar la
visibilidad, que antes solo se alcanzaba desde la ficha. Es el mismo `DialogoOcultar` en los
dos lados —la visibilidad es una columna de la empleada, no una preferencia de quien la
esconde, y el texto lo aclara: el cambio vale para todos los usuarios—. La opción se
deshabilita sobre una empleada ajena, porque `cambiarVisibilidad` pasa por `exigirEdicion` y
un administrador primero tiene que compartírsela (§8.7).

**El ítem «Acciones» del menú se llama ahora «Movimientos»** y dejó de ser solo botonera: es el
índice desde donde se entra a cada listado. Por ahora solo «Préstamos» lleva a su pantalla; las
otras tres conservan el «Registrar …» y su diálogo hasta que tengan la suya.

**Los dos submenús se dibujan con `SubmenuSeccion`.** «Datos» y «Movimientos» son lo mismo —una
rama del menú de la empleada con varias hojas— y se dibujaban distinto: Datos como una fila de
botones siempre presente, Movimientos como una tarjeta con un texto explicativo arriba. Queda
la forma de Datos, que es la que se comporta como submenú: está a la vista en toda la rama
—incluidas las pantallas propias, no solo el índice— y el botón de donde estás parado va en
`default` con `aria-current="page"`.

Es un **`<nav>`** y no un `<div>`: un submenú es navegación, y el landmark le da al lector de
pantalla cómo saltar hasta acá y saber que esos botones son hermanos. La salvedad de hoy es que
en Movimientos tres de los cuatro abren un diálogo en vez de navegar; se corrige solo cuando
tengan su pantalla.

**Las diez tablas se dibujan con `Tabla`** (`components/dominio/Tabla.tsx`), y siguen un
criterio único:

- **La fila tiene detalle** → la primera columna es el enlace, con `ENLACE_PRINCIPAL`
  (`text-lg font-medium hover:underline`), y la fila entera lleva al mismo lado y se resalta
  con `hover:bg-muted/5`. Son tres: préstamos, la vista «Lista» de liquidaciones y «Todo el
  Personal».
- **La fila no tiene detalle** —el desglose de la liquidación, la cuenta corriente, el plan de
  pagos, las licencias, los listados de administración, compartido con— → ni enlace ni
  resaltado, y la primera columna se dibuja como le convenga.

El resaltado es la promesa de que hay algo del otro lado; sin destino, engaña. Por eso
`TableRow` dejó de traer `hover:bg-muted/50` de fábrica: era un default que resaltaba las diez
tablas cuando solo tres llevan a alguna parte. La divergencia está en el README (§2.6).

**Los dos tipos son el mismo componente**, y lo que los separa es `hrefDetalle`: con él, la
primera columna se dibuja como enlace y la fila entera lo acompaña; sin él, ni una cosa ni la
otra. Las columnas se declaran en un array —`Columna<T>`— en vez de escribir el `<thead>` y el
`<tbody>` por separado, que es lo que los hacía divergir: antes el andamio estaba copiado en
quince lugares y cada estado vacío llevaba su `colSpan` escrito a mano, que quedaba viejo en
cuanto alguien agregaba una columna. Ahora sale de `columnas.length`.

Solo `Tabla` y `FilaConDetalle` importan de `components/ui/table`; ninguna pantalla arma su
propio andamio.

**Los diálogos de confirmar una acción son `DialogoDeAccion`**, siempre un `Dialog`, con
cuerpo o sin él. `peligrosa` mueve el acento al botón que no cambia nada.

Se probó distinguir las confirmaciones con `AlertDialog` —que atrapa el foco hasta que elegís
y no ofrece la X— y **se descartó por decisión del usuario**: se ven igual, y trabar la salida
de una pregunta que ya es reversible molesta más de lo que protege.

**Una fila con detalle ignora los clics que nacen en un portal.** El diálogo y el menú de la
fila cuelgan de `<body>` en el DOM, pero React los hace burbujear **por el árbol de
componentes**: como `DialogoCambiarDueno` se renderiza adentro de una celda, cerrar su diálogo
tocando afuera llegaba al `onClick` del `<tr>` y abría la empleada —cerraba el diálogo y
navegaba de arriba—. `FilaConDetalle` lo corta con `e.currentTarget.contains(e.target)`, que
es sobre el DOM y por eso separa las dos cosas. Cualquier fila que sume un control con portal
—un `Select`, un `Popover`— queda cubierta por la misma guarda.

Los usan los tres del menú de «Todo el Personal» y el de visibilidad. **Los cuatro diálogos de
alta** —préstamo, pago adicional, licencia, pago bancario— y las siete confirmaciones sueltas
que quedan —en `FormularioDatos`, `DetallePrestamo`, `PantallaUsuarios`, `PantallaLiquidacion`
y `PlanillaMensual`— todavía arman el suyo; encajan en `DialogoDeAccion` y conviene migrarlas
cuando se las toque. Si una tabla necesita algo que la plantilla no da, **agregalo a la plantilla**:
las columnas ya soportan alineación a la derecha, tipografía tabular, esconderse por
breakpoint y clases propias, y la primera columna tiene `alLado` y `debajo` para lo que no
debe quedar adentro del enlace —si el chip de estado y el nombre completo cayeran dentro del
`<a>`, el lector de pantalla anunciaría «Ana Ana Pereyra Gómez» en vez de «Ana»—.

**El enlace real vive en la celda, no en la fila.** Un `<a>` no puede envolver un `<tr>`, así
que `FilaConDetalle` agrega el clic con `router.push` y la celda conserva su `<Link>`: el
teclado y el lector de pantalla ven un enlace por fila, y sin JavaScript la tabla se sigue
navegando por la primera columna. Se descartó el «stretched link» —un `::after` estirado desde
el enlace— porque depende de que el navegador respete `position: relative` sobre un `<tr>`, que
la especificación deja indefinido: si lo ignora, el área invisible se estira contra la tarjeta
entera y se come los clics de media pantalla sin que nada lo delate.

`FilaConDetalle` deja pasar el clic cuando cae sobre un control propio de la fila —el chip de
estado, el menú de acciones de «Todo el Personal»— y cuando hay texto seleccionado, para que
arrastrar para copiar no termine navegando.

Dos reglas del detalle que son de negocio y conviene no aflojar:

- **La fecha y el monto no se editan.** El asiento ya está en el libro y puede tener
  liquidaciones confirmadas encima; corregirlo movería un saldo hacia atrás. El camino es
  anular el movimiento —que deja su contra-asiento— y registrarlo de nuevo. Lo editable es el
  concepto, en `actualizarPrestamo`.
- **Una cuota se bloquea si su mes ya pasó o si dejó de estar `PENDIENTE`.** Las dos reglas
  suman. La del mes es la que pidió el usuario; la del estado es la única que valida el
  servidor (§4.8), así que sin ella la pantalla ofrecería editar cuotas que la acción rechaza.

**El saldo de un préstamo es el monto menos las cuotas `APLICADA`.** Una `CANCELADA` no lo
baja: cancelarla significa que ese mes no se descuenta, no que la plata se haya devuelto. Un
préstamo sin plan muestra el monto entero, y uno anulado muestra cero.

`actualizarCuota` y `cancelarCuota` ya existían en `actions/prestamos.ts` desde el §4.8 y no
las llamaba nadie: esta pantalla es la que les da uso.

**La línea de la cuota en la liquidación dice de cuál se trata**: «Cuota 2 de 5 del préstamo de
25/03». Decía «Cuota del plan de pagos», y con dos préstamos abiertos en el mismo mes las dos
líneas quedaban idénticas. El ordinal cuenta **todas** las cuotas del plan, canceladas
incluidas: si cancelar la cuarta convirtiera la quinta en «4 de 4», la misma cuota cambiaría de
nombre entre una liquidación y la siguiente. Como `lib/calculo` es puro (§2.1), el ordinal, el
total y la fecha del préstamo se resuelven en `lib/liquidacion/datos.ts` y entran por
`CuotaPlanCalculo`.

### 1.11 El loopback del cron no se puede implementar como está escrito

El §7.12 pide que `/api/cron/*` verifique que la conexión viene de loopback. **Next 16 no
expone la dirección del socket a los route handlers.** Lo único disponible es
`x-forwarded-for`, y está verificado que es falsificable: mandando
`X-Forwarded-For: 10.0.0.7` desde localhost, Next respeta el valor del cliente.

La condición se hace cumplir en el borde, no en la app: **el proceso escucha solo en
127.0.0.1** (`next start --hostname 127.0.0.1`), y nginx bloquea `/api/cron/` hacia afuera.
La verificación del header queda como segunda línea de defensa. Está explicado en
`lib/auth/cronAuth.ts` y en el README.

Si algún día Next expone la dirección real, ese es el lugar a cambiar.

### 1.12 Funcionalidad pendiente de definición (§13)

Aguinaldo (§13.3) y Aumento de sueldos (§13.4) muestran **«funcionalidad no implementada
aún»**, por pedido del usuario. Pero no están vacíos:

- El aumento masivo tiene **toda la parte transaccional implementada y testeada** en
  `actions/aumento.ts`. Cuando se defina el criterio, lo único que falta es producir el
  salario nuevo de cada empleado; la inserción del salario y del valor hora «en negro» con la
  misma vigencia y el mismo porcentaje ya funciona.
- El aguinaldo solo tiene `esMesDeAguinaldo` y el semestre, que es lo único que el §7.7 deja
  cerrado.

---

## 2. Reglas de arquitectura que conviene no romper

### 2.1 `lib/calculo` es código puro

Recibe un objeto de entrada ya resuelto y devuelve las líneas. **No accede a la base ni a la
sesión** (§9). Es lo que permite testear las 46 pruebas del §12 sin infraestructura.

El puente entre la base y el motor es `lib/liquidacion/datos.ts`: resuelve las series
vigentes (§5.2), los conceptos de BPS aplicables (§4.11) y las novedades del período. Si
necesitás un dato nuevo en el cálculo, se agrega **ahí**, no dentro del motor.

### 2.2 Un solo lugar lee la identidad

`lib/auth/currentUser.ts` es el **único** archivo que lee `x-forwarded-user`,
`x-forwarded-email` y `x-forwarded-preferred-username` (§3.2). No lo repliques: si otro
archivo empieza a leer headers de identidad, la superficie de ataque se multiplica y deja de
ser auditable.

### 2.3 Toda Server Action valida permisos en el servidor

Ocultar un botón no es control de acceso (§3.4). Los guards están en `lib/auth/guards.ts` y
cada acción arranca con uno: `exigirEdicion`, `exigirDueno`, `exigirAdmin`…

Ojo con la distinción del nivel `ADMIN`: un administrador sobre un empleado **ajeno** puede
ver la ficha, cambiar el dueño y compartírselo a sí mismo, pero **no** registrar novedades ni
liquidar hasta compartírselo (§8.7). Está en `exigirEdicion`.

### 2.4 Las fechas de negocio son medianoche UTC

Todas las fechas del SPECS son `DATE`: sin hora, sin zona. Se representan como un `Date` a la
**medianoche UTC** y se leen con los getters `UTC*`. `America/Montevideo` interviene en un
solo lugar: `hoy()`.

La conexión a MySQL se abre con `timezone=Z` (ver `lib/db/prisma.ts`), verificado: los
timestamps se guardan en UTC aunque el proceso corra con `TZ=America/Montevideo`.

**No uses `new Date()` ni `getMonth()` en código de negocio.** Todo pasa por
`lib/format/dates.ts`.

### 2.5 Los Decimal de Prisma no son los de decimal.js

Prisma devuelve una clase propia. Se convierte **siempre por `toString()`**, con los helpers
de `lib/db/mapeo.ts` (`aDecimal`, `aColumnaImporte`…). No pases un Decimal de Prisma a una
función que espera uno de decimal.js.

### 2.6 `components/ui` vs `components/dominio`

shadcn **no es una dependencia**: es un generador que copia el código, así que
`components/ui/` es nuestro. El criterio para decidir dónde va un cambio:

- **Corrección de un default equivocado** → va en `ui/`. Hoy hay **una sola divergencia**,
  documentada en el README: `SelectTrigger` pasó de `w-fit` a `w-full min-w-0` porque crecía
  sin tope con el texto de la opción y rompía el layout.
- **Comportamiento propio del dominio** → va en `dominio/`. Por eso `SelectorFecha` y
  `SelectorVigencia` envuelven a los de shadcn en vez de modificarlos: la semana que empieza
  en lunes o los feriados resaltados no son cosas que shadcn deba saber.

Si agregás una modificación a `ui/`, **listala en el README**. Un comentario dentro del
archivo no sirve: nadie lee un archivo que está por sobrescribir.

### 2.7 El SPECS.md no se edita sin permiso

Hay más de una persona trabajando con el SPECS como referencia, así que **editarlo obliga a
avisarle al equipo que lo vuelva a leer**. Por eso la especificación se toca solo cuando el
dueño del proyecto lo pide explícitamente.

El lugar de las divergencias es **este archivo**: para eso existe la sección 1. Si al
implementar algo parece que el SPECS debería cambiar, se documenta acá y se le plantea a él,
que decide.

---

## 3. Trampas que ya costaron tiempo

| Síntoma | Causa | Dónde |
|---|---|---|
| `Only async functions are allowed to be exported in a "use server" file` | Un archivo de acciones exportaba una constante | Las constantes van a `lib/`, no al archivo de acciones. Pasó con `AUMENTO_NO_IMPLEMENTADO` |
| El middleware no se ejecuta | Next 16 renombró `middleware.ts` a **`proxy.ts`** | `proxy.ts` en la raíz. No tiene relación con oauth2-proxy |
| `The datasource property url is no longer supported` | Prisma 7 sacó la URL del schema | Va en `prisma.config.ts`, y el cliente necesita un **driver adapter** (`@prisma/adapter-mariadb`) |
| Warning de `package-lock.json` ignorado al arrancar | Next sube por el árbol buscando lockfiles | `outputFileTracingRoot` fijo en `next.config.ts` |
| `npm audit` en rojo por `deepmerge-ts` | Llega por el CLI de Prisma, que es devDependency | `overrides` en `package.json`. **Nunca `npm audit fix --force`**: baja a Prisma 6 y rompe todo |
| ESLint: `set-state-in-effect` | Estado derivado sincronizado con un efecto | Patrón «comparar contra el valor anterior durante el render», o montar el componente solo cuando hace falta. Los diálogos usan lo segundo |
| Un test de integración deja la base vacía | `limpiarBase()` **borra todas las tablas** de `DATABASE_URL` | Hoy hay una guarda: `tests/apoyo/base.ts` exige `DELETE_ALL_DATA=1`, que solo pone `npm run delete_all_data_and_test`. Con `npm test` las tres suites que borran fallan al cargar y las unitarias pasan. Después de correr la versión destructiva hay que volver a sembrar |
| Un error de Prisma que no se corresponde con el código —`Argument 'dueno' is missing` con `duenoId` presente, o tipos `string` donde el schema dice `String?`— | El cliente generado quedó viejo respecto del schema | `lib/db/generated/` está en `.gitignore`. **En desarrollo**, después de `db:generate` hay que reiniciar el dev server: el proceso tiene el cliente anterior en memoria. **En el deploy**, ese directorio sobrevive de una vez a la siguiente y `git pull` no lo actualiza, así que `npm run build` corre `prisma generate` antes de compilar |
| Una sombra o cualquier token de `@theme` no se aplica, sin error | En `@theme inline` la variable se definió apuntándose a sí misma | `--shadow-soft: var(--shadow-soft)` es circular y el valor queda inválido en silencio. Las variables de `:root` que alimentan el tema tienen que llamarse distinto: en `globals.css` son `--sombra-*` |
| Un `<input type="number">` acepta valores fuera de `min`/`max` | Esos atributos solo limitan las flechas del spinner y la validación nativa, no lo que se tipea | Las planillas mensuales clampean en el `onChange`. El tope real de horas de falta contra el régimen lo valida el servidor (§4.6), que es donde tiene que estar |
| Un archivo de tests rompe el build de producción | `tsconfig.json` incluía `**/*.ts`, así que `next build` typechequeaba `tests/` | Resuelto: ver abajo |

### Los tests están fuera del typecheck de producción

`tsconfig.json` excluye `tests/`. El código de prueba no se despliega y no tiene por qué poder
frenar un deploy.

Pasó de verdad: un commit subió un test nuevo pero no el módulo que ese test importaba, y el
build de producción se cayó con `TS2724` aunque la aplicación estaba bien. Hay un segundo
riesgo, peor: si el servidor instala con `npm ci --omit=dev`, `vitest` no existe, el
`import { describe } from 'vitest'` no resuelve y **el build falla con el código de la
aplicación intacto**.

El reparto quedó así:

| Comando | Qué chequea |
|---|---|
| `next build` | Solo la aplicación. Un test roto **no** lo frena |
| `npm run typecheck` | Las dos cosas: `tsconfig.json` y `tsconfig.test.json` |
| `npx eslint .` | Todo, tests incluidos |

Los tres comportamientos están verificados metiendo un error de tipos a propósito en un test.
**Usá `npm run typecheck`, no `npx tsc --noEmit` a secas**, o los tests dejan de chequearse.

Un efecto lateral que no es obvio: excluir `tests/` del tsconfig también los saca de la
resolución de `paths`, así que Vitest dejaba de resolver `@/`. Por eso el alias está
declarado explícitamente en `vitest.config.mts` en vez de deducirse del tsconfig.

---

## 4. Cómo están armados los tests

245 tests en 10 archivos. La división importa:

- **Puros** (`liquidacion`, `licencias`, `estado`, `cuentaCorriente`, `formato`) — no tocan la
  base, corren en milisegundos. Acá va todo lo que se pueda.
- **De integración** (`integracion`, `cron-aumento`, `listados`) — contra la base real, y
  **solo se corren con `npm run delete_all_data_and_test`**, porque vacían la base.
  Cubren lo que solo se puede verificar con transacciones: complementarias, idempotencia del
  cron, permisos, y el conteo de queries del §11.

Los de integración mockean `@/lib/auth/currentUser` y usan `actuarComo()` para cambiar de
usuario. El stub de `server-only` y los mocks de `next/cache` están en `tests/setup.ts` y
`tests/stubs/`.

La guarda de los destructivos es una variable de entorno que pone un script con nombre
explícito, y no un `--delete-all-data`, porque Vitest rechaza cualquier flag que no conozca
(`CACError: Unknown option`) y el passthrough de npm como `npm_config_*` está deprecado. El
nombre del script es la advertencia.

**Los casos del §12 están numerados en los `describe`.** Si agregás un caso del SPECS, seguí
la numeración: hace que se pueda auditar la cobertura contra la especificación.

### El calendario de referencia

Casi todos los tests usan **abril de 2026**: 30 días, arranca miércoles, 22 días de lunes a
viernes, 4 sábados. Y el empleado base es **$65.000 por 30 h semanales**, elegido para que el
valor hora dé exacto: `65.000 / (30 × 52/12) = $500`. Si cambiás la base, se rompen decenas de
aserciones.

---

## 5. Lo que quedó sin verificar

Sé honesto sobre esto antes de poner la aplicación en producción.

**Todo se probó contra MariaDB 10.11, no contra MySQL 8.** El MySQL de la máquina de
desarrollo no permitía `ALTER` ni `INSERT`, así que se levantó una instancia propia de MariaDB
en un directorio temporal. Es buen proxy pero no es lo mismo. Lo que más podría diferir son
los `CHECK` de la migración `20260818000100_restricciones`.

**Antes de dar esto por bueno: correr `prisma migrate deploy` y la suite completa contra un
MySQL 8 real.**

Tampoco se probó contra un **oauth2-proxy real**. La configuración de nginx del README está
razonada pero no ejecutada; el punto más frágil es que los `$upstream_http_x_auth_request_*`
dependen de que `--set-xauthrequest=true` esté puesto.

---

## 6. Decisiones de presentación que el SPECS no fijaba

- **Agrupación de líneas.** Las horas extras se agrupan por porcentaje de recargo y emiten una
  línea por recargo; los pagos adicionales y las cuotas emiten una línea cada uno. El §6.7
  fija la línea como unidad de redondeo, así que la suma cierra igual.
- **Estados vacíos y toasts.** Cada acción devuelve un `Resultado` (`lib/acciones/resultado.ts`)
  que el hook `useAccion` traduce a toast de éxito, aviso o error, y a errores por campo. Si
  agregás una acción, seguí ese contrato: la UI ya sabe qué hacer con él.
- **Los avisos del §5.3 y del §6.11** viajan en el campo `aviso` del resultado, no como
  excepción. Son informativos: la operación se guardó igual.

### La estética viene de un proyecto de Claude Design

El lenguaje visual —paleta cálida, Instrument Sans e Instrument Serif, geometría de píldora,
radios de 28px, sombras largas y la textura del lienzo— sale del componente **App Shell** del
proyecto «webapp» en claude.ai/design, no de decisiones tomadas acá. Los valores están en hex
en `app/globals.css` a propósito, para poder auditarlos contra el original.

Si algo se ve distinto del diseño, revisá primero esta lista antes de «corregirlo»: son
desvíos deliberados.

| Desvío | Por qué |
|---|---|
| El documento scrollea, no el panel `main` | El diseño scrollea dentro de `main`. Contenedores de scroll independientes rompen la impresión, que acá es una función real (§7.6) |
| No hay campana de notificaciones, badge «Beta» ni dashboard de ejemplo | Son relleno del mock. Serían UI sin función detrás |
| El modo oscuro no es del diseño | El diseño solo entrega la variante clara; la oscura se derivó conservando la temperatura cálida. Hoy no hay `ThemeProvider`, así que no se puede activar |
| El nombre del feriado no se muestra en la celda del calendario | §7.1 pide mostrarlo. Se decidió marcarlo con fondo y borde; el nombre quedó en el `title` y en el `aria-label`. **Divergencia abierta con el SPECS** |
| El padding del header derecho sale de un `calc()` | El diseño lo calcula midiendo `main` con un `ResizeObserver`. La misma cuenta en CSS evita convertir el layout raíz en componente cliente y un salto de layout |

Ese `calc()` del header —`app/globals.css`, clase `.header-app`— es el que mantiene el bloque
de usuario alineado con el borde derecho del contenido cuando la pantalla es más ancha que el
techo de contenido. Depende de dos valores que tienen que decir lo mismo en dos archivos: el
breakpoint y el ancho del menú lateral (`--ancho-sidebar` en `globals.css` contra `lg:block` y
`w-64` en `Menu.tsx`). Si se mueve el sidebar, hay que tocar los dos lados.

### Las filas de la lista rápida usan `display: contents`

En las planillas mensuales, abajo de `sm` cada campo ocupa su renglón con su etiqueta al lado;
desde `sm` la fila es horizontal con un encabezado de columnas. Eso se logra con un envoltorio
por campo que en desktop **desaparece** (`sm:contents`), así el campo vuelve a ser hijo directo
del flex y el layout de escritorio no cambia.

No lo «simplifiques» sacando el envoltorio: es lo que permite tener las dos vistas sin duplicar
el markup. Y los anchos de columna son las constantes `COL_*` exportadas por
`PlanillaMensual`, compartidas por el encabezado y por los campos justamente para que no se
puedan desincronizar. Las cinco columnas entran con **14px de holgura a 640px** —medidos: la
fila usa 544 de 558px—, así que agregar una más obliga a recortar otra. Eran 22px hasta que la
columna del día pasó de 100 a 108px, porque con 56px el input no mostraba los días de dos
dígitos: las flechas del spinner se comen unos 20px por dentro de la caja.
