-- 0150 · Control de usuarios, administradores y sedes por negocio.
--
-- Reglas (definidas con el dueño de Codec Studio, 2026-11-16):
--  · Usuarios activos por plan: Premium 10, Básico 5. Más usuarios: complemento
--    USUARIO_ADICIONAL que activa Codec Studio.
--  · Solo el DUEÑO del negocio crea administradores. Incluye 1 administrador y
--    1 más por cada sede adicional activa. Nadie crea cuentas de dueño
--    (super_usuario) desde la app.
--  · Solo el dueño crea sedes. El plan incluye la sede principal; cada sede
--    adicional cuesta 49.990/mes + 50.000 de instalación (complemento
--    SUCURSAL_ADICIONAL). Una sede nueva sin pagar entra en prueba gratis de
--    14 días; solo una sede en prueba a la vez.
--  · Lo que ya existía se respeta (administradores y sedes de antes no se tocan).
--  · Empleados con usuario corto (sin correo): crear_empleado_usuario.

-- ── Planes ───────────────────────────────────────────────────────────────────
update public.plan_entitlements pe set valor = jsonb_build_object('limite', 10)
from public.planes p, public.entitlements e
where pe.plan_id = p.id and pe.entitlement_id = e.id and p.codigo = 'PREMIUM' and e.codigo = 'MAX_USUARIOS';

update public.plan_entitlements pe set valor = jsonb_build_object('limite', 5)
from public.planes p, public.entitlements e
where pe.plan_id = p.id and pe.entitlement_id = e.id and p.codigo = 'BASICO' and e.codigo = 'MAX_USUARIOS';

-- La mensualidad incluye la sede principal; las demás son complemento pagado.
update public.plan_entitlements pe set valor = jsonb_build_object('limite', 1)
from public.planes p, public.entitlements e
where pe.plan_id = p.id and pe.entitlement_id = e.id and p.codigo in ('PREMIUM', 'BASICO') and e.codigo = 'MAX_SUCURSALES';

update public.addons set precio = 49990,
  descripcion = 'Sede adicional: 49.990 mensuales + 50.000 de instalación (una sola vez). Incluye 1 administrador para esa sede. La sede nueva tiene 14 días de prueba gratis.'
where codigo = 'SUCURSAL_ADICIONAL';

update public.addons set
  descripcion = 'Usuario adicional por encima del límite del plan (Premium 10, Básico 5). Lo activa Codec Studio.'
where codigo = 'USUARIO_ADICIONAL';

