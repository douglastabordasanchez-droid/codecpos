-- 0134 · Área de cada ítem vendido, para el cierre de caja por áreas de Veterinaria.
--
-- Las tiendas de mascotas cierran el día con un recibo por área (granel,
-- peluquería, consultas y procedimientos, medicamentos, accesorios) y un
-- consolidado (ver src/pwa/lib/ventasPorArea.ts). Los baños y consultas no
-- son productos del inventario, así que sin esta columna su área solo se
-- podía adivinar por el nombre.
--
-- Solo la llenan las ventas hechas con el módulo Veterinaria; en los demás
-- negocios queda en null y nada cambia. Es opcional: la web guarda la venta
-- sin ella si esta migración aún no se aplicó.

alter table public.venta_items
  add column if not exists area text;

comment on column public.venta_items.area is
  'Veterinaria: granel | peluqueria | consultas | medicamentos | accesorios | otros (null en los demás negocios)';
