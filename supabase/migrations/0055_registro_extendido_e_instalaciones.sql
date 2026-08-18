-- Fase 5 (ampliación): campos de registro adicionales (NIT, ciudad, tipo de
-- negocio) pedidos en el punto 3, y seguimiento real de instalaciones
-- Electron/PWA (punto 34) -- hasta ahora la tabla `instalaciones` del motor
-- comercial (Fase 3) existía pero ningún código la usaba.

begin;

alter table public.clientes_pos add column if not exists ciudad text;
alter table public.clientes_pos add column if not exists tipo_negocio text;

alter table public.instalaciones add column if not exists version text;

-- NIT como señal adicional de antiabuso (punto 35) -- solo bloquea cuando
-- el cliente sí lo proporciona (el registro mínimo no lo exige).
alter table public.trial_uso_historico add column if not exists nit text;
create unique index if not exists idx_trial_uso_historico_nit
  on public.trial_uso_historico (nit) where nit is not null;

-- Cambia de firma (se agregan nit/ciudad/tipo_negocio) -- Postgres trata un
-- cambio de firma como una función distinta, no un reemplazo in-place, así
-- que hay que borrar la versión anterior explícitamente.
drop function if exists public.crear_cuenta_prueba(text, text, text, text, text);

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

revoke all on function public.crear_cuenta_prueba(text, text, text, text, text, text, text, text) from public, authenticated;
grant execute on function public.crear_cuenta_prueba(text, text, text, text, text, text, text, text) to anon;

-- Registro/actualización de la propia instalación (Electron o PWA) -- un
-- empleado admin/super_usuario ya autenticado registra SU instalación,
-- nunca la de otro cliente (a diferencia de "instalaciones escritura
-- staff", que sigue existiendo para el Admin Web).
create or replace function public.registrar_instalacion(
  p_machine_id text,
  p_tipo text,
  p_version text default null,
  p_sucursal_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
  v_id uuid;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null then
    raise exception 'No autorizado';
  end if;
  if p_tipo not in ('ELECTRON', 'PWA') then
    raise exception 'Tipo de instalación desconocido: %', p_tipo;
  end if;

  select id into v_id from public.instalaciones
  where cliente_id = v_cliente_id and machine_id = p_machine_id and tipo = p_tipo;

  if v_id is not null then
    update public.instalaciones set
      version = coalesce(p_version, version),
      sucursal_id = coalesce(p_sucursal_id, sucursal_id),
      estado = 'ACTIVA',
      ultima_conexion = now()
    where id = v_id;
  else
    insert into public.instalaciones (cliente_id, sucursal_id, machine_id, tipo, version, estado, activada_en, ultima_conexion)
    values (v_cliente_id, p_sucursal_id, p_machine_id, p_tipo, p_version, 'ACTIVA', now(), now())
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.registrar_instalacion(text, text, text, uuid) from public, anon;
grant execute on function public.registrar_instalacion(text, text, text, uuid) to authenticated;

commit;
