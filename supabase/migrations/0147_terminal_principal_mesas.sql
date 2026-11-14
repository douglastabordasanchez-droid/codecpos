-- Terminal principal de Alimentos y Bebidas.
--
-- Hasta ahora cada caja de escritorio tenía SUS mesas en localStorage y las
-- subía a `panaderia_mesas` (solo upsert, nunca bajaba). Con dos cajas (PC y
-- terminal Android) la nube quedaba mezclada y el celular veía otras mesas y
-- en otro orden. Desde aquí un negocio puede marcar UNA terminal principal:
-- sus mesas son las correctas, las publica completas y las demás cajas las
-- copian. Si un negocio no marca ninguna, todo sigue como antes.
--
-- `equipo_id` es un identificador que cada instalación genera una sola vez
-- (localStorage `codecpos_equipo_id`).

create table if not exists public.panaderia_ajustes (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  terminal_principal_id text,
  terminal_principal_nombre text,
  terminal_principal_desde timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.panaderia_ajustes enable row level security;
revoke all on public.panaderia_ajustes from anon, authenticated;
grant select, insert, update on public.panaderia_ajustes to authenticated;

drop policy if exists panaderia_ajustes_select on public.panaderia_ajustes;
create policy panaderia_ajustes_select on public.panaderia_ajustes
  for select to authenticated
  using (cliente_id = (select public.current_cliente_id()));

-- Solo el dueño o un administrador elige la terminal principal.
drop policy if exists panaderia_ajustes_insert on public.panaderia_ajustes;
create policy panaderia_ajustes_insert on public.panaderia_ajustes
  for insert to authenticated
  with check (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  );

drop policy if exists panaderia_ajustes_update on public.panaderia_ajustes;
create policy panaderia_ajustes_update on public.panaderia_ajustes
  for update to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  )
  with check (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  );

-- Las cajas que copian a la principal se enteran al instante de los cambios.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'panaderia_mesas'
  ) then
    execute 'alter publication supabase_realtime add table public.panaderia_mesas';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'panaderia_ajustes'
  ) then
    execute 'alter publication supabase_realtime add table public.panaderia_ajustes';
  end if;
end $$;
