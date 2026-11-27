-- 0171 · Mis finanzas: finanzas personales y de la empresa del dueño.
--
-- Un «libro» de finanzas es privado: lo ven solo sus miembros (finanzas_miembros).
-- El dueño invita a otros usuarios como editor (registra) o lector (solo ve).
-- Ni el staff de Codec ni los demás super usuarios del negocio lo ven si no
-- están invitados. Todo pasa por finanzas_rol(libro), que mira auth.uid().
--
-- Movimientos: ingreso, gasto o transferencia entre cuentas, cada uno
-- marcado como personal o de la empresa. Presupuestos mensuales por
-- categoría, metas de ahorro, deudas (lo que debo y lo que me deben, con
-- abonos como movimientos) y pagos fijos del mes.

create table if not exists public.finanzas_libros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes_pos(id) on delete cascade,
  nombre text not null default 'Mis finanzas',
  creado_por uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.finanzas_miembros (
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  rol text not null check (rol in ('dueno', 'editor', 'lector')),
  created_at timestamptz not null default now(),
  primary key (libro_id, empleado_id)
);
create index if not exists finanzas_miembros_empleado_idx on public.finanzas_miembros (empleado_id);

create or replace function public.finanzas_rol(p_libro uuid)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select rol from public.finanzas_miembros where libro_id = p_libro and empleado_id = auth.uid()
$$;

