-- 0136 · Cantidades y stock con miligramos.
--
-- La báscula ahora pesa en kilos, gramos y miligramos (basculaWeb.ts) y lo
-- vendido a granel se guarda en kilos con 6 decimales. Con numeric(12,2) una
-- venta de 250 mg (0,00025 kg) quedaba en 0 y una de 125 g (0,125 kg) en 0,13.
-- Solo se amplía la precisión: ningún valor guardado cambia.

alter table public.venta_items alter column cantidad type numeric(16,6);
alter table public.productos alter column stock type numeric(16,6);
alter table public.devolucion_items alter column cantidad type numeric(16,6);
alter table public.tiendas_stock alter column cantidad type numeric(16,6);
