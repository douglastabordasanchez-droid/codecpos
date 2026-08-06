-- Esquema operativo nuevo para CodecPOS (productos, ventas, cierres, empleados, notificaciones de pago).
-- NO modifica el esquema de licenciamiento existente (clientes_pos, usuarios_clientes, usuarios_pos,
-- sesiones_pos, validaciones_hardware).
-- Multi-tenant: toda tabla nueva referencia cliente_id -> public.clientes_pos(id).

-- ============================================================
-- EMPLEADOS (identidad operativa, 1:1 con auth.users)
-- ============================================================
create table if not exists public.empleados (
  id uuid primary key references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre_completo text not null,
  cedula text,
  rol text not null default 'cajero'
    check (rol in ('super_usuario','admin','cajero','tecnico','cocina','barra','mesero')),
  permisos jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  hardware_id_autorizado text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_empleados_cliente_id on public.empleados(cliente_id);

-- ============================================================
-- PRODUCTOS
-- ============================================================
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  codigo_barras text,
  nombre text not null,
  descripcion text,
  categoria text,
  precio_venta numeric(12,2) not null default 0,
  costo numeric(12,2) not null default 0,
  stock numeric(12,2) not null default 0,
  foto_url text,
  activo boolean not null default true,
  updated_by uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_productos_cliente_id on public.productos(cliente_id);
create index if not exists idx_productos_codigo_barras on public.productos(codigo_barras);

-- ============================================================
-- VENTAS + LINEAS
-- ============================================================
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  terminal_id text,
  empleado_id uuid references public.empleados(id),
  total numeric(12,2) not null default 0,
  metodo_pago text,
  estado text not null default 'completada'
    check (estado in ('completada','anulada','pendiente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ventas_cliente_id on public.ventas(cliente_id);
create index if not exists idx_ventas_created_at on public.ventas(created_at);

create table if not exists public.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  producto_id uuid references public.productos(id),
  cantidad numeric(12,2) not null,
  precio_unitario numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_venta_items_venta_id on public.venta_items(venta_id);

-- ============================================================
-- CIERRES DE CAJA
-- ============================================================
create table if not exists public.cierres_caja (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  terminal_id text,
  empleado_id uuid references public.empleados(id),
  fecha_apertura timestamptz,
  fecha_cierre timestamptz,
  monto_apertura numeric(12,2) not null default 0,
  monto_cierre numeric(12,2) not null default 0,
  ventas_total numeric(12,2) not null default 0,
  diferencia numeric(12,2) not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_cierres_caja_cliente_id on public.cierres_caja(cliente_id);

-- ============================================================
-- SESIONES ACTIVAS (monitoreo de empleados)
-- ============================================================
create table if not exists public.sesiones_activas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  empleado_id uuid references public.empleados(id),
  terminal_id text,
  terminal_nombre text,
  iniciada_at timestamptz not null default now(),
  ultima_actividad timestamptz not null default now(),
  activa boolean not null default true
);
create index if not exists idx_sesiones_activas_cliente_id on public.sesiones_activas(cliente_id);

-- ============================================================
-- NOTIFICACIONES DE PAGO (Codec Verify v2)
-- ============================================================
create table if not exists public.notificaciones_pago (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  terminal_id text,
  venta_id uuid references public.ventas(id),
  monto numeric(12,2) not null,
  entidad text,
  referencia text,
  origen text not null default 'manual' check (origen in ('manual','automatizacion')),
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','descartado')),
  confirmado_por uuid references public.empleados(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_notificaciones_pago_cliente_id on public.notificaciones_pago(cliente_id);
create index if not exists idx_notificaciones_pago_estado on public.notificaciones_pago(estado);

-- ============================================================
-- HELPER: cliente_id del usuario autenticado actual
-- ============================================================
create or replace function public.current_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cliente_id from public.empleados where id = auth.uid()
$$;

-- ============================================================
-- RLS: aislamiento por negocio (cliente_id)
-- ============================================================
alter table public.empleados enable row level security;
alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.cierres_caja enable row level security;
alter table public.sesiones_activas enable row level security;
alter table public.notificaciones_pago enable row level security;

drop policy if exists empleados_select on public.empleados;
create policy empleados_select on public.empleados
  for select using (id = auth.uid() or cliente_id = public.current_cliente_id());

drop policy if exists empleados_update_self on public.empleados;
create policy empleados_update_self on public.empleados
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists productos_tenant on public.productos;
create policy productos_tenant on public.productos
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists ventas_tenant on public.ventas;
create policy ventas_tenant on public.ventas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists venta_items_tenant on public.venta_items;
create policy venta_items_tenant on public.venta_items
  for all using (
    exists (select 1 from public.ventas v where v.id = venta_items.venta_id and v.cliente_id = public.current_cliente_id())
  )
  with check (
    exists (select 1 from public.ventas v where v.id = venta_items.venta_id and v.cliente_id = public.current_cliente_id())
  );

drop policy if exists cierres_caja_tenant on public.cierres_caja;
create policy cierres_caja_tenant on public.cierres_caja
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists sesiones_activas_tenant on public.sesiones_activas;
create policy sesiones_activas_tenant on public.sesiones_activas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists notificaciones_pago_tenant on public.notificaciones_pago;
create policy notificaciones_pago_tenant on public.notificaciones_pago
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.productos;
alter publication supabase_realtime add table public.ventas;
alter publication supabase_realtime add table public.sesiones_activas;
alter publication supabase_realtime add table public.notificaciones_pago;

-- ============================================================
-- STORAGE: bucket de fotos de producto
-- ============================================================
insert into storage.buckets (id, name, public)
values ('productos-fotos', 'productos-fotos', true)
on conflict (id) do nothing;

drop policy if exists productos_fotos_public_read on storage.objects;
create policy productos_fotos_public_read on storage.objects
  for select using (bucket_id = 'productos-fotos');

drop policy if exists productos_fotos_auth_write on storage.objects;
create policy productos_fotos_auth_write on storage.objects
  for insert with check (bucket_id = 'productos-fotos' and auth.role() = 'authenticated');

drop policy if exists productos_fotos_auth_update on storage.objects;
create policy productos_fotos_auth_update on storage.objects
  for update using (bucket_id = 'productos-fotos' and auth.role() = 'authenticated');
