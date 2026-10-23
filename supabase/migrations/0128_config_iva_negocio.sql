-- 0128 · IVA del negocio desde la web/celular (Configurar mi negocio).
--
-- El IVA ya vivía en la configuración de empresa que Electron sincroniza
-- (empresa_configuraciones.datos: ivaHabilitado, porcentajeIVA,
-- ivaIncluidoEnPrecio). Ahora también se edita desde la web, con la nueva
-- opción ivaTodosLosProductos: el IVA va a todos los productos aunque el
-- producto tenga tarifa 0. Solo se mezclan esas cuatro llaves; el resto de
-- la configuración de Electron queda intacta.

create or replace function public.actualizar_config_iva(
  p_habilitado boolean,
  p_porcentaje numeric,
  p_incluido boolean,
  p_todos boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid := public.current_cliente_id();
  v_iva jsonb;
begin
  if v_cliente_id is null or not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'Solo un administrador puede configurar el IVA';
  end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje de IVA debe estar entre 0 y 100';
  end if;
  v_iva := jsonb_build_object(
    'ivaHabilitado', coalesce(p_habilitado, false),
    'porcentajeIVA', p_porcentaje,
    'ivaIncluidoEnPrecio', coalesce(p_incluido, false),
    'ivaTodosLosProductos', coalesce(p_todos, false)
  );
  insert into public.empresa_configuraciones (cliente_id, datos, updated_at, updated_by)
  values (v_cliente_id, v_iva, now(), auth.uid())
  on conflict (cliente_id) do update set
    datos = coalesce(public.empresa_configuraciones.datos, '{}'::jsonb) || v_iva,
    updated_at = now(),
    updated_by = auth.uid();
end;
$function$;

revoke all on function public.actualizar_config_iva(boolean, numeric, boolean, boolean) from public, anon;
grant execute on function public.actualizar_config_iva(boolean, numeric, boolean, boolean) to authenticated;
