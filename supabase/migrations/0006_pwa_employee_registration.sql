-- Fase 4: registro de empleados reales para la PWA (distinto de la identidad
-- de sync "de máquina" de la Fase 2). Mismo patrón de auto-provisión gateada
-- por las credenciales de licencia ya existentes, pero produce una cuenta
-- personal (email + contraseña elegidos por la persona), no compartida.
create or replace function public.provisionar_empleado(
  p_cliente_id uuid,
  p_usuario_licencia text,
  p_password_licencia text,
  p_email text,
  p_password text,
  p_nombre_completo text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_licencia_valida boolean;
  v_existente uuid;
  v_user_id uuid;
begin
  select exists(
    select 1 from public.usuarios_clientes
    where cliente_id = p_cliente_id
      and username = p_usuario_licencia
      and "contraseña" = p_password_licencia
      and activo = true
  ) into v_licencia_valida;

  if not v_licencia_valida then
    raise exception 'Credenciales de licencia inválidas para este negocio';
  end if;

  select id into v_existente from auth.users where email = p_email;
  if v_existente is not null then
    raise exception 'Ya existe una cuenta con ese correo. Inicia sesión en su lugar.';
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
  values (v_user_id, p_cliente_id, p_nombre_completo, 'super_usuario', true);

  return v_user_id;
end;
$$;

grant execute on function public.provisionar_empleado(uuid, text, text, text, text, text) to anon, authenticated;
