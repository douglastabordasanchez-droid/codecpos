-- Codec Verify: registro de cada aviso que llega (o que falla) desde el
-- celular Android, el iPhone (Atajos) o el correo, para poder ver en
-- Configuración si el aviso del banco llegó, se registró o por qué no.
-- Antes un aviso que no se podía leer se perdía sin dejar rastro.

create table if not exists public.codec_verify_eventos (
  id bigserial primary key,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  created_at timestamptz not null default now(),
  origen text not null default 'android',      -- android, iphone, correo
  entidad text,
  monto numeric,
  resultado text not null,                      -- registrado, no_leido, ignorado, error
  detalle text,
  texto text
);
create index if not exists codec_verify_eventos_cliente_idx on public.codec_verify_eventos (cliente_id, created_at desc);

alter table public.codec_verify_eventos enable row level security;
drop policy if exists codec_verify_eventos_tenant on public.codec_verify_eventos;
create policy codec_verify_eventos_tenant on public.codec_verify_eventos
  for select to authenticated using (cliente_id = public.current_cliente_id());
revoke all on public.codec_verify_eventos from anon;
revoke insert, update, delete on public.codec_verify_eventos from authenticated;
grant select on public.codec_verify_eventos to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'codec_verify_eventos') then
    alter publication supabase_realtime add table public.codec_verify_eventos;
  end if;
exception when undefined_object then null;
end $$;

create or replace function public._guardar_evento_codec_verify(
  p_cliente uuid, p_origen text, p_entidad text, p_monto numeric, p_resultado text, p_detalle text, p_texto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.codec_verify_eventos (cliente_id, origen, entidad, monto, resultado, detalle, texto)
  values (p_cliente, left(coalesce(p_origen, 'android'), 20), left(p_entidad, 30), p_monto, left(p_resultado, 20), left(p_detalle, 300), left(p_texto, 300));
  -- Solo se conservan los últimos 300 avisos por negocio.
  delete from public.codec_verify_eventos
  where cliente_id = p_cliente
    and id < (select min(id) from (select id from public.codec_verify_eventos where cliente_id = p_cliente order by id desc limit 300) t);
end;
$$;
revoke all on function public._guardar_evento_codec_verify(uuid, text, text, numeric, text, text, text) from public, anon, authenticated;

-- Para que el celular / el iPhone dejen constancia de un aviso que no se pudo registrar.
create or replace function public.registrar_evento_codec_verify(
  p_token text, p_origen text, p_entidad text, p_resultado text, p_detalle text default null, p_texto text default null, p_monto numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from public.clientes_pos where webhook_token = p_token;
  if v_cliente is null then
    raise exception 'Token de automatización inválido';
  end if;
  perform public._guardar_evento_codec_verify(v_cliente, p_origen, p_entidad, p_monto, p_resultado, p_detalle, p_texto);
end;
$$;
grant execute on function public.registrar_evento_codec_verify(text, text, text, text, text, text, numeric) to anon, authenticated;

-- registrar_pago_automatico: misma lógica probada, más palabras de dinero
-- entrante ("te consignaron", "abonaron", "te llegó") y deja constancia del
-- aviso registrado. p_origen es opcional (Android no lo manda).
drop function if exists public.registrar_pago_automatico(text, text, text, text);
create or replace function public.registrar_pago_automatico(
  p_token text, p_monto text, p_entidad text, p_referencia text default null, p_origen text default 'android'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
  v_texto text;
  v_monto_texto text;
  v_monto numeric;
begin
  select id into v_cliente_id from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;

  v_texto := coalesce(p_monto, '');

  -- Blindaje: nunca registrar como pago recibido una transacción SALIENTE.
  if v_texto ~* '\y(transferiste|enviaste|pagaste|retiraste|compraste)\y' then
    raise exception 'Notificación de transacción saliente, no se registra como pago recibido: %', v_texto;
  end if;

  -- 1) Número justo después de una palabra de dinero entrante.
  v_monto_texto := substring(
    v_texto from
    '(?i)(?:recib\w*|enviaron|envi[oó]|transfirieron|pagaron|deposit\w*|consign\w*|abon\w*|te\s+lleg\w*|ingres\w*)\D{0,80}\$?\s?([0-9][0-9.,]*)'
  );
  -- 2) Cualquier "$<número>".
  if v_monto_texto is null then
    v_monto_texto := substring(v_texto from '\$\s?([0-9][0-9.,]*)');
  end if;
  -- 3) Primera racha de al menos 4 dígitos/separadores.
  if v_monto_texto is null then
    v_monto_texto := substring(v_texto from '([0-9][0-9.,]{3,})');
  end if;

  if v_monto_texto is null then
    raise exception 'No se pudo extraer el monto del texto recibido: %', p_monto;
  end if;

  if v_monto_texto ~ ',\d{2}$' then
    v_monto := replace(replace(v_monto_texto, '.', ''), ',', '.')::numeric;
  elsif v_monto_texto ~ '\.\d{2}$' then
    v_monto := replace(v_monto_texto, ',', '')::numeric;
  else
    v_monto := replace(replace(v_monto_texto, '.', ''), ',', '')::numeric;
  end if;

  if v_monto is null or v_monto <= 0 then
    raise exception 'Monto inválido extraído: %', v_monto_texto;
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (v_cliente_id, v_monto, coalesce(p_entidad, 'otro'), coalesce(p_referencia, left(p_monto, 300)), 'automatizacion', 'confirmado');

  perform public._guardar_evento_codec_verify(v_cliente_id, p_origen, p_entidad, v_monto, 'registrado', null, v_texto);
end;
$function$;
grant execute on function public.registrar_pago_automatico(text, text, text, text, text) to anon, authenticated;
