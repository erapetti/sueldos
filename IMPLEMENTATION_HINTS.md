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
negocio disfrazadas de detalle técnico. La cuarta candidata es
`licencia_movimientos.anio_aniversario`, cuyo único parcial de §4.15.1 también se apoya en que la
columna sea NULL fuera de `GENERACION_ANUAL` (§1.10.1).

**El motor real es MariaDB**, no MySQL 8, y en los `ALTER TABLE` no siempre son intercambiables:
un CHECK se saca con `DROP CONSTRAINT` y no con `DROP CHECK`, y una columna generada se declara
`GENERATED ALWAYS AS (…) PERSISTENT` y no `STORED`. Las formas portables son las que están
escritas en las migraciones.

Las migraciones son cuatro y hay una escrita a mano:

- `20260818000000_init` — generada por Prisma
- `20260818000100_restricciones` — **a mano**: los `CHECK` de §5.1 y las validaciones de §4.x
- `20260818000200_cuota_liquidacion` — `liquidacion_aplicada_id`
- `20260818000300_bps_clave_seguro` — `seguro_salud_clave`
- `20260823000000_cuenta_opcional` y `20260823000100_banco_opcional`
- `20260824000000_recupera_otro_dia` — **a mano**: la quinta causal y el CHECK de horas
  extras relajado a `>= 0` (§1.6)
- `20260826000000_liquidacion_en_dos_tablas` y `20260826000100_dos_libros` — los totales por
  tabla y el libro de cada asiento (§1.7.1 y §1.7.2)
- `20260827000000_aporte_bps_serie` — **a mano**: la tabla `empleado_aporte_bps` con su CHECK,
  la fila por empleada que rellena la serie y el borrado de las dos columnas de `empleados`
  (§1.7.3)
- `20260828000000_salario_sin_regimen` — **a mano**: `ck_salarios_montos` relajado para admitir
  el par (0, 0) de la empleada sin régimen horario (§1.13)
- `20260828000100_cobra_boletos_serie` — **a mano**: la tabla `empleado_cobra_boletos` con su
  CHECK, la fila por empleada que rellena la serie y el borrado de la columna de `empleados`
  (§1.7.6)

`prisma migrate dev` no conoce los `CHECK` y los reporta como drift. Para cambiar el modelo:
`prisma migrate dev --create-only` y volver a agregarlos si la migración generada recrea
alguna de esas tablas.

### 1.2 El valor hora se calcula distinto de lo que dice el §4.3

El §4.3 escribe `salario / horas_semanales * (52 / 12)`. Leído literal, con $60.000 y 40 h da
**$6.500 la hora**, que es absurdo: una hora extra al 100 % costaría $13.000 y 8 horas de
falta descontarían $52.000 de un sueldo de $60.000.

Se implementó `salario / (horas_semanales × 52/12)` — el salario dividido las ~173,33 horas
del mes—, **confirmado con el usuario**. El §4.3 sigue diciendo lo otro.

**Con 0 horas semanales devuelve 0 y no divide.** Es la empleada sin régimen horario (§1.13),
que tiene el salario en cero: no hay valor hora que calcular.

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

La contabilidad de las dos tablas está en la nota que sigue.

### 1.7.2 La cuenta corriente se lleva en dos libros

Segunda etapa de lo anterior, también pedida por el usuario: cada tabla de la liquidación
cierra en su propio **libro** de la cuenta corriente. Es una columna
`libro: FORMAL | INFORMAL` en `cuenta_corriente`, no una tabla nueva: la mecánica de libro
—debe, haber, contra-asiento, saldo acumulado— es la misma para los dos, y duplicarla no
habría ganado nada. El enum es **uno solo** para las dos cosas, `Libro`, porque el corte es el
mismo: la tabla `FORMAL` de la liquidación cierra en el libro `FORMAL`.

**Qué va a cada libro.** Todo lo que pasa por el BPS —el salario de quien aporta, sus
descuentos, sus boletos, sus préstamos— al formal. Las horas extras sin BPS y los boletos que
generan, al informal. Una empleada con `aporta_bps = false` solo se relaciona con el informal.

**Las faltas no llevan marca de libro, y no la necesitan.** La falta descuenta del salario, así
que va al mismo libro que el salario, y eso se deduce de `aporta_bps`. No hay dos regímenes por
empleada —una aporta o no aporta— así que no hay caso de falta «del otro libro». Lo mismo vale
para el salario base, los boletos y los pagos adicionales: todos siguen a `tablaBase`.

La **única excepción** es la cuota del plan de pagos, que sí guarda su libro, porque el préstamo
puede ser anterior a un cambio de aporte. Eso ya no es una trampa: el aporte pasó a ser una serie
con vigencia (§1.7.3), así que cada período se liquida con el que regía ese mes y recalcular uno
viejo no le mueve las líneas.

**Dos asientos por liquidación**, uno por libro, cada uno por el devengado bruto de ese libro:
lo que paga más las cuotas que descuenta. El libro cuyo devengado da cero no emite asiento, que
es el caso de la complementaria parcial y el de la empleada que solo toca un libro. Anular hace
el contra-asiento de los dos, en su libro.

**Los totales de `liquidaciones`** quedaron en dos juegos por libro:
`total_recalculado_formal/informal` es el total de cada tabla, y `total_a_pagar_formal/informal`
es lo que ese libro paga —recalculado menos lo ya liquidado **de ese libro**—, que es el importe
de su asiento. Lo ya liquidado por libro no tiene columna: sale de la resta. En una liquidación
normal los dos juegos coinciden; en una complementaria, no.

**La complementaria es por libro.** Si el formal ya se pagó y el cambio del mes fue en el
informal, la diferencia del formal da cero y su asiento no se vuelve a tocar. La guarda del
§7.6.1 sigue siendo conservadora: alcanza con que **algún** libro esté pagado para que el
recálculo exija complementaria.

**La cuota del préstamo descuenta en el libro donde quedó el préstamo**, no en el que le tocaría
hoy a la empleada. Si pidió el préstamo antes de empezar a aportar, lo sigue devolviendo contra
el informal; si lo pidió aportando y después dejó de hacerlo, le aparece una tabla formal con
una sola línea —la cuota— y un total negativo. Es a propósito: es lo que hace que el préstamo
amortice dentro de su propio libro en vez de dejar un saldo que no baja nunca. El libro sale de
`plan_pagos.prestamo_id`, que ya apunta al movimiento del préstamo, así que no hace falta
guardarlo aparte.

**«Pagada» pasó a ser tres estados.** Antes era «existe algún movimiento `PAGO`»; ahora es
`SIN_PAGAR`, `PARCIAL` o `PAGADA`, mirando libro por libro (`estadoDePago`, en
`lib/calculo/cuentaCorriente`). Cuentan solo los libros con importe **positivo**: una diferencia
negativa no se paga con una transferencia, se compensa contra el saldo de su libro, y si contara
dejaría la liquidación esperando para siempre un pago que no va a existir. La lectura desde la
base está en un solo lugar, `lib/liquidacion/pago.ts`, porque la miran seis pantallas y todas
tienen que responder lo mismo. La única excepción es el listado de empleados, que resuelve el
estado en una consulta SQL única (§11): ahí la misma regla está escrita a mano en
`sqlLiquidaciones`, y `FALTA_PAGAR` incluye las parciales. Si la regla cambia, hay que tocar los
dos lugares.

**El pago es uno por libro.** El diálogo del §7.5 pide el libro y precarga el monto de ese
libro; una liquidación con las dos tablas se paga con dos transferencias, cada una con su fecha.
El ajuste manual también pide libro.

