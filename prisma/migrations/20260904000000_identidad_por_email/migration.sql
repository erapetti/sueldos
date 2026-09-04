-- §3.3 — la identidad deja de anclarse en el `sub` de Google y pasa a anclarse en el email.
--
-- Es una divergencia deliberada del SPECS, que pide el match por `google_sub`. El `sub`
-- protege de dos cosas: que a una persona le cambien el email, y que el email se reasigne a
-- otra persona. Contra cuentas `@gmail.com` ninguna de las dos puede pasar —una dirección de
-- Gmail no se renombra, y Google no recicla las direcciones que se dan de baja—, así que la
-- columna solo estaba pagando complejidad. Ver README §5.8.
--
-- Con la columna se va también la lógica de *claim* del registro (usuario pre-creado sin sub
-- al que el primer ingreso le asignaba el suyo): un usuario pre-creado ahora matchea de una.
-- El «Sin ingresar» de la pantalla de Usuarios pasa a mirar `ultimo_acceso`, que dice
-- exactamente lo mismo.
--
-- Destructiva y sin vuelta atrás: el `sub` que haya guardado se pierde. Si algún día hiciera
-- falta, se repuebla solo con que cada usuario ingrese una vez.

ALTER TABLE `usuarios` DROP INDEX `usuarios_google_sub_key`;
ALTER TABLE `usuarios` DROP COLUMN `google_sub`;
