-- 0159: la caja y la terminal crean cajeros aunque su sesión de nube sea la del equipo.
--
-- Tierra Colombiana (2026-11-19): en la terminal Android, el dueño entraba y a los 2 s
-- la sincronización volvía a abrir la sesión con la cuenta del equipo (sync+...).
-- crear_empleado_usuario solo aceptaba empleados admin, así que respondía
-- "No tienes permiso para agregar usuarios" al dueño legítimo.
-- Ahora la cuenta del equipo (sync_identidades) puede crear personal de turno y
-- darle módulos, solo en su negocio y nunca administradores. Límites y reglas
-- de los triggers siguen igual.

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
  if v_cliente_id is null then
    -- Cuenta de sincronización del equipo (caja o terminal vinculada): la caja la
    -- usa para hablar con la nube aunque el dueño haya entrado. Solo crea personal
    -- de turno de su propio negocio, nunca administradores. La caja ya exige que
    -- quien crea sea el administrador del equipo.
    select cliente_id into v_cliente_id from public.sync_identidades where id = auth.uid();
    if v_cliente_id is not null then
      if p_rol = 'admin' then raise exception 'Los administradores los crea el dueño desde su cuenta'; end if;
      v_rol_solicitante := 'equipo';
    end if;
  end if;
  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario', 'equipo') then
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

create or replace function public.actualizar_permisos_empleado(
  p_empleado_id uuid,
  p_modulos text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_rol_solicitante text;
  v_cliente_objetivo uuid;
  v_rol_objetivo text;
begin
  select cliente_id, rol into v_cliente_id, v_rol_solicitante
  from public.empleados where id = auth.uid();

  if v_cliente_id is null then
    select cliente_id into v_cliente_id from public.sync_identidades where id = auth.uid();
    if v_cliente_id is not null then v_rol_solicitante := 'equipo'; end if;
  end if;

  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario', 'equipo') then
    raise exception 'No tienes permiso para editar permisos';
  end if;

  select cliente_id, rol into v_cliente_objetivo, v_rol_objetivo from public.empleados where id = p_empleado_id;

  if v_cliente_objetivo is null or v_cliente_objetivo <> v_cliente_id then
    raise exception 'Ese usuario no pertenece a tu negocio';
  end if;
  if v_rol_solicitante = 'equipo' and v_rol_objetivo in ('admin', 'super_usuario') then
    raise exception 'Los permisos de un administrador los cambia el dueño desde su cuenta';
  end if;

  update public.empleados
  set permisos = jsonb_build_object('modulosHabilitados', to_jsonb(coalesce(p_modulos, array[]::text[]))),
      updated_at = now()
  where id = p_empleado_id;
end;
$$;
grant execute on function public.actualizar_permisos_empleado(uuid, text[]) to authenticated;