**La cuenta corriente de la ficha se muestra en dos listados**, cada uno con su saldo acumulado,
y arriba el saldo total. Un saldo corrido que mezclara los dos libros no diría cuánto falta de
ninguno. La empleada que solo tocó un libro ve un solo listado sin rótulo, como antes.

### 1.7.3 El aporte a BPS es una serie, y el SPECS todavía lo pone en `empleados`

**Divergencia con el SPECS.** El §4.2 lista `aporta_bps` y `seguro_salud` como columnas de
`empleados`, y el §5 enumera las series una por una sin incluirla. Las dos cosas quedaron
desactualizadas: el aporte es la tabla `empleado_aporte_bps`, con `fecha_vigencia`, y las dos
columnas de `empleados` **ya no existen**. El SPECS no se edita sin permiso del dueño (§2.7): la
actualización quedó anotada como pendiente aparte. Lo mismo pasó después con «cobra boletos»
(§1.7.6).

**Por qué.** Con el aporte suelto en `empleados`, cambiárselo a una empleada con historia y
recalcular un período viejo le movía **todas** las líneas al otro libro, porque el motor leía el
valor de hoy y no el que regía ese mes. Las liquidaciones confirmadas nunca corrieron peligro
—tienen su snapshot (§4.14)—, pero el recálculo daba un resultado que nunca fue cierto.

**El seguro de salud viaja en el mismo registro.** Solo tiene efecto si se aporta (§4.2) y es lo
que resuelve qué conceptos aplican (§4.11), así que separarlos permitiría estados imposibles: un
seguro vigente sin aporte, o un aporte sin el seguro que le corresponde. La serie no tiene
`origen`: el aumento masivo (§7.8) no la toca.

**El motor sigue recibiendo un booleano ya resuelto.** Lo que cambió es de dónde sale: era
`entrada.empleado.aportaBps` y ahora es `entrada.aporteBps`, que —como el salario y el régimen—
puede venir en `null`. Ese `null` es el cuarto caso del §6.8, `APORTE_BPS`, y **no** es «no
aporta»: tomarlo como `false` liquidaría sin aportes a alguien que sí los tiene.

**Cada lectura tiene su fecha, y ninguna es «hoy» por descuido.** Es lo más fácil de equivocar:

| Dónde | Con qué fecha |
|---|---|
| `lib/liquidacion/datos.ts` | La del período liquidado, junto con las otras series |
| `actions/licencias.ts` (salario vacacional) | La del mes de `fecha_desde`, la misma con la que resuelve el salario |
| `actions/prestamos.ts` (libro del préstamo) | La del préstamo. El libro queda grabado en el movimiento (§4.9) |
| `liquidacionesParaPago` → `DialogoPagoBancario` | Hoy: es solo el libro que el diálogo propone |

Las tres últimas pasan por `lib/consultas/aporteBps.ts`, que es el único lugar que resuelve la
serie fuera de la liquidación. `lib/auth/guards.ts` **dejó de traer** el aporte: servía a tres
llamadores con tres fechas distintas, y una sola de ellas era «hoy».

**Siempre hay un registro desde el mes de ingreso**, y desde §1.13 eso vale también para el
régimen horario: la empleada sin jornada tiene un registro con los siete días en cero, no la
ausencia de registro. Lo crea el alta en su transacción (§4.2.2)
y la migración lo hizo para las que ya existían. De eso depende que todo mes con vínculo
resuelva, así que el helper solo devuelve `null` cuando la empleada no tiene **ningún** registro,
y ahí el préstamo y la licencia se rechazan en vez de adivinar el libro. Para una fecha anterior
a toda la serie devuelve el registro más antiguo, que es con el que la empleada empezó.

**En la ficha es el tercer bloque de «Datos › Salario»**, con su tabla de vigencias y el
`FormularioSeries`. De «Generales» se fueron el switch y el selector de seguro: no son campos de
`empleados`.

### 1.7.4 La marca «con BPS» no se puede cargar en un mes sin aportes

**Divergencia con el §6.6**, que sigue describiendo el caso: dice que `con_bps` conserva su
significado propio —decide el valor hora y en qué paso del cálculo entra— también para una
empleada que no aporta. El motor lo respeta: paga esas horas al valor hora **calculado** y las
deja en la tabla que le toca, que para ella es la informal. Lo que cambió es que **la UI ya no
permite crear el dato**, así que el caso no aparece más por carga nueva.

**Por qué.** La liquidación quedaba mostrando dos líneas de horas extras con valores unitarios
distintos, y una de ellas rotulada «con BPS» para alguien sin aportes. Decisión del dueño del
proyecto: no arreglarlo en la presentación sino **en el ingreso**, que el dato inconsistente no
se pueda cargar.

Ese rótulo después se sacó (§6, «el rótulo de las horas extras»), así que hoy el síntoma es
distinto y **peor de leer**: en datos viejos las dos líneas quedan con el mismo texto y valores
unitarios distintos. Es un argumento más para la decisión de arriba, no en contra.

**Cómo.** Misma mecánica que el interruptor de faltas (`descuentaEsEditable`): se muestra igual
pero apagado y deshabilitado, para que se vea el efecto que tiene.

- `PlanillaHorasExtras.tsx` — `bpsEditable` sale del aporte del mes. Apaga los dos
  interruptores —el de la lista y el del popover—, el `extraNuevoRenglon` y el `esPlena` de las
  marcas del calendario.
- `guardarHorasExtras` en `actions/novedades.ts` — fuerza `con_bps = false` igual, sin confiar
  en lo que llegue del cliente. Un renglón viejo que quedó con la marca puesta se normaliza en
  el primer guardado de esa planilla.
- El **resumen** deja de partirse en «Con BPS» / «Sin BPS» cuando solo puede haber uno de los
  dos: muestra un importe solo, al valor hora sin aportes.

**El aporte se resuelve al mes de la planilla, no a hoy** (§1.7.3): cargar un mes anterior a un
cambio de aporte se rige por el que valía entonces. Sale de `contextoDePlanilla` para la pantalla
y de `aporteBpsALaFecha` para la acción.

**Sin registro de aporte no se bloquea nada.** `null` no es «no aporta»: ese mes no se puede
liquidar igual (§6.8), así que adivinar no arreglaría nada y sí impediría cargar.

**Las faltas quedan afuera y no les falta nada.** Una falta no lleva marca de BPS: descuenta del
salario, así que va al libro que se deduce del aporte, y no hay dos regímenes a la vez (§1.7.2).

### 1.7.5 La liquidación se lee en tarjetas, y en papel no sale nada informal

Tercera etapa de lo anterior, pedida por el usuario. **Divergencia con el §6.2**, que dice que
el orden de las líneas «es también el orden de presentación en pantalla y en la impresión»: en
pantalla sí, en la hoja impresa no, porque la hoja no lleva la tabla informal.

**En pantalla, una tarjeta por tabla.** Antes era una sola tarjeta con el bloque de datos, las
dos tablas separadas por líneas internas y el total general como un pie. Ahora son cuatro
bloques hermanos —datos, tabla formal, tabla informal y total general—, cada uno en su tarjeta,
separados por el `gap-5` de la pantalla. El total general pasó de `div` a tabla de una
fila, y **sigue apareciendo solo cuando existen las dos tablas**: con una sola, el total ya es
su última línea.

**La separación es `gap` y no `space-y-*`, por la hoja impresa.** Con `space-y-*` el margen lo
lleva cada hijo que no es el último del DOM, y los últimos de esta pantalla —la tabla informal,
el total general y los botones— son `no-print`: en papel la última tarjeta visible se quedaba
con 20px de margen colgando debajo. Cuando el contenido termina cerca del borde de la hoja esos
20px caen en la página siguiente y sale **una hoja en blanco al final**. El `gap` de flex solo
se aplica entre elementos que existen —un `display: none` no es ítem de flex—, así que no
reserva nada después del último visible.

