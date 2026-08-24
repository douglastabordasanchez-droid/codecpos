-- Admin Web: hasta ahora solo podía VER clientes/usuarios, nunca crearlos ni
-- dar/quitar acceso -- el "crear cliente" real vivía únicamente en Panel
-- Desarrollador (clientesAdminService.ts), que escribe directo sobre
-- clientes_pos.estado/plan/duracion (columnas que, desde la Fase 3, un
-- trigger sincroniza automáticamente DESDE la licencia vigente -- ver
-- comentario en la tabla licencias, migración 0047). Para no volver a
-- desincronizar esas columnas, esta función solo crea la CUENTA base
-- (auth.users + clientes_pos + empleado dueño) sin tocar plan/duracion/
-- estado -- la licencia real se asigna aparte con `registrar_licencia`
-- (ya existe, ya expuesto en adminApi.ts, nunca antes usado desde ninguna
-- pantalla). Mismo patrón que crear_cuenta_prueba (migración 0055), pero
-- iniciado por staff en vez de por registro público, y sin las
-- restricciones antiabuso de la prueba gratuita.
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
  insert into public.clientes_pos (
    nombre_negocio, contacto, telefono, email, nit, ciudad, tipo_negocio,
    plan, duracion, estado, en_prueba, fecha_activacion
  ) values (
    v_nombre_negocio, v_nombre_completo, v_telefono, v_email, nullif(trim(p_nit), ''), nullif(trim(p_ciudad), ''), nullif(trim(p_tipo_negocio), ''),
    'BASICO', 'MENSUAL', 'PENDIENTE_PAGO', false, now()
  ) returning id into v_cliente_id;

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, es_staff_codec, activo)
  values (v_user_id, v_cliente_id, v_nombre_completo, v_telefono, 'admin', false, true);

  perform public.registrar_auditoria('CREAR_CLIENTE', v_cliente_id, 'EXITO', jsonb_build_object('nombre_negocio', v_nombre_negocio, 'email', v_email));

  return v_cliente_id;
end;
$function$;

revoke all on function public.admin_crear_cliente_base(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_crear_cliente_base(text, text, text, text, text, text, text, text) to authenticated;

-- `empleados` solo tenía policy de autoservicio (un empleado edita SU propia
-- fila) -- staff nunca pudo activar/desactivar ni cambiar el rol del
-- empleado de OTRO cliente sin esta función. Security definer en vez de una
-- policy nueva para dejar auditoría de cada cambio (igual que el resto de
-- acciones administrativas de este archivo).
create or replace function public.admin_actualizar_empleado(
  p_empleado_id uuid,
  p_activo boolean default null,
  p_rol text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if p_rol is not null and p_rol not in ('admin', 'super_usuario', 'cajero') then
    raise exception 'Rol desconocido: %', p_rol;
  end if;

  select cliente_id into v_cliente_id from public.empleados where id = p_empleado_id;
  if v_cliente_id is null then raise exception 'Empleado no encontrado'; end if;

  update public.empleados set
    activo = coalesce(p_activo, activo),
    rol = coalesce(p_rol, rol)
  where id = p_empleado_id;

  perform public.registrar_auditoria('ACTUALIZAR_EMPLEADO', v_cliente_id, 'EXITO', jsonb_build_object('empleado_id', p_empleado_id, 'activo', p_activo, 'rol', p_rol));
end;
$function$;

revoke all on function public.admin_actualizar_empleado(uuid, boolean, text) from public, anon;
grant execute on function public.admin_actualizar_empleado(uuid, boolean, text) to authenticated;

commit;
