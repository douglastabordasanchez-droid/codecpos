-- Notificaciones push de pagos (Codec Verify) para la web y el celular,
-- incluido el iPhone (web agregada a la pantalla de inicio, iOS 16.4+), y
-- apoyo a la entrada de pagos desde el iPhone (Atajos → codec-verify-entrada).
--
-- Flujo: cada pago nuevo en notificaciones_pago dispara (pg_net) la Edge
-- Function `push-pago`, que envía la notificación a todos los dispositivos
-- del negocio suscritos. Así suena aunque la web esté cerrada, y el pago
-- llega igual a Electron, la web y la app (esos ya escuchan en tiempo real).

create extension if not exists pg_net with schema extensions;

-- ── Suscripciones ──────────────────────────────────────────────────────────
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  plataforma text,            -- iphone, android, computador
  user_agent text,
  activa boolean not null default true,
  fallos integer not null default 0,
  ultimo_envio timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_suscripciones_cliente_idx on public.push_suscripciones (cliente_id) where activa;

alter table public.push_suscripciones enable row level security;
drop policy if exists push_suscripciones_propias on public.push_suscripciones;
create policy push_suscripciones_propias on public.push_suscripciones
  for select to authenticated using (empleado_id = auth.uid());
revoke all on public.push_suscripciones from anon;
revoke insert, update, delete on public.push_suscripciones from authenticated;
grant select on public.push_suscripciones to authenticated;

-- Guarda (o reactiva) la suscripción de ESTE dispositivo para el usuario que llama.
create or replace function public.guardar_suscripcion_push(
  p_endpoint text, p_p256dh text, p_auth text, p_plataforma text default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
begin
  select cliente_id into v_cliente from public.empleados where id = auth.uid() and activo;
  if v_cliente is null then
    raise exception 'Sesión inválida';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción push inválida';
  end if;
  insert into public.push_suscripciones (cliente_id, empleado_id, endpoint, p256dh, auth, plataforma, user_agent)
  values (v_cliente, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_plataforma, 20), left(p_user_agent, 300))
  on conflict (endpoint) do update
    set cliente_id = excluded.cliente_id, empleado_id = excluded.empleado_id, p256dh = excluded.p256dh,
        auth = excluded.auth, plataforma = excluded.plataforma, user_agent = excluded.user_agent,
        activa = true, fallos = 0, updated_at = now();
end;
$$;

create or replace function public.eliminar_suscripcion_push(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_suscripciones where endpoint = p_endpoint and empleado_id = auth.uid();
$$;

revoke execute on function public.guardar_suscripcion_push(text, text, text, text, text) from public, anon;
revoke execute on function public.eliminar_suscripcion_push(text) from public, anon;
grant execute on function public.guardar_suscripcion_push(text, text, text, text, text) to authenticated;
grant execute on function public.eliminar_suscripcion_push(text) to authenticated;

-- ── Secreto compartido entre el disparador y la Edge Function ─────────────
-- Se genera aquí (nunca queda en el repositorio) y se guarda cifrado en Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_trigger_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'push_trigger_secret', 'Autoriza al disparador de pagos a llamar push-pago');
  end if;
end $$;

-- ── Disparador: cada pago nuevo avisa a push-pago ─────────────────────────
create or replace function public.notificar_push_pago()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secreto text;
begin
  -- Sin suscriptores en el negocio no se llama a nadie.
  if not exists (select 1 from public.push_suscripciones where cliente_id = new.cliente_id and activa) then
    return new;
  end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'push_trigger_secret';
  perform net.http_post(
    url := 'https://ophsckohhjajcsqniqvw.supabase.co/functions/v1/push-pago',
    body := jsonb_build_object(
      'id', new.id, 'cliente_id', new.cliente_id, 'monto', new.monto, 'entidad', new.entidad,
      'referencia', new.referencia, 'origen', new.origen, 'estado', new.estado
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secreto, '')),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  -- Un fallo del aviso nunca debe impedir registrar el pago.
  raise warning 'notificar_push_pago: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notificaciones_pago_push on public.notificaciones_pago;
create trigger notificaciones_pago_push
  after insert on public.notificaciones_pago
  for each row execute function public.notificar_push_pago();
