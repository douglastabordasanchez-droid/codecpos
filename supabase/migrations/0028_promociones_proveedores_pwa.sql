-- Promociones, Combos y Proveedores en Supabase — para que la PWA pueda
-- verlos (antes vivían 100% en localStorage de Electron, invisibles fuera
-- de la caja). Dirección: SOLO baja de Electron, igual que el catálogo de
-- Alimentos y Bebidas — se administran en el computador, el celular solo
-- consulta. No incluye historial de compras/pagos a proveedores todavía
-- (fuera de alcance de esta primera versión de solo-lectura en la PWA).

create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  descripcion text,
  tipo text not null,
  valor_descuento numeric(12,2),
  aplica_a text not null default 'todos',
  monto_minimo numeric(12,2),
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  activa boolean not null default true,
  prioridad int not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists promociones_cliente_local_id_key on public.promociones(cliente_id, local_id);
create index if not exists idx_promociones_cliente on public.promociones(cliente_id);

create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  descripcion text,
  precio_normal numeric(12,2) not null default 0,
  precio_combo numeric(12,2) not null default 0,
  productos jsonb not null default '[]'::jsonb,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists combos_cliente_local_id_key on public.combos(cliente_id, local_id);
create index if not exists idx_combos_cliente on public.combos(cliente_id);

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  nit text,
  contacto_principal text,
  telefono text,
  email text,
  categoria text,
  saldo_pendiente numeric(12,2) not null default 0,
  total_comprado numeric(12,2) not null default 0,
  calificacion int not null default 5,
  activo boolean not null default true,
  bloqueado boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index if not exists proveedores_cliente_local_id_key on public.proveedores(cliente_id, local_id);
create index if not exists idx_proveedores_cliente on public.proveedores(cliente_id);

alter table public.promociones enable row level security;
alter table public.combos enable row level security;
alter table public.proveedores enable row level security;

drop policy if exists promociones_tenant on public.promociones;
create policy promociones_tenant on public.promociones
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists combos_tenant on public.combos;
create policy combos_tenant on public.combos
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists proveedores_tenant on public.proveedores;
create policy proveedores_tenant on public.proveedores
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());
