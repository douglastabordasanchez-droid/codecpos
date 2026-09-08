-- "Modificar precio manualmente": un negocio con precios fijos que a veces
-- da rebajas a clientes frecuentes necesita que ese descuento quede
-- documentado en la contabilidad (no como si el costo hubiera cambiado).
-- Config por negocio (mismo patrón que propina_activa, 0070) + columnas para
-- guardar el descuento real en la venta y el precio de catálogo por línea.

alter table public.clientes_pos
  add column if not exists permitir_modificar_precio boolean not null default false;

alter table public.ventas
  add column if not exists descuento numeric(12,2) not null default 0
    check (descuento >= 0);

alter table public.venta_items
  add column if not exists precio_original numeric(12,2);

create or replace function public.actualizar_configuracion_precio_manual(
  p_permitir boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.current_cliente_id();
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'No autorizado para modificar la configuración de precio manual';
  end if;

  update public.clientes_pos set
    permitir_modificar_precio = coalesce(p_permitir, false),
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_configuracion_precio_manual(boolean) from public, anon;
grant execute on function public.actualizar_configuracion_precio_manual(boolean) to authenticated;
