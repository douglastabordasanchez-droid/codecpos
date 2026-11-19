-- 0161: almuerzo del día.
--
-- El administrador publica en la mañana las opciones del almuerzo (sopa,
-- principio, proteína, jugo…) y el mesero, al pedir «ALMUERZO DEL DÍA», elige
-- una de cada grupo; la elección viaja como nota a la estación.
-- Una fila por negocio: se sobrescribe cada día (fecha dice de qué día es).

create table if not exists public.menu_del_dia (
  cliente_id uuid primary key references public.clientes_pos(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  producto_local_id text,
  grupos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.menu_del_dia enable row level security;

drop policy if exists menu_del_dia_select on public.menu_del_dia;
create policy menu_del_dia_select on public.menu_del_dia
  for select using (cliente_id = (select public.current_cliente_id()));

drop policy if exists menu_del_dia_insert on public.menu_del_dia;
create policy menu_del_dia_insert on public.menu_del_dia
  for insert with check (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()));

drop policy if exists menu_del_dia_update on public.menu_del_dia;
create policy menu_del_dia_update on public.menu_del_dia
  for update using (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()))
  with check (cliente_id = (select public.current_cliente_id()) and (select public.current_empleado_es_admin()));

grant select, insert, update on public.menu_del_dia to authenticated;
