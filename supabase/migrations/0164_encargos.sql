-- 0164: encargos (tortas por pedido) con abonos.
--
-- Alguien pide una torta de $50.000 y abona $25.000: queda el encargo con el
-- cliente, el tipo de torta, cómo la quiere, el día y la hora de entrega, el
-- total y los abonos. Los abonos y el saldo se COBRAN por la caja normal (así
-- cuadran en el cierre); aquí queda la constancia. Se ve en la caja, la
-- terminal y el celular del negocio.

create table if not exists public.encargos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  tienda_id text,
  cliente_nombre text not null,
  cliente_telefono text,
  tipo text not null default 'Torta',
  detalle text,
  fecha_entrega date not null,
  hora_entrega time,
  total numeric not null default 0 check (total >= 0),
  abonos jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'lista', 'entregada', 'cancelada')),
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists encargos_cliente_fecha on public.encargos (cliente_id, fecha_entrega, hora_entrega);

alter table public.encargos enable row level security;
drop policy if exists encargos_tenant on public.encargos;
create policy encargos_tenant on public.encargos
  for all using (cliente_id = (select public.current_cliente_id()))
  with check (cliente_id = (select public.current_cliente_id()));
grant select, insert, update, delete on public.encargos to authenticated;

-- En vivo: un encargo creado en la caja aparece en el celular y en la terminal.
do $$ begin
  alter publication supabase_realtime add table public.encargos;
exception when others then null;
end $$;
