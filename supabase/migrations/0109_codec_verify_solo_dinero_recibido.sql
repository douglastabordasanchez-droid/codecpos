-- Codec Verify: solo el dinero que ENTRA al negocio, y solo con Codec Verify encendido.
--
-- Problema (2026-10-05): registrar_pago_automatico solo rechazaba cinco verbos
-- de salida (transferiste, enviaste, pagaste, retiraste, compraste) y después
-- tomaba cualquier "$<número>" del aviso. Avisos como "Tu pago ha sido
-- exitoso por $50.000", "Compra aprobada en ...", "Pago realizado" o
-- "Hiciste un pago" se registraban como pagos recibidos.
--
-- Cambios:
--   1) Interruptor del negocio en la nube (clientes_pos.codec_verify_activo).
--      Apagado: no se registra nada, ni siquiera en el registro de avisos.
--      Lo cambian Electron y la web/celular, y el lector de Android lo
--      consulta antes de enviar cualquier aviso.
--   2) Clasificador clasificar_aviso_pago(texto): RECIBIDO, ENVIADO u OTRO.
--      Solo RECIBIDO se registra. Primero mira la evidencia de salida (gana
--      siempre), luego los avisos que no son movimientos (solicitudes,
--      códigos, promociones, seguridad) y por último exige una frase de
--      recepción. Sin frase de recepción no hay pago, aunque diga "pago",
--      "exitoso" o el nombre del banco.
--   3) Los avisos ignorados quedan en codec_verify_eventos con su
--      clasificación para ajustar los patrones con casos reales.
--
-- La misma lista vive en el lector de Android (ClasificadorAviso.kt) para que
-- los avisos de salida no salgan del celular; esta es la que manda.

-- 1) Interruptor del negocio -------------------------------------------------
alter table public.clientes_pos
  add column if not exists codec_verify_activo boolean not null default false,
  add column if not exists codec_verify_actualizado_en timestamptz;

-- Quien ya lo tenía encendido en algún celular lo conserva encendido.
update public.clientes_pos c
set codec_verify_activo = true, codec_verify_actualizado_en = now()
where c.codec_verify_actualizado_en is null
  and exists (select 1 from public.empleados e where e.cliente_id = c.id and e.codec_verify_activo);

create or replace function public.obtener_codec_verify_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select codec_verify_activo from public.clientes_pos where id = public.current_cliente_id()), false)
$$;
grant execute on function public.obtener_codec_verify_activo() to authenticated;

create or replace function public.cambiar_codec_verify_activo(p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := public.current_cliente_id();
begin
  if v_cliente is null then
    raise exception 'Sin negocio en la sesión';
  end if;
  update public.clientes_pos
  set codec_verify_activo = coalesce(p_activo, false), codec_verify_actualizado_en = now()
  where id = v_cliente;
  return coalesce(p_activo, false);
end;
$$;
grant execute on function public.cambiar_codec_verify_activo(boolean) to authenticated;

-- Para el lector de Android: con el webhook_token, ¿está encendido? (false si el token no existe).
create or replace function public.codec_verify_esta_activo(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select codec_verify_activo from public.clientes_pos where webhook_token = p_token), false)
$$;
grant execute on function public.codec_verify_esta_activo(text) to anon, authenticated;

-- 2) Clasificador ------------------------------------------------------------
create or replace function public.clasificar_aviso_pago(p_texto text, out clasificacion text, out motivo text)
language plpgsql
immutable
set search_path = public
as $$
declare
  t text;
  m text;
begin
  -- Minúsculas y sin tildes: "envió", "Envio" y "ENVÍO" se leen igual.
  t := lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ¡¿', 'AEIOUUNaeiouun  '));
  t := regexp_replace(t, '\s+', ' ', 'g');

  -- a) Evidencia de que el dinero SALIÓ (o el movimiento falló): gana siempre.
  m := substring(t from '(enviaste|has enviado|le enviaste|transferiste|has transferido|transferencia enviada|transferencia realizada|transferencia exitosa a|pagaste|pasaste|has pagado|has realizado un pago|realizaste|hiciste (un|una) (pago|compra|transferencia|envio|retiro)|pago realizado|pago exitoso|pago aprobado|tu pago|recibimos tu|compraste|compra (en|aprobada|rechazada|por|exitosa|realizada)|retiraste|retiro (en|de|por|exitoso)|sacaste|se debito|debitamos|debito (de|por|en|automatico)|te cobramos|cobro (de|por)|cuota de manejo|salio de tu|salida de dinero|recarga (exitosa|de)|recargaste|fondos insuficientes|saldo insuficiente|rechazad[ao]|declinad[ao]|no procesad[ao]|no fue posible|no se pudo|fallid[ao])');
  if m is not null then
    clasificacion := 'enviado';
    motivo := 'dice "' || m || '"';
    return;
  end if;

  -- b) Avisos que no son un movimiento de dinero aunque usen "recibiste" o "te enviaron".
  m := substring(t from '(solicitud|te pidi|te esta pidiendo|pidiendo plata|cobrarte|codigo de (seguridad|verificacion|acceso)|tu codigo|clave dinamica|contrasena|token|inicio de sesion|iniciaste sesion|ingresaste|nuevo dispositivo|alerta de seguridad|promo|descuento|cashback|puntos|bono de|gana |sorteo|credito aprobado|prestamo)');
  if m is not null then
    clasificacion := 'otro';
    motivo := 'no es un pago, dice "' || m || '"';
    return;
  end if;

  -- c) Evidencia de que el dinero ENTRÓ.
  m := substring(t from '(recibiste|has recibido|te enviaron|te envio|te transfirieron|te transfirio|te llego|te llegaron|te pasaron|te paso|te consignaron|te consigno|te abonaron|te abono|te depositaron|te deposito|te pagaron|te pago|pago recibido|dinero recibido|plata recibida|transferencia recibida|abono recibido|abono a tu|abonamos|consignacion (exitosa|recibida)|entrada de dinero|ingreso de dinero|tu (cuenta|nequi|daviplata|llave) recibio)');
  if m is not null then
    clasificacion := 'recibido';
    motivo := 'dice "' || m || '"';
    return;
  end if;

  clasificacion := 'otro';
  motivo := 'no dice que entró dinero';
