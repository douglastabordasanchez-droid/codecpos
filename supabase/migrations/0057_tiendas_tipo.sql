-- Distingue "tienda" (punto de venta) de "bodega" (solo almacenamiento) en el
-- directorio de tiendas espejado desde Electron (ver 0030_tiendas_pwa.sql).
-- Aditivo y retro-compatible: filas existentes quedan como 'tienda'.

alter table public.tiendas add column if not exists tipo text not null default 'tienda';

alter table public.tiendas drop constraint if exists tiendas_tipo_check;
alter table public.tiendas add constraint tiendas_tipo_check check (tipo in ('tienda', 'bodega'));
