-- Restricciones que Prisma no expresa en schema.prisma y que el SPECS pide validar
-- también a nivel de esquema (§5.1: "se valida en el esquema, en los esquemas zod y en
-- los formularios"). Se mantienen en una migración propia y escrita a mano.
--
-- IMPORTANTE: `prisma migrate dev` no conoce estas restricciones y las reporta como
-- drift. Para cambiar el modelo usar `prisma migrate dev --create-only` y volver a
-- agregarlas si la migración generada recrea alguna de estas tablas.

-- §5.1 — toda fecha_vigencia es el día 1 de un mes
ALTER TABLE `empleado_salarios`         ADD CONSTRAINT `ck_salarios_vigencia_dia1`  CHECK (DAY(`fecha_vigencia`) = 1);
ALTER TABLE `empleado_valor_hora_negro` ADD CONSTRAINT `ck_vhnegro_vigencia_dia1`   CHECK (DAY(`fecha_vigencia`) = 1);
ALTER TABLE `empleado_regimenes`        ADD CONSTRAINT `ck_regimenes_vigencia_dia1` CHECK (DAY(`fecha_vigencia`) = 1);
ALTER TABLE `bps_conceptos`             ADD CONSTRAINT `ck_bps_vigencia_dia1`       CHECK (DAY(`fecha_vigencia`) = 1);
ALTER TABLE `valor_boleto`              ADD CONSTRAINT `ck_boleto_vigencia_dia1`    CHECK (DAY(`fecha_vigencia`) = 1);

-- §4.14 — el período de una liquidación es el primer día del mes liquidado
ALTER TABLE `liquidaciones` ADD CONSTRAINT `ck_liquidacion_periodo_dia1` CHECK (DAY(`periodo`) = 1);
ALTER TABLE `liquidaciones` ADD CONSTRAINT `ck_liquidacion_secuencia`    CHECK (`secuencia` >= 1);
-- La columna que emula el índice único parcial solo admite 1 o NULL
ALTER TABLE `liquidaciones` ADD CONSTRAINT `ck_liquidacion_uk_vigente`   CHECK (`uk_vigente` IS NULL OR `uk_vigente` = 1);

-- §4.3 — salario > 0, horas semanales > 0 y <= 60
ALTER TABLE `empleado_salarios` ADD CONSTRAINT `ck_salarios_montos`
  CHECK (`salario` > 0 AND `horas_semanales` > 0 AND `horas_semanales` <= 60);

-- §4.3.1 — valor hora "en negro" > 0
ALTER TABLE `empleado_valor_hora_negro` ADD CONSTRAINT `ck_vhnegro_valor` CHECK (`valor` > 0);

-- §4.4 — horas por día >= 0, <= 24 y múltiplos de 0,5
ALTER TABLE `empleado_regimenes` ADD CONSTRAINT `ck_regimenes_horas` CHECK (
      `horas_lunes`     BETWEEN 0 AND 24 AND `horas_lunes`     * 2 = FLOOR(`horas_lunes`     * 2)
  AND `horas_martes`    BETWEEN 0 AND 24 AND `horas_martes`    * 2 = FLOOR(`horas_martes`    * 2)
  AND `horas_miercoles` BETWEEN 0 AND 24 AND `horas_miercoles` * 2 = FLOOR(`horas_miercoles` * 2)
  AND `horas_jueves`    BETWEEN 0 AND 24 AND `horas_jueves`    * 2 = FLOOR(`horas_jueves`    * 2)
  AND `horas_viernes`   BETWEEN 0 AND 24 AND `horas_viernes`   * 2 = FLOOR(`horas_viernes`   * 2)
  AND `horas_sabado`    BETWEEN 0 AND 24 AND `horas_sabado`    * 2 = FLOOR(`horas_sabado`    * 2)
  AND `horas_domingo`   BETWEEN 0 AND 24 AND `horas_domingo`   * 2 = FLOOR(`horas_domingo`   * 2)
);

-- §4.5 — horas extras > 0, múltiplos de 0,5, y recargo dentro del Anexo B
ALTER TABLE `horas_extras` ADD CONSTRAINT `ck_horas_extras_horas`
  CHECK (`horas` > 0 AND `horas` * 2 = FLOOR(`horas` * 2));
ALTER TABLE `horas_extras` ADD CONSTRAINT `ck_horas_extras_recargo`
  CHECK (`recargo_pct` IN (0, 20, 100, 120, 150, 170, 200, 220));

-- §4.6 — faltas > 0 y múltiplos de 0,5
ALTER TABLE `faltas` ADD CONSTRAINT `ck_faltas_horas`
  CHECK (`horas` > 0 AND `horas` * 2 = FLOOR(`horas` * 2));

-- §4.7 / §4.8 — importes positivos
ALTER TABLE `pagos_adicionales` ADD CONSTRAINT `ck_pagos_adicionales_monto` CHECK (`monto` > 0);
ALTER TABLE `plan_pagos`        ADD CONSTRAINT `ck_plan_pagos_monto`        CHECK (`monto` > 0);

-- §4.9 — debe y haber nunca negativos; un movimiento usa un solo lado
ALTER TABLE `cuenta_corriente` ADD CONSTRAINT `ck_cuenta_corriente_lados`
  CHECK (`debe` >= 0 AND `haber` >= 0 AND (`debe` = 0 OR `haber` = 0));

-- §4.11 — porcentaje no negativo cuando está informado
ALTER TABLE `bps_conceptos` ADD CONSTRAINT `ck_bps_porcentaje`
  CHECK (`porcentaje` IS NULL OR `porcentaje` >= 0);

-- §4.12 — valor del boleto > 0
ALTER TABLE `valor_boleto` ADD CONSTRAINT `ck_boleto_monto` CHECK (`monto` > 0);

-- §4.15.1 — el año de aniversario solo tiene sentido en GENERACION_ANUAL, y ahí es obligatorio
ALTER TABLE `licencia_movimientos` ADD CONSTRAINT `ck_licencia_mov_aniversario`
  CHECK ((`tipo` = 'GENERACION_ANUAL' AND `anio_aniversario` IS NOT NULL AND `anio_aniversario` >= 1)
      OR (`tipo` <> 'GENERACION_ANUAL' AND `anio_aniversario` IS NULL));
ALTER TABLE `licencia_movimientos` ADD CONSTRAINT `ck_licencia_mov_lados`
  CHECK (`debe` >= 0 AND `haber` >= 0 AND (`debe` = 0 OR `haber` = 0));

-- §4.15.2 — el período de licencia no puede terminar antes de empezar
ALTER TABLE `licencias` ADD CONSTRAINT `ck_licencias_rango` CHECK (`fecha_hasta` >= `fecha_desde`);
ALTER TABLE `licencias` ADD CONSTRAINT `ck_licencias_dias`  CHECK (`dias_habiles` >= 0);
