-- 0120 · "Registrar pago" desde los paneles de Codec Studio.
--
-- Cuando un negocio paga por fuera (efectivo, Nequi, transferencia) el staff
-- tenía que combinar botones: Reactivar dejaba la licencia EXPIRADA si ya
-- había vencido, Cortesía no quitaba la suspensión y Cambiar plan contaba el
-- periodo desde hoy, así que quien pagaba antes de la fecha perdía los días
-- que le quedaban. Ahora un solo paso:
--   · Suma un periodo de su modalidad (mes, trimestre o año) a su fecha de
--     vencimiento, aunque pague unos días tarde (venció el 16 de octubre y
--     paga el 21: queda hasta el 16 de noviembre). Si ni así alcanza a hoy,
--     el periodo cuenta desde hoy.
--   · Deja la licencia ACTIVA aunque estuviera SUSPENDIDA, EXPIRADA, en
--     prueba o pendiente de pago (el trigger sincroniza clientes_pos y las
--     apps se desbloquean en su siguiente revisión).
--   · Queda en el historial como PAGO_REGISTRADO con quién lo registró.

alter table public.historial_comercial drop constraint if exists historial_comercial_tipo_evento_check;
alter table public.historial_comercial add constraint historial_comercial_tipo_evento_check
  check (tipo_evento in (
    'CREACION_LICENCIA', 'CAMBIO_PLAN', 'CAMBIO_MODALIDAD', 'UPGRADE', 'DOWNGRADE', 'CANCELACION',
    'REACTIVACION', 'PROMOCION_APLICADA', 'CAMBIO_PRECIO', 'CAMBIO_SUCURSAL', 'CAMBIO_USUARIO',
    'ACTIVACION', 'SUSPENSION', 'ADDON_AGREGADO', 'ADDON_CANCELADO', 'MIGRACION_LEGACY',
    'PRUEBA_VENCIDA', 'DIAS_CORTESIA', 'LICENCIA_VENCIDA', 'PAGO_REGISTRADO'
  ));

create or replace function public.registrar_pago_licencia_admin(p_cliente_id uuid, p_motivo text default null)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lic public.licencias;
  v_cliente public.clientes_pos;
  v_periodo interval;
  v_fin timestamptz;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para registrar pagos';
  end if;

  select * into v_lic from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_lic.id is null then
    -- Cliente legacy, sin licencia en la tabla nueva.
    select * into v_cliente from public.clientes_pos where id = p_cliente_id;
    if v_cliente.id is null then raise exception 'Cliente no encontrado'; end if;
    if v_cliente.duracion = 'VITALICIA' then
      update public.clientes_pos set estado = 'ACTIVA', updated_at = now() where id = p_cliente_id;
      return null;
    end if;
    v_periodo := case v_cliente.duracion when '3_MESES' then interval '3 months' when '1_ANO' then interval '1 year' else interval '1 month' end;
    v_fin := coalesce(v_cliente.fecha_expiracion, now()) + v_periodo;
    if v_fin <= now() then v_fin := now() + v_periodo; end if;
    update public.clientes_pos set fecha_expiracion = v_fin, estado = 'ACTIVA', en_prueba = false, updated_at = now()
    where id = p_cliente_id;
    return v_fin;
  end if;

  if v_lic.modalidad = 'VITALICIA' then
    v_fin := null;
  else
    v_periodo := case v_lic.modalidad when 'TRIMESTRAL' then interval '3 months' when 'ANUAL' then interval '1 year' else interval '1 month' end;
    v_fin := coalesce(v_lic.fecha_fin_periodo_actual, now()) + v_periodo;
    if v_fin <= now() then v_fin := now() + v_periodo; end if;
  end if;

  update public.licencias set
    estado = 'ACTIVA',
    fecha_fin_periodo_actual = coalesce(v_fin, fecha_fin_periodo_actual),
    fecha_expiracion = coalesce(v_fin, fecha_expiracion),
    fecha_cancelacion = null,
    updated_at = now()
  where id = v_lic.id;

  -- Los avisos pendientes eran para la fecha vieja.
  delete from public.avisos_licencia where licencia_id = v_lic.id and enviado_en is null;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_lic.id, 'PAGO_REGISTRADO',
    jsonb_build_object('estado', v_lic.estado, 'fecha_fin', v_lic.fecha_fin_periodo_actual),
    jsonb_build_object('estado', 'ACTIVA', 'fecha_fin', v_fin),
    coalesce(p_motivo, 'Pago registrado desde el panel de staff'),
    auth.uid()
  );

  return v_fin;
end;
$function$;

revoke all on function public.registrar_pago_licencia_admin(uuid, text) from public, anon;
grant execute on function public.registrar_pago_licencia_admin(uuid, text) to authenticated;
