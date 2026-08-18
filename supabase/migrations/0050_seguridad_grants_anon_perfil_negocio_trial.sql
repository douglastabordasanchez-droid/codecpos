-- Fase 5, paso 1: corrige 3 huecos de seguridad activos en producción encontrados
-- durante la investigación previa al registro público, y deja el motor comercial
-- listo para soportar prueba gratuita de 14 días con precios redondeados a .999.
--
-- Problema 1: anon/authenticated tenían GRANT ALL (incluyendo TRUNCATE) sobre
--   todas las tablas del motor comercial. TRUNCATE no está sujeto a RLS.
-- Problema 2: puedo_administrar_cliente() trataba auth.uid() IS NULL como
--   "confiar", pero eso también es cierto para anon sin sesión -- permitía
--   llamar registrar_licencia()/cancelar_licencia() sin autenticarse.
-- Problema 3: clientes_pos permitía que el propio dueño del negocio (admin/
--   super_usuario) reescribiera columnas comerciales (plan, estado, etc.) vía
--   UPDATE directo, no solo su perfil.

begin;

-- =========================================================================
-- 1) Cierra el bypass de anon/service en puedo_administrar_cliente()
-- =========================================================================
create or replace function public.puedo_administrar_cliente(p_cliente_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select (public.es_staff_actual() and public.nivel_staff_actual() is distinct from 'LECTURA')
    or public.empleado_es_admin_de(p_cliente_id)
$function$;

-- =========================================================================
-- 2) Revoca EXECUTE de anon/PUBLIC sobre funciones SECURITY DEFINER
--    que escriben licencias -- solo authenticated/service_role deben poder.
-- =========================================================================
revoke execute on function public.registrar_licencia(uuid, text, text, text, text, text, text) from anon, public;
revoke execute on function public.cancelar_licencia(uuid, text) from anon, public;

-- =========================================================================
-- 3) clientes_pos: separa UPDATE staff (sin restricción de columnas) de
--    autoservicio del dueño del negocio (solo perfil, vía función acotada).
-- =========================================================================
drop policy if exists "clientes_pos_self_or_staff_update" on public.clientes_pos;

create policy "clientes_pos_staff_update" on public.clientes_pos
  for update to authenticated
  using (exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true))
  with check (exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true));

create or replace function public.actualizar_perfil_negocio(
  p_nombre_negocio text,
  p_nit text default null,
  p_contacto text default null,
  p_telefono text default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'No autorizado para modificar el perfil de este negocio';
  end if;
  if p_nombre_negocio is null or length(trim(p_nombre_negocio)) = 0 then
    raise exception 'El nombre del negocio es obligatorio';
  end if;

  update public.clientes_pos set
    nombre_negocio = p_nombre_negocio,
    nit = p_nit,
    contacto = p_contacto,
    telefono = p_telefono,
    email = p_email,
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_perfil_negocio(text, text, text, text, text) from public, anon;
grant execute on function public.actualizar_perfil_negocio(text, text, text, text, text) to authenticated;

-- =========================================================================
-- 4) clientes_pos: el SELECT "true para cualquiera" exponía machine_id,
--    webhook_token, nit, teléfono, email a cualquier visitante anónimo.
--    authenticated sigue viendo todas las columnas (así lo usan hoy Admin
--    Web/Electron/PWA); anon solo ve id+nombre_negocio, necesario para el
--    selector de negocio del autoservicio de empleados (RegistroPage.tsx).
-- =========================================================================
drop policy if exists "Allow public read access" on public.clientes_pos;

create policy "clientes_pos_select_authenticated" on public.clientes_pos
  for select to authenticated
  using (true);

create policy "clientes_pos_select_anon_directorio" on public.clientes_pos
  for select to anon
  using (true);

revoke select on public.clientes_pos from anon;
grant select (id, nombre_negocio) on public.clientes_pos to anon;

-- =========================================================================
-- 5) Cierra TRUNCATE/TRIGGER/REFERENCES (no gobernados por RLS) en TODAS
--    las tablas del motor comercial, para anon y authenticated.
-- =========================================================================
do $do$
declare
  t text;
begin
  foreach t in array array[
    'clientes_pos','licencias','empleados','planes','precios','entitlements',
    'plan_entitlements','entitlements_override_cliente','sucursales','instalaciones',
    'historial_comercial','promociones_comerciales','promociones_comerciales_clientes',
    'addons','addons_cliente','auditoria_admin','solicitudes_soporte','configuracion_comercial'
  ] loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end;
$do$;

-- =========================================================================
-- 6) anon no necesita INSERT/UPDATE/DELETE directo en ninguna tabla
--    comercial (todo pasa por funciones SECURITY DEFINER); mantiene SELECT
--    únicamente donde ya existía una policy de RLS para anon (catálogo
--    público de planes/precios/entitlements/promociones/addons).
-- =========================================================================
do $do$
declare
  t text;
begin
  foreach t in array array[
    'licencias','empleados','entitlements_override_cliente','sucursales','instalaciones',
    'historial_comercial','promociones_comerciales_clientes','addons_cliente',
    'auditoria_admin','solicitudes_soporte','configuracion_comercial'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;

  foreach t in array array['addons','entitlements','plan_entitlements','planes','precios','promociones_comerciales'] loop
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end;
$do$;

-- =========================================================================
-- 7) Redondeo comercial a .999 en los precios CALCULADOS (trimestral/anual).
--    Los precios base MENSUAL/UNICO quedan tal como están configurados en
--    `precios`/`promociones_comerciales` (29.990 / 79.990 / 49.990).
-- =========================================================================
create or replace function public.aplicar_modalidad_a_base(p_base numeric, p_modalidad text)
returns numeric
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_descuento numeric;
  v_bruto numeric;
