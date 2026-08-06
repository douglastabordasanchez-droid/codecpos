-- Fix: auth.identities.email es columna GENERATED (derivada de identity_data),
-- no se puede insertar explícitamente. Se omite del INSERT.
create or replace function public.provisionar_sync_identidad(
  p_cliente_id uuid,
  p_usuario_licencia text,
  p_password_licencia text,
  p_sync_email text,
  p_sync_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_licencia_valida boolean;
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

  select id into v_user_id from auth.users where email = p_sync_email;
  if v_user_id is not null then
    return v_user_id;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    p_sync_email, crypt(p_sync_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_sync_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.sync_identidades (id, cliente_id) values (v_user_id, p_cliente_id)
    on conflict (cliente_id) do nothing;

  return v_user_id;
end;
$$;

grant execute on function public.provisionar_sync_identidad(uuid, text, text, text, text) to anon, authenticated;
