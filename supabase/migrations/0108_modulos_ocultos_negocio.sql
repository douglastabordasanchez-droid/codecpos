-- El administrador del negocio decide qué módulos especializados se ven en
-- todo el sistema (web, celular y Electron) desde "Configurar mi negocio":
-- por ejemplo, solo Alimentos y Bebidas, o solo el modo ropa. Solo OCULTA:
-- lo contratado lo sigue definiendo Codec en el Panel Desarrollador
-- (modulos_activos), así que nunca concede un módulo que no se pagó.

alter table public.clientes_pos add column if not exists modulos_ocultos text[] not null default '{}';

create or replace function public.actualizar_modulos_ocultos(p_modulos text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid := public.current_cliente_id();
begin
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'Solo un administrador puede configurar los módulos del negocio';
  end if;
  update public.clientes_pos
  set modulos_ocultos = coalesce((select array_agg(distinct m) from unnest(coalesce(p_modulos, '{}')) m where m ~ '^[a-z_]{3,40}$'), '{}'),
      updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_modulos_ocultos(text[]) from public, anon;
grant execute on function public.actualizar_modulos_ocultos(text[]) to authenticated;
