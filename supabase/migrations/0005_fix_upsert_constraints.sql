-- Fix: los índices únicos PARCIALES (where local_id is not null) no sirven
-- para ON CONFLICT vía PostgREST/upsert — necesita una unique constraint real.
-- NULL en local_id no rompe unicidad (Postgres no compara NULLs entre sí).
drop index if exists productos_cliente_local_id_key;
alter table public.productos
  add constraint productos_cliente_local_id_key unique (cliente_id, local_id);

drop index if exists ventas_cliente_local_id_key;
alter table public.ventas
  add constraint ventas_cliente_local_id_key unique (cliente_id, local_id);
