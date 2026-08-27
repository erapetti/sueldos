-- §4.4.1 y §5 — el aporte a BPS deja de ser un campo suelto de `empleados` y pasa a ser una
-- serie con fecha de vigencia, como el salario, el valor hora sin aportes y el régimen.
--
-- Escrita a mano: `prisma migrate dev` no conoce los CHECK y reportaría drift (§1.1).
--
-- El seguro de salud viaja en el mismo registro: solo tiene efecto si se aporta (§4.2) y es
-- lo que resuelve qué conceptos de BPS aplican (§4.11), así que separarlos permitiría un
-- seguro vigente sin aporte.

CREATE TABLE `empleado_aporte_bps` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `aporta_bps` BOOLEAN NOT NULL,
    `seguro_salud` VARCHAR(4) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `empleado_aporte_bps_empleado_id_fecha_vigencia_key`(`empleado_id`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `empleado_aporte_bps`
  ADD CONSTRAINT `empleado_aporte_bps_empleado_id_fkey`
  FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- §5.1 — toda fecha_vigencia es el día 1 de un mes.
ALTER TABLE `empleado_aporte_bps`
  ADD CONSTRAINT `ck_aporte_bps_vigencia_dia1` CHECK (DAY(`fecha_vigencia`) = 1);

-- Una fila por empleada, con el valor que tiene hoy y vigencia el 1° del mes de su ingreso.
-- Es lo que garantiza que **todo** mes con vínculo tenga aporte resuelto: sin esta fila, el
-- primer período liquidable quedaría sin registro vigente y fallaría por §6.8.
INSERT INTO `empleado_aporte_bps`
  (`id`, `empleado_id`, `fecha_vigencia`, `aporta_bps`, `seguro_salud`, `creado_en`, `creado_por`, `modificado_en`, `modificado_por`)
SELECT
  UUID(),
  `id`,
  DATE_FORMAT(`fecha_ingreso`, '%Y-%m-01'),
  `aporta_bps`,
  CASE WHEN `aporta_bps` THEN `seguro_salud` ELSE NULL END,
  CURRENT_TIMESTAMP(3),
  `creado_por`,
  CURRENT_TIMESTAMP(3),
  `modificado_por`
FROM `empleados`;

ALTER TABLE `empleados` DROP COLUMN `aporta_bps`, DROP COLUMN `seguro_salud`;
