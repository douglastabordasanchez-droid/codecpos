-- Fase de paridad móvil: Gastos y Devoluciones existen en Electron pero solo
-- viven en localStorage ('pos-gastos', sin bridge; devoluciones ni siquiera
-- se persisten fuera de la sesión). Se agregan aquí como tablas operativas
-- reales, mismo patrón multi-tenant (cliente_id + RLS) que productos/ventas.

-- ============================================================
-- GASTOS
-- ============================================================
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  local_id text,
  fecha timestamptz not null default now(),
  descripcion text not null,
  categoria text not null default 'otros',
  monto numeric(12,2) not null default 0,
  medio_pago text not null default 'efectivo',
  comprobante text,
  registrado_por uuid references public.empleados(id),
  registrado_por_nombre text,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists idx_gastos_cliente_id on public.gastos(cliente_id);
create index if not exists idx_gastos_fecha on public.gastos(fecha);
alter table public.gastos
  add constraint gastos_cliente_local_id_key unique (cliente_id, local_id);

alter table public.gastos enable row level security;
drop policy if exists gastos_tenant on public.gastos;
create policy gastos_tenant on public.gastos
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter publication supabase_realtime add table public.gastos;

-- ============================================================
-- DEVOLUCIONES + LINEAS
-- ============================================================
create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  venta_id uuid references public.ventas(id),
  numero_factura text,
  total_devolucion numeric(12,2) not null default 0,
  metodo_pago text,
  procesado_por uuid references public.empleados(id),
  procesado_por_nombre text,
  observaciones text,
  estado text not null default 'completada'
    check (estado in ('completada','pendiente','rechazada')),
  created_at timestamptz not null default now()
);
create index if not exists idx_devoluciones_cliente_id on public.devoluciones(cliente_id);

create table if not exists public.devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  producto_id uuid references public.productos(id),
  nombre text not null,
  cantidad numeric(12,2) not null,
  precio_unitario numeric(12,2) not null,
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists idx_devolucion_items_devolucion_id on public.devolucion_items(devolucion_id);

alter table public.devoluciones enable row level security;
drop policy if exists devoluciones_tenant on public.devoluciones;
create policy devoluciones_tenant on public.devoluciones
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

alter table public.devolucion_items enable row level security;
drop policy if exists devolucion_items_tenant on public.devolucion_items;
create policy devolucion_items_tenant on public.devolucion_items
  for all using (
    exists (select 1 from public.devoluciones d where d.id = devolucion_items.devolucion_id and d.cliente_id = public.current_cliente_id())
  )
  with check (
    exists (select 1 from public.devoluciones d where d.id = devolucion_items.devolucion_id and d.cliente_id = public.current_cliente_id())
  );

alter publication supabase_realtime add table public.devoluciones;

-- ============================================================
-- RPC: procesar una devolución móvil devolviendo stock atómicamente
-- (misma razón que descontar_stock_producto en 0010: evita
-- read-then-write desde el cliente).
-- ============================================================
create or replace function public.procesar_devolucion_movil(
  p_cliente_id uuid,
  p_venta_id uuid,
  p_numero_factura text,
  p_metodo_pago text,
  p_observaciones text,
  p_procesado_por uuid,
  p_procesado_por_nombre text,
  p_items jsonb -- [{producto_id, nombre, cantidad, precio_unitario, motivo}]
)
returns uuid
language plpgsql
as $$
declare
  v_devolucion_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
begin
  select coalesce(sum((it->>'cantidad')::numeric * (it->>'precio_unitario')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_items) it;

  insert into public.devoluciones (
    cliente_id, venta_id, numero_factura, total_devolucion, metodo_pago,
    procesado_por, procesado_por_nombre, observaciones
  ) values (
    p_cliente_id, p_venta_id, p_numero_factura, v_total, p_metodo_pago,
    p_procesado_por, p_procesado_por_nombre, p_observaciones
  ) returning id into v_devolucion_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.devolucion_items (devolucion_id, producto_id, nombre, cantidad, precio_unitario, motivo)
    values (
      v_devolucion_id,
      nullif(v_item->>'producto_id', '')::uuid,
      v_item->>'nombre',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      v_item->>'motivo'
    );

    if (v_item->>'producto_id') is not null and (v_item->>'producto_id') != '' then
      update public.productos
      set stock = stock + (v_item->>'cantidad')::numeric, updated_at = now()
      where id = (v_item->>'producto_id')::uuid;
    end if;
  end loop;

  return v_devolucion_id;
end;
$$;

grant execute on function public.procesar_devolucion_movil(uuid, uuid, text, text, text, uuid, text, jsonb) to authenticated;
