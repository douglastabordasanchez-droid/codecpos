-- Recetario de Alimentos y Bebidas en la nube (ingredientes, recetas y combos).
--
-- Hasta ahora los ingredientes y las recetas vivían solo en el localStorage de
-- cada caja: lo que se creaba en el PC no llegaba a la terminal Android y un
-- equipo nuevo arrancaba vacío. Desde aquí cada negocio tiene UN documento con
-- todo su recetario. Las cajas lo suben cuando alguien crea, edita o borra
-- algo, y lo bajan al arrancar y cada pocos minutos.
--
-- El stock que descuentan las ventas sigue siendo de cada equipo; solo viaja
-- el stock que alguien ajusta a mano (campo stockAjustadoEn de cada
-- ingrediente), para que dos cajas no se pisen las existencias.

create table if not exists public.panaderia_recetario (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  ingredientes jsonb not null default '[]'::jsonb,
  recetas jsonb not null default '[]'::jsonb,
  lineas jsonb not null default '[]'::jsonb,
  combos jsonb not null default '[]'::jsonb,
  -- ids de ingredientes borrados, para que las otras cajas también los quiten
  eliminados jsonb not null default '[]'::jsonb,
  equipo_id text,
  updated_at timestamptz not null default now()
);

alter table public.panaderia_recetario enable row level security;
revoke all on public.panaderia_recetario from anon, authenticated;
grant select, insert, update on public.panaderia_recetario to authenticated;

drop policy if exists panaderia_recetario_select on public.panaderia_recetario;
create policy panaderia_recetario_select on public.panaderia_recetario
  for select to authenticated
  using (cliente_id = (select public.current_cliente_id()));

drop policy if exists panaderia_recetario_insert on public.panaderia_recetario;
create policy panaderia_recetario_insert on public.panaderia_recetario
  for insert to authenticated
  with check (cliente_id = (select public.current_cliente_id()));

drop policy if exists panaderia_recetario_update on public.panaderia_recetario;
create policy panaderia_recetario_update on public.panaderia_recetario
  for update to authenticated
  using (cliente_id = (select public.current_cliente_id()))
  with check (cliente_id = (select public.current_cliente_id()));
