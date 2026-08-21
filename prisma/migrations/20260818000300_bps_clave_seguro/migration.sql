-- §4.11 — el índice único (concepto, seguro_salud, fecha_vigencia) no se cumple en MySQL
-- cuando seguro_salud es NULL, porque los NULL no se comparan entre sí. Se reemplaza por
-- una columna normalizada que vale '*' para los conceptos generales.

-- DropIndex
DROP INDEX `bps_conceptos_concepto_seguro_salud_fecha_vigencia_key` ON `bps_conceptos`;

-- AlterTable
-- Se agrega con default para no romper las filas existentes y se rellena a continuación.
ALTER TABLE `bps_conceptos` ADD COLUMN `seguro_salud_clave` VARCHAR(4) NOT NULL DEFAULT '*';
UPDATE `bps_conceptos` SET `seguro_salud_clave` = COALESCE(`seguro_salud`, '*');
ALTER TABLE `bps_conceptos` ALTER COLUMN `seguro_salud_clave` DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX `bps_conceptos_concepto_seguro_salud_clave_fecha_vigencia_key` ON `bps_conceptos`(`concepto`, `seguro_salud_clave`, `fecha_vigencia`);

