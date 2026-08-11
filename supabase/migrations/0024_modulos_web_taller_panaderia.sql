-- ============================================================================
-- Paridad móvil, fase 1: el dueño decide desde Electron QUÉ módulos aparecen
-- en la app web/celular, y los dos primeros módulos portados (Taller de
-- Reparaciones y Panadería y Onces) dejan de vivir solo en el equipo.
--
-- Contexto: hasta ahora Taller vivía en IndexedDB y Panadería en localStorage,
-- ambos dentro de UNA instalación de Electron. No existía forma de verlos —ni
-- mucho menos operarlos— desde el celular. Se agregan como tablas operativas
-- reales con el mismo patrón multi-tenant (cliente_id + RLS) que
-- productos/ventas/gastos.
-- ============================================================================


-- ============================================================
-- 1. MÓDULOS VISIBLES EN LA APP WEB / CELULAR
-- ============================================================
-- `modulos_activos` (0008) es la LICENCIA: qué compró el negocio, lo edita
-- Codec Studio desde Panel Desarrollador. `modulos_web` es distinto: de todo
-- lo que el negocio YA tiene, cuáles quiere ver en el celular. Lo edita el
-- dueño desde su propio Electron. Separarlos evita que una instalación pueda
-- concederse módulos que no compró: la PWA muestra la INTERSECCIÓN.
--
-- null = "todavía no eligió" → la PWA muestra todos los de su licencia
-- (mismo comportamiento que antes de existir esta columna, sin romper nada).
alter table public.clientes_pos
  add column if not exists modulos_web text[];

-- La política de UPDATE de clientes_pos (0009) exige ser un `empleados` con
-- rol admin/super_usuario. La instalación de Electron NO es un empleado: se
-- autentica con una identidad de sync (`sync_identidades`, 0003), así que no
-- puede tocar la tabla directamente. Este RPC security definer es el único
-- camino, y solo permite escribir ESTA columna, del PROPIO negocio.
create or replace function public.actualizar_modulos_web(
  p_modulos text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_es_admin boolean;
begin
  v_cliente_id := public.current_cliente_id();

  if v_cliente_id is null then
    raise exception 'Esta sesión no está vinculada a ningún negocio';
  end if;

  -- Quien llama debe ser la instalación de Electron vinculada (identidad de
  -- sync) o un admin/super_usuario humano de ese mismo negocio. Un cajero no
  -- decide qué módulos ve el equipo en sus celulares.
  select exists(
    select 1 from public.sync_identidades s where s.id = auth.uid()
  ) or exists(
    select 1 from public.empleados e
    where e.id = auth.uid() and e.rol in ('admin', 'super_usuario')
  ) into v_es_admin;

  if not v_es_admin then
    raise exception 'No tienes permiso para configurar los módulos de la app móvil';
  end if;

  update public.clientes_pos
  set modulos_web = p_modulos
  where id = v_cliente_id;
end;
$$;

grant execute on function public.actualizar_modulos_web(text[]) to authenticated;


-- ============================================================
-- 2. TALLER DE REPARACIONES
-- ============================================================
-- La orden de servicio es un objeto profundamente anidado (cliente,
-- dispositivo, diagnóstico, insumos, pagos, historial de estados, notas,
-- garantía, firmas — ver src/app/types/taller.ts). Se guarda completa en
-- `datos` jsonb para no perder NADA al sincronizar, y se promueven a columnas
-- solo los campos por los que se filtra, ordena o agrupa. Así el Kanban del
-- celular pagina sin descargar el jsonb entero.
create table if not exists public.taller_ordenes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  -- id de la orden en el IndexedDB de Electron — ancla del upsert idempotente
  local_id text not null,
  numero_orden text not null,
  estado text not null default 'recibido',
  prioridad text not null default 'normal',
  cliente_nombre text,
  cliente_telefono text,
  dispositivo_tipo text,
  dispositivo_marca text,
  dispositivo_modelo text,
  tecnico_asignado text,
  fecha_recepcion timestamptz not null default now(),
  fecha_estimada_entrega timestamptz,
  fecha_entrega timestamptz,
  costo_estimado numeric(12,2) not null default 0,
  costo_final numeric(12,2) not null default 0,
  anticipo numeric(12,2) not null default 0,
  saldo_pendiente numeric(12,2) not null default 0,
  -- OrdenServicio completa, tal cual la maneja Electron
  datos jsonb not null default '{}'::jsonb,
  -- Marca de quién escribió último, para que Electron sepa qué bajar
  actualizado_por text,
  actualizado_en text not null default 'electron',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists taller_ordenes_cliente_local_id_key
  on public.taller_ordenes(cliente_id, local_id);
create index if not exists idx_taller_ordenes_cliente on public.taller_ordenes(cliente_id);
create index if not exists idx_taller_ordenes_estado on public.taller_ordenes(cliente_id, estado);
create index if not exists idx_taller_ordenes_updated on public.taller_ordenes(cliente_id, updated_at desc);

alter table public.taller_ordenes enable row level security;
drop policy if exists taller_ordenes_tenant on public.taller_ordenes;
create policy taller_ordenes_tenant on public.taller_ordenes
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());