**Las tablas no llevan rótulo.** Decían «Conceptos con BPS» y «Conceptos sin BPS» en un
`caption`; se sacó el `caption` entero, así que tampoco queda para el lector de pantalla. Cuál
es cuál se lee en las líneas: la formal es la que tiene los descuentos de BPS.

**En papel no sale nada informal**, y de esa regla sale todo lo demás:

| Qué | En la hoja |
|---|---|
| Tabla formal | sale |
| Tabla informal | **no sale** (`no-print`) |
| Total general | **no sale**: incluye lo informal |
| Cierre de la complementaria (§7.6.1) | sale, pero **solo su columna formal** |
| Bordes redondeados | rectos: `border-radius: 0` para todo, en el bloque `@media print` |

El corte es por lo que la tabla **es**, no por su posición: una empleada con `aporta_bps = false`
tiene la informal como única tabla, así que su hoja sale con el encabezado de datos y **ninguna
tabla**. Es a propósito, y es la consecuencia que hay que tener presente antes de «arreglarlo».

**El cierre de la complementaria pidió dos cosas más**, y las dos son de fondo, no de estilo:

- si el cierre no tiene columna formal, el bloque entero se queda afuera de la hoja: serían
  tres rótulos sin ninguna cifra;
- el rótulo —«DIFERENCIA A PAGAR» / «A DESCONTAR»— y el aviso de saldo a favor de la empresa
  **miran la cifra del libro formal en papel** y la del período en pantalla. Los dos signos
  pueden no coincidir: con el formal en cero y el informal en −$1.050, la hoja decía «A
  DESCONTAR» arriba de un $0. Por eso hay dos versiones del rótulo, una `print:hidden` y otra
  `hidden print:inline`, en vez de una sola.

Lo que **no** se toca al imprimir es el encabezado de datos de la empleada: es lo único que
identifica la hoja, porque el encabezado de la página es `no-print` (§7.6).

### 1.7.6 «Cobra boletos» también es una serie, y el SPECS lo pone en `empleados`

**Divergencia con el SPECS.** El §4.2 lista `cobra_boletos` como columna de `empleados` y el §5
enumera las series sin incluirla. Las dos quedaron desactualizadas: es la tabla
`empleado_cobra_boletos`, con `fecha_vigencia`, y la columna **ya no existe**. El SPECS no se
edita sin permiso del dueño (§2.7): la actualización queda anotada aparte, junto con la del
aporte a BPS (§1.7.3), que arrastra exactamente la misma divergencia.

**Por qué.** El mismo problema del §1.7.3, con el mismo síntoma: con el valor suelto en
`empleados`, cambiárselo a una empleada con historia y recalcular un período viejo le quitaba
—o le agregaba— los boletos de **todos** los meses, porque el motor leía el valor de hoy y no el
que regía ese mes. Las liquidaciones confirmadas nunca corrieron peligro —tienen su snapshot
(§4.14)—, pero el recálculo daba un resultado que nunca fue cierto.

**`null` no es «no cobra».** Es el sexto caso del §6.8, `COBRA_BOLETOS`: tomarlo como `false`
le quitaría los boletos en silencio a quien sí los cobra. Que no llegue a dispararse depende de
que el alta cree el primer registro en su transacción (§4.2.2) y de que la migración lo haya
hecho para las que ya existían.

**Cada lectura con su fecha.** Es la trampa que el §1.7.3 ya documenta, y acá se cobró una
víctima: el commit que hizo que el pie de las planillas no anunciara boletos a quien no los
cobra lo tomó de `accesoAEmpleado`, que resuelve **hoy**. Ahora sale de `contextoDePlanilla`,
resuelto al mes de la planilla, igual que `aportaBps`. `lib/auth/guards.ts` **dejó de traerlo**:
era su único consumidor.

| Dónde | Con qué fecha |
|---|---|
| `lib/liquidacion/datos.ts` | La del período liquidado, junto con las otras series |
| `lib/consultas/planilla.ts` → el pie de las dos planillas | La del mes de la planilla |

**No es lo mismo que el valor del boleto.** `valor_boleto` (§7.9) también es una serie, pero
**global** y de administración; esta es por empleada. El §6.8 las cruza: solo se reclama el
valor del boleto si esa empleada, ese mes, cobra boletos.

**En la ficha es el cuarto bloque de «Datos › Salario»**, con su tabla de vigencias y su
`FormularioSeries`. Vive ahí y no en «Generales» —donde estaba el switch— por decisión del dueño
del proyecto: las cosas que se registran con vigencia se leen juntas.

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

**Las flechas recorren la vida laboral de la empleada, no su historia de liquidaciones.**
Durante un tiempo la de atrás se habilitó solo si existía una liquidación no anulada en un
período anterior, y eso dejaba encerrado justamente al mes atrasado: sin liquidaciones previas
no había forma de llegar con las flechas al mes que faltaba liquidar. El rango ahora es el
mismo de las planillas (§1.15).

### 1.10 Los movimientos de a uno tienen listado y detalle, y no hay tabla de préstamos

El §7.4 y el §7.5 describen las cuatro acciones que se cargan de a una —préstamo, pago
adicional, licencia y pago bancario— **solo como diálogos de alta**. Con eso, lo registrado no
se podía volver a mirar ni corregir: el préstamo quedaba como un asiento en la cuenta corriente
y sus cuotas en el plan de pagos, sin ninguna pantalla que las juntara. Por pedido del usuario
cada una pasa a tener **listado y detalle**, empezando por préstamos. Las cuatro tienen su
pantalla, y **licencia es la distinta**: no tiene detalle y su listado es el estado de cuenta de
días (§1.10.1).

**Las cuatro pantallas son la misma, y eso está factorizado.** Lo que comparten no se copió:

| Pieza | Qué pone |
|---|---|
| `MarcoDeMovimientos` | El encabezado de la empleada y su submenú, con el ítem donde estás marcado. Recibe los siete datos de la empleada en un objeto, que la página arma con `empleadaDelMarco` (`lib/auth/guards.ts`) desde el `accesoAEmpleado` que ya resolvió el permiso |
| `DetalleDeMovimiento` | El detalle entero: flecha de volver, título con sus chips, el cartel de aviso, la tarjeta de datos grabados con su nota, el campo del concepto, y las ranuras `children` y `pie` para lo propio de cada uno |
| `ListadoDeMovimientos` | El listado: título, botón de alta y `Tabla` con `hrefDetalle` |

**Tres reglas del detalle, iguales para los cuatro, y todas de negocio:**

1. **La fecha y el monto no se editan; el concepto sí.** El movimiento puede tener liquidaciones
   confirmadas encima, así que corregirlo movería un saldo hacia atrás. El camino es anular —o
   borrar— y registrar de nuevo. La validación es una sola, `edicionConcepto`, y la acción de
   los asientos también: `actualizarMovimiento` reemplazó a `actualizarPrestamo` y sirve para el
   préstamo y para el pago bancario.
2. **Los datos fijos se muestran como dato, no como campo deshabilitado.** Un input en gris
   invita a escribirlo y después no explica por qué no se puede; para eso está la nota debajo.
3. **Anular deja su contra-asiento**, nunca se borra nada (§4.9). El anulado se sigue mostrando,
   atenuado en el listado y sin botones en el detalle.

