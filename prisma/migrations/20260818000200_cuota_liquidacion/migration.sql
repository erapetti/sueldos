-- AlterTable
ALTER TABLE `plan_pagos` ADD COLUMN `liquidacion_aplicada_id` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `plan_pagos_liquidacion_aplicada_id_idx` ON `plan_pagos`(`liquidacion_aplicada_id`);

-- AddForeignKey
ALTER TABLE `plan_pagos` ADD CONSTRAINT `plan_pagos_liquidacion_aplicada_id_fkey` FOREIGN KEY (`liquidacion_aplicada_id`) REFERENCES `liquidaciones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

