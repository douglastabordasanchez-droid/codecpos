-- Multi-Tienda en Supabase — SOLO el directorio de sucursales (nombre,
-- dirección, teléfono). Deliberadamente NO incluye stock por tienda ni
-- transferencias: eso vive en un overlay local separado en Electron
-- (multitienda_stock, multitienda_transferencias) que NO toca la tabla
-- `productos` compartida — tocar ese modelo para hacerlo multi-tienda de
-- verdad es un cambio de esquema más grande que se deja fuera de esta
-- primera versión, para no arriesgar Inventario/Vender/Escáner ya en
-- producción sobre esa misma tabla.

create table if not exists public.tiendas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text not null,
  nombre text not null,
  direccion text,
  telefono text,
  color text,
  emoji text,
  activo boolean not null default true,
  es_principal boolean not null default false,
  notas text,
  updated_at timestamptz not null default now()
);
create unique index if not exists tiendas_cliente_local_id_key on public.tiendas(cliente_id, local_id);
create index if not exists idx_tiendas_cliente on public.tiendas(cliente_id);

alter table public.tiendas enable row level security;

drop policy if exists tiendas_tenant on public.tiendas;
create policy tiendas_tenant on public.tiendas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());
