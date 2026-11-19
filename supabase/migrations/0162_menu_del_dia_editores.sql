-- 0162: almuerzo del día con adicionales y con personas autorizadas a publicarlo.
--
--  * adicionales: [{nombre, precio}] que se venden como productos aparte.
--  * editores: empleados (además de los administradores) que pueden publicar
--    el almuerzo, p. ej. la cocina. Solo un administrador cambia esa lista.

alter table public.menu_del_dia add column if not exists adicionales jsonb not null default '[]'::jsonb;
alter table public.menu_del_dia add column if not exists editores uuid[] not null default '{}';

drop policy if exists menu_del_dia_update on public.menu_del_dia;
create policy menu_del_dia_update on public.menu_del_dia
  for update using (
    cliente_id = (select public.current_cliente_id())
    and ((select public.current_empleado_es_admin()) or (select auth.uid()) = any(editores))
  )
  with check (cliente_id = (select public.current_cliente_id()));

-- Un editor publica el menú, pero no se da permiso a sí mismo ni a otros.
create or replace function public.menu_del_dia_proteger_editores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.editores is distinct from OLD.editores and not public.current_empleado_es_admin() then
    raise exception 'Solo un administrador decide quién publica el almuerzo';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_menu_del_dia_proteger_editores on public.menu_del_dia;
create trigger trg_menu_del_dia_proteger_editores
  before update on public.menu_del_dia
  for each row execute function public.menu_del_dia_proteger_editores();
