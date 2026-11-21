-- ============================================================================
-- Sede adicional con precio según el plan (decisión del 18 nov 2026, la misma
-- de pos.codecstudio.online): Básico $29.990 al mes y Premium $49.990 al mes,
-- más $50.000 de instalación una sola vez.
--
-- La tabla addons guarda un solo precio por complemento, y el cobro de sedes
-- lo marca Codec Studio a mano en el panel (admin_marcar_sede_pagada), así
-- que el precio queda en el de Premium y la descripción explica los dos.
-- No se crea un complemento aparte para Básico porque varios tableros cuentan
-- las sedes contratadas por el código SUCURSAL_ADICIONAL.
-- ============================================================================

update public.addons
   set precio = 49990,
       descripcion = 'Sede adicional: Básico 29.990 mensuales, Premium 49.990 mensuales, + 50.000 de instalación (una sola vez). Incluye 1 administrador para esa sede. La sede nueva tiene 14 días de prueba gratis.'
 where codigo = 'SUCURSAL_ADICIONAL';

-- El anual se calcula con meses_gratis_anual desde la 0104 (12 meses por el
-- precio de 11). descuento_anual quedó sin uso; se deja dicho para que nadie
-- lo tome como el precio vigente.
update public.configuracion_comercial
   set descripcion = 'SIN USO desde la migración 0104: el anual se calcula con meses_gratis_anual (12 meses por el precio de 11).'
 where clave = 'descuento_anual';
