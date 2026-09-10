-- Bug: admin_crear_cliente_base (0062) insertaba duracion = 'MENSUAL' en
-- clientes_pos, pero esa columna solo acepta los valores legacy
-- ('1_MES', '3_MESES', '1_ANO', 'VITALICIA' -- ver SCHEMA_GESTION_REMOTA_COMPLETO.sql
-- y el mapeo real en sincronizar_cliente_pos_desde_licencia, migración 0047).
-- Esto rompía TODA alta manual de cliente desde Admin Web con
-- "violates check constraint clientes_pos_duracion_check", sin importar qué
-- plan/modalidad eligiera el staff en el formulario (el insert que fallaba
-- es el placeholder previo a asignar la licencia real, no el que depende del
-- select de modalidad). El flujo de registro público (0066) ya usaba el
-- valor correcto ('1_MES'); aquí solo se corrige ese único literal.
begin;

create or replace function public.admin_crear_cliente_base(
  p_nombre_negocio text,
  p_nombre_completo text,
  p_email text,
  p_telefono text,
  p_password text,
  p_nit text default null,
  p_ciudad text default null,
  p_tipo_negocio text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_email text := lower(trim(p_email));
  v_telefono text := trim(p_telefono);
  v_nombre_negocio text := trim(p_nombre_negocio);
  v_nombre_completo text := trim(p_nombre_completo);
  v_user_id uuid;
  v_cliente_id uuid;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;

  if v_nombre_negocio is null or length(v_nombre_negocio) < 2 then
    raise exception 'Ingresa el nombre del negocio';
  end if;
  if v_nombre_completo is null or length(v_nombre_completo) < 2 then
    raise exception 'Ingresa el nombre del dueño';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ingresa un correo válido';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Ya existe una cuenta con ese correo';
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
    jsonb_build_object('tipo_registro', 'ALTA_MANUAL_STAFF'),
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

  -- estado inicial 'PENDIENTE_PAGO' -- placeholder hasta que se le asigne
  -- una licencia real con registrar_licencia() justo después; ese trigger
  -- de sincronización deja el valor correcto apenas exista la licencia.
  -- 🛡️ FIX: 'MENSUAL' no es un valor válido de clientes_pos.duracion (el
  -- check constraint solo acepta '1_MES' | '3_MESES' | '1_ANO' | 'VITALICIA').
  insert into public.clientes_pos (
    nombre_negocio, contacto, telefono, email, nit, ciudad, tipo_negocio,
    plan, duracion, estado, en_prueba, fecha_activacion
  ) values (
    v_nombre_negocio, v_nombre_completo, v_telefono, v_email, nullif(trim(p_nit), ''), nullif(trim(p_ciudad), ''), nullif(trim(p_tipo_negocio), ''),
    'BASICO', '1_MES', 'PENDIENTE_PAGO', false, now()
  ) returning id into v_cliente_id;

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, es_staff_codec, activo)
  values (v_user_id, v_cliente_id, v_nombre_completo, v_telefono, 'admin', false, true);

  perform public.registrar_auditoria('CREAR_CLIENTE', v_cliente_id, 'EXITO', jsonb_build_object('nombre_negocio', v_nombre_negocio, 'email', v_email));

  return v_cliente_id;
end;
$function$;

revoke all on function public.admin_crear_cliente_base(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_crear_cliente_base(text, text, text, text, text, text, text, text) to authenticated;

commit;
