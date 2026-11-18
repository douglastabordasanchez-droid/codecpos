-- ============================================================================
-- Servicio técnico conectado entre cajas, web y celular.
--
-- 1. Número de orden único por negocio. Cada PC numeraba con su propio
--    contador (OS-2026-0001 en los dos), y la orden del otro PC no entraba
--    en el equipo que ya tenía ese número. Ahora el número lo da la nube.
-- 2. updated_at lo pone el servidor. Cada equipo bajaba "lo cambiado desde
--    la última vez" comparando con la hora de la nube, pero la hora la
--    escribía cada equipo con su reloj: un PC con el reloj atrasado subía
--    cambios que los demás nunca bajaban.
-- 3. Borrar una orden viaja a los demás equipos (marca `eliminada`).
-- ============================================================================

alter table public.taller_ordenes
  add column if not exists eliminada boolean not null default false;

-- ── Hora del servidor ───────────────────────────────────────────────────────
create or replace function public.taller_ordenes_hora_servidor()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_taller_ordenes_hora_servidor on public.taller_ordenes;
create trigger trg_taller_ordenes_hora_servidor
  before insert or update on public.taller_ordenes
  for each row execute function public.taller_ordenes_hora_servidor();

-- ── Consecutivo de órdenes ──────────────────────────────────────────────────
create table if not exists public.taller_consecutivos (
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  anio int not null,
  ultimo int not null default 0,
  primary key (cliente_id, anio)
);

alter table public.taller_consecutivos enable row level security;
drop policy if exists taller_consecutivos_tenant on public.taller_consecutivos;
create policy taller_consecutivos_tenant on public.taller_consecutivos
  for select using (cliente_id = public.current_cliente_id());

-- Devuelve el siguiente número (OS-AAAA-0001) del negocio de quien llama.
-- Nunca devuelve uno ya usado: arranca desde el mayor que exista en la nube,
-- incluidas las órdenes que un PC numeró sin internet.
create or replace function public.siguiente_numero_orden_taller()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_anio int := extract(year from (now() at time zone 'America/Bogota'))::int;
  v_max int;
  v_siguiente int;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null then
    raise exception 'Esta sesión no está vinculada a ningún negocio';
  end if;

  select coalesce(max((regexp_match(numero_orden, '^OS-' || v_anio || '-[A-Z]?(\d+)'))[1]::int), 0)
    into v_max
    from public.taller_ordenes
   where cliente_id = v_cliente_id
     and numero_orden like 'OS-' || v_anio || '-%';

  insert into public.taller_consecutivos as c (cliente_id, anio, ultimo)
  values (v_cliente_id, v_anio, v_max + 1)
  on conflict (cliente_id, anio)
  do update set ultimo = greatest(c.ultimo, v_max) + 1
  returning ultimo into v_siguiente;

  return 'OS-' || v_anio || '-' || lpad(v_siguiente::text, 4, '0');
end;
$$;

grant execute on function public.siguiente_numero_orden_taller() to authenticated;
