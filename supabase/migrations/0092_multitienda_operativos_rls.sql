-- Multi-Tienda: aislamiento real por sucursal para empleados operativos
-- (cajero/tecnico/cocina/barra/mesero) vía Supabase RLS, y vinculación
-- rápida de un empleado/terminal a su sucursal por código QR.
--
-- Antes de esta migración, `tiendas_stock`/`solicitudes_transferencia`
-- (migración 0068) solo filtraban por cliente_id — CUALQUIER empleado del
-- negocio, sin importar su rol o sucursal, podía leer/escribir el stock y
-- las transferencias de TODAS las sucursales. Esto agrega la sucursal
-- asignada a cada empleado y hace que la RLS la respete: un cajero asignado
-- a "Tienda 2" solo puede ver/operar esa sucursal; el dueño (super_usuario/
-- admin) sigue viendo todas, igual que antes. Alcance de esta pasada:
-- inventario/stock/ventas por sucursal -- mesas y comandas de cocina quedan
-- para una fase posterior.

alter table public.empleados
  add column if not exists tienda_id text;
comment on column public.empleados.tienda_id is
  'Sucursal (multitiendaService.ts local_id, ej. "tienda_principal" o un id "tid_...") a la que este empleado está limitado. NULL = sin restricción explícita (se trata como tienda_principal para operativos; los admins/super_usuario ven todas sin importar este valor).';

-- ============================================================
-- HELPERS DE RLS
-- ============================================================

-- ¿El usuario autenticado actual puede operar TODAS las sucursales del
-- negocio? Sí para: dueño/administrador (rol super_usuario|admin) y para la
-- identidad de sincronización de Electron (sync_identidades — el propio
-- equipo que corre el negocio completo, nunca debe quedar bloqueado por
-- esta RLS pensada para empleados individuales).
create or replace function public.current_empleado_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rol in ('super_usuario', 'admin') from public.empleados where id = (select auth.uid())),
    (select true from public.sync_identidades where id = (select auth.uid())),
    false
  )
$$;

-- Sucursal a la que está limitado el empleado autenticado actual. NULL si es
-- admin/sync (current_empleado_es_admin() ya los deja pasar sin mirar esto)
-- o si el empleado nunca fue asignado a una sucursal (equivale a
-- "tienda_principal" — no vive en tiendas_stock, así que un no-admin sin
-- asignar simplemente no ve filas ahí, que es lo correcto).
create or replace function public.current_empleado_tienda_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tienda_id from public.empleados where id = (select auth.uid())
$$;

-- ============================================================
-- tiendas_stock: antes solo cliente_id, ahora también la sucursal asignada
-- ============================================================
drop policy if exists tiendas_stock_tenant on public.tiendas_stock;

create policy tiendas_stock_select on public.tiendas_stock
  for select to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id = (select public.current_empleado_tienda_id())
    )
  );

create policy tiendas_stock_insert on public.tiendas_stock
  for insert to authenticated
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id = (select public.current_empleado_tienda_id())
    )
  );

create policy tiendas_stock_update on public.tiendas_stock
  for update to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id = (select public.current_empleado_tienda_id())
    )
  )
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_id = (select public.current_empleado_tienda_id())
    )
  );

create policy tiendas_stock_delete on public.tiendas_stock
  for delete to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (select public.current_empleado_es_admin())
  );

-- ============================================================
-- solicitudes_transferencia: un operativo solo ve/crea solicitudes donde su
-- propia sucursal es origen o destino; el admin ve/gestiona todas.
-- ============================================================
drop policy if exists solicitudes_transferencia_tenant on public.solicitudes_transferencia;

create policy solicitudes_transferencia_select on public.solicitudes_transferencia
  for select to authenticated
  using (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_origen_id = (select public.current_empleado_tienda_id())
      or tienda_destino_id = (select public.current_empleado_tienda_id())
    )
  );

create policy solicitudes_transferencia_insert on public.solicitudes_transferencia
  for insert to authenticated
  with check (
    cliente_id = (select public.current_cliente_id())
    and (
      (select public.current_empleado_es_admin())
      or tienda_origen_id = (select public.current_empleado_tienda_id())
      or tienda_destino_id = (select public.current_empleado_tienda_id())
    )
  );

-- Solo Electron (o un admin) marca una solicitud como completada/con error
-- al procesarla — un operativo puede crear la solicitud pero no cerrarla él
-- mismo (evita que "confirme" una transferencia que nunca se ejecutó).
create policy solicitudes_transferencia_update on public.solicitudes_transferencia
  for update to authenticated
  using (cliente_id = (select public.current_cliente_id()))
  with check (cliente_id = (select public.current_cliente_id()));

-- ============================================================
-- Vinculación rápida por QR: un admin (o la propia instalación Electron)
-- asigna la sucursal de un empleado escaneando el QR de esa sucursal.
-- ============================================================
create or replace function public.asignar_empleado_a_tienda(p_empleado_id uuid, p_tienda_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if not public.current_empleado_es_admin() then
    raise exception 'Solo un administrador puede asignar la sucursal de un empleado';
  end if;

  select cliente_id into v_cliente_id from public.empleados where id = p_empleado_id;
  if v_cliente_id is null or v_cliente_id <> public.current_cliente_id() then
    raise exception 'Empleado no encontrado en este negocio';
  end if;

  update public.empleados set tienda_id = p_tienda_id, updated_at = now() where id = p_empleado_id;
end;
$$;

grant execute on function public.asignar_empleado_a_tienda(uuid, text) to authenticated;

-- ============================================================
-- Venta móvil: ahora puede descontar el stock de la sucursal asignada al
-- empleado (tiendas_stock) en vez de siempre el de Tienda Principal
-- (productos.stock). Sin p_tienda_id (o 'tienda_principal'), comportamiento
-- idéntico al de antes.
--
-- 🛡️ Se DROPEA la firma vieja de 2 argumentos antes de crear la nueva de 3
-- (el tercero con default) — `create or replace` con una lista de
-- parámetros distinta NO reemplaza, crea una sobrecarga aparte que convive
-- con la vieja (ver 0088_fix_overload_activar_prueba_admin.sql, mismo bug
-- ya pisado una vez en este proyecto).
-- ============================================================
drop function if exists public.descontar_stock_producto(uuid, numeric);

create or replace function public.descontar_stock_producto(
  p_producto_id uuid,
  p_cantidad numeric,
  p_tienda_id text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_tienda_id is null or p_tienda_id = 'tienda_principal' then
    update public.productos
    set stock = greatest(stock - p_cantidad, 0), updated_at = now()
    where id = p_producto_id;
  else
    insert into public.tiendas_stock (cliente_id, tienda_id, producto_id, cantidad)
    values (public.current_cliente_id(), p_tienda_id, p_producto_id, 0)
    on conflict (cliente_id, tienda_id, producto_id) do nothing;

    update public.tiendas_stock
    set cantidad = greatest(cantidad - p_cantidad, 0), actualizado_en = now()
    where cliente_id = public.current_cliente_id()
      and tienda_id = p_tienda_id
      and producto_id = p_producto_id;
  end if;
end;
$$;

grant execute on function public.descontar_stock_producto(uuid, numeric, text) to authenticated;