-- Los usuarios de soporte de Codec Studio no cuentan para el límite del cliente.
create or replace function public.contar_empleados_activos(p_cliente_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.empleados
  where cliente_id = p_cliente_id and activo and coalesce(es_staff_codec, false) = false
$$;

create or replace function public.validar_limite_empleados()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite numeric;
  v_actuales int;
begin
  -- Solo al crear uno activo o al reactivar uno inactivo.
  if not NEW.activo or coalesce(NEW.es_staff_codec, false) then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.activo then return NEW; end if;
  v_limite := public.limite_empleados_totales(NEW.cliente_id);
  if v_limite is not null then
    v_actuales := public.contar_empleados_activos(NEW.cliente_id);
    if v_actuales >= v_limite then
      raise exception 'Llegaste al límite de % usuarios activos de tu plan. Desactiva uno que ya no trabaje o comunícate con Codec Studio para agregar un usuario adicional.', v_limite;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validar_limite_empleados on public.empleados;
create trigger trg_validar_limite_empleados
  before insert or update of activo on public.empleados
  for each row execute function public.validar_limite_empleados();

-- ── Dueño del negocio ────────────────────────────────────────────────────────
-- Es dueño: la cuenta de la licencia (owner+<negocio>@codecpos.internal), un
-- super_usuario, o, en negocios sin cuenta de licencia, el primer administrador.
create or replace function public.es_dueno_negocio(p_empleado_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
declare
  e record;
  v_email text;
begin
  select id, cliente_id, rol, created_at into e from public.empleados where id = p_empleado_id;
  if e.id is null then return false; end if;
  if e.rol = 'super_usuario' then return true; end if;
  select email into v_email from auth.users where id = p_empleado_id;
  if v_email = 'owner+' || e.cliente_id || '@codecpos.internal' then return true; end if;
  if exists (select 1 from auth.users where email = 'owner+' || e.cliente_id || '@codecpos.internal')
     or exists (select 1 from public.empleados where cliente_id = e.cliente_id and rol = 'super_usuario' and activo) then
    return false;
  end if;
  return e.rol = 'admin' and e.id = (
    select id from public.empleados where cliente_id = e.cliente_id and rol = 'admin' and coalesce(es_staff_codec, false) = false
    order by created_at, id limit 1);
end;
$$;

-- ── Sedes: estado de cobro ───────────────────────────────────────────────────
alter table public.tiendas add column if not exists cobro_estado text not null default 'incluida';
alter table public.tiendas add column if not exists prueba_hasta timestamptz;
do $$ begin
  alter table public.tiendas add constraint tiendas_cobro_estado_check
    check (cobro_estado in ('incluida', 'pagada', 'prueba', 'vencida'));
exception when duplicate_object then null; end $$;

-- Las sedes que ya existían se respetan: la principal queda incluida y las demás pagadas.
update public.tiendas set cobro_estado = case when es_principal then 'incluida' else 'pagada' end
where cobro_estado = 'incluida' and not es_principal;

-- Sedes adicionales permitidas sin prueba: las del plan (menos la principal) + las compradas.
create or replace function public.sedes_adicionales_pagadas(p_cliente_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_plan numeric;
  v_addons int;
begin
  v_plan := public.entitlement_limite(p_cliente_id, 'MAX_SUCURSALES');
  select coalesce(sum(ac.cantidad), 0) into v_addons
  from public.addons_cliente ac join public.addons a on a.id = ac.addon_id
  where ac.cliente_id = p_cliente_id and ac.estado = 'ACTIVO' and a.codigo = 'SUCURSAL_ADICIONAL';
  return greatest(coalesce(v_plan, 1) - 1, 0) + v_addons;
end;
$$;

create or replace function public.controlar_creacion_sede()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller record;
  v_pagadas_usadas int;
  v_permitidas int;
begin
  if NEW.es_principal then NEW.cobro_estado := 'incluida'; return NEW; end if;
  select id, coalesce(es_staff_codec, false) as staff into v_caller from public.empleados where id = auth.uid();
  -- Codec Studio, el servidor o una restauración (sin sesión de empleado): se respeta lo que venga.
  if v_caller.id is null or v_caller.staff then
    if NEW.cobro_estado = 'incluida' then NEW.cobro_estado := 'pagada'; end if;
    return NEW;
  end if;
  if not public.es_dueno_negocio(v_caller.id) then
    raise exception 'Solo el dueño del negocio puede crear sedes.';
  end if;
  select count(*) into v_pagadas_usadas from public.tiendas
  where cliente_id = NEW.cliente_id and not es_principal and activo and cobro_estado in ('pagada', 'incluida');
  v_permitidas := public.sedes_adicionales_pagadas(NEW.cliente_id);
  if v_pagadas_usadas < v_permitidas then
    NEW.cobro_estado := 'pagada';
    NEW.prueba_hasta := null;
    return NEW;
  end if;
  if exists (select 1 from public.tiendas where cliente_id = NEW.cliente_id and activo and cobro_estado = 'prueba' and prueba_hasta > now()) then
    raise exception 'Ya tienes una sede en prueba. Para abrir otra, comunícate con Codec Studio (sede adicional: 49.990 mensuales + 50.000 de instalación).';
  end if;
  NEW.cobro_estado := 'prueba';
  NEW.prueba_hasta := now() + interval '14 days';
  return NEW;
end;
$$;

drop trigger if exists trg_controlar_creacion_sede on public.tiendas;
create trigger trg_controlar_creacion_sede
  before insert on public.tiendas
  for each row execute function public.controlar_creacion_sede();

-- Sedes en prueba que ya pasaron los 14 días: vencidas (la app avisa y bloquea vender en ellas).
create or replace function public.estado_sedes_negocio()
returns table (local_id text, nombre text, cobro_estado text, prueba_hasta timestamptz, dias_restantes int)
language sql stable security definer set search_path = public as $$
  select t.local_id, t.nombre,
    case when t.cobro_estado = 'prueba' and t.prueba_hasta <= now() then 'vencida' else t.cobro_estado end,
    t.prueba_hasta,
    case when t.cobro_estado = 'prueba' then greatest(ceil(extract(epoch from (t.prueba_hasta - now())) / 86400)::int, 0) end
  from public.tiendas t
  where t.cliente_id = public.current_cliente_id() and t.activo
  order by t.es_principal desc, t.nombre
$$;
grant execute on function public.estado_sedes_negocio() to authenticated;

-- Codec Studio marca una sede como pagada (al cobrar instalación y mensualidad).
create or replace function public.admin_marcar_sede_pagada(p_cliente_id uuid, p_local_id text, p_pagada boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.empleados where id = auth.uid() and coalesce(es_staff_codec, false)) then
    raise exception 'No autorizado';
  end if;
  update public.tiendas
  set cobro_estado = case when p_pagada then 'pagada' else 'prueba' end,
      prueba_hasta = case when p_pagada then null else now() end,
      updated_at = now()
  where cliente_id = p_cliente_id and local_id = p_local_id and not es_principal;
end;
$$;
grant execute on function public.admin_marcar_sede_pagada(uuid, text, boolean) to authenticated;

-- ── Administradores ──────────────────────────────────────────────────────────
-- 1 administrador incluido + 1 por cada sede adicional activa (pagada o en prueba vigente).
create or replace function public.limite_administradores(p_cliente_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select 1 + count(*)::int from public.tiendas
  where cliente_id = p_cliente_id and activo and not es_principal
    and (cobro_estado in ('pagada', 'incluida') or (cobro_estado = 'prueba' and prueba_hasta > now()))
$$;

create or replace function public.controlar_roles_empleados()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller record;
  v_admins int;
  v_limite int;
  v_nuevo_admin boolean;
begin
  select id, coalesce(es_staff_codec, false) as staff into v_caller from public.empleados where id = auth.uid();
  -- Codec Studio, el servidor, el registro de un negocio nuevo o el propio dueño al crear su cuenta.
  if v_caller.id is null or v_caller.staff or coalesce(NEW.es_staff_codec, false) then return NEW; end if;

  if NEW.rol = 'super_usuario' and (TG_OP = 'INSERT' or OLD.rol is distinct from 'super_usuario') then
    raise exception 'La cuenta de dueño solo la crea Codec Studio.';
  end if;

  v_nuevo_admin := NEW.rol = 'admin' and NEW.activo and (
    TG_OP = 'INSERT' or OLD.rol is distinct from 'admin' or not OLD.activo);
  if v_nuevo_admin then
    if not public.es_dueno_negocio(v_caller.id) then
      raise exception 'Solo el dueño del negocio puede crear administradores.';
    end if;
    select count(*) into v_admins from public.empleados e
    where e.cliente_id = NEW.cliente_id and e.rol = 'admin' and e.activo and e.id <> NEW.id
      and coalesce(e.es_staff_codec, false) = false and not public.es_dueno_negocio(e.id);
    v_limite := public.limite_administradores(NEW.cliente_id);
    if v_admins >= v_limite then
      raise exception 'Tu plan incluye % administrador(es). Cada sede adicional permite uno más; para otro, comunícate con Codec Studio.', v_limite;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_controlar_roles_empleados on public.empleados;
create trigger trg_controlar_roles_empleados
  before insert or update of rol, activo on public.empleados
  for each row execute function public.controlar_roles_empleados();

-- Nadie crea cuentas de dueño desde la app.
create or replace function public.invitar_empleado(p_email text, p_password text, p_nombre_completo text, p_rol text default 'cajero')
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_cliente_id uuid;
  v_rol_solicitante text;
  v_existente uuid;
  v_user_id uuid;
begin
  select cliente_id, rol into v_cliente_id, v_rol_solicitante from public.empleados where id = auth.uid();
  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario') then
    raise exception 'No tienes permiso para agregar usuarios';
  end if;
  if p_rol not in ('admin', 'cajero', 'tecnico', 'cocina', 'barra', 'mesero') then
    raise exception 'Rol inválido';
  end if;
  select id into v_existente from auth.users where email = p_email;
  if v_existente is not null then raise exception 'Ya existe una cuenta con ese correo'; end if;

  v_user_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
  insert into public.empleados (id, cliente_id, nombre_completo, rol, activo)
  values (v_user_id, v_cliente_id, p_nombre_completo, p_rol, true);
  return v_user_id;
end;
$$;

-- ── Empleado con usuario corto (sin correo) ──────────────────────────────────
-- La terminal y el celular crean cajeros, meseros, etc. con usuario y
-- contraseña. Quedan en el negocio de quien los crea y entran desde cualquier
-- equipo de ese negocio (resolver_login_empleado).
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
  if exists (select 1 from public.empleados where lower(username) = v_usuario)
     or exists (select 1 from public.usuarios_clientes where lower(username) = v_usuario) then
    raise exception 'El usuario «%» ya existe. Prueba con otro, por ejemplo agregando el nombre del negocio.', v_usuario;
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
revoke all on function public.crear_empleado_usuario(text, text, text, text, text) from public, anon;
grant execute on function public.crear_empleado_usuario(text, text, text, text, text) to authenticated;
