-- 0140 · Fechas de la licencia puestas a mano desde /admin.
--
-- Hasta ahora las fechas solo salían de los botones (Registrar pago, Dar días,
-- Cambiar plan), que cuentan desde hoy o desde el vencimiento. Para organizar
-- a los negocios nuevos, o corregir uno que quedó con fechas que no
-- corresponden, el staff pone la fecha de inicio y la fecha final que quiera.
--
--   · Las fechas son días de Colombia: el inicio cuenta desde las 00:00 y el
--     último día se puede trabajar completo (vence a las 23:59:59, hora de
--     Bogotá).
--   · Se guardan en la licencia vigente; el trigger sincronizar_cliente_pos
--     las copia a clientes_pos (fecha_activacion y fecha_expiracion), que es lo
--     que revisan Electron, la web y la app del celular para bloquear.
--   · Lo automático sigue igual: los avisos de 2 y 1 día antes se recalculan
--     con la fecha nueva, el cron de cada hora pausa la licencia al vencer y
--     Registrar pago suma el periodo desde esta fecha final.
--   · Si la fecha final queda en el futuro y la licencia estaba pausada por
--     vencimiento (EXPIRADA) o pendiente de pago, vuelve a ACTIVA. Si queda en
--     el pasado, se pausa de una vez. Una suspensión o cancelación hecha a mano
--     no se toca: se quita con su propio botón.
--   · Vitalicia no vence: solo se cambia la fecha de inicio.

alter table public.historial_comercial drop constraint if exists historial_comercial_tipo_evento_check;
alter table public.historial_comercial add constraint historial_comercial_tipo_evento_check
  check (tipo_evento in (
    'CREACION_LICENCIA', 'CAMBIO_PLAN', 'CAMBIO_MODALIDAD', 'UPGRADE', 'DOWNGRADE', 'CANCELACION',
    'REACTIVACION', 'PROMOCION_APLICADA', 'CAMBIO_PRECIO', 'CAMBIO_SUCURSAL', 'CAMBIO_USUARIO',
    'ACTIVACION', 'SUSPENSION', 'ADDON_AGREGADO', 'ADDON_CANCELADO', 'MIGRACION_LEGACY',
    'PRUEBA_VENCIDA', 'DIAS_CORTESIA', 'LICENCIA_VENCIDA', 'PAGO_REGISTRADO', 'FECHAS_AJUSTADAS'
  ));

create or replace function public.fijar_fechas_licencia_admin(
  p_cliente_id uuid,
  p_inicio date,
  p_fin date default null,
  p_motivo text default null
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lic public.licencias;
  v_cliente public.clientes_pos;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_estado text;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para cambiar las fechas de la licencia';
  end if;
  if p_inicio is null then
    raise exception 'Falta la fecha de inicio';
  end if;
  if p_fin is not null and p_fin < p_inicio then
    raise exception 'La fecha final no puede ser anterior a la fecha de inicio';
  end if;

  v_inicio := p_inicio::timestamp at time zone 'America/Bogota';
  v_fin := case when p_fin is null then null
    else ((p_fin + 1)::timestamp at time zone 'America/Bogota') - interval '1 second' end;

  select * into v_lic from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_lic.id is null then
    -- Cliente legacy, sin licencia en la tabla nueva: se ajusta clientes_pos.
    select * into v_cliente from public.clientes_pos where id = p_cliente_id;
    if v_cliente.id is null then raise exception 'Cliente no encontrado'; end if;
    if v_cliente.duracion <> 'VITALICIA' and v_fin is null then
      raise exception 'Falta la fecha final';
    end if;
    update public.clientes_pos set
      fecha_activacion = v_inicio,
      fecha_expiracion = case when duracion = 'VITALICIA' then fecha_expiracion else v_fin end,
      estado = case
        when duracion = 'VITALICIA' or estado in ('SUSPENDIDA', 'CANCELADA') then estado
        when v_fin > now() and estado in ('VENCIDA', 'PENDIENTE_PAGO') then 'ACTIVA'
        when v_fin <= now() and estado in ('ACTIVA', 'PENDIENTE_PAGO') then 'VENCIDA'
        else estado end,
      updated_at = now()
    where id = p_cliente_id;
    return v_fin;
  end if;

  if v_lic.modalidad = 'VITALICIA' then
    v_fin := null;
    v_estado := v_lic.estado;
  else
    if v_fin is null then raise exception 'Falta la fecha final'; end if;
    v_estado := case
      when v_lic.estado in ('SUSPENDIDA', 'CANCELADA') then v_lic.estado
      when v_fin > now() and v_lic.estado in ('EXPIRADA', 'PENDIENTE_PAGO') then 'ACTIVA'
      when v_fin <= now() and v_lic.estado in ('ACTIVA', 'TRIAL', 'PENDIENTE_PAGO') then 'EXPIRADA'
      else v_lic.estado end;
  end if;

  update public.licencias set
    fecha_inicio = v_inicio,
    fecha_fin_periodo_actual = coalesce(v_fin, fecha_fin_periodo_actual),
    fecha_expiracion = coalesce(v_fin, fecha_expiracion),
    estado = v_estado,
    updated_at = now()
  where id = v_lic.id;

  -- Los avisos pendientes eran para la fecha vieja; el cron los vuelve a crear.
  delete from public.avisos_licencia where licencia_id = v_lic.id and enviado_en is null;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_lic.id, 'FECHAS_AJUSTADAS',
    jsonb_build_object('estado', v_lic.estado, 'fecha_inicio', v_lic.fecha_inicio, 'fecha_fin', v_lic.fecha_fin_periodo_actual),
    jsonb_build_object('estado', v_estado, 'fecha_inicio', v_inicio, 'fecha_fin', v_fin),
    coalesce(p_motivo, format('Fechas puestas a mano: del %s al %s',
      to_char(p_inicio, 'DD/MM/YYYY'), coalesce(to_char(p_fin, 'DD/MM/YYYY'), 'sin vencimiento'))),
    auth.uid()
  );

  return v_fin;
end;
$function$;

revoke all on function public.fijar_fechas_licencia_admin(uuid, date, date, text) from public, anon;
grant execute on function public.fijar_fechas_licencia_admin(uuid, date, date, text) to authenticated;