**Los rótulos de dominio que se repiten viven en `constants/etiquetas.ts`.** El del libro estaba
declarado de nuevo en tres pantallas y el del tipo de liquidación en dos, y una copia vieja hace
que la misma cosa se llame distinto según por dónde se llegue. Ahí está también
`nombreDeLiquidacion`, que es cómo se la menciona desde otra pantalla —«Mensual agosto 2026»,
con la secuencia solo si hay más de una—. `PantallaLiquidacion` conserva los suyos aparte:
escribe «con BPS» y «sin aportes» en minúscula porque los usa en medio de una oración.

**El pago adicional es la excepción de la tercera, porque no es un asiento** sino una novedad de
la liquidación (§4.7): se **borra** con `borrarNovedad`, que es lo que ya hacían las planillas,
y no hay nada que contra-asentar. Lo que sí tiene es el aviso del §6.11, dos veces y a propósito:
el listado y el detalle marcan «ya liquidado» **antes** de tocarlo, con enlace a la pantalla de
cálculo del mes —que es lo que pide el §6.11 y un toast no puede dar—, y la acción devuelve su
aviso **después**. El concepto entra en la descripción de la línea (§6.2, paso 10), así que
editarlo también cambia el resultado del recálculo.

**El pago bancario muestra sus dos vínculos y no deja editar ninguno**: el libro del que salió
(§4.9) y la liquidación que cancela (§4.14), con enlace a su pantalla. El vínculo es lo que
marca la liquidación como pagada, así que cambiarlo movería el estado de otra pantalla sin
decirlo; el camino es anular y registrar de nuevo.

**El préstamo no tiene botón de anular** y los dos pagos sí. No es una decisión:
`anularMovimiento` existe desde antes y nunca tuvo desde dónde llamarse, así que el chip
«Anulado» de su listado hoy no se puede producir desde la UI. Falta agregárselo.

**No se creó una tabla `prestamos`, y no hace falta.** Un préstamo *es* el asiento `PRESTAMO`
de `cuenta_corriente` (§4.9): `plan_pagos.prestamo_id` ya es FK a esa tabla y el §4.8 la
describe como «préstamo que originó el plan». Darle tabla propia duplicaría la identidad del
movimiento y obligaría a migrar esa FK. El listado se arma leyendo el asiento con sus cuotas,
en `lib/consultas/movimientos.ts`, que está partido para que las otras tres entren al lado: las
cuatro están ahí, cada una con su función de listado, y las tres que tienen detalle con la suya.
**El detalle siempre devuelve `null` si el id no es de esa empleada**, y es la página la que lo
traduce a 404: así el id de otra empleada no filtra ni que exista.

**El menú de fila de «Todo el Personal» no ofrece «abrir la ficha».** La fila entera ya enlaza
a la empleada desde que las tablas siguen el criterio de arriba, así que era ofrecer dos
caminos a lo mismo, y el peor de los dos: escondido dentro de un menú. Sí ofrece cambiar la
visibilidad, que antes solo se alcanzaba desde la ficha. Es el mismo `DialogoOcultar` en los
dos lados —la visibilidad es una columna de la empleada, no una preferencia de quien la
esconde, y el texto lo aclara: el cambio vale para todos los usuarios—. La opción se
deshabilita sobre una empleada ajena, porque `cambiarVisibilidad` pasa por `exigirEdicion` y
un administrador primero tiene que compartírsela (§8.7).

**El ítem «Acciones» del menú se llama ahora «Movimientos»** y dejó de ser solo botonera: es el
índice desde donde se entra a cada listado. Los cuatro son links a su pantalla y el alta vive
ahí: ninguno abre un diálogo. Con permiso `VER` siguen todos activos —mirar no pide permiso de
edición— y el alta la esconde cada pantalla.

**Los dos submenús se dibujan con `SubmenuSeccion`.** «Datos» y «Movimientos» son lo mismo —una
rama del menú de la empleada con varias hojas— y se dibujaban distinto: Datos como una fila de
botones siempre presente, Movimientos como una tarjeta con un texto explicativo arriba. Queda
la forma de Datos, que es la que se comporta como submenú: está a la vista en toda la rama
—incluidas las pantallas propias, no solo el índice— y el botón de donde estás parado va en
`default` con `aria-current="page"`.

Es un **`<nav>`** y no un `<div>`: un submenú es navegación, y el landmark le da al lector de
pantalla cómo saltar hasta acá y saber que esos botones son hermanos. La salvedad que tenía
—«tres de los cuatro abren un diálogo en vez de navegar»— ya no existe: los cuatro navegan.

**Las diez tablas se dibujan con `Tabla`** (`components/dominio/Tabla.tsx`), y siguen un
criterio único:

- **La fila tiene detalle** → la primera columna es el enlace, con `ENLACE_PRINCIPAL`
  (`text-lg font-medium hover:underline`), y la fila entera lleva al mismo lado y se resalta
  con `hover:bg-muted/5`. Son cinco: los tres listados de movimientos que tienen detalle
  —préstamos, pagos adicionales, pagos bancarios—, la vista «Lista» de liquidaciones y «Todo el
  Personal». **Licencias no**, y por eso su tabla va sin enlace ni resaltado (§1.10.1).
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

**Ya no queda ninguno armado a mano.** Los usan los tres del menú de «Todo el Personal» y el de
visibilidad, los cuatro diálogos de alta —préstamo, pago adicional, licencia, pago bancario— y
las siete confirmaciones de `FormularioDatos`, `DetallePrestamo`, `PantallaUsuarios`,
`PantallaLiquidacion` y `PlanillaMensual`. `components/ui/alert-dialog.tsx` quedó sin ningún
uso.

Migrarlas pidió cuatro cosas de la plantilla, y las cuatro salieron de un diálogo concreto que
no encajaba: `etiquetaCancelar` —«Volver» donde la acción **es** cancelar algo, «Descartar» y
«Seguir editando» en la planilla—, `etiquetaEnviando` para el «Guardando…» de los formularios
de alta, `amplio` para los dos que no entran en el ancho de una pregunta, y que `peligrosa`
pueda ser una expresión: en la salida de la planilla el acento depende de si se pierde el
borrador.

Dos consecuencias de la migración que conviene tener presentes:

- **Los botones ya no cierran solos.** `AlertDialogAction` y `AlertDialogCancel` cerraban el
  diálogo por su cuenta; los de `DialogoDeAccion` son botones comunes. Cerrar pasó a ser tarea
  del `onExito` de la acción —que es lo que ya hacían todos—, y el efecto secundario es bueno:
  si la acción falla, el diálogo queda abierto con lo elegido en vez de cerrarse y dejar solo
  un toast de error.
- **Los cuatro de alta se montan solo mientras están abiertos**, ahora desde afuera:
  `props.abierto ? <Cuerpo /> : null`. Es lo que hace que el formulario arranque limpio en cada
  apertura sin un efecto que lo resetee, y tiene que quedar afuera porque el pie —qué se envía,
  si falta completar algo— depende del estado del cuerpo.

**Una fila con detalle ignora los clics que nacen en un portal.** El diálogo y el menú de la
fila cuelgan de `<body>` en el DOM, pero React los hace burbujear **por el árbol de
componentes**: como `DialogoCambiarDueno` se renderiza adentro de una celda, cerrar su diálogo
tocando afuera llegaba al `onClick` del `<tr>` y abría la empleada —cerraba el diálogo y
navegaba de arriba—. `FilaConDetalle` lo corta con `e.currentTarget.contains(e.target)`, que
es sobre el DOM y por eso separa las dos cosas. Cualquier fila que sume un control con portal
—un `Select`, un `Popover`— queda cubierta por la misma guarda.

Si una tabla necesita algo que la plantilla no da, **agregalo a la plantilla**:
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

### 1.10.1 Licencias es la pantalla distinta: no tiene detalle y su listado es el libro de días

