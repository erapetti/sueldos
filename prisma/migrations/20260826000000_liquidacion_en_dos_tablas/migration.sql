-- §6.2 — la liquidación se presenta en dos tablas: la formal, que pasa por el BPS y cierra en
-- su propio total a pagar, y la informal, con lo que se paga sin aportes.

-- Cada línea sabe en qué tabla va. No hay DEFAULT: el motor la asigna siempre.
ALTER TABLE `liquidacion_lineas`
  ADD COLUMN `tabla` ENUM('FORMAL', 'INFORMAL') NOT NULL AFTER `orden`;

-- Los dos totales, para que el pago y —cuando exista— el asiento de cada libro (§4.9) no
-- tengan que rearmarlos sumando líneas.
ALTER TABLE `liquidaciones`
  ADD COLUMN `total_formal` DECIMAL(14, 2) NOT NULL AFTER `total_a_pagar`,
  ADD COLUMN `total_informal` DECIMAL(14, 2) NOT NULL AFTER `total_formal`;
