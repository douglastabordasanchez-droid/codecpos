-- Multi-tienda para clientes con varias instalaciones independientes (ej. un
-- dueño con 6 piñaterías, cada una su propia licencia/instalación Electron,
-- cada una un cliente_id distinto). Objetivo de esta fase: el dueño entra a
-- la app móvil con SU usuario y puede elegir, desde un selector, cuál de sus
-- tiendas quiere VER — ventas, gastos, devoluciones — sin poder operar ni
-- modificar nada de una tienda en la que no está físicamente. Fases
-- posteriores (fuera de esta migración): pantalla en el Panel de
-- Desarrollador para vincular instalaciones, y el selector en la PWA.
--
-- No confundir con el "Multitienda" que ya existe en Electron
-- (multitiendaService.ts / tiendas_pwa) — eso es UNA instalación con varios
-- mostradores que comparten catálogo; esto es VARIAS instalaciones
-- independientes bajo un mismo dueño real. Cosas distintas, esta migración
-- no toca esa tabla ni ese flujo.
--
-- Diseño deliberadamente aditivo y de solo lectura, para el menor riesgo
-- posible en un cambio que toca el aislamiento entre clientes:
--   1) Tabla nueva `tiendas_vinculadas` — el único lugar donde se declara
--      "el dueño de cliente_id A también puede VER cliente_id B". Sin
--      policies para anon/authenticated: nadie puede vincularse tiendas a
--      sí mismo ni ver quién está vinculado con quién salvo el staff de
--      Codec Studio (mismo patrón `es_staff_codec` que ya usa
--      clientes_pos_self_or_staff_update en la migración 0009).
--   2) Dos funciones security definer de solo lectura que exponen
--      ÚNICAMENTE cliente_id + nombre_negocio de las tiendas permitidas —
--      nunca columnas sensibles de clientes_pos (ej. webhook_token).
--   3) Policies NUEVAS de SELECT (no reemplazan ninguna existente) en
--      ventas/gastos/devoluciones. En RLS de Postgres, varias policies
--      permisivas para el mismo comando se combinan con OR — así que esto
--      SOLO amplía qué se puede LEER cuando hay un vínculo; las policies
--      "for all" ya existentes siguen siendo las únicas que gobiernan
--      INSERT/UPDATE/DELETE, intactas. Una tienda vinculada nunca puede
--      escribir sobre datos de otra, solo verlos.

create table if not exists public.tiendas_vinculadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id_propietario uuid not null references public.clientes_pos(id) on delete cascade,
  cliente_id_tienda uuid not null references public.clientes_pos(id) on delete cascade,
  creado_por_nombre text,
  created_at timestamptz not null default now(),
  constraint tiendas_vinculadas_no_self check (cliente_id_propietario <> cliente_id_tienda),
  constraint tiendas_vinculadas_unica unique (cliente_id_propietario, cliente_id_tienda)
);
create index if not exists idx_tiendas_vinculadas_propietario on public.tiendas_vinculadas(cliente_id_propietario);

alter table public.tiendas_vinculadas enable row level security;

-- Solo staff de Codec Studio administra vínculos (pantalla futura en el
-- Panel de Desarrollador) — ningún negocio puede auto-vincularse tiendas.
create policy tiendas_vinculadas_staff_select on public.tiendas_vinculadas
  for select using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );
create policy tiendas_vinculadas_staff_insert on public.tiendas_vinculadas
  for insert with check (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );
create policy tiendas_vinculadas_staff_delete on public.tiendas_vinculadas
  for delete using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

-- Set de cliente_id que el usuario actual puede VER: el suyo propio + los
-- vinculados como propietario. security definer porque tiendas_vinculadas no
-- tiene policy de select para el usuario final (ver arriba).
create or replace function public.mis_cliente_ids_permitidos()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_cliente_id()
  union
  select tv.cliente_id_tienda
  from public.tiendas_vinculadas tv
  where tv.cliente_id_propietario = public.current_cliente_id();
$$;
grant execute on function public.mis_cliente_ids_permitidos() to authenticated;

-- Lista para el selector de tienda de la PWA: solo id + nombre + si es la
-- propia — nunca columnas sensibles de clientes_pos.
create or replace function public.mis_tiendas_para_selector()
returns table (cliente_id uuid, nombre_negocio text, es_propia boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre_negocio, (c.id = public.current_cliente_id()) as es_propia
  from public.clientes_pos c
  where c.id in (select public.mis_cliente_ids_permitidos())
  order by es_propia desc, c.nombre_negocio;
$$;
grant execute on function public.mis_tiendas_para_selector() to authenticated;

-- Policies aditivas de solo lectura — ver nota de diseño arriba.
create policy ventas_lectura_multi_tienda on public.ventas
  for select to authenticated
  using (cliente_id in (select public.mis_cliente_ids_permitidos()));

create policy gastos_lectura_multi_tienda on public.gastos
  for select to authenticated
  using (cliente_id in (select public.mis_cliente_ids_permitidos()));

create policy devoluciones_lectura_multi_tienda on public.devoluciones
  for select to authenticated
  using (cliente_id in (select public.mis_cliente_ids_permitidos()));
