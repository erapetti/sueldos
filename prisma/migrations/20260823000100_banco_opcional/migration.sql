-- §4.2 — el banco también pasa a ser opcional. No tiene sentido exigirlo si el número
-- de cuenta es opcional: los dos datos se conocen juntos o no se conocen.
--
-- Va en una migración aparte de `20260823000000_cuenta_opcional` porque esa ya está
-- aplicada; editarla rompería su checksum.

-- AlterTable
ALTER TABLE `empleados` MODIFY `banco` VARCHAR(120) NULL;

UPDATE `empleados` SET `banco` = NULL WHERE `banco` = '';
