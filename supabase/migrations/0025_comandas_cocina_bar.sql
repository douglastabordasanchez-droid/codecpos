-- Comandas de Cocina/Bar — ver [[project_alimentos_bebidas_cocina_bar]]
--
-- A diferencia de `panaderia_cuentas` (la cuenta corriente de la mesa, que se
-- sobrescribe con upsert cada vez que cambia), una comanda es un pedido
-- concreto que el mesero decide enviar a preparar en un momento dado — se
-- inserta una fila nueva por cada envío, nunca se sobrescribe, y tiene un
-- ciclo de vida propio (pendiente → preparando → listo → entregado) que la
-- pantalla de Cocina/Bar actualiza a medida que prepara cada pedido.

create table if not exists public.panaderia_comandas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  mesa_local_id text not null,
  mesa_nombre text,
  items jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
  mesero_nombre text,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_panaderia_comandas_cliente
  on public.panaderia_comandas(cliente_id, estado);

alter table public.panaderia_comandas enable row level security;

drop policy if exists panaderia_comandas_tenant on public.panaderia_comandas;
create policy panaderia_comandas_tenant on public.panaderia_comandas
  for all using (cliente_id = public.current_cliente_id())
  with check (cliente_id = public.current_cliente_id());

-- Realtime: la pantalla de Cocina/Bar ve el pedido apenas el mesero lo envía,
-- y el mesero ve el cambio de estado (listo/entregado) sin refrescar.
alter publication supabase_realtime add table public.panaderia_comandas;
