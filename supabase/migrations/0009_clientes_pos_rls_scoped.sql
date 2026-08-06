-- Fase B (PWA Configuración): antes de exponer una pantalla que deja a un
-- negocio editar sus propios datos, se cierra un hueco preexistente — las
-- policies de clientes_pos/usuarios_clientes eran "cualquier usuario
-- autenticado" sin escoping, es decir cualquier empleado de CUALQUIER
-- negocio podía, en teoría, escribir sobre los datos de otro. Se reemplazan
-- por: el propio negocio (admin/super_usuario) puede editar SU fila, staff
-- Codec Studio (es_staff_codec) puede editar cualquiera. usuarios_clientes
-- (credenciales de licencia) queda solo para staff — el propio negocio nunca
-- necesita tocarlas directamente, la vinculación pasa por las RPCs
-- provisionar_sync_identidad/provisionar_empleado.

drop policy if exists "Allow authenticated update" on public.clientes_pos;
create policy clientes_pos_self_or_staff_update on public.clientes_pos
  for update using (
    (id = public.current_cliente_id() and exists (
      select 1 from public.empleados e where e.id = auth.uid() and e.rol in ('admin', 'super_usuario')
    ))
    or exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

drop policy if exists "Allow authenticated insert" on public.clientes_pos;
create policy clientes_pos_staff_insert on public.clientes_pos
  for insert with check (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

drop policy if exists "Allow authenticated delete" on public.clientes_pos;
create policy clientes_pos_staff_delete on public.clientes_pos
  for delete using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

drop policy if exists "Allow authenticated insert" on public.usuarios_clientes;
create policy usuarios_clientes_staff_insert on public.usuarios_clientes
  for insert with check (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

drop policy if exists "Allow authenticated update" on public.usuarios_clientes;
create policy usuarios_clientes_staff_update on public.usuarios_clientes
  for update using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );

drop policy if exists "Allow authenticated delete" on public.usuarios_clientes;
create policy usuarios_clientes_staff_delete on public.usuarios_clientes
  for delete using (
    exists (select 1 from public.empleados e where e.id = auth.uid() and e.es_staff_codec = true)
  );
