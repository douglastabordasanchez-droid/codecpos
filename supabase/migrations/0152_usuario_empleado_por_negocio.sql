-- 0152 · El usuario de un empleado es único DENTRO de su negocio, no en todo
-- el sistema: «prueba» puede existir en Tierra Colombiana y en otro negocio,
-- y son cuentas separadas que nunca se cruzan.
--
-- · Los usuarios de licencia (dueños) siguen siendo únicos en todo el sistema
--   y ningún empleado puede usar uno de ellos (_usuario_acceso_libre).
-- · Al entrar se distingue por la contraseña. Si dos negocios tienen el mismo
--   usuario con la misma contraseña, decide el negocio del equipo
--   (p_cliente_id) o el código del negocio escrito como «usuario#código».

drop index if exists public.idx_empleados_username;
drop index if exists public.idx_empleados_username_lower;
create unique index if not exists idx_empleados_cliente_username
  on public.empleados (cliente_id, lower(username)) where username is not null;
create index if not exists idx_empleados_username_busqueda
  on public.empleados (lower(username)) where username is not null;

-- Licencias: un usuario de licencia no puede repetirse con el de ningún empleado
-- (para que la cuenta del dueño nunca se confunda). Empleados: solo choca con
-- usuarios de licencia (los demás empleados se validan por negocio con el índice).
create or replace function public._usuario_acceso_libre()
returns trigger language plpgsql as $$
declare
  v_usuario text := lower(btrim(coalesce(new.username, '')));
begin
  if v_usuario = '' then return new; end if;
  if tg_table_name = 'usuarios_clientes' then
    if exists (select 1 from public.empleados e where lower(e.username) = v_usuario) then
      raise exception 'El usuario «%» ya está en uso, elige otro', new.username using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.usuarios_clientes u where lower(u.username) = v_usuario) then
      raise exception 'El usuario «%» está reservado, elige otro', new.username using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.resolver_login_empleado(text, text);
create or replace function public.resolver_login_empleado(
  p_usuario text, p_password text, p_cliente_id uuid default null)
returns text language plpgsql stable security definer set search_path = public, auth, extensions as $$
declare
  v_entrada text := btrim(coalesce(p_usuario, ''));
  v_usuario text;
  v_codigo text;
  v_correos text[];
  v_cliente uuid;
begin
  -- «usuario#código»: el código corto del negocio desempata.
  if position('#' in v_entrada) > 0 then
    v_usuario := lower(btrim(split_part(v_entrada, '#', 1)));
    v_codigo := upper(btrim(split_part(v_entrada, '#', 2)));
  else
    v_usuario := lower(v_entrada);
  end if;

  select array_agg(u.email), (array_agg(e.cliente_id))[1] into v_correos, v_cliente
  from public.empleados e
  join auth.users u on u.id = e.id
  left join public.clientes_pos cp on cp.id = e.cliente_id
  where lower(e.username) = v_usuario
    and e.activo = true
    and coalesce(e.es_staff_codec, false) = false
    and u.encrypted_password = crypt(p_password, u.encrypted_password)
    and (v_codigo is null or upper(cp.codigo_corto) = v_codigo);

  if v_correos is null then return null; end if;
  if array_length(v_correos, 1) = 1 then return v_correos[1]; end if;

  -- Varios negocios con el mismo usuario y la misma contraseña: decide el negocio del equipo.
  if p_cliente_id is not null then
    return (select u.email from public.empleados e join auth.users u on u.id = e.id
      where lower(e.username) = v_usuario and e.cliente_id = p_cliente_id and e.activo
        and u.encrypted_password = crypt(p_password, u.encrypted_password) limit 1);
  end if;
  raise exception 'Ese usuario existe en varios negocios. Escríbelo con el código de tu negocio, por ejemplo %#CÓDIGO (el código lo ve el administrador en Configuración).', v_usuario;
end;
$$;
grant execute on function public.resolver_login_empleado(text, text, uuid) to anon, authenticated;

-- Crear empleado: el usuario solo se valida dentro del negocio (y contra los de licencia).
create or replace function public.crear_empleado_usuario(
  p_usuario text, p_password text, p_nombre_completo text, p_rol text default 'cajero', p_telefono text default null)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_cliente_id uuid;
  v_rol_solicitante text;
  v_user_id uuid;
  v_usuario text := lower(btrim(p_usuario));
  v_email text;
begin
  select cliente_id, rol into v_cliente_id, v_rol_solicitante from public.empleados where id = auth.uid();
  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario') then
    raise exception 'No tienes permiso para agregar usuarios';
  end if;
  if p_rol not in ('admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then raise exception 'Rol inválido'; end if;
  if v_usuario !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'El usuario debe tener de 3 a 30 letras o números, sin espacios ni tildes';
  end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'La contraseña debe tener al menos 4 caracteres'; end if;
  if exists (select 1 from public.empleados where cliente_id = v_cliente_id and lower(username) = v_usuario) then
    raise exception 'Ya tienes un empleado con el usuario «%». Elige otro.', v_usuario;
  end if;
  if exists (select 1 from public.usuarios_clientes where lower(username) = v_usuario) then
    raise exception 'El usuario «%» está reservado, elige otro.', v_usuario;
  end if;

  v_user_id := gen_random_uuid();
  v_email := 'emp+' || v_user_id || '@codecpos.internal';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into public.empleados (id, cliente_id, nombre_completo, rol, activo, username, telefono)
  values (v_user_id, v_cliente_id, btrim(p_nombre_completo), p_rol, true, v_usuario, nullif(btrim(coalesce(p_telefono, '')), ''));
  return v_user_id;
end;
$$;
