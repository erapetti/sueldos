-- Escrita a mano, como la de restricciones: `prisma migrate dev` no conoce los CHECK y los
-- reportaría como drift.

-- §4.6 — nueva causal de inasistencia. El día no paga boletos (la regla de la jornada
-- completa ya lo resuelve) pero las horas no se descuentan del sueldo.
ALTER TABLE `faltas`
  MODIFY `causal` ENUM('CON_AVISO', 'SIN_AVISO', 'ENFERMEDAD', 'MATERNIDAD', 'RECUPERA_OTRO_DIA') NOT NULL;

-- §6.5 — se admiten horas extras en cero. No pagan nada: marcan que ese día fue a trabajar,
-- que es lo que hace que el día entre en el cálculo de boletos.
-- `DROP CONSTRAINT` en vez de `DROP CHECK` porque lo entienden los dos motores: MySQL desde
-- 8.0.19 y MariaDB desde 10.2.22.
ALTER TABLE `horas_extras` DROP CONSTRAINT `ck_horas_extras_horas`;
ALTER TABLE `horas_extras` ADD CONSTRAINT `ck_horas_extras_horas`
  CHECK (`horas` >= 0 AND `horas` * 2 = FLOOR(`horas` * 2));
