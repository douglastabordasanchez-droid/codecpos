-- Roles personalizados por negocio ("Supervisor", "Bodeguero", "Domiciliario"...)
-- creados por el administrador desde la web, el celular o Electron.
--
-- Un rol personalizado es una plantilla: un rol base operativo (cajero,
-- técnico, mesero, cocina o barra) más la lista de módulos que puede usar.
-- Al asignarlo, el empleado queda con `rol = rol_base` y
-- `permisos = { modulosHabilitados, rolPersonalizadoId, rolPersonalizadoNombre }`.
-- Así funciona en todo el ecosistema sin tocar los logins: Electron, la web y
-- el celular ya respetan `permisos.modulosHabilitados`.
--
-- A propósito no se puede crear un rol con base admin/super_usuario: un rol
-- personalizado sirve para RESTRINGIR, no para repartir poderes de dueño.
--
-- Las escrituras van solo por funciones security definer que exigen ser
-- admin/super_usuario del mismo negocio (igual que actualizar_empleado_admin).

create table if not exists public.roles_personalizados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  descripcion text,
  rol_base text not null check (rol_base in ('cajero', 'tecnico', 'mesero', 'cocina', 'barra')),
  modulos text[] not null default '{}',
  color text,
  creado_por uuid references public.empleados(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roles_personalizados_nombre_unico
  on public.roles_personalizados (cliente_id, lower(btrim(nombre)));

alter table public.roles_personalizados enable row level security;

drop policy if exists roles_personalizados_lectura on public.roles_personalizados;
create policy roles_personalizados_lectura on public.roles_personalizados
  for select to authenticated using (cliente_id = public.current_cliente_id());

revoke all on public.roles_personalizados from anon;
revoke insert, update, delete on public.roles_personalizados from authenticated;
grant select on public.roles_personalizados to authenticated;

-- Que la lista se actualice sola en los demás dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roles_personalizados'
  ) then
    alter publication supabase_realtime add table public.roles_personalizados;
  end if;
exception when undefined_object then null;
end $$;

-- ── Helper: quien llama debe ser admin del negocio ─────────────────────────
create or replace function public._cliente_de_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_rol text;
begin
  select cliente_id, rol into v_cliente, v_rol from public.empleados where id = auth.uid() and activo;
  if v_cliente is null or v_rol not in ('admin', 'super_usuario') then
    raise exception 'Solo un administrador puede gestionar roles y usuarios';
  end if;
  return v_cliente;
end;
$$;
revoke all on function public._cliente_de_admin() from public, anon, authenticated;

-- ── Crear o editar un rol ─────────────────────────────────────────────────
create or replace function public.guardar_rol_personalizado(
  p_id uuid,
  p_nombre text,
  p_rol_base text,
  p_modulos text[],
  p_descripcion text default null,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := public._cliente_de_admin();
  v_id uuid;
  v_modulos text[] := coalesce((select array_agg(distinct m) from unnest(coalesce(p_modulos, '{}')) m where m is not null and m <> ''), '{}');
begin
  if p_rol_base not in ('cajero', 'tecnico', 'mesero', 'cocina', 'barra') then
    raise exception 'El rol base debe ser cajero, técnico, mesero, cocina o barra';
  end if;
  if coalesce(array_length(v_modulos, 1), 0) = 0 then
    raise exception 'Elige al menos un módulo para el rol';
  end if;
  if exists (
    select 1 from public.roles_personalizados
    where cliente_id = v_cliente and lower(btrim(nombre)) = lower(btrim(p_nombre)) and id is distinct from p_id
  ) then
    raise exception 'Ya existe un rol con ese nombre';
  end if;

  if p_id is null then
    insert into public.roles_personalizados (cliente_id, nombre, descripcion, rol_base, modulos, color, creado_por)
    values (v_cliente, btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), p_rol_base, v_modulos, p_color, auth.uid())
    returning id into v_id;
  else
    update public.roles_personalizados
    set nombre = btrim(p_nombre),
        descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
        rol_base = p_rol_base,
        modulos = v_modulos,
        color = p_color,
        updated_at = now()
    where id = p_id and cliente_id = v_cliente
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese rol no existe en tu negocio';
    end if;

    -- Quienes ya tienen el rol reciben los cambios de inmediato.
    update public.empleados
    set rol = p_rol_base,
        permisos = coalesce(permisos, '{}'::jsonb) || jsonb_build_object(
          'modulosHabilitados', to_jsonb(v_modulos),
          'rolPersonalizadoId', v_id,
          'rolPersonalizadoNombre', btrim(p_nombre)
        ),
        updated_at = now()
    where cliente_id = v_cliente
      and permisos->>'rolPersonalizadoId' = v_id::text
      and rol not in ('admin', 'super_usuario');
  end if;

  return v_id;
