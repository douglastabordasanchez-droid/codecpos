-- Permite que un admin/super_usuario edite qué módulos ve CADA empleado
-- suyo (columna empleados.permisos, existía desde 0001 pero nunca se
-- llenaba ni se leía). RLS solo deja a un empleado actualizar su PROPIA
-- fila (empleados_update_self), así que hace falta este RPC security
-- definer — mismo patrón que invitar_empleado — para que el dueño pueda
-- tocar la fila de OTRO empleado, siempre y cuando sea de su mismo negocio.
create or replace function public.actualizar_permisos_empleado(
  p_empleado_id uuid,
  p_modulos text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_rol_solicitante text;
  v_cliente_objetivo uuid;
begin
  select cliente_id, rol into v_cliente_id, v_rol_solicitante
  from public.empleados where id = auth.uid();

  if v_cliente_id is null or v_rol_solicitante not in ('admin', 'super_usuario') then
    raise exception 'No tienes permiso para editar permisos';
  end if;

  select cliente_id into v_cliente_objetivo from public.empleados where id = p_empleado_id;

  if v_cliente_objetivo is null or v_cliente_objetivo <> v_cliente_id then
    raise exception 'Ese usuario no pertenece a tu negocio';
  end if;

  update public.empleados
  set permisos = jsonb_build_object('modulosHabilitados', to_jsonb(coalesce(p_modulos, array[]::text[]))),
      updated_at = now()
  where id = p_empleado_id;
end;
$$;

grant execute on function public.actualizar_permisos_empleado(uuid, text[]) to authenticated;
