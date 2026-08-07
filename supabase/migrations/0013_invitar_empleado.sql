-- Un admin/super_usuario ya logueado puede agregar un compañero directo
-- desde Mi Perfil, sin tener que volver a escribir las credenciales de
-- licencia (esas ya se usaron una vez para crear SU propia cuenta vía
-- provisionar_empleado). La verificación de permiso es auth.uid() contra
-- empleados, no la licencia.
create or replace function public.invitar_empleado(
  p_email text,
  p_password text,
  p_nombre_completo text,
  p_rol text default 'cajero'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_cliente_id uuid;
  v_rol_solicitante text;
  v_existente uuid;
  v_user_id uuid;
begin
  select cliente_id, rol into v_cliente_id, v_rol_solicitante
  from public.empleados where id = auth.uid();

  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario') then
    raise exception 'No tienes permiso para agregar usuarios';
  end if;

  if p_rol not in ('super_usuario', 'admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then
    raise exception 'Rol inválido';
  end if;

  select id into v_existente from auth.users where email = p_email;
  if v_existente is not null then
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
    p_email, crypt(p_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.empleados (id, cliente_id, nombre_completo, rol, activo)
  values (v_user_id, v_cliente_id, p_nombre_completo, p_rol, true);

  return v_user_id;
end;
$$;

grant execute on function public.invitar_empleado(text, text, text, text) to authenticated;