begin
  if p_base is null then return null; end if;
  if p_modalidad = 'MENSUAL' then
    return p_base;
  elsif p_modalidad = 'TRIMESTRAL' then
    v_descuento := coalesce(public.configuracion_valor_numeric('descuento_trimestral'), 0);
    v_bruto := p_base * 3 * (1 - v_descuento);
  elsif p_modalidad = 'ANUAL' then
    v_descuento := coalesce(public.configuracion_valor_numeric('descuento_anual'), 0);
    v_bruto := p_base * 12 * (1 - v_descuento);
  else
    raise exception 'Modalidad desconocida: %', p_modalidad;
  end if;

  -- Redondea hacia arriba al siguiente millar y le resta 1 (termina en 999).
  return ceil(v_bruto / 1000) * 1000 - 1;
end;
$function$;

-- =========================================================================
-- 8) Trial de 14 días: registrar_licencia() ya aceptaba p_estado='TRIAL' y
--    p_origen='TRIAL_SIGNUP', pero calculaba el período solo desde la
--    modalidad (MENSUAL->+1 mes). Un TRIAL debe durar 14 días exactos y ser
--    gratis (precio_aplicado=0), sin importar la modalidad que se le pase.
-- =========================================================================
create or replace function public.registrar_licencia(
  p_cliente_id uuid,
  p_plan_codigo text,
  p_modalidad text,
  p_promocion_codigo text default null,
  p_origen text default 'MANUAL_STAFF',
  p_motivo text default null,
  p_estado text default 'ACTIVA'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan_id uuid;
  v_promocion public.promociones_comerciales;
  v_promo_cliente_id uuid;
  v_precio numeric;
  v_licencia_anterior public.licencias;
  v_nueva_id uuid;
  v_periodo interval;
  v_tipo_evento text;
begin
  if not public.puedo_administrar_cliente(p_cliente_id) then
    raise exception 'No autorizado para modificar la licencia de este cliente';
  end if;

  select id into v_plan_id from public.planes where codigo = p_plan_codigo and activo;
  if v_plan_id is null then raise exception 'Plan desconocido o inactivo: %', p_plan_codigo; end if;

  select * into v_licencia_anterior from public.licencias where cliente_id = p_cliente_id and vigente = true;

  if p_promocion_codigo is not null then
    select * into v_promocion from public.promociones_comerciales where codigo = p_promocion_codigo and activa;
    if v_promocion.id is null then
      raise exception 'Promoción desconocida o inactiva: %', p_promocion_codigo;
    end if;
    if not public.cliente_elegible_promocion(p_cliente_id, v_promocion.id) then
      raise exception 'Este cliente ya adquirió esta promoción anteriormente (o la canceló) -- no es elegible de nuevo.';
    end if;
    if now() > v_promocion.fecha_fin then
      raise exception 'La ventana de esta promoción ya cerró.';
    end if;
  end if;

  if p_estado = 'TRIAL' then
    v_precio := 0;
  elsif v_promocion.id is not null then
    v_precio := public.aplicar_modalidad_a_base(v_promocion.precio_promocional, p_modalidad);
  else
    v_precio := public.precio_modalidad(p_plan_codigo, p_modalidad, p_cliente_id);
  end if;

  if v_licencia_anterior.id is not null then
    update public.licencias set vigente = false, fecha_fin_vigencia = now(),
      motivo_fin = coalesce(motivo_fin, 'Reemplazada por nueva licencia'), updated_at = now()
    where id = v_licencia_anterior.id;
    v_tipo_evento := case when v_licencia_anterior.plan_id != v_plan_id then 'CAMBIO_PLAN' else 'CAMBIO_MODALIDAD' end;
  elsif exists (select 1 from public.licencias where cliente_id = p_cliente_id) then
    v_tipo_evento := 'REACTIVACION';
  else
    v_tipo_evento := 'CREACION_LICENCIA';
  end if;

  v_periodo := case
    when p_estado = 'TRIAL' then interval '14 days'
    when p_modalidad = 'MENSUAL' then interval '1 month'
    when p_modalidad = 'TRIMESTRAL' then interval '3 months'
    when p_modalidad = 'ANUAL' then interval '1 year'
    else null
  end;

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, motivo, created_by
  ) values (
    p_cliente_id, v_plan_id, p_modalidad, p_estado,
    v_precio, true, p_origen, now(), case when v_periodo is not null then now() + v_periodo else null end,
    p_motivo, auth.uid()
  ) returning id into v_nueva_id;

  if v_promocion.id is not null then
    insert into public.promociones_comerciales_clientes (promocion_id, cliente_id, licencia_id, fecha_fin_beneficio)
    values (
      v_promocion.id, p_cliente_id, v_nueva_id,
      now() + make_interval(months => v_promocion.duracion_beneficio_meses)
    ) returning id into v_promo_cliente_id;
    update public.licencias set promocion_cliente_id = v_promo_cliente_id where id = v_nueva_id;
  end if;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_anteriores, datos_nuevos, motivo, actor)
  values (
    p_cliente_id, v_nueva_id, v_tipo_evento,
    case when v_licencia_anterior.id is not null then to_jsonb(v_licencia_anterior) else null end,
    jsonb_build_object('plan', p_plan_codigo, 'modalidad', p_modalidad, 'precio_aplicado', v_precio, 'promocion', p_promocion_codigo, 'estado', p_estado),
    p_motivo, auth.uid()
  );

  return v_nueva_id;
end;
$function$;

commit;
