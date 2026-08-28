-- La empleada sin régimen horario: `empleado_salarios` admite el par (0, 0).
--
-- Hasta acá `ck_salarios_montos` pedía `salario > 0 AND horas_semanales > 0`, y de ahí salía
-- que toda empleada tuviera jornada: un régimen vacío suma 0 h y §4.4 obliga a que las horas
-- semanales coincidan, o sea 0, que el CHECK no admitía.
--
-- El par va junto por decisión del dueño del proyecto: sin régimen tampoco hay salario, porque
-- el valor hora calculado es `salario / (horas_semanales × 52/12)` y con 0 horas habría que
-- inventarle uno. Salario y horas van los dos en cero o los dos en positivo.
--
-- Divergencia con el §4.3, anotada en IMPLEMENTATION_HINTS §1.2.

-- `DROP CONSTRAINT` en vez de `DROP CHECK` porque lo entienden los dos motores (§1.1).
ALTER TABLE `empleado_salarios` DROP CONSTRAINT `ck_salarios_montos`;

ALTER TABLE `empleado_salarios` ADD CONSTRAINT `ck_salarios_montos` CHECK (
      `salario` >= 0
  AND `horas_semanales` >= 0
  AND `horas_semanales` <= 60
  AND (`salario` > 0) = (`horas_semanales` > 0)
);
