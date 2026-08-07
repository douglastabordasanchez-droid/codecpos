-- El dueño de un negocio debe poder entrar con UNA sola credencial tanto en
-- Electron (usuario/contraseña de licencia) como en la PWA — decisión
-- explícita del usuario para simplificar el onboarding de clientes nuevos.
-- Empleados individuales (cajeros, técnicos) siguen con cuenta propia por
-- correo, vía invitar_empleado (migración 0013) — esto NO los reemplaza.
--
-- Mecanismo: se provisiona una identidad de Supabase Auth "de dueño" con un
-- correo sintético (no se le muestra nunca al usuario) cuya contraseña es
-- LITERALMENTE la contraseña de licencia. El login de la PWA acepta el
-- usuario de licencia como alternativa a un correo real: resuelve el
-- cliente_id vía resolver_login_licencia (verificación server-side, sin
-- exponer usuarios_clientes a SELECT público) y arma el correo sintético.

create or replace function public.provisionar_dueno_pwa(
  p_cliente_id uuid,
  p_usuario_licencia text,
  p_password_licencia text,
  p_nombre_negocio text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_sync_email text := 'owner+' || p_cliente_id::text || '@codecpos.internal';
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = v_sync_email;

  if v_user_id is not null then
    -- Ya existe (regenerando tras cambio de contraseña de licencia, o
    -- backfill manual desde el Panel Desarrollador) — sincroniza la clave.
    update auth.users set encrypted_password = crypt(p_password_licencia, gen_salt('bf')), updated_at = now()
    where id = v_user_id;
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
    v_sync_email, crypt(p_password_licencia, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_sync_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.empleados (id, cliente_id, nombre_completo, rol, activo)
  values (v_user_id, p_cliente_id, coalesce(p_nombre_negocio, 'Propietario'), 'super_usuario', true)
  on conflict (id) do nothing;

  return v_user_id;
end;
$$;

grant execute on function public.provisionar_dueno_pwa(uuid, text, text, text) to anon, authenticated;

-- Resuelve un usuario de licencia + contraseña a su cliente_id, para que el
-- login de la PWA pueda aceptar "Admin" además de un correo real. No expone
-- usuarios_clientes — la verificación ocurre dentro del security definer.
create or replace function public.resolver_login_licencia(
  p_usuario text,
  p_password text
)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cliente_id from public.usuarios_clientes
  where username = p_usuario and "contraseña" = p_password and activo = true
  limit 1;
$$;

grant execute on function public.resolver_login_licencia(text, text) to anon;
