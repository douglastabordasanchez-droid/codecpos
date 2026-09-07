-- Admin Web: staff podía ver/editar rol-activo/resetear password de
-- cualquier empleado (admin_listar_usuarios, admin_actualizar_empleado,
-- admin_resetear_password_empleado) pero nunca CREAR uno para un cliente
-- existente ni ELIMINARLO -- ClienteDetallePage solo mostraba el conteo
-- usuarios.total/limite, sin ningún listado ni acción. Mismo patrón que el
-- resto de RPCs staff-gated de este proyecto: es_staff_actual() + bloqueo de
-- nivel_staff='LECTURA' (igual que admin_resetear_password_empleado, 0077) +
-- auditoría (igual que admin_crear_cliente_base/admin_actualizar_empleado,
-- 0062).
begin;

-- Lista de empleados de UN cliente puntual, con email (admin_listar_usuarios
-- de 0078 es global, para todos los tenants; ClienteDetallePage necesita la
-- versión scoped a un solo cliente).
create or replace function public.admin_listar_empleados_cliente(p_cliente_id uuid)
returns table (
  id uuid, nombre_completo text, email text, rol text,
  activo boolean, telefono text, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select e.id, e.nombre_completo, u.email, e.rol, e.activo, e.telefono, e.created_at
  from public.empleados e
  join auth.users u on u.id = e.id
  where e.cliente_id = p_cliente_id and public.es_staff_actual()
  order by e.nombre_completo;
$$;
revoke all on function public.admin_listar_empleados_cliente(uuid) from public, anon;
grant execute on function public.admin_listar_empleados_cliente(uuid) to authenticated;

-- Crear empleado para un cliente puntual, desde el Admin Web -- mismo patrón
-- de alta directa en auth.users/auth.identities que admin_crear_cliente_base
-- (0062) e invitar_empleado (0013), pero sin scoping de tenant (solo staff,
-- para cualquier cliente).
create or replace function public.admin_crear_empleado(
  p_cliente_id uuid,
  p_email text,
  p_password text,
  p_nombre_completo text,
  p_rol text default 'cajero',
  p_telefono text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_email text := lower(trim(p_email));
  v_nombre_completo text := trim(p_nombre_completo);
  v_user_id uuid;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if public.nivel_staff_actual() = 'LECTURA' then
    raise exception 'Tu nivel de acceso es de solo lectura';
  end if;

  if not exists (select 1 from public.clientes_pos where id = p_cliente_id) then
    raise exception 'Cliente no encontrado';
  end if;
  if v_nombre_completo is null or length(v_nombre_completo) < 2 then
    raise exception 'Ingresa el nombre completo';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ingresa un correo válido';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  if p_rol not in ('super_usuario', 'admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then
    raise exception 'Rol inválido: %', p_rol;
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

  insert into public.empleados (id, cliente_id, nombre_completo, telefono, rol, activo)
  values (v_user_id, p_cliente_id, v_nombre_completo, nullif(trim(p_telefono), ''), p_rol, true);

  perform public.registrar_auditoria('CREAR_EMPLEADO', p_cliente_id, 'EXITO', jsonb_build_object('empleado_id', v_user_id, 'email', v_email, 'rol', p_rol));

  return v_user_id;
end;
$function$;

revoke all on function public.admin_crear_empleado(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_crear_empleado(uuid, text, text, text, text, text) to authenticated;

-- Eliminar (definitivo) un empleado -- solo si NO tiene ningún registro
-- transaccional/de auditoría asociado; si tiene, se rechaza pidiendo usar
-- "Desactivar" (admin_actualizar_empleado con p_activo=false) para no perder
-- historial de ventas/cierres por accidente. Nunca se expone a PWA/Electron
-- -- solo staff.
create or replace function public.admin_eliminar_empleado(p_empleado_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
  v_referencias int;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if public.nivel_staff_actual() = 'LECTURA' then
    raise exception 'Tu nivel de acceso es de solo lectura';
  end if;

  select cliente_id into v_cliente_id from public.empleados where id = p_empleado_id;
  if v_cliente_id is null then
    raise exception 'Empleado no encontrado';
  end if;

  select
    (select count(*) from public.ventas where empleado_id = p_empleado_id) +
    (select count(*) from public.cierres_caja where empleado_id = p_empleado_id) +
    (select count(*) from public.productos where updated_by = p_empleado_id) +
    (select count(*) from public.notificaciones_pago where confirmado_por = p_empleado_id) +
    (select count(*) from public.historial_comercial where actor = p_empleado_id)
  into v_referencias;

  if v_referencias > 0 then
    raise exception 'Este empleado tiene % registro(s) asociados (ventas, cierres, historial). No se puede eliminar de forma definitiva -- usa "Desactivar" en su lugar.', v_referencias;
  end if;

  perform public.registrar_auditoria('ELIMINAR_EMPLEADO', v_cliente_id, 'EXITO', jsonb_build_object('empleado_id', p_empleado_id));

  -- empleados.id referencia auth.users(id) on delete cascade (0001) -- la
  -- fila de empleados se borra sola.
  delete from auth.users where id = p_empleado_id;
end;
$function$;

revoke all on function public.admin_eliminar_empleado(uuid) from public, anon;
grant execute on function public.admin_eliminar_empleado(uuid) to authenticated;

-- Fix: admin_actualizar_empleado (0062) solo aceptaba 3 de los 7 roles
-- válidos -- ese era el bloqueo real en el BACKEND (no solo el <select>
-- corto de UsuariosPage.tsx). De paso se agrega el mismo bloqueo de
-- nivel_staff='LECTURA' que ya tiene admin_resetear_password_empleado (0077)
-- y que a esta función le faltaba.
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
  if public.nivel_staff_actual() = 'LECTURA' then
    raise exception 'Tu nivel de acceso es de solo lectura';
  end if;
  if p_rol is not null and p_rol not in ('super_usuario', 'admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then
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

commit;
