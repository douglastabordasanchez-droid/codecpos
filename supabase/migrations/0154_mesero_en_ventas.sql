-- 0154 · Mesero de cada venta en la nube: quien atendió la mesa («Atendido
-- por» en la tirilla). Lo sube la caja junto con la venta; sirve para el
-- reporte de Meseros y propinas en la web y el celular. Vacío = venta de
-- mostrador o anterior a esta función.
alter table public.ventas add column if not exists mesero_nombre text;
create index if not exists idx_ventas_cliente_mesero on public.ventas (cliente_id, mesero_nombre) where mesero_nombre is not null;
