-- §4.2 — la cuenta bancaria pasa a ser opcional. Hay empleados de los que se conoce
-- el banco pero todavía no la cuenta.
--
-- El formato también se afloja para admitir el guion, porque hay bancos que numeran
-- cuenta-subcuenta. Eso se valida en la aplicación (§4.2, esquema `datosEmpleado`);
-- la columna sigue siendo VARCHAR(32).

-- AlterTable
ALTER TABLE `empleados` MODIFY `cuenta` VARCHAR(32) NULL;

-- Las filas existentes no pueden tener cadena vacía, porque hasta ahora la validación
-- exigía al menos un carácter. Se normaliza igual, por si alguna entró por otra vía.
UPDATE `empleados` SET `cuenta` = NULL WHERE `cuenta` = '';
