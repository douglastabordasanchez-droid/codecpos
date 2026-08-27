-- Permite a staff Codec Studio (Admin Web) restablecer la contraseña de
-- CUALQUIER empleado/dueño de cualquier negocio -- para soporte, cuando un
-- cliente se bloquea y no puede recuperarla él mismo.
--
-- Nunca expone ni permite "ver" la contraseña actual (es imposible, está
-- hasheada con bcrypt vía pgcrypto -- igual que login_unico_dueno en 0014,
-- que ya usa exactamente este mismo mecanismo). Solo permite FIJAR una
-- nueva, que sí queda visible momentáneamente en el formulario mientras el
-- staff la escribe (con botón de ojito), nunca después de guardarla.

create or replace function public.admin_resetear_password_empleado(
  p_empleado_id uuid,
  p_password_nueva text
)
returns void
language plpgsql
security definer
set search_path = public
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
