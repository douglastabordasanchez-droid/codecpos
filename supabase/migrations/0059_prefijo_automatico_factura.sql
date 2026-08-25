-- Prefijo de factura automático por instalación (caja), para que dos cajas
-- del mismo dueño (mismo cliente_id, varias instalaciones Electron) nunca
-- generen el mismo número de factura, sin que el dueño tenga que escribir
-- nada a mano y sin depender de una llamada a Supabase por venta.
--
-- Diseño: dos códigos cortos que se concatenan.
--   1) `clientes_pos.codigo_corto` -- se asigna UNA vez, al crearse el
--      negocio (cualquier INSERT en clientes_pos: registro público,
--      creación manual desde el Admin Web, etc. -- por eso es un trigger de
--      tabla y no un cambio en cada función que inserta ahí). Viene de una
--      secuencia global (nextval nunca repite, ni bajo inserciones
--      concurrentes), codificada en base36 para que sea corta.
--   2) `instalaciones.codigo_caja` -- se asigna la primera vez que una caja
--      física (machine_id) se registra, secuencial DENTRO de ese negocio
--      (1, 2, 3...). Un `pg_advisory_xact_lock` evita que dos cajas nuevas
--      registrándose en el mismo instante del mismo negocio reciban el
--      mismo número.
--
-- El prefijo final (ej. "A7K01") lo arma `registrar_instalacion` y lo
-- devuelve al Electron que lo llama -- éste decide si lo aplica (ver
-- useRegistrarInstalacion.ts: solo lo usa como respaldo si el negocio nunca
-- configuró su propio prefijo a mano, nunca pisa una elección manual ya
-- guardada).

begin;

create sequence if not exists public.clientes_pos_codigo_seq start 100;

create or replace function public.int_to_base36(n bigint)
returns text
language plpgsql
immutable
as $$
declare
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  resultado text := '';
  resto int;
begin
  if n <= 0 then return '0'; end if;
  while n > 0 loop
    resto := n % 36;
    resultado := substr(chars, resto + 1, 1) || resultado;
    n := n / 36;
  end loop;
  return resultado;
end;
$$;

alter table public.clientes_pos add column if not exists codigo_corto text;

create or replace function public.asignar_codigo_corto_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.codigo_corto is null then
    new.codigo_corto := public.int_to_base36(nextval('public.clientes_pos_codigo_seq'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignar_codigo_corto_cliente on public.clientes_pos;
create trigger trg_asignar_codigo_corto_cliente
  before insert on public.clientes_pos
  for each row execute function public.asignar_codigo_corto_cliente();

-- Backfill: negocios creados antes de esta migración también reciben su
-- código, para que el mecanismo funcione igual con instalaciones nuevas de
-- un cliente ya existente.
update public.clientes_pos set codigo_corto = public.int_to_base36(nextval('public.clientes_pos_codigo_seq'))
where codigo_corto is null;

alter table public.clientes_pos alter column codigo_corto set not null;
create unique index if not exists idx_clientes_pos_codigo_corto on public.clientes_pos(codigo_corto);

-- ── Número de caja por instalación ──────────────────────────────────────
alter table public.instalaciones add column if not exists codigo_caja int;
create unique index if not exists idx_instalaciones_cliente_codigo_caja
  on public.instalaciones(cliente_id, codigo_caja) where codigo_caja is not null;

-- Reemplaza registrar_instalacion: mismo comportamiento de antes (upsert
-- por machine_id+tipo) más la asignación/devolución del prefijo. Cambia el
-- tipo de retorno (antes uuid solo), así que hay que borrar la versión
-- anterior explícitamente.
drop function if exists public.registrar_instalacion(text, text, text, uuid);

create or replace function public.registrar_instalacion(
  p_machine_id text,
  p_tipo text,
  p_version text default null,
  p_sucursal_id uuid default null
)
returns table(id uuid, codigo_caja int, prefijo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
  v_codigo_corto text;
  v_id uuid;
  v_codigo_caja int;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null then
    raise exception 'No autorizado';
  end if;
  if p_tipo not in ('ELECTRON', 'PWA') then
    raise exception 'Tipo de instalación desconocido: %', p_tipo;
  end if;

  select i.id, i.codigo_caja into v_id, v_codigo_caja
  from public.instalaciones i
  where i.cliente_id = v_cliente_id and i.machine_id = p_machine_id and i.tipo = p_tipo;

  if v_id is not null then
    update public.instalaciones set
      version = coalesce(p_version, version),
      sucursal_id = coalesce(p_sucursal_id, sucursal_id),
      estado = 'ACTIVA',
      ultima_conexion = now()
    where id = v_id;
  else
    -- Serializa la asignación del siguiente número de caja por negocio:
    -- sin este lock, dos cajas nuevas del mismo cliente_id registrándose
    -- en el mismo instante podrían leer el mismo max()+1.
    perform pg_advisory_xact_lock(hashtext(v_cliente_id::text));

    select coalesce(max(i.codigo_caja), 0) + 1 into v_codigo_caja
    from public.instalaciones i where i.cliente_id = v_cliente_id;

    insert into public.instalaciones (cliente_id, sucursal_id, machine_id, tipo, version, estado, activada_en, ultima_conexion, codigo_caja)
    values (v_cliente_id, p_sucursal_id, p_machine_id, p_tipo, p_version, 'ACTIVA', now(), now(), v_codigo_caja)
    returning id into v_id;
  end if;

  select c.codigo_corto into v_codigo_corto from public.clientes_pos c where c.id = v_cliente_id;

  return query select v_id, v_codigo_caja, (v_codigo_corto || lpad(v_codigo_caja::text, 2, '0'));
end;
$function$;

revoke all on function public.registrar_instalacion(text, text, text, uuid) from public, anon;
grant execute on function public.registrar_instalacion(text, text, text, uuid) to authenticated;

commit;
