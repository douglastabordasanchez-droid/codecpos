-- Suspender, reactivar y dar días de cortesía desde cualquier panel de staff
-- (Electron, /app/desarrollador y /admin) pasando por la tabla `licencias`.
--
-- Antes, "Suspender" escribía solo clientes_pos.estado. Como el trigger
-- sincronizar_cliente_pos_desde_licencia (0047/0087) proyecta la licencia
-- vigente sobre clientes_pos, cualquier cambio posterior de la licencia
-- (o la expiración automática) volvía a dejar al cliente ACTIVO sin que nadie
-- lo reactivara. Ahora el estado vive en la licencia y clientes_pos lo copia.
-- Los clientes sin licencia en la tabla nueva (legacy) se siguen manejando
-- directo en clientes_pos.

begin;

alter table public.historial_comercial drop constraint if exists historial_comercial_tipo_evento_check;
alter table public.historial_comercial add constraint historial_comercial_tipo_evento_check check (tipo_evento in (
  'CREACION_LICENCIA', 'CAMBIO_PLAN', 'CAMBIO_MODALIDAD', 'UPGRADE', 'DOWNGRADE',
  'CANCELACION', 'REACTIVACION', 'PROMOCION_APLICADA', 'CAMBIO_PRECIO',
  'CAMBIO_SUCURSAL', 'CAMBIO_USUARIO', 'ACTIVACION', 'SUSPENSION',
  'ADDON_AGREGADO', 'ADDON_CANCELADO', 'MIGRACION_LEGACY', 'PRUEBA_VENCIDA',
  'DIAS_CORTESIA'
));

-- ── Suspender / reactivar ────────────────────────────────────────────────
-- p_suspender = true  → la licencia vigente queda SUSPENDIDA.
-- p_suspender = false → vuelve al estado que tenía antes de suspenderla
--                       (TRIAL o ACTIVA); si su fecha ya pasó, EXPIRADA.
create or replace function public.suspender_cliente_admin(p_cliente_id uuid, p_suspender boolean, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lic public.licencias;
  v_estado_previo text;
  v_nuevo text;
  v_cliente public.clientes_pos;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para suspender clientes';
  end if;

  select * into v_lic from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if v_lic.id is null then
    -- Cliente legacy, sin licencia en la tabla nueva.
    select * into v_cliente from public.clientes_pos where id = p_cliente_id;
    if v_cliente.id is null then raise exception 'Cliente no encontrado'; end if;
    v_nuevo := case
      when p_suspender then 'SUSPENDIDA'
      when v_cliente.duracion <> 'VITALICIA' and v_cliente.fecha_expiracion is not null and v_cliente.fecha_expiracion < now() then 'VENCIDA'
      else 'ACTIVA'
    end;
    update public.clientes_pos set estado = v_nuevo, updated_at = now() where id = p_cliente_id;
    return v_nuevo;
  end if;

  if p_suspender then
    if v_lic.estado = 'SUSPENDIDA' then return 'SUSPENDIDA'; end if;
    v_nuevo := 'SUSPENDIDA';
  else
    if v_lic.estado <> 'SUSPENDIDA' then
      -- Ya estaba activa en la licencia; solo se corrige clientes_pos por si
      -- quedó suspendido con el método viejo (update directo).
      update public.licencias set updated_at = now() where id = v_lic.id;
      return v_lic.estado;
    end if;
    select h.datos_anteriores->>'estado' into v_estado_previo
    from public.historial_comercial h
    where h.licencia_id = v_lic.id and h.tipo_evento = 'SUSPENSION'
    order by h.created_at desc limit 1;
    v_nuevo := case
      when v_lic.modalidad <> 'VITALICIA' and v_lic.fecha_fin_periodo_actual is not null and v_lic.fecha_fin_periodo_actual < now() then 'EXPIRADA'
      when v_estado_previo in ('TRIAL', 'ACTIVA') then v_estado_previo
      else 'ACTIVA'
    end;
  end if;

  update public.licencias set estado = v_nuevo, updated_at = now() where id = v_lic.id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_lic.id,
    case when p_suspender then 'SUSPENSION' else 'REACTIVACION' end,
    jsonb_build_object('estado', v_lic.estado),
    jsonb_build_object('estado', v_nuevo),
    coalesce(p_motivo, case when p_suspender then 'Suspendido desde el panel de staff' else 'Reactivado desde el panel de staff' end),
    auth.uid()
  );

  return v_nuevo;
end;
$function$;

-- ── Días de cortesía ─────────────────────────────────────────────────────
-- Suma días a la licencia actual SIN cambiar el plan (a diferencia de
-- activar_prueba_admin, que la reemplaza por una prueba Premium nueva).
-- Si ya estaba vencida, los días se cuentan desde hoy y vuelve a quedar
-- activa. Una licencia suspendida sigue suspendida.
create or replace function public.dar_dias_cortesia_admin(p_cliente_id uuid, p_dias integer)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lic public.licencias;
  v_cliente public.clientes_pos;
  v_base timestamptz;
  v_fin timestamptz;
  v_estado text;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado para dar días de cortesía';
  end if;
  if p_dias is null or p_dias <= 0 then
    raise exception 'Los días deben ser un número positivo';
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

  delete from public.avisos_licencia where licencia_id = v_lic.id and enviado_en is null;
  insert into public.avisos_licencia (cliente_id, licencia_id, tipo, programado_para)
  values (p_cliente_id, v_lic.id, 'RENOVACION_PROXIMA', v_fin - interval '2 days');

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_lic.id, 'DIAS_CORTESIA',
    jsonb_build_object('estado', v_lic.estado, 'fecha_fin', v_lic.fecha_fin_periodo_actual),
    jsonb_build_object('estado', v_estado, 'fecha_fin', v_fin, 'dias', p_dias),
    format('%s días de cortesía dados desde el panel de staff', p_dias),
    auth.uid()
  );

  return v_fin;
end;
$function$;

revoke all on function public.suspender_cliente_admin(uuid, boolean, text) from public, anon;
revoke all on function public.dar_dias_cortesia_admin(uuid, integer) from public, anon;
grant execute on function public.suspender_cliente_admin(uuid, boolean, text) to authenticated;
grant execute on function public.dar_dias_cortesia_admin(uuid, integer) to authenticated;

-- Coman Streetwear quedó SUSPENDIDA con el método viejo (solo clientes_pos)
-- mientras su licencia sigue en TRIAL: se pasa la suspensión a la licencia
-- para que no se reactive sola la próxima vez que cambie la licencia.
do $$
declare r record;
begin
  for r in
    select c.id as cliente_id, l.id as licencia_id, l.estado
    from public.clientes_pos c
    join public.licencias l on l.cliente_id = c.id and l.vigente
    where c.estado = 'SUSPENDIDA' and l.estado <> 'SUSPENDIDA'
  loop
    update public.licencias set estado = 'SUSPENDIDA', updated_at = now() where id = r.licencia_id;
    insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo)
    values (r.cliente_id, r.licencia_id, 'SUSPENSION', jsonb_build_object('estado', r.estado),
      jsonb_build_object('estado', 'SUSPENDIDA'), 'Suspensión hecha antes en clientes_pos, pasada a la licencia');
  end loop;
end $$;

commit;
