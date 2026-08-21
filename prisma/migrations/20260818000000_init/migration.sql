-- CreateTable
CREATE TABLE `usuarios` (
    `id` CHAR(36) NOT NULL,
    `google_sub` VARCHAR(255) NULL,
    `email` VARCHAR(320) NOT NULL,
    `nombre` VARCHAR(255) NULL,
    `es_admin` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `ultimo_acceso` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `usuarios_google_sub_key`(`google_sub`),
    UNIQUE INDEX `usuarios_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empleados` (
    `id` CHAR(36) NOT NULL,
    `dueno_id` CHAR(36) NOT NULL,
    `alias` VARCHAR(40) NOT NULL,
    `nombre_completo` VARCHAR(120) NOT NULL,
    `banco` VARCHAR(120) NOT NULL,
    `cuenta` VARCHAR(32) NOT NULL,
    `fecha_ingreso` DATE NOT NULL,
    `cobra_boletos` BOOLEAN NOT NULL,
    `aporta_bps` BOOLEAN NOT NULL DEFAULT true,
    `celular` VARCHAR(60) NULL,
    `direccion` VARCHAR(255) NULL,
    `cedula` VARCHAR(20) NULL,
    `seguro_salud` VARCHAR(4) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_egreso` DATE NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `empleados_activo_visible_idx`(`activo`, `visible`),
    UNIQUE INDEX `empleados_dueno_id_alias_key`(`dueno_id`, `alias`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empleado_salarios` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `salario` DECIMAL(14, 2) NOT NULL,
    `horas_semanales` DECIMAL(6, 2) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `origen` ENUM('MANUAL', 'AUMENTO_MASIVO') NOT NULL DEFAULT 'MANUAL',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `empleado_salarios_empleado_id_fecha_vigencia_key`(`empleado_id`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empleado_valor_hora_negro` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `valor` DECIMAL(14, 2) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `origen` ENUM('MANUAL', 'AUMENTO_MASIVO') NOT NULL DEFAULT 'MANUAL',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `empleado_valor_hora_negro_empleado_id_fecha_vigencia_key`(`empleado_id`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empleado_regimenes` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `horas_lunes` DECIMAL(4, 2) NOT NULL,
    `horas_martes` DECIMAL(4, 2) NOT NULL,
    `horas_miercoles` DECIMAL(4, 2) NOT NULL,
    `horas_jueves` DECIMAL(4, 2) NOT NULL,
    `horas_viernes` DECIMAL(4, 2) NOT NULL,
    `horas_sabado` DECIMAL(4, 2) NOT NULL,
    `horas_domingo` DECIMAL(4, 2) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `empleado_regimenes_empleado_id_fecha_vigencia_key`(`empleado_id`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horas_extras` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `con_bps` BOOLEAN NOT NULL,
    `recargo_pct` INTEGER NOT NULL,
    `nota` TEXT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `horas_extras_empleado_id_fecha_idx`(`empleado_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faltas` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `horas` DECIMAL(4, 2) NOT NULL,
    `causal` ENUM('CON_AVISO', 'SIN_AVISO', 'ENFERMEDAD', 'MATERNIDAD') NOT NULL,
    `descuenta` BOOLEAN NOT NULL DEFAULT true,
    `nota` TEXT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `faltas_empleado_id_fecha_idx`(`empleado_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos_adicionales` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `monto` DECIMAL(14, 2) NOT NULL,
    `concepto` VARCHAR(255) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `pagos_adicionales_empleado_id_fecha_idx`(`empleado_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_pagos` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `prestamo_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `monto` DECIMAL(14, 2) NOT NULL,
    `estado` ENUM('PENDIENTE', 'APLICADA', 'CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `plan_pagos_empleado_id_fecha_estado_idx`(`empleado_id`, `fecha`, `estado`),
    INDEX `plan_pagos_prestamo_id_idx`(`prestamo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuenta_corriente` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('LIQUIDACION', 'PAGO', 'PRESTAMO', 'AJUSTE') NOT NULL,
    `debe` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `haber` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `concepto` VARCHAR(255) NOT NULL,
    `liquidacion_id` CHAR(36) NULL,
    `reversa_de_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `cuenta_corriente_empleado_id_fecha_idx`(`empleado_id`, `fecha`),
    INDEX `cuenta_corriente_liquidacion_id_idx`(`liquidacion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empleado_permisos` (
    `empleado_id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `permiso` ENUM('VER', 'EDITAR') NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `empleado_permisos_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`empleado_id`, `usuario_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bps_conceptos` (
    `id` CHAR(36) NOT NULL,
    `concepto` VARCHAR(80) NOT NULL,
    `porcentaje` DECIMAL(7, 4) NULL,
    `seguro_salud` VARCHAR(4) NULL,
    `fecha_vigencia` DATE NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `bps_conceptos_fecha_vigencia_idx`(`fecha_vigencia`),
    UNIQUE INDEX `bps_conceptos_concepto_seguro_salud_fecha_vigencia_key`(`concepto`, `seguro_salud`, `fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valor_boleto` (
    `id` CHAR(36) NOT NULL,
    `monto` DECIMAL(14, 2) NOT NULL,
    `fecha_vigencia` DATE NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `valor_boleto_fecha_vigencia_key`(`fecha_vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feriados` (
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(120) NOT NULL,
    `no_laborable` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    PRIMARY KEY (`fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `liquidaciones` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `periodo` DATE NOT NULL,
    `tipo` ENUM('MENSUAL', 'AGUINALDO', 'SALARIO_VACACIONAL') NOT NULL,
    `secuencia` INTEGER NOT NULL DEFAULT 1,
    `estado` ENUM('BORRADOR', 'CONFIRMADA', 'ANULADA') NOT NULL DEFAULT 'BORRADOR',
    `total_recalculado` DECIMAL(14, 2) NOT NULL,
    `total_ya_liquidado` DECIMAL(14, 2) NOT NULL,
    `total_a_pagar` DECIMAL(14, 2) NOT NULL,
    `snapshot` JSON NOT NULL,
    `uk_vigente` INTEGER NULL,
    `confirmada_en` DATETIME(3) NULL,
    `confirmada_por` CHAR(36) NULL,
    `anulada_en` DATETIME(3) NULL,
    `anulada_por` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `liquidaciones_empleado_id_periodo_tipo_idx`(`empleado_id`, `periodo`, `tipo`),
    UNIQUE INDEX `liquidaciones_empleado_id_periodo_tipo_secuencia_uk_vigente_key`(`empleado_id`, `periodo`, `tipo`, `secuencia`, `uk_vigente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `liquidacion_lineas` (
    `id` CHAR(36) NOT NULL,
    `liquidacion_id` CHAR(36) NOT NULL,
    `orden` INTEGER NOT NULL,
    `codigo` VARCHAR(40) NOT NULL,
    `descripcion` VARCHAR(255) NOT NULL,
    `cantidad` DECIMAL(12, 4) NULL,
    `valor_unitario` DECIMAL(14, 4) NULL,
    `importe` DECIMAL(14, 2) NOT NULL,
    `signo` INTEGER NOT NULL,

    INDEX `liquidacion_lineas_liquidacion_id_orden_idx`(`liquidacion_id`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `licencia_movimientos` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('GENERACION_ANUAL', 'GOCE', 'AJUSTE') NOT NULL,
    `debe` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `haber` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `concepto` VARCHAR(255) NOT NULL,
    `licencia_id` CHAR(36) NULL,
    `anio_aniversario` INTEGER NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    INDEX `licencia_movimientos_empleado_id_fecha_idx`(`empleado_id`, `fecha`),
    UNIQUE INDEX `licencia_movimientos_empleado_id_anio_aniversario_key`(`empleado_id`, `anio_aniversario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `licencias` (
    `id` CHAR(36) NOT NULL,
    `empleado_id` CHAR(36) NOT NULL,
    `fecha_desde` DATE NOT NULL,
    `fecha_hasta` DATE NOT NULL,
    `dias_habiles` DECIMAL(6, 2) NOT NULL,
    `nota` TEXT NULL,
    `liquidacion_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_por` CHAR(36) NULL,
    `modificado_en` DATETIME(3) NOT NULL,
    `modificado_por` CHAR(36) NULL,

    UNIQUE INDEX `licencias_liquidacion_id_key`(`liquidacion_id`),
    INDEX `licencias_empleado_id_fecha_desde_idx`(`empleado_id`, `fecha_desde`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditoria` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `entidad` VARCHAR(60) NOT NULL,
    `entidad_id` CHAR(36) NULL,
    `accion` VARCHAR(60) NOT NULL,
    `datos_antes` JSON NULL,
    `datos_despues` JSON NULL,

    INDEX `auditoria_entidad_entidad_id_idx`(`entidad`, `entidad_id`),
    INDEX `auditoria_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `empleados` ADD CONSTRAINT `empleados_dueno_id_fkey` FOREIGN KEY (`dueno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleado_salarios` ADD CONSTRAINT `empleado_salarios_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleado_valor_hora_negro` ADD CONSTRAINT `empleado_valor_hora_negro_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleado_regimenes` ADD CONSTRAINT `empleado_regimenes_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horas_extras` ADD CONSTRAINT `horas_extras_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faltas` ADD CONSTRAINT `faltas_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_adicionales` ADD CONSTRAINT `pagos_adicionales_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_pagos` ADD CONSTRAINT `plan_pagos_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_pagos` ADD CONSTRAINT `plan_pagos_prestamo_id_fkey` FOREIGN KEY (`prestamo_id`) REFERENCES `cuenta_corriente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuenta_corriente` ADD CONSTRAINT `cuenta_corriente_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuenta_corriente` ADD CONSTRAINT `cuenta_corriente_liquidacion_id_fkey` FOREIGN KEY (`liquidacion_id`) REFERENCES `liquidaciones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuenta_corriente` ADD CONSTRAINT `cuenta_corriente_reversa_de_id_fkey` FOREIGN KEY (`reversa_de_id`) REFERENCES `cuenta_corriente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleado_permisos` ADD CONSTRAINT `empleado_permisos_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empleado_permisos` ADD CONSTRAINT `empleado_permisos_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidaciones` ADD CONSTRAINT `liquidaciones_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liquidacion_lineas` ADD CONSTRAINT `liquidacion_lineas_liquidacion_id_fkey` FOREIGN KEY (`liquidacion_id`) REFERENCES `liquidaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licencia_movimientos` ADD CONSTRAINT `licencia_movimientos_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licencia_movimientos` ADD CONSTRAINT `licencia_movimientos_licencia_id_fkey` FOREIGN KEY (`licencia_id`) REFERENCES `licencias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licencias` ADD CONSTRAINT `licencias_empleado_id_fkey` FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `licencias` ADD CONSTRAINT `licencias_liquidacion_id_fkey` FOREIGN KEY (`liquidacion_id`) REFERENCES `liquidaciones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `auditoria_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

