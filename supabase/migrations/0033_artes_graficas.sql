-- Artes Gráficas: módulo nuevo, nativo de la nube — a diferencia de Taller o
-- Panadería (que nacieron 100% locales y necesitaron sincronización con
-- anti-eco), este módulo se crea directo contra Supabase: Electron y la app
-- móvil leen/escriben la MISMA fila, sin copia local ni cola offline. Tiene
-- sentido porque el módulo ya depende de internet para la factura dinámica
-- y (más adelante) los links de pago — no hay caso de uso realista sin red.
--
-- Precio por catálogo, no por producto suelto: cada producto trae 7 escalas
-- de cantidad (10/20/30/40/50/100/1000) × 2 variantes (marcado = con
-- logo/diseño impreso, sin marcar = en blanco) = 14 precios fijos, tal como
-- se pidió para la plantilla de Excel de este negocio.

create table if not exists public.artes_graficas_productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre text not null,
  descripcion text,
  categoria text,
  unidad text not null default 'cm' check (unidad in ('cm', 'unidad')),
  precio_marcado_10     numeric(12,2) not null default 0,
  precio_marcado_20     numeric(12,2) not null default 0,
  precio_marcado_30     numeric(12,2) not null default 0,
  precio_marcado_40     numeric(12,2) not null default 0,
  precio_marcado_50     numeric(12,2) not null default 0,
  precio_marcado_100    numeric(12,2) not null default 0,
  precio_marcado_1000   numeric(12,2) not null default 0,
  precio_sin_marcar_10   numeric(12,2) not null default 0,
  precio_sin_marcar_20   numeric(12,2) not null default 0,
  precio_sin_marcar_30   numeric(12,2) not null default 0,
  precio_sin_marcar_40   numeric(12,2) not null default 0,
  precio_sin_marcar_50   numeric(12,2) not null default 0,
  precio_sin_marcar_100  numeric(12,2) not null default 0,
  precio_sin_marcar_1000 numeric(12,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ag_productos_cliente_id on public.artes_graficas_productos(cliente_id);

-- La factura dinámica: nace con un abono (o sin él), y se termina de pagar
-- cuando el cliente recoge el producto — igual patrón anticipo/saldo que ya
-- usa Taller, pero con las 4 variantes de layout que se pidieron.
create table if not exists public.artes_graficas_ordenes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  numero_orden text not null,
  cliente_nombre text,
  cliente_telefono text,
  -- [{producto_id, producto_nombre, marcado, cantidad, unidad, precio_unitario, subtotal}]
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  abono numeric(12,2) not null default 0,
  saldo_pendiente numeric(12,2) not null default 0,
  tipo_pago text not null default 'no_abono'
    check (tipo_pago in ('abono', 'no_abono', 'retiro', 'precio_personalizado')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'abonado', 'pagado', 'retirado', 'cancelado')),
  metodo_pago text,
  -- Queda listo el campo para cuando se confirme el proveedor de pagos
  -- colombiano — hoy nadie lo llena, ninguna pantalla promete un link real.
  link_pago_url text,
  creado_por text,
  fecha_creacion timestamptz not null default now(),
  fecha_retiro timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_ag_ordenes_cliente_id on public.artes_graficas_ordenes(cliente_id);
create index if not exists idx_ag_ordenes_estado on public.artes_graficas_ordenes(cliente_id, estado);

alter table public.artes_graficas_productos enable row level security;
alter table public.artes_graficas_ordenes enable row level security;

drop policy if exists artes_graficas_productos_tenant on public.artes_graficas_productos;
create policy artes_graficas_productos_tenant on public.artes_graficas_productos
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

drop policy if exists artes_graficas_ordenes_tenant on public.artes_graficas_ordenes;
create policy artes_graficas_ordenes_tenant on public.artes_graficas_ordenes
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

-- Realtime: quien esté viendo el catálogo o el tablero de órdenes en
-- cualquiera de las dos plataformas se entera al instante.
alter publication supabase_realtime add table public.artes_graficas_productos;
alter publication supabase_realtime add table public.artes_graficas_ordenes;
