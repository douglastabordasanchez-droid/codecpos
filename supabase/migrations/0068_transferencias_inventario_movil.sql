-- Transferencias de inventario ENTRE SUCURSALES de un mismo negocio
-- (multitiendaService.ts en Electron -- "tienda_principal" + tiendas
-- secundarias, 100% local en localStorage hasta ahora) creadas desde la PWA.
--
-- Caso real: el dueño no está en el local, lo llaman para pasar mercancía de
-- una sucursal a otra, y hoy no puede hacerlo si no está frente al Electron.
--
-- No confundir con `tiendas_vinculadas` (migración 0045) -- eso es MÚLTIPLES
-- INSTALACIONES/cliente_id independientes de un mismo dueño (solo lectura,
-- sin transferencias posibles: son negocios/catálogos distintos). Esto es
-- UNA instalación con varias sucursales que comparten catálogo.
--
-- Diseño: como el stock por sucursal vive en localStorage de Electron
-- (`multitienda_stock`), Electron sigue siendo la única fuente de verdad que
-- EJECUTA transferencias (reusa ejecutarTransferencia(), ya probada). La PWA
-- solo puede: 1) ver el stock por tienda (espejo de lectura que Electron
-- sube en cada sync) y 2) crear una SOLICITUD; Electron la recoge en su
-- próximo ciclo de sync (cada 30s) y la ejecuta.

-- ============================================================
-- Espejo de lectura: stock por tienda (solo tiendas NO principales -- la
-- principal ya se ve vía productos.stock, que ya sincroniza).
-- ============================================================
create table public.tiendas_stock (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tienda_id text not null,
  tienda_nombre text,
  producto_id uuid not null references public.productos(id) on delete cascade,
  cantidad integer not null default 0,
  actualizado_en timestamptz not null default now(),
  unique (cliente_id, tienda_id, producto_id)
);
create index idx_tiendas_stock_cliente_tienda on public.tiendas_stock(cliente_id, tienda_id);

alter table public.tiendas_stock enable row level security;
create policy tiendas_stock_tenant on public.tiendas_stock
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter publication supabase_realtime add table public.tiendas_stock;

-- ============================================================
-- Solicitudes de transferencia creadas desde la PWA.
-- ============================================================
create table public.solicitudes_transferencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tienda_origen_id text not null,
  tienda_origen_nombre text,
  tienda_destino_id text not null,
  tienda_destino_nombre text,
  items jsonb not null, -- [{producto_id uuid, producto_nombre text, cantidad int}]
  notas text,
  estado text not null default 'pendiente' check (estado in ('pendiente','completada','error')),
  error_mensaje text,
  solicitado_por uuid references public.empleados(id),
  solicitado_por_nombre text,
  creado_en timestamptz not null default now(),
  procesado_en timestamptz
);
create index idx_solicitudes_transferencia_cliente_estado on public.solicitudes_transferencia(cliente_id, estado);

alter table public.solicitudes_transferencia enable row level security;
create policy solicitudes_transferencia_tenant on public.solicitudes_transferencia
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter publication supabase_realtime add table public.solicitudes_transferencia;
