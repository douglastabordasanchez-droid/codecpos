-- 0145 · Un usuario de acceso no se repite entre licencias y empleados.
--
-- El login de la web y el celular busca primero el usuario de licencia del
-- dueño (usuarios_clientes) y después el de empleado (empleados.username).
-- Cada tabla ya era única por su lado, pero una licencia nueva llamada
-- «Gabriela» le habría quitado el acceso a la empleada Gabriela de MEGA CAN
-- (2026-11-13). Ahora un usuario tomado en una tabla no se puede crear en la otra.

create or replace function public._usuario_acceso_libre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := lower(btrim(coalesce(new.username, '')));
begin
  if v_usuario = '' then
    return new;
  end if;
  if tg_table_name = 'usuarios_clientes' then
    if exists (select 1 from public.empleados e where lower(e.username) = v_usuario) then
      raise exception 'El usuario «%» ya está en uso, elige otro', new.username using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.usuarios_clientes u where lower(u.username) = v_usuario) then
      raise exception 'El usuario «%» ya está en uso, elige otro', new.username using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_clientes_usuario_libre on public.usuarios_clientes;
create trigger trg_usuarios_clientes_usuario_libre
  before insert or update of username on public.usuarios_clientes
  for each row execute function public._usuario_acceso_libre();

drop trigger if exists trg_empleados_usuario_libre on public.empleados;
create trigger trg_empleados_usuario_libre
  before insert or update of username on public.empleados
  for each row execute function public._usuario_acceso_libre();
