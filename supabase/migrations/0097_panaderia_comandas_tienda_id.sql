-- `panaderia_comandas` (cocina/bar) quedó fuera de la migración 0093, que sí
-- agregó `tienda_id` a `panaderia_mesas`/`panaderia_cuentas`. Sin esta
-- columna era imposible saber a qué sucursal pertenecía una comanda, así que
-- CUALQUIER terminal Electron (o celular) recibía por Realtime — y sonaba la
-- alerta de "comanda recibida" — por pedidos de OTRA sucursal del mismo
-- negocio. Mismo patrón: texto libre = `tiendas.local_id`, NULL = Tienda
-- Principal.

alter table public.panaderia_comandas add column if not exists tienda_id text;
create index if not exists idx_panaderia_comandas_tienda on public.panaderia_comandas(cliente_id, tienda_id);