`Movimientos/Licencias` reemplazó a **dos** pantallas: la sección `Datos/Licencia` de la ficha y
el botón «Registrar licencia» del submenú. Las dos tablas que tenía la ficha —el libro de días y
«Períodos gozados»— quedaron condensadas en **una sola**, y el motivo es que eran la misma cosa:
cada asiento `GOCE` *es* una licencia gozada, así que el período y el salario vacacional que
generó (§7.11) van en su propia fila. El saldo de días va arriba de la tabla.

**El menú de la empleada perdió el ítem «Licencia» y quedó con seis.** Un `?seccion=licencia`
guardado en favoritos ahora da 404, que es mejor que dibujar el encabezado con el cuerpo vacío, y
`datosDeFicha` dejó de hacer tres de sus consultas.

**La tabla se ordena por fecha**, como cualquier libro, y el saldo acumulado corre en ese orden.
Con una licencia adelantada el saldo queda negativo hasta que llega la generación que la cubre,
igual que en la cuenta corriente de dinero.

**El consumo no se imputa a un año, y es a propósito.** El §4.15.1 define un saldo único
—`Σ haber − Σ debe`—; lo único partido por año es el **haber**, porque la generación anual
acredita un asiento por aniversario (§4.15.4). Se probó lo contrario —imputar cada goce al año
cuyos días gasta, los más viejos primero, partiendo la licencia en un asiento por año para poder
ordenar la tabla por `(anio_aniversario, fecha)`— y **se descartó por decisión del dueño del
proyecto**: obligaba a que `anio_aniversario` llevara dos sentidos distintos según el tipo de
asiento, y con eso se caían las dos garantías que la columna tiene encima —el único parcial de la
generación anual, que es lo que hace idempotente al cron de §7.12, y el CHECK que hoy la exige
solo ahí—. Ordenar por fecha da la misma lectura sin tocar la base.

Lo que se resigna con eso es poder leer el libro por año —«el año 3 generó 20 y se gastaron 15»—.
Los números no cambian: los días son fungibles y el saldo total es el mismo. Si alguna vez hace
falta, hay que deducirlo en la consulta y no guardarlo.

**Lo que quedó afuera, por decisión del dueño del proyecto:** ninguna fila lleva a un detalle, así
que editar la nota de una licencia y borrarla no tienen desde dónde dispararse todavía, y
`borrarLicencia` quedó como estaba. Falta decidir si va una segunda tabla o si las filas de goce
llevan a un detalle.

Cuando se haga, **la regla del borrado ya está fijada y no es la que está implementada**: se puede
borrar una licencia que **no tenga hecho el pago del salario vacacional**, y al borrarla se van
también su asiento de cuenta corriente y la liquidación de salario vacacional prevista. Hoy
`borrarLicencia` pide otra cosa —que la liquidación esté **anulada**— así que ese cambio es parte
del trabajo.

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

### 1.13 La empleada sin régimen horario, y el salario que va con él

**Divergencia con el §4.3 y con el §4.4.** El §4.3 pide `horas_semanales > 0` y el §4.4 que la
suma de los siete días del régimen sea igual a esas horas: de las dos juntas salía que **toda**
empleada tuviera jornada, porque un régimen vacío suma 0 h y las horas semanales tendrían que
dar 0, que ni el zod ni el CHECK admitían. El SPECS no se edita sin permiso del dueño (§2.7): la
actualización queda planteada.

**Por qué.** Hay empleadas que no tienen jornada: todo lo que cobran son horas extras sin
aportes y pagos adicionales. Antes había que inventarles un régimen para poder darlas de alta.

**El régimen vacío es un registro con los siete días en cero, no la ausencia de registro.** Si se
resolviera borrando el registro, el §6.8 cortaría con razón —`verificarDatos` emite `REGIMEN` y
la pantalla de cálculo muestra el cartel de dato faltante en vez de números—. Con el registro en
cero la resolución de series del §5.2 sigue funcionando igual y el motor no se entera.

**El salario la acompaña, por decisión del dueño del proyecto.** Salario y horas semanales van
**los dos en cero o los dos en positivo**: sin jornada tampoco hay salario. La otra lectura
—conservar el salario y apagar solo el régimen— obligaba a inventar un valor hora que el §4.3 no
define. Se verifica en tres lugares:

| Dónde | Qué |
|---|---|
| `lib/validacion/esquemas.ts` | `salarioYHorasVanJuntos`, compartido por `altaEmpleado` y `nuevoSalario` |
| `prisma/migrations/20260828000000_salario_sin_regimen` | `ck_salarios_montos` relajado a `(salario > 0) = (horas_semanales > 0)` |
| `lib/calculo/liquidacion.ts` | `valorHoraCalculado` devuelve 0 con 0 horas, en vez de dividir por cero |

**La invariante que sale de ahí: aportar al BPS exige un régimen con horas.** No habría materia
gravada sobre la cual aportar. Va en las dos direcciones —sin régimen el aporte no se puede
prender, y con el aporte prendido el régimen no se puede vaciar— y **es por período, no «hoy»**:
son las dos series con `fecha_vigencia` (§1.7.3), así que apagar el aporte desde el mes que viene
no habilita un régimen vacío este mes.

- `exigirAporteConRegimen` en `actions/series.ts` es el control (§2.3). Mira el mes del cambio y
  los meses en los que alguna de las dos series vuelve a cambiar de ahí en adelante: entre dos
  quiebres ninguna se mueve. Sin ningún registro de una de las dos no bloquea nada, con el mismo
  criterio del §1.7.4.
- En el alta las dos cosas se eligen en la misma pantalla, así que ahí alcanza con el esquema.
- En la pantalla, el interruptor del aporte se muestra **apagado y deshabilitado** cuando el
  régimen vigente a esa fecha no tiene horas —la mecánica del §1.7.4, para que se lea el
  efecto—, y el formulario del régimen avisa cuando la empleada aporta desde ese mes.

**Volver atrás son tres pasos, y el orden no es libre**: primero el salario con horas, después el
régimen que las iguala (§4.4), y recién ahí el aporte. Al revés no se puede, y es correcto: el
§4.4 hace que el régimen siga al salario, no al revés.

**Lo que ya funcionaba solo y no se tocó:** con el régimen en cero `días_a_trabajar` da 0 y los
boletos salen por §6.5 —los días con horas extras en un día sin horas de régimen—, que es justo
el caso de esta empleada; y las faltas quedan topeadas en 0 h por §4.6, que también corresponde:
no falta quien no tiene jornada. El aviso de «no hay régimen» de las planillas
(`contexto.hayRegimen`) tampoco cambia: mira si hay registro, y el registro está.

**Su liquidación no lleva línea de salario base.** Un renglón en cero todos los meses no informa
nada, así que se omite —decisión del dueño del proyecto—. Es la única línea que se filtra, y el
filtro mira el **salario vigente**, no el importe de la línea: el mes anterior al ingreso de una
empleada con salario también da cero, pero ahí el cero es el dato —tiene salario y no lo cobró—
y la línea se emite con sus días y su valor unitario.

### 1.14 Las reglas del día se escriben una sola vez

**El pie de las planillas no recalcula: pregunta.** Los predicados del §6.4 y del §6.5
—`eraDiaDeTrabajo`, `laFaltaDescuentaElBoleto`, `generaBoletoAdicional`— los usan el motor **y**
las dos planillas. `DiaContexto` (en `components/dominio/PlanillaMensual.tsx`) extiende
`DiaDeBoletos` justamente para eso.

