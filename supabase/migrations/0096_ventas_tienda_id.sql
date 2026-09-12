-- Ventas por sucursal (Multi-Tienda).
--
-- `ventas` solo se particionaba por `cliente_id` -- no había forma de saber
-- a qué sucursal pertenecía una venta hecha desde el celular (ver
-- ventaMovilService.ts, que ya recibe `tiendaId` pero nunca lo guardaba).
-- Esto agrega la columna, igual patrón que `panaderia_mesas`/`empleados`
-- (migraciones 0092/0093): texto libre = `tiendas.local_id`, NULL = Tienda
-- Principal. Sin esto, Dashboard/Ventas en la PWA no pueden filtrar por
-- sucursal aunque el usuario elija una.

alter table public.ventas add column if not exists tienda_id text;
create index if not exists idx_ventas_tienda on public.ventas(cliente_id, tienda_id);
