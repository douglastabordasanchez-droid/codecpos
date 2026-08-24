-- Integración real de Mercado Pago (Checkout Pro) + ajustes comerciales
-- pedidos junto con ella:
--   1) Prueba gratuita: 14 días -> 3 meses (crear_cuenta_prueba + rama TRIAL
--      de registrar_licencia -- eran las dos únicas fuentes de verdad).
--   2) Precio Vitalicio: hasta hoy `precios` no tenía fila UNICO para ningún
--      plan (a propósito, "no inventar valor" -- ver migración 0047). Ahora
--      sí hay precio de lista, así que se define y se expone en
--      plan_catalogo_publico() (antes no lo devolvía en absoluto).
--   3) Usuario adicional: mismo caso -- `configuracion_comercial` y el addon
--      USUARIO_ADICIONAL estaban en null "no inventar valor". Se define acá,
--      en un solo lugar, para que ningún componente lo hardcodee.
--   4) Tabla `pagos_licencia`: registro de cada intento de pago con Mercado
--      Pago, para poder ser idempotente en el webhook y nunca activar una
--      licencia solo porque el usuario "volvió" del checkout.
begin;

-- ────────────────────────────────────────────────────────────────────────
-- 1) PRUEBA GRATUITA: 14 días -> 3 meses
-- ────────────────────────────────────────────────────────────────────────

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
    'PREMIUM', '1_MES', 'PRUEBA', true, 90, now()
  ) returning id into v_cliente_id;

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, es_staff_codec, activo)
  values (v_user_id, v_cliente_id, v_nombre_completo, v_telefono, 'admin', false, true);

  insert into public.licencias (
    cliente_id, plan_id, modalidad, estado, precio_aplicado, vigente, origen,
    fecha_inicio, fecha_fin_periodo_actual, motivo, created_by
  ) values (
    v_cliente_id, v_plan_id, 'MENSUAL', 'TRIAL', 0, true, 'TRIAL_SIGNUP',
    now(), now() + interval '3 months', 'Prueba gratuita de 3 meses -- registro público', v_user_id
  ) returning id into v_licencia_id;

  insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, datos_nuevos, motivo, actor)
  values (
    v_cliente_id, v_licencia_id, 'CREACION_LICENCIA',
    jsonb_build_object('plan', 'PREMIUM', 'estado', 'TRIAL', 'origen', 'TRIAL_SIGNUP'),
    'Registro público (Probar 3 meses gratis)', v_user_id
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
    when p_estado = 'TRIAL' then interval '3 months'
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

-- Cosmético: el mensaje del log ya no debe hardcodear una duración
-- específica (evita que vuelva a quedar desactualizado si cambia otra vez).
create or replace function public.expirar_pruebas_vencidas()
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
    select l.id, l.cliente_id
    from public.licencias l
    where l.estado = 'TRIAL' and l.vigente = true and l.fecha_fin_periodo_actual < now()
  loop
    update public.licencias set estado = 'EXPIRADA', updated_at = now() where id = v_lic.id;

    update public.clientes_pos set
      estado = 'VENCIDA', en_prueba = false, dias_prueba_restantes = 0, updated_at = now()
    where id = v_lic.cliente_id;

    insert into public.historial_comercial (cliente_id, licencia_id, tipo_evento, motivo)
    values (v_lic.cliente_id, v_lic.id, 'PRUEBA_VENCIDA', 'Prueba gratuita vencida automáticamente');

    v_afectados := v_afectados + 1;
  end loop;
  return v_afectados;
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────
-- 2) PRECIO VITALICIO (Básico y Premium)
-- ────────────────────────────────────────────────────────────────────────

insert into public.precios (plan_id, modalidad, precio)
select id, 'UNICO', 699900 from public.planes where codigo = 'BASICO'
union all
select id, 'UNICO', 1199900 from public.planes where codigo = 'PREMIUM';

-- Cambia la forma de la fila de retorno (se agrega precio_vitalicio) --
-- Postgres exige borrar la función antes de recrearla en ese caso.
drop function if exists public.plan_catalogo_publico();

create function public.plan_catalogo_publico()
returns table (
  plan_codigo text, plan_nombre text,
  precio_mensual numeric, precio_trimestral numeric, precio_anual numeric, precio_vitalicio numeric,
  promocion_activa boolean, precio_promocional_mensual numeric
) language sql stable security definer set search_path = public as $$
  select
    p.codigo, p.nombre,
    public.precio_modalidad(p.codigo, 'MENSUAL'),
    public.precio_modalidad(p.codigo, 'TRIMESTRAL'),
    public.precio_modalidad(p.codigo, 'ANUAL'),
    public.precio_modalidad(p.codigo, 'VITALICIA'),
    (public.promocion_vigente_para_nuevo(p.codigo)).id is not null,
    (public.promocion_vigente_para_nuevo(p.codigo)).precio_promocional
  from public.planes p where p.activo and not p.es_personalizable order by p.orden
$$;
grant execute on function public.plan_catalogo_publico() to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3) USUARIO ADICIONAL: $25.000 COP, centralizado (un solo lugar editable)
-- ────────────────────────────────────────────────────────────────────────

update public.configuracion_comercial set valor = '25000', updated_at = now()
where clave = 'precio_usuario_adicional';

update public.addons set precio = 25000
where codigo = 'USUARIO_ADICIONAL';

-- ────────────────────────────────────────────────────────────────────────
-- 4) PAGOS_LICENCIA: un registro por cada intento de pago con Mercado Pago.
--    Nunca se activa una licencia solo porque el usuario "volvió" del
--    checkout -- el webhook consulta el estado real en Mercado Pago y solo
--    entonces llama registrar_licencia(). external_reference es lo único
--    que el frontend/checkout conoce de antemano; mp_payment_id se llena
--    cuando el webhook confirma, y es único -- eso es lo que hace idempotente
--    procesar la misma notificación dos veces.
-- ────────────────────────────────────────────────────────────────────────

create table public.pagos_licencia (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id),
  plan_codigo text not null,
  modalidad text not null check (modalidad in ('MENSUAL', 'TRIMESTRAL', 'ANUAL', 'VITALICIA')),
  monto numeric(12,2) not null check (monto >= 0),
  moneda text not null default 'COP',
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'EN_PROCESO', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'REEMBOLSADO')),
  external_reference uuid not null unique default gen_random_uuid(),
  mp_preference_id text,
  mp_payment_id text unique,
  mp_status_detail text,
  licencia_id uuid references public.licencias(id),
  respuesta_mp jsonb,
  creado_por uuid references public.empleados(id),
  created_at timestamptz not null default now(),
  procesado_en timestamptz
);
create index idx_pagos_licencia_cliente on public.pagos_licencia(cliente_id);
create index idx_pagos_licencia_estado on public.pagos_licencia(estado);
comment on table public.pagos_licencia is 'Un registro por cada intento de checkout de Mercado Pago para activar/renovar una licencia. El backend (webhook) es la única fuente de verdad del estado -- nunca el frontend.';

alter table public.pagos_licencia enable row level security;

create policy pagos_licencia_select_propio on public.pagos_licencia
  for select to authenticated
  using (cliente_id = public.current_cliente_id() or public.es_staff_actual());

-- Sin policies de insert/update/delete para authenticated/anon a propósito:
-- todas las escrituras pasan por las Edge Functions (service_role, que
-- ignora RLS). Un cliente nunca puede crear ni modificar su propio registro
-- de pago directamente.

commit;
