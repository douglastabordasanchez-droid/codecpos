-- Estaciones de preparación (Cocina, Greca, Comidas rápidas, Bar...).
--
-- El administrador las crea desde el celular. El mesero, al enviar el pedido
-- de una mesa, elige la estación de cada producto (o "solo cuenta", que no se
-- envía a ninguna parte); se crea una comanda por estación y la cuenta de la
-- mesa sigue siendo una sola. Cada tablet de estación ve solo lo suyo.
--
-- `panaderia_producto_estacion` guarda la última estación elegida para cada
-- producto: la próxima vez sale preseleccionada para todos los meseros.

create table if not exists public.estaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  color text not null default '#f97316',
  icono text not null default 'cocina',
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_estaciones_cliente on public.estaciones(cliente_id, orden);

alter table public.estaciones enable row level security;
revoke all on public.estaciones from anon, authenticated;
grant select, insert, update, delete on public.estaciones to authenticated;

drop policy if exists estaciones_select on public.estaciones;
create policy estaciones_select on public.estaciones
  for select to authenticated
  using (cliente_id = (select public.current_cliente_id()));

-- Crear, editar y borrar: solo dueño o administrador (o la caja de escritorio).
drop policy if exists estaciones_insert on public.estaciones;
create policy estaciones_insert on public.estaciones
  for insert to authenticated
  with check (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()));

drop policy if exists estaciones_update on public.estaciones;
create policy estaciones_update on public.estaciones
  for update to authenticated
  using (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()))
  with check (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()));

drop policy if exists estaciones_delete on public.estaciones;
create policy estaciones_delete on public.estaciones
  for delete to authenticated
  using (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()));

-- Estación de cada comanda (null = comandas de antes, sin estación).
alter table public.panaderia_comandas add column if not exists estacion_id uuid references public.estaciones(id) on delete set null;
alter table public.panaderia_comandas add column if not exists estacion_nombre text;
create index if not exists idx_panaderia_comandas_estacion on public.panaderia_comandas(cliente_id, estacion_id, estado);

-- Estación aprendida por producto. estacion_id null = "solo cuenta".
create table if not exists public.panaderia_producto_estacion (
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  producto_local_id text not null,
  estacion_id uuid references public.estaciones(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (cliente_id, producto_local_id)
);

alter table public.panaderia_producto_estacion enable row level security;
revoke all on public.panaderia_producto_estacion from anon, authenticated;
grant select, insert, update, delete on public.panaderia_producto_estacion to authenticated;

drop policy if exists panaderia_producto_estacion_tenant on public.panaderia_producto_estacion;
create policy panaderia_producto_estacion_tenant on public.panaderia_producto_estacion
  for all to authenticated
  using (cliente_id = (select public.current_cliente_id()))
  with check (cliente_id = (select public.current_cliente_id()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'estaciones'
  ) then
    execute 'alter publication supabase_realtime add table public.estaciones';
  end if;
end $$;
