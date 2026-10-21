-- 0122 · "Mi contador": Codec POS envía sus ventas y facturas electrónicas a
-- Codec Document (módulo Contabilidad del contador). Fase 1.
--
-- Acuerdo con Codec Document (lado del contador, otro proyecto):
--   · El contador genera un código en Codec Document; el negocio lo pega en
--     Configuración › Mi contador. pos-vincular devuelve un token cdp_… que
--     se muestra una sola vez: aquí se guarda CIFRADO (Edge Function
--     contador-sync, secreto CONTADOR_TOKEN_KEY) y ninguna sesión de cliente
--     lo puede leer.
--   · Se envía de nube a nube: las ventas de Electron, web y celular ya
--     llegan a esta base; un cron despierta a contador-sync cada minuto y
--     ella manda lotes de hasta 200 eventos a pos-ingesta.
--   · Cada evento tiene id_origen único (uuid de la venta o de la factura):
--     reenviar es idempotente del otro lado.
--   · Al vincular se encola el historial desde el 1 de enero del año.
--
-- Eventos de Fase 1: venta (todas, con su detalle) y factura_electronica
-- (solo aceptadas y en producción). Gastos y cierres quedan para Fase 2.

-- ── Vínculo con el contador (uno por negocio) ───────────────────────────
create table if not exists public.contador_vinculos (
  cliente_id       uuid primary key references public.clientes_pos(id) on delete cascade,
  estado           text not null check (estado in ('activo', 'revocado', 'desvinculado')),
  empresa          text,
  contador         text,
  nit              text,
  token_cifrado    text,
  vinculado_por    uuid,
  vinculado_en     timestamptz not null default now(),
  desvinculado_en  timestamptz,
  ultimo_envio_en  timestamptz,
  ultimo_error     text,
  updated_at       timestamptz not null default now()
);

-- ── Cola de eventos ─────────────────────────────────────────────────────
create table if not exists public.contador_eventos (
  id                 bigint generated always as identity primary key,
  cliente_id         uuid not null references public.clientes_pos(id) on delete cascade,
  tipo               text not null check (tipo in ('venta', 'factura_electronica', 'anulacion')),
  id_origen          text not null,
  fecha_origen       timestamptz not null,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'enviado', 'duplicado', 'rechazado', 'cancelado')),
  intentos           integer not null default 0,
  proximo_intento_en timestamptz not null default now(),
  motivo             text,
  enviado_en         timestamptz,
  created_at         timestamptz not null default now(),
  unique (cliente_id, tipo, id_origen)
);
create index if not exists contador_eventos_pendientes_idx
  on public.contador_eventos (cliente_id, fecha_origen, id) where estado = 'pendiente';

-- Ningún cliente lee ni escribe estas tablas: solo el service role (la
-- Edge Function) y las funciones SECURITY DEFINER de abajo.
alter table public.contador_vinculos enable row level security;
alter table public.contador_eventos enable row level security;
revoke all on public.contador_vinculos from anon, authenticated;
revoke all on public.contador_eventos from anon, authenticated;

-- ── Encolar al nacer una venta o aceptarse una factura ──────────────────
create or replace function public.contador_encolar_venta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estado = 'completada' and exists (
    select 1 from public.contador_vinculos v where v.cliente_id = new.cliente_id and v.estado = 'activo'
  ) then
    -- Los ítems llegan justo después de la venta: se espera un momento
    -- antes de armar el evento para que viaje completo.
    insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen, proximo_intento_en)
    values (new.cliente_id, 'venta', new.id::text, new.created_at, now() + interval '2 minutes')
    on conflict (cliente_id, tipo, id_origen) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_contador_encolar_venta on public.ventas;
create trigger trg_contador_encolar_venta
  after insert on public.ventas
  for each row execute function public.contador_encolar_venta();

