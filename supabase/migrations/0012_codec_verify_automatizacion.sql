-- Codec Verify — puente de automatización (correo/SMS vía Tasker o Apps
-- Script) hacia notificaciones_pago. Cada negocio tiene un token secreto
-- propio: solo quien lo conozca (el dueño, al configurar su puente) puede
-- registrar pagos "automáticos" para ese negocio. RPC en vez de Edge
-- Function: mismo patrón ya probado en descontar_stock_producto /
-- procesar_devolucion_movil, sin depender de desplegar infraestructura
-- adicional.

alter table public.clientes_pos
  add column if not exists webhook_token text;

create unique index if not exists clientes_pos_webhook_token_key
  on public.clientes_pos(webhook_token) where webhook_token is not null;

create or replace function public.rotar_webhook_token(p_cliente_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  v_token := 'wh_' || replace(gen_random_uuid()::text, '-', '');
  update public.clientes_pos set webhook_token = v_token where id = p_cliente_id;
  return v_token;
end;
$$;
grant execute on function public.rotar_webhook_token(uuid) to authenticated;

-- security definer + grant a "anon": el propio secreto del token ES el
-- control de acceso (igual que un webhook secret de Stripe/Mailgun) — la
-- llamada llega sin sesión de usuario porque la origina Tasker/Apps Script,
-- no un empleado logueado.
create or replace function public.registrar_pago_automatico(
  p_token text,
  p_monto numeric,
  p_entidad text,
  p_referencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  select id into v_cliente_id from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto inválido';
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (v_cliente_id, p_monto, coalesce(p_entidad, 'otro'), p_referencia, 'automatizacion', 'confirmado');
end;
$$;
grant execute on function public.registrar_pago_automatico(text, numeric, text, text) to anon;
