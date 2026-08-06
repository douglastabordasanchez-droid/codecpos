-- Fase 2: motor de sincronización Electron <-> Supabase.
-- 1) Columnas adicionales para no perder datos locales al sincronizar productos/ventas.
-- 2) Identidad de "sync" por negocio (no humana): permite que una instalación de
--    Electron escriba bajo RLS sin depender de que cada empleado tenga cuenta
--    individual en Supabase Auth. Se auto-provisiona una sola vez reutilizando
--    las credenciales de licencia YA existentes en usuarios_clientes como prueba
--    de propiedad del negocio — cero pasos manuales, cero secretos nuevos que
--    distribuir.

-- ============================================================
-- PRODUCTOS: columnas que faltaban para no perder fidelidad
-- ============================================================
alter table public.productos
  add column if not exists local_id text,
  add column if not exists stock_minimo numeric(12,2),
  add column if not exists unidad text,
  add column if not exists iva numeric(5,2) default 0,
  add column if not exists fecha_vencimiento date,
  add column if not exists proveedor text;

create unique index if not exists productos_cliente_local_id_key
  on public.productos(cliente_id, local_id) where local_id is not null;

-- ============================================================
-- VENTAS / VENTA_ITEMS: idem
-- ============================================================
alter table public.ventas
  add column if not exists local_id text,
  add column if not exists numero integer,
  add column if not exists cajero_nombre text,
  add column if not exists metodos_multiples jsonb;

create unique index if not exists ventas_cliente_local_id_key
  on public.ventas(cliente_id, local_id) where local_id is not null;

alter table public.venta_items
  add column if not exists nombre text,
  add column if not exists subtotal numeric(12,2);

-- ============================================================
-- IDENTIDAD DE SYNC POR NEGOCIO
-- ============================================================
create table if not exists public.sync_identidades (
  id uuid primary key references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes_pos(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists sync_identidades_cliente_id_key on public.sync_identidades(cliente_id);

alter table public.sync_identidades enable row level security;
drop policy if exists sync_identidades_self on public.sync_identidades;
create policy sync_identidades_self on public.sync_identidades
  for select using (id = auth.uid());

-- current_cliente_id() ahora también reconoce identidades de sync, además de empleados humanos.
create or replace function public.current_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cliente_id from public.empleados where id = auth.uid()),
    (select cliente_id from public.sync_identidades where id = auth.uid())
  )
$$;

-- ============================================================
-- PROVISIONAMIENTO AUTO-CONTENIDO DE LA IDENTIDAD DE SYNC
-- Gateado por las credenciales de licencia ya existentes (usuarios_clientes).
-- Idempotente: si el email de sync ya existe, retorna el id existente.
-- ============================================================
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
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, email
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_sync_email, 'email_verified', true),
    'email', now(), now(), now(), p_sync_email
  );

  insert into public.sync_identidades (id, cliente_id) values (v_user_id, p_cliente_id)
    on conflict (cliente_id) do nothing;

  return v_user_id;
end;
$$;

grant execute on function public.provisionar_sync_identidad(uuid, text, text, text, text) to anon, authenticated;
