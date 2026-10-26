-- 0132 · Empleados que entran con un usuario corto (sin correo) y empleados
-- que solo agregan.
--
-- · resolver_login_empleado: igual que resolver_login_licencia (0014) pero
--   para un empleado con `username`. Exige la contraseña correcta antes de
--   devolver el correo, así no sirve para averiguar cuentas ajenas; el login
--   lo sigue verificando signInWithPassword con ese correo.
-- · permisos.soloAgregar = true: el empleado crea productos, ventas y gastos
--   pero no cambia ni borra lo que ya existe. Las ventas le siguen
--   descontando stock (stock, updated_at y updated_by no cuentan como
--   modificar el producto).
-- · permisos.soloCelular = true lo respetan la app y Electron (no hay forma
--   fiable de saberlo en el servidor).

create or replace function public.resolver_login_empleado(p_usuario text, p_password text)
returns text
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select u.email
  from public.empleados e
  join auth.users u on u.id = e.id
  where lower(e.username) = lower(btrim(p_usuario))
    and e.activo = true
    and coalesce(e.es_staff_codec, false) = false
    and u.encrypted_password = crypt(p_password, u.encrypted_password)
  limit 1;
$$;
grant execute on function public.resolver_login_empleado(text, text) to anon, authenticated;

create unique index if not exists idx_empleados_username_lower
  on public.empleados (lower(username)) where username is not null;

create or replace function public._empleado_solo_agregar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (e.permisos->>'soloAgregar')::boolean from public.empleados e where e.id = auth.uid()), false);
$$;
revoke all on function public._empleado_solo_agregar() from public, anon;
grant execute on function public._empleado_solo_agregar() to authenticated;

create or replace function public.proteger_registros_solo_agregar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public._empleado_solo_agregar() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'productos'
     and (to_jsonb(new) - 'stock' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'stock' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  raise exception 'Tu usuario solo puede agregar registros nuevos; pídele al administrador que haga este cambio';
end;
$$;

drop trigger if exists trg_productos_solo_agregar on public.productos;
create trigger trg_productos_solo_agregar before update or delete on public.productos
  for each row execute function public.proteger_registros_solo_agregar();

drop trigger if exists trg_gastos_solo_agregar on public.gastos;
create trigger trg_gastos_solo_agregar before update or delete on public.gastos
  for each row execute function public.proteger_registros_solo_agregar();

drop trigger if exists trg_ventas_solo_agregar on public.ventas;
create trigger trg_ventas_solo_agregar before delete on public.ventas
  for each row execute function public.proteger_registros_solo_agregar();
