-- Respaldo por IA para registrar_pago_automatico: cuando el regex de esa
-- función (0045) no logra extraer un monto y lanza excepción, la app Android
-- (PagoNotificationListenerService) llama a la Edge Function
-- `interpretar-pago-ia`, que le pide a un modelo de lenguaje que interprete
-- el texto y, si está seguro, llama a ESTA función con el monto YA
-- numérico — sin repetir ningún regex, para no duplicar esa lógica en dos
-- lugares. Mismo modelo de seguridad que registrar_pago_automatico: el
-- webhook_token es el único control de acceso (ver advertencia ya existente
-- en la UI de "Automatización de pagos" sobre ese token).
create or replace function public.registrar_pago_automatico_monto_confirmado(
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
    raise exception 'Monto inválido: %', p_monto;
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (
    v_cliente_id,
    p_monto,
    coalesce(p_entidad, 'otro'),
    coalesce(p_referencia, 'Monto interpretado por IA (el regex no pudo extraerlo)'),
    'automatizacion',
    'confirmado'
  );
end;
$$;

grant execute on function public.registrar_pago_automatico_monto_confirmado(text, numeric, text, text) to anon;