create or replace function public.contador_encolar_factura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estado = 'accepted'
     and coalesce(new.issuer_ambiente, '') = 'produccion'
     and (tg_op = 'INSERT' or old.estado is distinct from 'accepted')
     and exists (select 1 from public.contador_vinculos v where v.cliente_id = new.cliente_id and v.estado = 'activo') then
    insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
    values (new.cliente_id, 'factura_electronica', new.id::text, coalesce(new.fecha_emision, new.created_at))
    on conflict (cliente_id, tipo, id_origen) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_contador_encolar_factura on public.facturas_electronicas;
create trigger trg_contador_encolar_factura
  after insert or update of estado on public.facturas_electronicas
  for each row execute function public.contador_encolar_factura();

-- ── Historial al vincular ───────────────────────────────────────────────
-- Todo desde el 1 de enero del año en curso (hora de Colombia). Solo lo
-- llama contador-sync con el service role.
create or replace function public.contador_encolar_historial(p_cliente_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_desde timestamptz := (date_trunc('year', now() at time zone 'America/Bogota') at time zone 'America/Bogota');
  v_total integer;
begin
  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select v.cliente_id, 'venta', v.id::text, v.created_at
  from public.ventas v
  where v.cliente_id = p_cliente_id and v.estado = 'completada' and v.created_at >= v_desde
  on conflict (cliente_id, tipo, id_origen) do nothing;

  insert into public.contador_eventos (cliente_id, tipo, id_origen, fecha_origen)
  select f.cliente_id, 'factura_electronica', f.id::text, coalesce(f.fecha_emision, f.created_at)
  from public.facturas_electronicas f
  where f.cliente_id = p_cliente_id and f.estado = 'accepted' and f.issuer_ambiente = 'produccion'
    and coalesce(f.fecha_emision, f.created_at) >= v_desde
  on conflict (cliente_id, tipo, id_origen) do nothing;

  select count(*) into v_total from public.contador_eventos where cliente_id = p_cliente_id and estado = 'pendiente';
  return v_total;
end;
$function$;
revoke all on function public.contador_encolar_historial(uuid) from public, anon, authenticated;

-- ── Estado para la pantalla "Mi contador" ───────────────────────────────
-- Nunca devuelve el token.
create or replace function public.mi_contador_estado()
returns table (
  estado text, empresa text, contador text, vinculado_en timestamptz, ultimo_envio_en timestamptz,
  ultimo_error text, pendientes bigint, enviados bigint, rechazados bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.estado, v.empresa, v.contador, v.vinculado_en, v.ultimo_envio_en, v.ultimo_error,
         count(e.id) filter (where e.estado = 'pendiente'),
         count(e.id) filter (where e.estado in ('enviado', 'duplicado')),
         count(e.id) filter (where e.estado = 'rechazado')
  from public.contador_vinculos v
  left join public.contador_eventos e on e.cliente_id = v.cliente_id
  where v.cliente_id = public.current_cliente_id()
  group by v.cliente_id;
$function$;
revoke all on function public.mi_contador_estado() from public, anon;
grant execute on function public.mi_contador_estado() to authenticated;

-- ── Cron: despierta el envío cada minuto si hay algo pendiente ──────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'contador_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'contador_cron_secret', 'Autoriza al cron a llamar contador-sync');
  end if;
end $$;

create or replace function public.contador_despertar_envio()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secreto text;
begin
  if not exists (
    select 1 from public.contador_eventos e
    join public.contador_vinculos v on v.cliente_id = e.cliente_id and v.estado = 'activo'
    where e.estado = 'pendiente' and e.proximo_intento_en <= now()
  ) then
    return;
  end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'contador_cron_secret';
  perform net.http_post(
    url := 'https://ophsckohhjajcsqniqvw.supabase.co/functions/v1/contador-sync',
    body := jsonb_build_object('accion', 'despachar'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-contador-secret', coalesce(v_secreto, '')),
    timeout_milliseconds := 55000
  );
end;
$function$;
revoke all on function public.contador_despertar_envio() from public, anon, authenticated;

select cron.unschedule('contador-envio') where exists (select 1 from cron.job where jobname = 'contador-envio');
select cron.schedule('contador-envio', '* * * * *', 'select public.contador_despertar_envio()');
