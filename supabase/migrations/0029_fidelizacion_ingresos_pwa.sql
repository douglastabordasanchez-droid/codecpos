-- Fidelización (clientes de puntos) e Ingresos Extra en Supabase.
--
-- Mismo patrón de solo-lectura desde la PWA que promociones/proveedores:
-- Electron sigue siendo la fuente de verdad (IndexedDB/localStorage), esto
-- solo espeja para consulta remota. Redimir/acumular puntos desde el
-- celular queda para una siguiente iteración (necesitaría reflejarse en la
-- venta real de Electron, no solo en la nube).

create table if not exists public.clientes_fidelizacion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  documento text,
  telefono text,
  email text,
  puntos numeric(12,2) not null default 0,
  puntos_acumulados numeric(12,2) not null default 0,
  nivel_fidelidad text not null default 'bronce',
  total_compras numeric(12,2) not null default 0,
  numero_compras int not null default 0,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists clientes_fidelizacion_cliente_local_id_key on public.clientes_fidelizacion(cliente_id, local_id);
create index if not exists idx_clientes_fidelizacion_cliente on public.clientes_fidelizacion(cliente_id);

-- Ingresos extra (aportes de socio, préstamos, etc.) — el resto de
-- Contabilidad (gastos) ya sincroniza desde antes vía la tabla `gastos`.
create table if not exists public.ingresos_extra (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  fecha timestamptz not null default now(),
  concepto text not null,
  categoria text,
  monto numeric(12,2) not null default 0,
  metodo_pago text,
  registrado_por text,
  updated_at timestamptz not null default now()
);
create unique index if not exists ingresos_extra_cliente_local_id_key on public.ingresos_extra(cliente_id, local_id);
create index if not exists idx_ingresos_extra_cliente on public.ingresos_extra(cliente_id);

alter table public.clientes_fidelizacion enable row level security;
alter table public.ingresos_extra enable row level security;

drop policy if exists clientes_fidelizacion_tenant on public.clientes_fidelizacion;
create policy clientes_fidelizacion_tenant on public.clientes_fidelizacion
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists ingresos_extra_tenant on public.ingresos_extra;
create policy ingresos_extra_tenant on public.ingresos_extra
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());