**Dónde viven.** `DiaDeBoletos`, `eraDiaDeTrabajo`, `motivoSinJornada` y `topeDeFaltaDelDia`
están en `lib/calculo/jornada.ts`; `laFaltaDescuentaElBoleto`, `generaBoletoAdicional` y
`calcularBoletos`, en `lib/calculo/boletos.ts`, que importa los primeros. Nacieron todos en
`boletos.ts` y se separaron cuando el tope de las faltas pasó a preguntar lo mismo: «¿ese día
había jornada?» dejó de ser una pregunta sobre boletos.

**Por qué.** Con la regla escrita dos veces, el mismo error volvió tres veces:

| Dónde | Cómo terminó |
|---|---|
| Pie de horas extras: no miraba `cobra_boletos` | commit `9a6a5f4` |
| Pie de horas extras: no miraba el feriado no laborable | commit `a68cbec` |
| Pie de inasistencias: descontaba boletos de días que no pagaban ninguno | esta sección |
| Popover de inasistencias: ofrecía faltar a un feriado no laborable | esta sección |

Los tres son la misma clase de error: la pantalla tenía **su** copia de una regla del motor y
se desviaba. El pie de inasistencias, por ejemplo, anunciaba «−2 boletos» por faltar a un
feriado no laborable, un día que nunca había pagado boleto.

**Los predicados van en `number`, no en `Decimal`**, porque los comparte el cliente, que recibe
el día ya serializado. Es seguro: el CHECK `ck_regimenes_horas` obliga a que las horas sean
múltiplos de 0,5, exactos en binario. El motor convierte con `.toNumber()` en el borde.

**`DiaContexto` ganó dos hechos que antes no tenía**, `enLicencia` y `dentroDelVinculo`: sin
ellos el pie no podía acertar esos casos ni queriendo. Los resuelve `contextoDePlanilla` con la
misma expansión por día que usa `lib/liquidacion/datos.ts` para el motor.

**El criterio, escrito una sola vez: se paga ida y vuelta por cada día que la empleada fue a
trabajar.** Fue si cumplió su jornada, o si hizo horas extras — no importa por cuál de las dos
cosas viajó, el viaje es el mismo. De ahí salen los dos casos que atiende `días_a_trabajar` y
los cuatro que atiende `días_extra_con_boleto`: el día que el régimen deja en cero, el feriado
no laborable, el día de licencia y **el día en que faltó la jornada completa**.

**Divergencia con el §6.5**, por decisión del dueño del proyecto. El SPECS solo saca de la
cuenta al feriado no laborable —«invalidan las horas del régimen vigente, por lo tanto son días
con 0 horas»— más lo «ya contado en días_a_trabajar», así que dos días quedaban sin cobrar
ningún boleto aunque la empleada hubiera ido:

| Caso | Antes | Ahora |
|---|---|---|
| Licencia + horas extras | sin boleto | lo paga la hora extra |
| Falta de jornada completa + horas extras | sin boleto | lo paga la hora extra |
| Día fuera del vínculo + horas extras | pagaba boleto | sin boleto (§6.4) |

En los dos primeros el boleto **no se pierde, cambia de dueño**: lo deja de pagar la jornada y
lo pasa a pagar la hora extra, que es lo que decide en qué tabla cae (§6.5.1). El tercero es al
revés y es el §6.4 aplicándose donde ya correspondía: si no era empleada, no fue a trabajar.
El `SPECS.md` no se edita sin permiso del dueño (§2.7). Las tres asimetrías eran invisibles
mientras la regla estaba en dos lados; al juntarla hubo que responderlas.

**Por eso `laFaltaDescuentaElBoleto` también pregunta si el día tiene horas extras**: si las
tiene, la falta no descuenta nada. Descontar acá y volver a sumar allá daría el mismo total,
pero la planilla anunciaría un descuento que no existe.

#### El tope de la falta es el mismo predicado

**§4.6 — no se falta a un día sin jornada.** `topeDeFaltaDelDia(dia)` es
`eraDiaDeTrabajo(dia) ? dia.horasRegimen : 0`, y lo usan `guardarFaltas` (`actions/novedades.ts`)
para validar el lote y la planilla de inasistencias para deshabilitar el día, precargar el campo
y decidir el «Día completo». Antes el tope era `horasDelDia(regimen, fecha)` —las horas crudas
del régimen—, así que el feriado no laborable y el día de licencia admitían falta, el popover
decía «Corresponden 8 horas ese día» en un 25 de agosto, y esa falta **descontaba sueldo** en el
paso 2 de días que ya estaban pagos por otro lado. Era doble descuento.

**El feriado no laborable no es divergencia; la licencia sí.** El §4.6 dice «las horas que le
corresponden a ese día según el régimen vigente», y el §6.5 ya define que los feriados no
laborables «invalidan las horas del régimen vigente, por lo tanto son días con 0 horas»:
bloquear ahí es leer el SPECS consistentemente. Que el **día de licencia** también baje el tope
a cero es una **divergencia con el §4.6**, por decisión del dueño del proyecto del 01/09/2026:
el §6.4 ya deja esos días pagos, así que la falta los descontaría dos veces. El `SPECS.md` no se
edita sin su permiso (§2.7).

**`motivoSinJornada` devuelve el motivo y no un booleano** porque los dos lados que preguntan
necesitan explicarlo: el servidor lo traduce a un `ErrorNegocio` y la celda lo pone en su
`title` y en su etiqueta accesible. La frase sale de `TEXTO_SIN_JORNADA`, una sola vez para los
dos.

#### El importe de las horas extras, también

**Se calcula en un solo lugar.** `importeDeHorasExtras` y `totalDeHorasExtras`, en
`lib/calculo/liquidacion.ts`, son de donde salen tanto las líneas de la liquidación como el
importe del pie. Importa porque el §6.7 redondea **por línea**: agrupar
por recargo y redondear cada grupo no da lo mismo que sumar todo y redondear al final, y el pie
—que no redondeaba— anunciaba un importe parecido al que después se liquidaba, pero no el
mismo. El §7.1 lo sigue llamando «importe estimado» porque el mes no está cerrado, no porque la
cuenta sea aproximada.

### 1.14.1 El vínculo topea el registro de novedades

**`fechaEnElVinculo` (`lib/validacion/vinculo.ts`) es el criterio único**, y va en fechas ISO
(`AAAA-MM-DD`) y no en `Date`: es lo que cruza al cliente, lo que tienen los formularios, y
compara como texto sin malabares de zona horaria. El servidor convierte en el borde con
`vinculoDe` (`lib/auth/guards.ts`), que es también lo que `empleadaDelMarco` le pasa a los
diálogos de alta para que no ofrezcan fechas de afuera.

**Qué topea cada extremo**, por decisión del dueño del proyecto del 01/09/2026:

| Novedad | Antes del ingreso | Después del egreso |
|---|---|---|
| Horas extras, faltas (§7.1, §7.2) | bloquea | bloquea |
| Licencia (§7.11) — **las dos puntas** | bloquea | bloquea |
| Préstamo (§7.4) | bloquea | bloquea |
| Pago adicional (§7.3) | bloquea | **se registra igual** |
| Pago bancario (§7.5) | — | **se registra igual** |

Los dos últimos son a propósito: la liquidación final, un premio o una transferencia se pagan
después del cese. Las **cuotas del plan de pagos también quedan libres** —un préstamo tomado
antes del cese se sigue debiendo después—, así que el límite es la fecha del préstamo y no la de
sus cuotas.

**En el préstamo la validación va antes de resolver el libro.** La fecha es la que decide el
libro (§4.9, `libroALaFecha`), así que con una fecha de afuera el error que salía era «no tiene
aporte registrado», que manda a mirar la ficha en vez de a corregir la fecha.

