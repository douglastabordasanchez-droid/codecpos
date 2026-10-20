-- 0118 · Vencimiento automático de licencias pagadas y avisos previos.
--
-- Antes solo las pruebas gratis se vencían solas (expirar_pruebas_vencidas).
-- Una licencia MENSUAL, TRIMESTRAL o ANUAL que llegaba a su fecha sin pago
-- seguía en ACTIVA en los paneles (Papotas co, 16 oct 2026) y solo la
-- bloqueaban las apps nuevas por la fecha. Ahora:
--   · 2 días antes y 1 día antes se crea un aviso para el negocio.
--   · Al pasar la fecha sin pago la licencia queda EXPIRADA y el negocio
--     VENCIDA (el trigger sincroniza clientes_pos), con su evento en el
--     historial. Las vitalicias no vencen nunca.
--   · Al pagar (registrar_licencia desde Wompi o Mercado Pago), al dar días
--     de cortesía o al cambiar el plan, el negocio vuelve a ACTIVA como antes.

-- ── Tipos de aviso ───────────────────────────────────────────────────────
alter table public.avisos_licencia drop constraint if exists avisos_licencia_tipo_check;
alter table public.avisos_licencia add constraint avisos_licencia_tipo_check
  check (tipo in ('RENOVACION_PROXIMA', 'VENCE_EN_2_DIAS', 'VENCE_EN_1_DIA'));

-- Un aviso por licencia, tipo y fecha de vencimiento: si se dan días de
-- cortesía la fecha cambia y los avisos vuelven a salir para la nueva fecha.
alter table public.avisos_licencia drop constraint if exists avisos_licencia_licencia_id_tipo_key;
alter table public.avisos_licencia add constraint avisos_licencia_licencia_tipo_fecha_key
  unique (licencia_id, tipo, programado_para);

-- ── Evento de historial ──────────────────────────────────────────────────
alter table public.historial_comercial drop constraint if exists historial_comercial_tipo_evento_check;
alter table public.historial_comercial add constraint historial_comercial_tipo_evento_check
  check (tipo_evento in (
    'CREACION_LICENCIA', 'CAMBIO_PLAN', 'CAMBIO_MODALIDAD', 'UPGRADE', 'DOWNGRADE', 'CANCELACION',
    'REACTIVACION', 'PROMOCION_APLICADA', 'CAMBIO_PRECIO', 'CAMBIO_SUCURSAL', 'CAMBIO_USUARIO',
    'ACTIVACION', 'SUSPENSION', 'ADDON_AGREGADO', 'ADDON_CANCELADO', 'MIGRACION_LEGACY',
    'PRUEBA_VENCIDA', 'DIAS_CORTESIA', 'LICENCIA_VENCIDA'
  ));

-- ── Avisos 2 días y 1 día antes ─────────────────────────────────────────
create or replace function public.generar_avisos_licencia()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dos integer;
  v_uno integer;
begin
  -- Solo si todavía falta más de un día: quien entra ya en el último día
  -- recibe directamente el aviso de 1 día.
  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  select l.cliente_id, l.id, 'VENCE_EN_2_DIAS', l.fecha_fin_periodo_actual - interval '2 days'
  from public.licencias l
  where l.vigente and l.modalidad <> 'VITALICIA' and l.estado in ('ACTIVA', 'TRIAL', 'PENDIENTE_PAGO')
    and l.fecha_fin_periodo_actual is not null
    and now() >= l.fecha_fin_periodo_actual - interval '2 days'
    and now() <  l.fecha_fin_periodo_actual - interval '1 day'
  on conflict do nothing;
  get diagnostics v_dos = row_count;

  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  select l.cliente_id, l.id, 'VENCE_EN_1_DIA', l.fecha_fin_periodo_actual - interval '1 day'
  from public.licencias l
  where l.vigente and l.modalidad <> 'VITALICIA' and l.estado in ('ACTIVA', 'TRIAL', 'PENDIENTE_PAGO')
    and l.fecha_fin_periodo_actual is not null
    and now() >= l.fecha_fin_periodo_actual - interval '1 day'
    and now() <  l.fecha_fin_periodo_actual
  on conflict do nothing;
  get diagnostics v_uno = row_count;

  return v_dos + v_uno;
end;
$function$;

-- ── Vencimiento de licencias pagadas ─────────────────────────────────────
create or replace function public.vencer_licencias_sin_pago()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_afectados int := 0;
  v_lic record;
