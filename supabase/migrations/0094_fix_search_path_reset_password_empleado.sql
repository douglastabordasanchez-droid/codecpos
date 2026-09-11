-- 🐛 FIX: admin_resetear_password_empleado (migración 0077) fijaba
-- `search_path = public` sin incluir `extensions` -- a diferencia de TODAS
-- las demás funciones de este proyecto que usan crypt()/gen_salt() (ver
-- 0014, 0013, 0006, 0004, 0003, 0052, 0055, 0062, 0063, 0066, 0084, 0091,
-- que sí incluyen `extensions` en su search_path). Resultado: el botón
-- "Restablecer contraseña" del Panel Desarrollador fallaba SIEMPRE, para
-- cualquier cliente, con "function gen_salt(unknown) does not exist" --
-- detectado en vivo al intentar reparar el acceso de un cliente real.
create or replace function public.admin_resetear_password_empleado(
  p_empleado_id uuid,
  p_password_nueva text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_cliente_id uuid;
begin
  if not public.es_staff_actual() then
    raise exception 'No autorizado';
  end if;
  if public.nivel_staff_actual() = 'LECTURA' then
    raise exception 'Tu nivel de acceso es de solo lectura';
  end if;
  if p_password_nueva is null or length(p_password_nueva) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  select cliente_id into v_cliente_id from public.empleados where id = p_empleado_id;
  if v_cliente_id is null then
    raise exception 'Empleado no encontrado';
  end if;

  update auth.users
  set encrypted_password = crypt(p_password_nueva, gen_salt('bf')), updated_at = now()
  where id = p_empleado_id;

  perform public.registrar_auditoria(
    'RESETEAR_PASSWORD_EMPLEADO', v_cliente_id, 'EXITO',
    jsonb_build_object('empleado_id', p_empleado_id)
  );
end;
$$;

revoke all on function public.admin_resetear_password_empleado(uuid, text) from public, anon;
grant execute on function public.admin_resetear_password_empleado(uuid, text) to authenticated;