**La celda bloqueada usa `aria-disabled` y no `disabled`.** Un botón deshabilitado no toma foco,
y las flechas del §7.1 recorren la grilla con el foco: una semana de licencia en el medio del
mes dejaría al teclado sin paso. El día sigue mostrando lo que tenga cargado —de antes de la
baja, o de antes de que se registrara la licencia—, que es lo que hay que ver para ir a
borrarlo.

**Lo que esto NO hace: el motor no filtra por vínculo.** El cambio es de *registro*. Los pasos
2, 3 y 9 de la liquidación siguen agrupando faltas y horas extras sin mirar el vínculo; lo único
que ya lo respeta es `calcularBoletos`. No importa porque no hay datos cargados fuera del
vínculo y el seed tampoco los crea. Si algún día aparecen, filtrar el motor es otra tarea, y
cambia números de meses viejos al recalcular.

### 1.15 El selector de mes es uno solo, y se acuerda de dónde estabas

Las tres pantallas de la empleada con selector de mes —horas extras, inasistencias y
liquidación— tenían cada una su idea de por dónde se podía andar y en qué mes abrir. Por pedido
del dueño del proyecto pasan a compartir las dos cosas.

**El rango es la vida laboral de la empleada.** Del mes de su ingreso al de su egreso, sin
pasar del mes en curso (§6.10 — no hay períodos futuros). Lo resuelve `rangoDePeriodos` en
`lib/calculo/periodos.ts`, y las tres pantallas apagan sus flechas con `mesEnRango`. Antes las
planillas retrocedían **sin tope**, hasta meses en que la empleada no existía y no hay régimen
ni salario que aplicar; la liquidación, al revés, pedía historia y no llegaba al mes atrasado.

Un `?periodo=` fuera del rango no rompe nada ni da 404: `acotarPeriodo` lo trae al borde más
cercano. Hace falta, porque el mes viaja de una empleada a otra y el de una puede no existir
para la siguiente.

**El mes se recuerda entre pantallas y entre empleadas.** Pasar de inasistencias a horas
extras, o saltar a otra empleada desde el listado, mantiene el mes que se venía mirando; se
pierde al cerrar la ventana del navegador. Se guarda en una cookie de sesión (`COOKIE_PERIODO`)
y **no** en `sessionStorage`, porque el que decide qué mes dibujar es el servidor: las tres
pantallas son componentes de servidor y leen la cookie del request. Con el estado en el
cliente habría que dibujar un mes y redirigir al otro, con el parpadeo de por medio.

| Pieza | Qué hace |
|---|---|
| `lib/consultas/periodoDePantalla.ts` | Resuelve el mes: URL → cookie → atraso, y lo acota al rango |
| `components/dominio/MemoriaDePeriodo.tsx` | Escribe la cookie desde el cliente; un componente de servidor no puede mandar `Set-Cookie` |
| `components/dominio/EncabezadoEmpleada.tsx` | Recibe `periodo`, lo pone en los enlaces del menú y monta la memoria |

Los enlaces del menú llevan el mes puesto aunque la cookie alcanzaría: así el botón «atrás» del
navegador vuelve al mes que se estaba mirando y no al que diga la cookie en ese momento.

**Divergencia con el §6.10**, por decisión del dueño del proyecto: el SPECS dice que la
pantalla abre en el mes en curso, y ahora abre en el **mes anterior** cuando ese mes quedó sin
liquidar y la empleada ya había ingresado. Lo habitual es entrar a cargar las novedades del mes
que falta liquidar, y empezar en un mes ya cerrado obliga a retroceder a mano cada vez. El
criterio solo se aplica cuando no hay nada en la URL ni en la cookie —la primera pantalla de la
sesión—; después manda lo que se venía mirando. «Sin liquidar» es no tener una liquidación
`MENSUAL` `CONFIRMADA` de ese mes: las filas de `Liquidacion` se crean únicamente al confirmar,
así que un mes pendiente no tiene fila y no hay un estado intermedio que mirar.
El `SPECS.md` no se edita sin permiso del dueño (§2.7).

### 1.16 Confirmar la liquidación del mes recién se habilita el día 23

El botón **Confirmar liquidación** de la pantalla de liquidación (§7.6) estaba siempre
habilitado. Por pedido del dueño del proyecto arranca apagado y se habilita el **día 23 del mes
del período**: la liquidación de setiembre 2026 se confirma el 23/09/2026 o cualquier día
posterior, sin tope. Un mes atrasado, entonces, se confirma siempre: su día 23 ya pasó.

El umbral es el **mismo** número del §4.2.3 —`DIA_UMBRAL_LIQUIDACION`, en
`lib/calculo/estado.ts`—, no uno nuevo. El pedido original decía 25 y se corrigió a 23
justamente para eso: con dos números distintos quedaba una ventana de dos días en la que la
empleada figuraba «Falta liquidación» y la aplicación no dejaba liquidarla.

| Pieza | Qué hace |
|---|---|
| `lib/calculo/periodos.ts` | `sePuedeConfirmar(periodo, referencia)` y `primerDiaConfirmable(periodo)` |
| `app/empleados/[id]/liquidacion/page.tsx` | Resuelve `puedeConfirmar` en el servidor y lo pasa como prop |
| `app/empleados/[id]/liquidacion/PantallaLiquidacion.tsx` | Botón apagado, envuelto en el tooltip que dice qué día se habilita |

**La regla se resuelve en el servidor.** La pantalla es un componente de cliente y el dato
depende de qué día es hoy: calculado en el cliente, el primer dibujado no coincidiría con el del
servidor. La página ya es `force-dynamic`, así que se recalcula en cada request; una pantalla
abierta durante la medianoche del 22 al 23 se habilita al recargar.

**El tooltip va sobre un `span`, no sobre el botón.** Un botón `disabled` no dispara eventos de
puntero, así que un tooltip colgado de él nunca abre. El `disabled:pointer-events-none` que ya
trae `Button` deja pasar el hover al envoltorio, que es el que abre el tooltip; el `tabIndex`
del `span` lo pone además al alcance del teclado. Es el primer uso real de
`components/ui/tooltip.tsx` en la aplicación: el `TooltipProvider` estaba montado en
`app/layout.tsx` desde el principio, sin nadie que lo usara.

**En un teléfono el tooltip no aparece** —no hay con qué pasar por encima— y el botón queda
apagado sin explicación. Es una decisión del dueño del proyecto, no un olvido: se descartó
agregar un renglón de texto visible al lado del botón.

**Divergencia con el §4.2.3 y el §7.6**, por decisión del dueño del proyecto. El §4.2.3 dice
textualmente que el día 23 «no restringe la operación: se puede liquidar cualquier mes cualquier
día (§6.10)», y el §7.6 lista el botón Confirmar sin ninguna condición de fecha. Los casos de
prueba 35 y 36 del §12 siguen valiendo tal cual: hablan del estado del empleado, que no cambió.
El `SPECS.md` no se edita sin permiso del dueño (§2.7).

