-- Edición de perfil en la app móvil: foto, cumpleaños y teléfono de cada
-- empleado, además de un RPC para que el admin pueda activar/desactivar y
-- cambiar el rol de OTRO empleado desde PersonalPage.
--
-- ⚠️ Bug encontrado de paso: PersonalPage.tsx hacía
-- `.from('empleados').update({activo|rol}).eq('id', fila.id)` directo desde
-- el cliente para editar a OTRO empleado. La única política de UPDATE sobre
-- `empleados` es `empleados_update_self` (id = auth.uid()), así que esas
-- llamadas afectaban 0 filas sin lanzar error — el toggle se veía bien en
-- pantalla (optimista) pero nunca se guardaba. Mismo patrón que
-- `actualizar_permisos_empleado` (0016): RPC security definer que valida
-- que quien llama es admin/super_usuario del mismo negocio.

alter table public.empleados add column if not exists foto_url text;
alter table public.empleados add column if not exists fecha_nacimiento date;
alter table public.empleados add column if not exists telefono text;

-- ============================================================
-- STORAGE: bucket de fotos de perfil de empleado
-- ============================================================
insert into storage.buckets (id, name, public)
values ('empleados-fotos', 'empleados-fotos', true)
on conflict (id) do nothing;

drop policy if exists empleados_fotos_public_read on storage.objects;
create policy empleados_fotos_public_read on storage.objects
  for select using (bucket_id = 'empleados-fotos');

drop policy if exists empleados_fotos_auth_write on storage.objects;
create policy empleados_fotos_auth_write on storage.objects
  for insert with check (bucket_id = 'empleados-fotos' and auth.role() = 'authenticated');

drop policy if exists empleados_fotos_auth_update on storage.objects;
create policy empleados_fotos_auth_update on storage.objects
  for update using (bucket_id = 'empleados-fotos' and auth.role() = 'authenticated');

-- ============================================================
-- RPC: admin edita activo/rol de OTRO empleado de su mismo negocio
-- ============================================================
create or replace function public.actualizar_empleado_admin(
  p_empleado_id uuid,
  p_activo boolean,
  p_rol text
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
    raise exception 'No tienes permiso para editar empleados';
  end if;

  if p_empleado_id = auth.uid() then
    raise exception 'No puedes editar tu propio acceso desde aquí';
  end if;

  select cliente_id into v_cliente_objetivo from public.empleados where id = p_empleado_id;

  if v_cliente_objetivo is null or v_cliente_objetivo <> v_cliente_id then
    raise exception 'Ese usuario no pertenece a tu negocio';
  end if;

  if p_rol not in ('super_usuario','admin','cajero','tecnico','cocina','barra','mesero') then
    raise exception 'Rol inválido';
  end if;

  update public.empleados
  set activo = coalesce(p_activo, activo),
      rol = coalesce(p_rol, rol),
      updated_at = now()
  where id = p_empleado_id;
end;
$$;

grant execute on function public.actualizar_empleado_admin(uuid, boolean, text) to authenticated;
