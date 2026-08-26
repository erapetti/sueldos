-- §4.9 — la cuenta corriente se lleva en dos libros: el formal, con todo lo que pasa por el
-- BPS, y el informal, con lo que se paga sin aportes. Cada libro tiene su propio saldo.

-- El DEFAULT existe solo para poder agregar la columna sobre las filas que ya estaban: todo
-- lo cargado hasta ahora es formal. Se saca enseguida, porque cada escritor pone el libro
-- explícitamente y un default silencioso escondería el que se olvide.
ALTER TABLE `cuenta_corriente`
  ADD COLUMN `libro` ENUM('FORMAL', 'INFORMAL') NOT NULL DEFAULT 'FORMAL' AFTER `tipo`;
ALTER TABLE `cuenta_corriente` ALTER COLUMN `libro` DROP DEFAULT;

-- Los totales por libro. `total_formal` y `total_informal` eran el total **recalculado** de
-- cada tabla, así que se renombran a lo que son, y se agrega lo que cada libro efectivamente
-- paga: en una liquidación normal coincide con el recalculado, y en una complementaria es la
-- diferencia de ese libro contra lo ya liquidado (§7.6.1). Es el importe de su asiento.
ALTER TABLE `liquidaciones`
  CHANGE `total_formal` `total_recalculado_formal` DECIMAL(14, 2) NOT NULL,
  CHANGE `total_informal` `total_recalculado_informal` DECIMAL(14, 2) NOT NULL,
  ADD COLUMN `total_a_pagar_formal` DECIMAL(14, 2) NOT NULL AFTER `total_recalculado_informal`,
  ADD COLUMN `total_a_pagar_informal` DECIMAL(14, 2) NOT NULL AFTER `total_a_pagar_formal`;
