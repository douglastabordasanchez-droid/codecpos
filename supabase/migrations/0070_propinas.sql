-- Propina: configuración por negocio y valores inmutables por venta.
-- Las filas existentes conservan el comportamiento anterior (propina = 0).
alter table public.clientes_pos
  add column if not exists propina_activa boolean not null default false,
  add column if not exists porcentaje_propina_predeterminado numeric(5,2) not null default 0
    check (porcentaje_propina_predeterminado >= 0);

alter table public.ventas
  add column if not exists propina numeric(12,2) not null default 0
    check (propina >= 0),
  add column if not exists porcentaje_propina_sugerido numeric(5,2) not null default 0
    check (porcentaje_propina_sugerido >= 0),
  add column if not exists propina_modificada boolean not null default false;

create or replace function public.actualizar_configuracion_propina(
  p_propina_activa boolean,
  p_porcentaje_propina_predeterminado numeric
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
    raise exception 'No autorizado para modificar la configuración de propina';
  end if;
  if p_porcentaje_propina_predeterminado is null or p_porcentaje_propina_predeterminado < 0 then
    raise exception 'El porcentaje de propina debe ser no negativo';
  end if;

  update public.clientes_pos set
    propina_activa = coalesce(p_propina_activa, false),
    porcentaje_propina_predeterminado = p_porcentaje_propina_predeterminado,
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_configuracion_propina(boolean, numeric) from public, anon;
grant execute on function public.actualizar_configuracion_propina(boolean, numeric) to authenticated;
