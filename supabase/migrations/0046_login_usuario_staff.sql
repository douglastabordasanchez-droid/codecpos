-- El staff de Codec Studio (es_staff_codec = true) inicia sesión en el Panel
-- Desarrollador con su correo real, verificado por Supabase Auth (ver
-- StaffLoginGate.tsx / iniciarSesionStaff). El dueño pidió poder escribir un
-- usuario corto en vez de su correo — mismo patrón ya usado para dueños de
-- negocio entrando a la PWA con su usuario de licencia (ver
-- 0014_login_unico_dueno.sql, resolver_login_licencia): el usuario es SOLO
-- una forma de encontrar el correo real, la verificación de contraseña
-- sigue pasando 100% por Supabase Auth sin cambios — esto no reemplaza ni
-- debilita esa verificación, solo evita escribir el correo.

alter table public.empleados
  add column if not exists username text;

-- Único entre quienes lo usan (varios empleados pueden seguir sin username,
-- de ahí el índice parcial en vez de un unique constraint normal).
create unique index if not exists idx_empleados_username
  on public.empleados (username) where username is not null;

-- Devuelve el correo real asociado a un username de staff — SOLO para
-- es_staff_codec = true (un empleado normal de un negocio no puede usar
-- esto para "adivinar" el correo de otro empleado). No recibe ni verifica
-- contraseña — eso lo sigue haciendo exclusivamente supabase.auth.signInWithPassword
-- después, con el correo que esta función resuelve.
create or replace function public.resolver_email_staff(p_username text)
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.email
  from public.empleados e
  join auth.users u on u.id = e.id
  where e.username = p_username
    and e.es_staff_codec = true
  limit 1;
$$;

grant execute on function public.resolver_email_staff(text) to anon;
