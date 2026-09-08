-- Unifica la activación/edición de la prueba gratuita en el motor real de
-- licencias (activar_prueba_admin, 0082) para Admin Web y Electron, que hoy
-- escriben directo sobre columnas legacy de clientes_pos (en_prueba,
-- dias_prueba_restantes) sin pasar por la tabla `licencias` -- la PWA
-- (PanelDesarrolladorPage) ya usa el motor real. Además, los "14 días"
-- quedaban fijos en el servidor; ahora son parametrizables.

begin;

-- El trigger que proyecta `licencias` -> `clientes_pos` (0047) sincroniza
-- plan/duracion/estado/fecha_activacion/fecha_expiracion/app_movil_habilitada
-- pero NUNCA actualizó en_prueba/dias_prueba_restantes -- esas dos columnas
-- solo las tocaba expirar_pruebas_vencidas() (0053) al vencer la prueba. Se
-- amplía para que también sean fuente-de-verdad-única, así cualquier vista
-- de staff que todavía lea las columnas crudas (DeveloperPanel, DashboardPage
-- admin) queda correcta sin tener que migrarlas todas ahora mismo.
create or replace function public.sincronizar_cliente_pos_desde_licencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan_codigo text;
  v_duracion text;
  v_estado_legacy text;
  v_mobile boolean;
  v_en_prueba boolean;
  v_dias_restantes integer;
begin
  if not NEW.vigente and not (TG_OP = 'UPDATE' and OLD.vigente = true) then
    return NEW;
  end if;
  select codigo into v_plan_codigo from public.planes where id = NEW.plan_id;

  v_duracion := case NEW.modalidad
    when 'MENSUAL' then '1_MES' when 'TRIMESTRAL' then '3_MESES'
    when 'ANUAL' then '1_ANO' when 'VITALICIA' then 'VITALICIA' end;

  v_estado_legacy := case NEW.estado
    when 'TRIAL' then 'PRUEBA' when 'ACTIVA' then 'ACTIVA' when 'SUSPENDIDA' then 'SUSPENDIDA'
    when 'EXPIRADA' then 'VENCIDA' when 'CANCELADA' then 'CANCELADA' when 'PENDIENTE_PAGO' then 'PENDIENTE_PAGO'
    else NEW.estado end;

  v_mobile := coalesce((public.entitlement_valor(NEW.cliente_id, 'MOBILE_APP')->>'habilitado')::boolean, true);

  v_en_prueba := NEW.vigente and NEW.estado = 'TRIAL';
  v_dias_restantes := case
    when v_en_prueba then greatest(0, ceil(extract(epoch from (NEW.fecha_fin_periodo_actual - now())) / 86400))::integer
    else 0
  end;

  update public.clientes_pos set
    plan = coalesce(v_plan_codigo, plan),
    duracion = coalesce(v_duracion, duracion),
    estado = coalesce(v_estado_legacy, estado),
    fecha_activacion = NEW.fecha_inicio,
    fecha_expiracion = NEW.fecha_fin_periodo_actual,
    app_movil_habilitada = v_mobile,
    en_prueba = v_en_prueba,
    dias_prueba_restantes = v_dias_restantes,
    updated_at = now()
  where id = NEW.cliente_id;

  return NEW;
end;
$$;

-- Ahora acepta días de prueba variables (por defecto 14, mismo valor de
-- siempre) -- firma retrocompatible, ninguna llamada existente se rompe.
create or replace function public.activar_prueba_admin(p_cliente_id uuid, p_dias integer default 14)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan_id uuid;
  v_anterior public.licencias;
  v_nueva_id uuid;
  v_inicio timestamptz := now();
  v_fin timestamptz;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para activar pruebas';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'Los días de prueba deben ser un número positivo';
  end if;
  v_fin := v_inicio + (p_dias || ' days')::interval;

  select id into v_plan_id from public.planes where codigo = 'PREMIUM' and activo;
  if v_plan_id is null then raise exception 'Plan Premium no disponible'; end if;
  select * into v_anterior from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_anterior.id is not null then
    update public.licencias set vigente = false, fecha_fin_vigencia = v_inicio,
      motivo_fin = format('Reemplazada por prueba gratuita de %s días', p_dias), updated_at = v_inicio
    where id = v_anterior.id;
  end if;

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, fecha_expiracion, motivo, created_by
  ) values (
    p_cliente_id, v_plan_id, 'MENSUAL', 'TRIAL', 0, true, 'MANUAL_STAFF',
    v_inicio, v_fin, v_fin, format('Prueba gratuita de %s días activada por staff', p_dias), auth.uid()
  ) returning id into v_nueva_id;

  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  values (p_cliente_id, v_nueva_id, 'RENOVACION_PROXIMA', v_fin - interval '2 days');

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_nueva_id, 'ACTIVACION',
    case when v_anterior.id is not null then to_jsonb(v_anterior) else null end,
    jsonb_build_object('estado', 'TRIAL', 'dias', p_dias, 'fecha_inicio', v_inicio, 'fecha_fin', v_fin),
    format('Prueba gratuita de %s días activada desde Panel Desarrollador', p_dias), auth.uid()
  );

  return v_nueva_id;
end;
$function$;

-- Nueva: ajusta los días TOTALES de una prueba YA activa (sin resetear
-- fecha_inicio ni crear una licencia nueva) -- para "dale un mes en vez de
-- 14 días" sobre un cliente que ya está en prueba.
create or replace function public.editar_dias_prueba_activa(p_cliente_id uuid, p_dias integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'Los días de prueba deben ser un número positivo';
  end if;

  select id, fecha_inicio into v_id, v_inicio from public.licencias
  where cliente_id = p_cliente_id and vigente = true and estado = 'TRIAL';
  if v_id is null then
    raise exception 'Este cliente no tiene una prueba gratuita activa';
  end if;

  v_fin := v_inicio + (p_dias || ' days')::interval;

  update public.licencias set
    fecha_fin_periodo_actual = v_fin,
    fecha_expiracion = v_fin,
    updated_at = now()
  where id = v_id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_id, 'CAMBIO_MODALIDAD',
    jsonb_build_object('dias_prueba_totales', p_dias, 'fecha_fin_nueva', v_fin),
    format('Días de prueba ajustados a %s por staff', p_dias), auth.uid()
  );
end;
$function$;

revoke all on function public.editar_dias_prueba_activa(uuid, integer) from public, anon;
grant execute on function public.editar_dias_prueba_activa(uuid, integer) to authenticated;

commit;