end;
$$;
grant execute on function public.clasificar_aviso_pago(text) to anon, authenticated;

-- El registro de avisos no guarda nada si Codec Verify está apagado.
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
  v_activo boolean;
begin
  select id, codec_verify_activo into v_cliente, v_activo from public.clientes_pos where webhook_token = p_token;
  if v_cliente is null then
    raise exception 'Token de automatización inválido';
  end if;
  if not v_activo then
    return;
  end if;
  perform public._guardar_evento_codec_verify(v_cliente, p_origen, p_entidad, p_monto, p_resultado, p_detalle, p_texto);
end;
$$;

-- 3) registrar_pago_automatico: encendido + RECIBIDO, si no, nada --------------
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
  v_activo boolean;
  v_texto text;
  v_clase record;
  v_monto_texto text;
  v_monto numeric;
begin
  select id, codec_verify_activo into v_cliente_id, v_activo from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;
  -- Interruptor apagado: el aviso no se lee, no se guarda y no se anota.
  if not v_activo then
    raise exception 'Codec Verify está apagado en el POS: aviso descartado';
  end if;

  v_texto := coalesce(p_monto, '');
  select * into v_clase from public.clasificar_aviso_pago(v_texto);

  -- Los mensajes de error empiezan con "Movimiento saliente" / "No es un pago recibido":
  -- las apps ya instaladas los distinguen por esas palabras (no reintentan ni usan la IA).
  if v_clase.clasificacion = 'enviado' then
    raise exception 'Movimiento saliente (ENVIADO, %), no se registra como pago recibido', v_clase.motivo;
  end if;
  if v_clase.clasificacion <> 'recibido' then
    raise exception 'No es un pago recibido (OTRO, %), aviso ignorado', v_clase.motivo;
  end if;

  -- 1) Número justo después de una palabra de dinero entrante.
  v_monto_texto := substring(
    v_texto from
    '(?i)(?:recib\w*|enviaron|envi[oó]|transfiri\w*|pagaron|pag[oó]|pasaron|pas[oó]|deposit\w*|consign\w*|abon\w*|te\s+lleg\w*|ingres\w*)\D{0,80}\$?\s?([0-9][0-9.,]*)'
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
  values (v_cliente_id, v_monto, coalesce(p_entidad, 'otro'), coalesce(nullif(p_referencia, ''), left(p_monto, 300)), 'automatizacion', 'confirmado');

  perform public._guardar_evento_codec_verify(v_cliente_id, p_origen, p_entidad, v_monto, 'registrado', 'RECIBIDO, ' || v_clase.motivo, v_texto);
end;
$function$;
grant execute on function public.registrar_pago_automatico(text, text, text, text, text) to anon, authenticated;

-- Respaldo con IA: también exige el interruptor encendido y un aviso RECIBIDO.
-- Solo lo llama la Edge Function interpretar-pago-ia (con la clave de servicio).
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
  v_activo boolean;
begin
  select id, codec_verify_activo into v_cliente_id, v_activo from public.clientes_pos where webhook_token = p_token;
  if v_cliente_id is null then
    raise exception 'Token de automatización inválido';
  end if;
  if not v_activo then
    raise exception 'Codec Verify está apagado en el POS: aviso descartado';
  end if;
  if (public.clasificar_aviso_pago(p_referencia)).clasificacion <> 'recibido' then
    raise exception 'No es un pago recibido, aviso ignorado';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto inválido: %', p_monto;
  end if;

  insert into public.notificaciones_pago (cliente_id, monto, entidad, referencia, origen, estado)
  values (v_cliente_id, p_monto, coalesce(p_entidad, 'otro'), coalesce(p_referencia, 'Monto interpretado por IA'), 'automatizacion', 'confirmado');
  perform public._guardar_evento_codec_verify(v_cliente_id, 'android', p_entidad, p_monto, 'registrado', 'RECIBIDO, leído con IA', p_referencia);
end;
$$;
revoke execute on function public.registrar_pago_automatico_monto_confirmado(text, numeric, text, text) from public, anon, authenticated;