end;
$$;
grant execute on function public.guardar_rol_personalizado(uuid, text, text, text[], text, text) to authenticated;

-- ── Eliminar un rol ───────────────────────────────────────────────────────
-- Quien lo tenía conserva su rol base y sus módulos actuales (no se le corta
-- el acceso de golpe); solo deja de figurar con el nombre del rol.
create or replace function public.eliminar_rol_personalizado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := public._cliente_de_admin();
begin
  update public.empleados
  set permisos = permisos - 'rolPersonalizadoId' - 'rolPersonalizadoNombre',
      updated_at = now()
  where cliente_id = v_cliente and permisos->>'rolPersonalizadoId' = p_id::text;

  delete from public.roles_personalizados where id = p_id and cliente_id = v_cliente;
end;
$$;
grant execute on function public.eliminar_rol_personalizado(uuid) to authenticated;

-- ── Asignar un rol (de sistema o personalizado) a un empleado ─────────────
create or replace function public.asignar_rol_empleado(
  p_empleado_id uuid,
  p_rol text,
  p_rol_personalizado_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := public._cliente_de_admin();
  v_rp public.roles_personalizados;
  v_permisos jsonb;
begin
  if p_empleado_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol';
  end if;
  select permisos into v_permisos from public.empleados where id = p_empleado_id and cliente_id = v_cliente;
  if not found then
    raise exception 'Ese usuario no pertenece a tu negocio';
  end if;

  if p_rol_personalizado_id is not null then
    select * into v_rp from public.roles_personalizados where id = p_rol_personalizado_id and cliente_id = v_cliente;
    if v_rp.id is null then
      raise exception 'Ese rol no existe en tu negocio';
    end if;
    update public.empleados
    set rol = v_rp.rol_base,
        permisos = coalesce(permisos, '{}'::jsonb) || jsonb_build_object(
          'modulosHabilitados', to_jsonb(v_rp.modulos),
          'rolPersonalizadoId', v_rp.id,
          'rolPersonalizadoNombre', v_rp.nombre
        ),
        updated_at = now()
    where id = p_empleado_id;
    return;
  end if;

  if p_rol not in ('super_usuario', 'admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then
    raise exception 'Rol inválido';
  end if;

  update public.empleados
  set rol = p_rol,
      -- Si venía de un rol personalizado, sus módulos eran los del rol: se
      -- quitan para que tome los del rol de sistema. Los permisos puestos a
      -- mano a un rol de sistema se respetan.
      permisos = case
        when coalesce(permisos, '{}'::jsonb) ? 'rolPersonalizadoId'
          then permisos - 'rolPersonalizadoId' - 'rolPersonalizadoNombre' - 'modulosHabilitados'
        else permisos
      end,
      updated_at = now()
  where id = p_empleado_id;
end;
$$;
grant execute on function public.asignar_rol_empleado(uuid, text, uuid) to authenticated;

-- ── Crear un usuario con su rol en un solo paso ───────────────────────────
create or replace function public.crear_empleado_con_rol(
  p_email text,
  p_password text,
  p_nombre_completo text,
  p_rol text,
  p_rol_personalizado_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_cliente uuid := public._cliente_de_admin();
  v_rp public.roles_personalizados;
  v_id uuid;
begin
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  if char_length(btrim(coalesce(p_nombre_completo, ''))) < 2 then
    raise exception 'Escribe el nombre de la persona';
  end if;

  if p_rol_personalizado_id is not null then
    select * into v_rp from public.roles_personalizados where id = p_rol_personalizado_id and cliente_id = v_cliente;
    if v_rp.id is null then
      raise exception 'Ese rol no existe en tu negocio';
    end if;
    v_id := public.invitar_empleado(lower(btrim(p_email)), p_password, btrim(p_nombre_completo), v_rp.rol_base);
    update public.empleados
    set permisos = jsonb_build_object(
          'modulosHabilitados', to_jsonb(v_rp.modulos),
          'rolPersonalizadoId', v_rp.id,
          'rolPersonalizadoNombre', v_rp.nombre
        )
    where id = v_id;
  else
    v_id := public.invitar_empleado(lower(btrim(p_email)), p_password, btrim(p_nombre_completo), p_rol);
  end if;
  return v_id;
end;
$$;
grant execute on function public.crear_empleado_con_rol(text, text, text, text, uuid) to authenticated;

revoke execute on function public.guardar_rol_personalizado(uuid, text, text, text[], text, text) from anon;
revoke execute on function public.eliminar_rol_personalizado(uuid) from anon;
revoke execute on function public.asignar_rol_empleado(uuid, text, uuid) from anon;
revoke execute on function public.crear_empleado_con_rol(text, text, text, text, uuid) from anon;
