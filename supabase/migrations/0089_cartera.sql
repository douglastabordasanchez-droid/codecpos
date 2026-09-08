-- Cartera (ventas a crédito) bidireccional Electron<->PWA. Hoy "cartera" es
-- 100% local en Electron (carteraService.ts, IndexedDB) -- esta tabla es la
-- única pieza de nube necesaria para que el mismo saldo/abonos se vean y se
-- puedan editar desde ambas plataformas. Diseño deliberadamente simple (una
-- sola tabla, abonos como jsonb embebido, "gana el más reciente" por
-- updated_at) en vez de una tabla de abonos aparte -- decisión explícita del
-- usuario para minimizar almacenamiento/complejidad; el riesgo aceptado es
-- que un abono registrado en Electron y otro en la PWA sobre la MISMA cuenta
-- en la misma ventana de sync (~30s) puede perder uno de los dos.
--
-- Mismo patrón tenant-scoped que `ventas` (0001): cliente_id = current_cliente_id().
-- `local_id` nulo = fila creada desde la PWA (Electron la "hala" en el pull,
-- igual que ya hace con `ventas`/`gastos`); no nulo = creada/actualizada por
-- una instalación de Electron.

create table public.cuentas_cartera (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text,
  venta_local_id text,
  numero_factura text,
  cliente_cartera_nombre text not null,
  cliente_cartera_telefono text,
  cliente_cartera_documento text,
  total numeric(12,2) not null,
  total_abonado numeric(12,2) not null default 0,
  saldo numeric(12,2) not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagada', 'vencida')),
  fecha_venta timestamptz not null default now(),
  fecha_vencimiento timestamptz not null,
  dias_credito integer not null default 30,
  fecha_pago_completo timestamptz,
  usuario_creador text,
  notas text,
  abonos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, local_id)
);
create index idx_cuentas_cartera_cliente on public.cuentas_cartera(cliente_id, updated_at);

alter table public.cuentas_cartera enable row level security;
create policy cuentas_cartera_tenant on public.cuentas_cartera
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());