**Lo que queda deliberadamente afuera:** la validación en el servidor.
`confirmarLiquidacionMensual` (`actions/liquidaciones.ts`) **no** verifica el día, así que un
pedido armado a mano confirma igual. El dueño del proyecto eligió que la regla viva solo en el
botón. Si alguna vez se quiere de verdad, el lugar es el mismo `if` donde ya se rechaza el
período futuro (§6.10), reusando `sePuedeConfirmar`; hay que tener en cuenta que ese action es
también el que genera la complementaria, que hoy no tiene restricción de fecha ninguna.

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
| Al imprimir sale una última hoja en blanco | El contenedor usaba `space-y-*` y sus últimos hijos son `no-print`: el último bloque visible se queda con el margen inferior, que empuja el documento unos píxeles más allá del borde de la hoja | Separar con `gap` en un contenedor flex, que no reserva nada alrededor de un `display: none`. Vale para cualquier pantalla imprimible que termine en elementos ocultos |
| Al verificar el CSS de impresión, las utilidades `print:*` de Tailwind parecen no existir | Un recorrido de `document.styleSheets` que solo mira las reglas de primer nivel no las encuentra: viven dentro de `@layer utilities`, y ahí el `@media print` es una regla anidada | Hay que recorrer `CSSGroupingRule.cssRules` en recursión. Las de `globals.css` sí están arriba, así que el recorrido plano encuentra `.no-print` y hace parecer que Tailwind no emitió nada |
| Google muestra una pantalla de consentimiento en **cada** ingreso, y manda un mail «You shared some Google Account data with …» | Sin `--prompt` ni `--approval-prompt`, oauth2-proxy manda `approval_prompt=force` por compatibilidad legacy, y Google lee eso como «volvé a pedir el consentimiento». Cada aceptación es una autorización nueva, y de ahí el mail | `--approval-prompt=auto` en oauth2-proxy. Con la configuración alpha, el parámetro no tiene default: se borra el bloque `loginURLParameters`. README §5 |
| «Salir» borra la sesión pero el navegador queda en bucle sobre `/oauth2/sign_out` | nginx manda `X-Auth-Request-Redirect: $request_uri` para todo `/oauth2/`, y para sign_out eso vale `/oauth2/sign_out`. De las tres estrategias de redirect de oauth2-proxy, la del encabezado es la única que **no** descarta las rutas del propio proxy, y es la de mayor prioridad | Un `location = /oauth2/sign_out` que vacíe ese encabezado; caen las otras dos estrategias, que sí se protegen. README §5.2 |
| Un usuario dado de alta en **Usuarios** no puede entrar: Google lo autentica y aterriza en un 403 «Invalid session: unauthorized» | El despliegue arranca oauth2-proxy con `--authenticated-emails-file` y sin `--email-domain`, así que ese archivo es una segunda lista de acceso, **antes** de la app. La validación pasa en el callback de OAuth, antes de que haya sesión, así que la request nunca llega a Next y no se ve `/sin-acceso` | El email va en los dos lugares. Es una divergencia del §3.3 sin resolver: README §5.6 |
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

**El oauth2-proxy ya no es hipotético, pero los arreglos del README §5 sí.** Hay un despliegue
real corriendo, y de ahí salieron dos síntomas que están en la tabla de arriba: el
consentimiento de Google repitiéndose en cada ingreso, y `/oauth2/sign_out` en bucle. Las causas
están leídas en el código de oauth2-proxy, no adivinadas.

Lo que **no** está verificado es la configuración de nginx del §5.1 corriendo. Se editó a partir
de la que está en producción, pero acá no hay nginx ni para pasarle un `nginx -t`. Los tres
cambios a confirmar en el servidor, en este orden:

1. `nginx -t` pasa.
2. «Salir» corta en una sola vuelta, sin bucle.
3. Un POST con la sesión vencida da 401 y la app muestra el aviso de sesión, no el genérico.
   Es lo que prueba que `/sesion/estado` quedó bien: es de lo que depende que el aviso
   distinga sesión de red. `curl -s -o /dev/null -w '%{http_code}\n' https://tu-dominio/oauth2/auth`
   tiene que seguir dando **404**, que es lo que confirma que el `internal` sigue puesto.

---

## 6. Decisiones de presentación que el SPECS no fijaba

- **Agrupación de líneas.** Las horas extras se agrupan por porcentaje de recargo y emiten una
  línea por recargo; los pagos adicionales y las cuotas emiten una línea cada uno. El §6.7
  fija la línea como unidad de redondeo, así que la suma cierra igual.
- **El rótulo de las horas extras no repite lo que ya dice el contexto.** Dice «Horas extras
  (recargo 100 %)», y al 0 % simplemente «Horas extras». Se fue el «con BPS» / «sin BPS», que
  lo dice la tabla en la que cae la línea (§1.7.1), y se fue el «recargo 0 %», que no informa
  nada. Sale de `descripcionDeHorasExtras`, en el motor, que es el único lugar que lo arma;
  ahí está anotado el único caso que el rótulo ya no distingue.
- **La columna «cantidad» de la liquidación lleva la unidad de cada línea.** No cuenta lo mismo
  en todas: son horas, un porcentaje o una cantidad de boletos según la línea, y los números
  pelados se leían todos como lo mismo. La decisión vive en un mapa `código → formateador` en
  `PantallaLiquidacion`; si se agrega una línea con cantidad, se le agrega su unidad ahí. La
  del boleto —`38 b`— es **inventada**: el §8.5 fija `$`, `h` y `%`, y de los boletos no dice
  nada, así que vive en la pantalla y no en `lib/format/money`. Los días quedan pelados a
  propósito: la descripción de la línea ya los dice.
- **Estados vacíos y toasts.** Cada acción devuelve un `Resultado` (`lib/acciones/resultado.ts`)
  que el hook `useAccion` traduce a toast de éxito, aviso o error, y a errores por campo. Si
  agregás una acción, seguí ese contrato: la UI ya sabe qué hacer con él.
- **Los avisos del §5.3 y del §6.11** viajan en el campo `aviso` del resultado, no como
  excepción. Son informativos: la operación se guardó igual.
- **El rótulo del encabezado de la empleada es un breadcrumb al listado.** Decía «Empleada»,
  que era repetir lo que ya dice el título (§8.4); ahora es el enlace al listado de donde se
  vino: «Mi Personal» (§8.3) o «Todo el Personal» (§8.7). Las dos etiquetas con su ruta salen
  de `constants/listados.ts`, que es también de donde las toma el menú (§8.1), para que el
  breadcrumb diga exactamente lo mismo que el ítem de donde se vino.
- **De qué listado se vino se deduce del permiso, no de la URL.** Los dos listados linkean a la
  misma ruta (`/empleados/{id}/faltas`), así que el origen no se puede leer de la ruta, y
  llevarlo en un `?desde=` obligaba a propagarlo por cada enlace de adentro de la empleada —el
  menú, los dos submenús, las filas de los listados de movimientos, el navegador de período—.
  Lo resuelve `listadoDeOrigen` (`lib/auth/guards.ts`) en un solo lugar: el único nivel de
  acceso que dice «no es propia ni compartida conmigo» es `ADMIN`, y esa es justo la empleada
  que solo aparece en «Todo el Personal» (§8.7). El valor viaja como prop `listadoDeOrigen`
  hasta `EncabezadoEmpleada`; en la rama de Movimientos va adentro de `EmpleadaDelMarco`, así
  que lo arma `empleadaDelMarco` y las nueve pantallas no lo repiten. **Dos casos quedan
  mostrando «Mi Personal» sin estar ahí**: el administrador que entra desde «Todo el Personal»
  a una empleada propia, y la empleada oculta, que se lista solo en «Todo el Personal». En los
  dos el enlace lleva a un listado que existe, y si hace falta acertar siempre el camino es el
  `?desde=`.

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
| El botón primario no se levanta al pasar el mouse | El diseño lo sube 1 px con `hover:-translate-y-px`. Mover la caja obliga al navegador a re-rasterizar el texto en la posición nueva, y el cambio de antialias se lee como un temblor de las letras mientras el icono —vectorial— sube limpio. El hover quedó como **oscurecido** del relleno (`hover:bg-primary-deep`), que es lo que ya hacían los botones no primarios, así que la aplicación tiene un solo lenguaje de hover. La sombra sigue creciendo: no mueve nada |

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