create table if not exists public.finanzas_cuentas (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'efectivo' check (tipo in ('efectivo', 'banco', 'nequi', 'daviplata', 'tarjeta', 'ahorro', 'otra')),
  saldo_inicial numeric not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.finanzas_deudas (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  tipo text not null check (tipo in ('debo', 'me_deben')),
  ambito text not null default 'personal' check (ambito in ('personal', 'empresa')),
  persona text not null,
  concepto text,
  monto numeric not null check (monto > 0),
  fecha date not null default current_date,
  vence date,
  saldada boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.finanzas_fijos (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  nombre text not null,
  ambito text not null default 'personal' check (ambito in ('personal', 'empresa')),
  categoria text not null default 'otros',
  monto numeric not null check (monto > 0),
  dia_mes int not null default 1 check (dia_mes between 1 and 31),
  cuenta_id uuid references public.finanzas_cuentas(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.finanzas_movimientos (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'gasto', 'transferencia')),
  ambito text not null default 'personal' check (ambito in ('personal', 'empresa')),
  categoria text not null default 'otros',
  monto numeric not null check (monto > 0),
  cuenta_id uuid references public.finanzas_cuentas(id) on delete set null,
  cuenta_destino_id uuid references public.finanzas_cuentas(id) on delete set null,
  descripcion text,
  deuda_id uuid references public.finanzas_deudas(id) on delete set null,
  fijo_id uuid references public.finanzas_fijos(id) on delete set null,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists finanzas_movimientos_libro_fecha_idx on public.finanzas_movimientos (libro_id, fecha desc);

create table if not exists public.finanzas_presupuestos (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  ambito text not null default 'personal' check (ambito in ('personal', 'empresa')),
  categoria text not null,
  monto_mensual numeric not null check (monto_mensual > 0),
  created_at timestamptz not null default now(),
  unique (libro_id, ambito, categoria)
);

create table if not exists public.finanzas_metas (
  id uuid primary key default gen_random_uuid(),
  libro_id uuid not null references public.finanzas_libros(id) on delete cascade,
  nombre text not null,
  objetivo numeric not null check (objetivo > 0),
  ahorrado numeric not null default 0 check (ahorrado >= 0),
  fecha_limite date,
  created_at timestamptz not null default now()
);

-- ── Seguridad ─────────────────────────────────────────────────────────────

alter table public.finanzas_libros enable row level security;
alter table public.finanzas_miembros enable row level security;

drop policy if exists finanzas_libros_ver on public.finanzas_libros;
create policy finanzas_libros_ver on public.finanzas_libros
  for select to authenticated using (public.finanzas_rol(id) is not null);

drop policy if exists finanzas_miembros_ver on public.finanzas_miembros;
create policy finanzas_miembros_ver on public.finanzas_miembros
  for select to authenticated using (public.finanzas_rol(libro_id) is not null);

do $$
declare t text;
begin
  foreach t in array array['finanzas_cuentas', 'finanzas_deudas', 'finanzas_fijos', 'finanzas_movimientos', 'finanzas_presupuestos', 'finanzas_metas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.finanzas_rol(libro_id) is not null)', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.finanzas_rol(libro_id) in (''dueno'', ''editor'')) with check (public.finanzas_rol(libro_id) in (''dueno'', ''editor''))', t || '_editar', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.finanzas_libros from anon;
revoke all on public.finanzas_miembros from anon;
grant select on public.finanzas_libros to authenticated;
grant select on public.finanzas_miembros to authenticated;

-- ── Funciones ─────────────────────────────────────────────────────────────

create or replace function public.finanzas_mis_libros()
returns table (id uuid, nombre text, cliente_id uuid, rol text)
language sql stable security definer
set search_path to 'public'
as $$
  select l.id, l.nombre, l.cliente_id, m.rol
  from public.finanzas_miembros m join public.finanzas_libros l on l.id = m.libro_id
  where m.empleado_id = auth.uid()
  order by m.rol = 'dueno' desc, l.created_at
$$;

create or replace function public.finanzas_personas(p_libro uuid)
returns table (empleado_id uuid, nombre text, usuario text, negocio text, rol text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if public.finanzas_rol(p_libro) is null then raise exception 'No tienes acceso a estas finanzas'; end if;
  return query
    select e.id, e.nombre_completo, e.username, c.nombre_negocio, m.rol
    from public.finanzas_miembros m
    join public.empleados e on e.id = m.empleado_id
    left join public.clientes_pos c on c.id = e.cliente_id
    where m.libro_id = p_libro
    order by m.rol = 'dueno' desc, e.nombre_completo;
end;
$$;

-- Invita con lo mismo que la persona usa para entrar a la app: su usuario,
-- su correo o el usuario de licencia del negocio (el dueño). Solo el dueño.
create or replace function public.finanzas_invitar(p_libro uuid, p_usuario text, p_rol text)
returns text
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_emp public.empleados;
  v_txt text := lower(trim(p_usuario));
  v_cliente uuid := (select cliente_id from public.finanzas_libros where id = p_libro);
  v_cli_lic uuid;
begin
  if public.finanzas_rol(p_libro) is distinct from 'dueno' then raise exception 'Solo el dueño puede dar acceso'; end if;
  if p_rol not in ('editor', 'lector', 'dueno') then raise exception 'Permiso no válido'; end if;
  if v_txt = '' then raise exception 'Escribe el usuario o el correo'; end if;

  -- 1. Usuario de un empleado de este mismo negocio.
  select * into v_emp from public.empleados where activo and cliente_id = v_cliente and lower(username) = v_txt limit 1;
  -- 2. Correo con que entra.
  if v_emp.id is null then
    select e.* into v_emp from public.empleados e join auth.users u on u.id = e.id
    where e.activo and lower(u.email) = v_txt limit 1;
  end if;
  -- 3. Usuario de licencia de un negocio: es su dueño.
  if v_emp.id is null then
    select cliente_id into v_cli_lic from public.usuarios_clientes where lower(username) = v_txt and activo limit 1;
    if v_cli_lic is not null then
      select e.* into v_emp from public.empleados e join auth.users u on u.id = e.id
      where e.activo and u.email = 'owner+' || v_cli_lic || '@codecpos.internal' limit 1;
    end if;
  end if;
  -- 4. Usuario de un empleado de otro negocio, solo si no hay dos iguales.
  if v_emp.id is null and (select count(*) from public.empleados where activo and lower(username) = v_txt) = 1 then
    select * into v_emp from public.empleados where activo and lower(username) = v_txt;
  end if;
  if v_emp.id is null then raise exception 'No encontré a nadie con «%»', trim(p_usuario); end if;
  insert into public.finanzas_miembros (libro_id, empleado_id, rol) values (p_libro, v_emp.id, p_rol)
    on conflict (libro_id, empleado_id) do update set rol = excluded.rol;
  return v_emp.nombre_completo;
end;
$$;

create or replace function public.finanzas_quitar(p_libro uuid, p_empleado uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if public.finanzas_rol(p_libro) is distinct from 'dueno' then raise exception 'Solo el dueño puede quitar el acceso'; end if;
  if (select rol from public.finanzas_miembros where libro_id = p_libro and empleado_id = p_empleado) = 'dueno'
     and (select count(*) from public.finanzas_miembros where libro_id = p_libro and rol = 'dueno') <= 1 then
    raise exception 'El libro necesita al menos un dueño';
  end if;
  delete from public.finanzas_miembros where libro_id = p_libro and empleado_id = p_empleado;
end;
$$;

revoke all on function public.finanzas_mis_libros() from anon;
revoke all on function public.finanzas_personas(uuid) from anon;
revoke all on function public.finanzas_invitar(uuid, text, text) from anon;
revoke all on function public.finanzas_quitar(uuid, uuid) from anon;
grant execute on function public.finanzas_mis_libros() to authenticated;
grant execute on function public.finanzas_personas(uuid) to authenticated;
grant execute on function public.finanzas_invitar(uuid, text, text) to authenticated;
grant execute on function public.finanzas_quitar(uuid, uuid) to authenticated;