begin
  for v_lic in
    select l.id, l.cliente_id, l.estado, l.modalidad, l.fecha_fin_periodo_actual
    from public.licencias l
    where l.vigente
      and l.estado in ('ACTIVA', 'PENDIENTE_PAGO')
      and l.modalidad <> 'VITALICIA'
      and l.fecha_fin_periodo_actual is not null
      and l.fecha_fin_periodo_actual < now()
  loop
    -- El trigger trg_sincronizar_cliente_pos deja clientes_pos en VENCIDA.
    update public.licencias set estado = 'EXPIRADA', updated_at = now() where id = v_lic.id;

    insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo)
    values (
      v_lic.cliente_id, v_lic.id, 'LICENCIA_VENCIDA',
      jsonb_build_object('estado', v_lic.estado, 'fecha_fin', v_lic.fecha_fin_periodo_actual),
      jsonb_build_object('estado', 'EXPIRADA'),
      format('Licencia %s vencida el %s sin pago: pausada automáticamente',
        lower(v_lic.modalidad), to_char(v_lic.fecha_fin_periodo_actual at time zone 'America/Bogota', 'DD/MM/YYYY'))
    );
    v_afectados := v_afectados + 1;
  end loop;

  -- Negocios viejos sin fila en `licencias`: se vencen por su propia fecha.
  update public.clientes_pos c set estado = 'VENCIDA', updated_at = now()
  where c.estado = 'ACTIVA'
    and coalesce(c.duracion, '') <> 'VITALICIA'
    and c.fecha_expiracion is not null and c.fecha_expiracion < now()
    and not exists (select 1 from public.licencias l where l.cliente_id = c.id and l.vigente);

  return v_afectados;
end;
$function$;

revoke all on function public.vencer_licencias_sin_pago() from public, anon, authenticated;

-- ── Días de cortesía: ya no crea su propio aviso ─────────────────────────
CREATE OR REPLACE FUNCTION public.dar_dias_cortesia_admin(p_cliente_id uuid, p_dias integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lic public.licencias;
  v_cliente public.clientes_pos;
  v_base timestamptz;
  v_fin timestamptz;
  v_estado text;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para dar dÃ­as de cortesÃ­a';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'Los dÃ­as deben ser un nÃºmero positivo';
  end if;

  select * into v_lic from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_lic.id is null then
    select * into v_cliente from public.clientes_pos where id = p_cliente_id;
    if v_cliente.id is null then raise exception 'Cliente no encontrado'; end if;
    if v_cliente.duracion = 'VITALICIA' then raise exception 'Este cliente tiene licencia vitalicia: no vence'; end if;
    v_base := greatest(coalesce(v_cliente.fecha_expiracion, now()), now());
    v_fin := v_base + (p_dias || ' days')::interval;
    update public.clientes_pos set
      fecha_expiracion = v_fin,
      estado = case when estado in ('VENCIDA', 'CANCELADA') then 'ACTIVA' else estado end,
      updated_at = now()
    where id = p_cliente_id;
    return v_fin;
  end if;

  if v_lic.modalidad = 'VITALICIA' then
    raise exception 'Este cliente tiene licencia vitalicia: no vence';
  end if;

  v_base := greatest(coalesce(v_lic.fecha_fin_periodo_actual, now()), now());
  v_fin := v_base + (p_dias || ' days')::interval;
  v_estado := case
    when v_lic.estado in ('EXPIRADA', 'PENDIENTE_PAGO', 'CANCELADA') then 'ACTIVA'
    else v_lic.estado
  end;

  update public.licencias set
    fecha_fin_periodo_actual = v_fin,
    fecha_expiracion = v_fin,
    estado = v_estado,
    fecha_cancelacion = case when v_estado = 'ACTIVA' then null else fecha_cancelacion end,
    updated_at = now()
  where id = v_lic.id;

  -- Los avisos pendientes eran para la fecha vieja; generar_avisos_licencia
  -- crea los de la fecha nueva (2 días y 1 día antes).
  delete from public.avisos_licencia where licencia_id = v_lic.id and enviado_en is null;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_lic.id, 'DIAS_CORTESIA',
    jsonb_build_object('estado', v_lic.estado, 'fecha_fin', v_lic.fecha_fin_periodo_actual),
    jsonb_build_object('estado', v_estado, 'fecha_fin', v_fin, 'dias', p_dias),
    format('%s dÃ­as de cortesÃ­a dados desde el panel de staff', p_dias),
    auth.uid()
  );

  return v_fin;
end;
$function$;

-- Avisos viejos sin entregar: los reemplazan los de 2 días y 1 día.
delete from public.avisos_licencia where tipo = 'RENOVACION_PROXIMA' and enviado_en is null;

-- Cada hora, igual que las pruebas gratis y los avisos.
select cron.unschedule('vencer-licencias-sin-pago')
where exists (select 1 from cron.job where jobname = 'vencer-licencias-sin-pago');
select cron.schedule('vencer-licencias-sin-pago', '5 * * * *', 'select public.vencer_licencias_sin_pago();');

-- Ponerse al día ahora mismo.
select public.vencer_licencias_sin_pago();
select public.generar_avisos_licencia();
