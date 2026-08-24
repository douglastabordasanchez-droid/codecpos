-- Corrige una mala interpretación en la migración 0063: la prueba gratuita
-- SIEMPRE fue de 14 días -- lo que cambia a 3 meses es la ventana de precio
-- preferencial de lanzamiento ("Premium fundador 3 meses", $49.990/mes),
-- no el trial. Revierte crear_cuenta_prueba/registrar_licencia a 14 días y
-- ajusta la promoción LANZAMIENTO_PREMIUM_2026 de 6 a 3 meses de beneficio.
begin;

create or replace function public.crear_cuenta_prueba(
  p_nombre_completo text,
  p_nombre_negocio text,
  p_email text,
  p_telefono text,
  p_password text,
  p_nit text default null,
  p_ciudad text default null,
  p_tipo_negocio text default null
)
returns table(cliente_id uuid, licencia_id uuid)
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_email text := lower(trim(p_email));
  v_telefono text := trim(p_telefono);
  v_nombre_negocio text := trim(p_nombre_negocio);
  v_nombre_completo text := trim(p_nombre_completo);
  v_nit text := nullif(trim(p_nit), '');
  v_ciudad text := nullif(trim(p_ciudad), '');
  v_tipo_negocio text := nullif(trim(p_tipo_negocio), '');
  v_user_id uuid;
  v_cliente_id uuid;
  v_plan_id uuid;
  v_licencia_id uuid;
begin
  if v_nombre_completo is null or length(v_nombre_completo) < 2 then
    raise exception 'Ingresa tu nombre completo';
  end if;
  if v_nombre_negocio is null or length(v_nombre_negocio) < 2 then
    raise exception 'Ingresa el nombre de tu negocio';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ingresa un correo válido';
  end if;
  if v_telefono is null or length(v_telefono) < 7 then
    raise exception 'Ingresa un teléfono válido';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Ya existe una cuenta con ese correo -- inicia sesión en su lugar.';
  end if;
  if exists (select 1 from public.trial_uso_historico where lower(email) = v_email or telefono = v_telefono) then
    raise exception 'Ya se usó una prueba gratuita con este correo o teléfono. Si necesitas más tiempo, escríbenos a soporte.';
  end if;
  if v_nit is not null and exists (select 1 from public.trial_uso_historico where nit = v_nit) then
    raise exception 'Ya se usó una prueba gratuita con este NIT. Si necesitas más tiempo, escríbenos a soporte.';
  end if;

  select id into v_plan_id from public.planes where codigo = 'PREMIUM' and activo;
  if v_plan_id is null then
    raise exception 'No se pudo preparar el plan de prueba -- contacta soporte';
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('tipo_registro', 'NUEVO_NEGOCIO'),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.clientes_pos (
    nombre_negocio, contacto, telefono, email, nit, ciudad, tipo_negocio,
    plan, duracion, estado, en_prueba, dias_prueba_restantes, fecha_activacion
  ) values (
    v_nombre_negocio, v_nombre_completo, v_telefono, v_email, v_nit, v_ciudad, v_tipo_negocio,
    'PREMIUM', '1_MES', 'PRUEBA', true, 14, now()
  ) returning id into v_cliente_id;

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, es_staff_codec, activo)
  values (v_user_id, v_cliente_id, v_nombre_completo, v_telefono, 'admin', false, true);

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, motivo, created_by
  ) values (
    v_cliente_id, v_plan_id, 'MENSUAL', 'TRIAL', 0, true, 'TRIAL_SIGNUP',
    now(), now() + interval '14 days', 'Prueba gratuita de 14 días -- registro público', v_user_id
  ) returning id into v_licencia_id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, motivo, actor)
  values (
    v_cliente_id, v_licencia_id, 'CREACION_LICENCIA',
    jsonb_build_object('plan', 'PREMIUM', 'estado', 'TRIAL', 'origen', 'TRIAL_SIGNUP'),
    'Registro público (Probar 14 días gratis)', v_user_id
  );

  insert into public.trial_uso_historico (email, telefono, nit, cliente_id) values (v_email, v_telefono, v_nit, v_cliente_id);

  return query select v_cliente_id, v_licencia_id;
end;
$function$;

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

-- "Premium fundador 3 meses" ($49.990/mes) -- antes decía 6 meses de
-- beneficio para quien la adquiera; ahora son 3. Los clientes que YA la
-- tienen conservan la fecha_fin_beneficio que se les calculó al momento de
-- adquirirla (no se toca su historial), esto solo afecta a quien la
-- adquiera de ahora en adelante.
update public.promociones_comerciales
set duracion_beneficio_meses = 3
where codigo = 'LANZAMIENTO_PREMIUM_2026';

commit;