-- ============================================================
-- 3. PANADERÍA Y ONCES
-- ============================================================
-- En Electron esto son 4 claves de localStorage sueltas
-- (codecpos_panaderia_cats, codecpos_mesas_config, codecpos_mesas_cuentas,
-- codecpos_panaderia_cuenta_libre). Se normaliza en tablas para que el
-- celular pueda operar mesas de verdad —tomar el pedido en la mesa y que la
-- caja lo vea— en lugar de solo mirar.

create table if not exists public.panaderia_categorias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  icono text default 'pan',
  color text default '#2563eb',
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists panaderia_categorias_cliente_local_id_key
  on public.panaderia_categorias(cliente_id, local_id);
create index if not exists idx_panaderia_categorias_cliente on public.panaderia_categorias(cliente_id);

create table if not exists public.panaderia_productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  categoria_local_id text,
  nombre text not null,
  codigo text,
  precio numeric(12,2) not null default 0,
  costo numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0,
  icono text default 'pan',
  color text default '#2563eb',
  tipo_inventario text not null default 'directo',
  recipe_id text,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists panaderia_productos_cliente_local_id_key
  on public.panaderia_productos(cliente_id, local_id);
create index if not exists idx_panaderia_productos_cliente on public.panaderia_productos(cliente_id);

create table if not exists public.panaderia_mesas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  activa boolean not null default true,
  orden int not null default 0
);
create unique index if not exists panaderia_mesas_cliente_local_id_key
  on public.panaderia_mesas(cliente_id, local_id);
create index if not exists idx_panaderia_mesas_cliente on public.panaderia_mesas(cliente_id);

-- Una cuenta abierta por mesa. `items` va en jsonb porque una cuenta la edita
-- una persona a la vez (el mesero de esa mesa) — no hay escritura concurrente
-- real sobre la misma fila, y así el pedido viaja completo de un golpe.
create table if not exists public.panaderia_cuentas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  mesa_local_id text not null,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  abierta boolean not null default true,
  mesero_nombre text,
  actualizado_en text not null default 'electron',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists panaderia_cuentas_cliente_mesa_key
  on public.panaderia_cuentas(cliente_id, mesa_local_id);
create index if not exists idx_panaderia_cuentas_cliente on public.panaderia_cuentas(cliente_id);

alter table public.panaderia_categorias enable row level security;
alter table public.panaderia_productos enable row level security;
alter table public.panaderia_mesas enable row level security;
alter table public.panaderia_cuentas enable row level security;

drop policy if exists panaderia_categorias_tenant on public.panaderia_categorias;
create policy panaderia_categorias_tenant on public.panaderia_categorias
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists panaderia_productos_tenant on public.panaderia_productos;
create policy panaderia_productos_tenant on public.panaderia_productos
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists panaderia_mesas_tenant on public.panaderia_mesas;
create policy panaderia_mesas_tenant on public.panaderia_mesas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists panaderia_cuentas_tenant on public.panaderia_cuentas;
create policy panaderia_cuentas_tenant on public.panaderia_cuentas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());


-- Realtime: la caja en Electron y el celular del mesero se enteran del cambio
-- en el momento, sin recargar ni esperar al siguiente ciclo de sync.
alter publication supabase_realtime add table public.taller_ordenes;
alter publication supabase_realtime add table public.panaderia_cuentas;
