-- Alimentos y Bebidas (Panadería/mesas) por sucursal.
--
-- Hasta ahora `panaderia_mesas`/`panaderia_cuentas` (migración 0024) solo se
-- particionaban por `cliente_id` -- un negocio con varias sucursales
-- (`tiendas`, ver multitiendaService.ts) tenía UN SOLO salón compartido: las
-- mismas mesas para todas sus tiendas, sin forma de decir "estas mesas son
-- de Tienda 2". Esto agrega `tienda_id` (mismo local_id de `tiendas` que ya
-- usan `tiendas_stock`/`empleados.tienda_id`, migración 0092) y hace que la
-- RLS lo respete igual que el resto del sistema multi-tienda: el dueño/admin
-- sigue viendo todo, un mesero/cajero asignado a una sucursal solo ve/opera
-- las mesas de ESA sucursal.
--
-- Diferencia deliberada con `tiendas_stock`: ahí un empleado sin sucursal
-- asignada (tienda_id NULL) no ve NADA en esa tabla a propósito (su stock de
-- tienda_principal vive en `productos`, no ahí). Aquí, en cambio, las mesas
-- de tienda_principal SÍ viven en esta misma tabla (tienda_id NULL) -- así
-- que la comparación usa `is not distinct from` (NULL = NULL) para que un
-- empleado sin asignar vea las mesas de tienda_principal, no una lista vacía.

alter table public.panaderia_mesas add column if not exists tienda_id text;
alter table public.panaderia_cuentas add column if not exists tienda_id text;
create index if not exists idx_panaderia_mesas_tienda on public.panaderia_mesas(cliente_id, tienda_id);
create index if not exists idx_panaderia_cuentas_tienda on public.panaderia_cuentas(cliente_id, tienda_id);

drop policy if exists panaderia_mesas_tenant on public.panaderia_mesas;

create policy panaderia_mesas_select on public.panaderia_mesas
  for select to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_mesas_insert on public.panaderia_mesas
  for insert to authenticated
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_mesas_update on public.panaderia_mesas
  for update to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  )
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_mesas_delete on public.panaderia_mesas
  for delete to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  );

-- ── panaderia_cuentas: mismo criterio -- un mesero solo abre/edita cuentas
-- de mesas de su propia sucursal. ──────────────────────────────────────────
drop policy if exists panaderia_cuentas_tenant on public.panaderia_cuentas;

create policy panaderia_cuentas_select on public.panaderia_cuentas
  for select to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_cuentas_insert on public.panaderia_cuentas
  for insert to authenticated
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_cuentas_update on public.panaderia_cuentas
  for update to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  )
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id is not distinct from (select public.current_empleado_tienda_id())
    )
  );

create policy panaderia_cuentas_delete on public.panaderia_cuentas
  for delete to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  );
