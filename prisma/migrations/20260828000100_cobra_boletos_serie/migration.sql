-- §5 — «cobra boletos» deja de ser un campo suelto de `empleados` y pasa a ser una serie con
-- fecha de vigencia, como el salario, el valor hora sin aportes, el régimen y el aporte a BPS.
--
-- Escrita a mano, con la misma forma que `20260827000000_aporte_bps_serie` (§1.1): crear la
-- tabla, llenarla con una fila por empleada desde el mes de ingreso y borrar la columna vieja.
--
-- Por qué: con el valor suelto en `empleados`, cambiárselo a una empleada con historia y
-- recalcular un período viejo le quitaba —o le agregaba— los boletos de **todos** los meses,
-- porque el motor leía el valor de hoy y no el que regía ese mes.

CREATE TABLE `empleado_cobra_boletos` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `cobra_boletos` BOOLEAN NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `empleado_cobra_boletos_empleado_id_fecha_vigencia_key`(`empleado_id`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `empleado_cobra_boletos`
  ADD CONSTRAINT `empleado_cobra_boletos_empleado_id_fkey`
  FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- §5.1 — toda fecha_vigencia es el día 1 de un mes.
ALTER TABLE `empleado_cobra_boletos`
  ADD CONSTRAINT `ck_cobra_boletos_vigencia_dia1` CHECK (DAY(`fecha_vigencia`) = 1);

-- Una fila por empleada, con el valor que tiene hoy y vigencia el 1° del mes de su ingreso.
-- Es lo que garantiza que **todo** mes con vínculo lo tenga resuelto: sin esta fila, el primer
-- período liquidable quedaría sin registro vigente y fallaría por §6.8.
INSERT INTO `empleado_cobra_boletos`
  (`id`, `empleado_id`, `fecha_vigencia`, `cobra_boletos`, `creado_en`, `creado_por`, `modificado_en`, `modificado_por`)
SELECT
  UUID(),
  `id`,
  DATE_FORMAT(`fecha_ingreso`, '%Y-%m-01'),
  `cobra_boletos`,
  CURRENT_TIMESTAMP(3),
  `creado_por`,
  CURRENT_TIMESTAMP(3),
  `modificado_por`
FROM `empleados`;

ALTER TABLE `empleados` DROP COLUMN `cobra_boletos`;
