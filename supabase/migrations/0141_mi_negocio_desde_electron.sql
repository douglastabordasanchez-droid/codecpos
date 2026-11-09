-- 0141 · Guardar "Mi negocio" desde Electron.
--
-- Electron entra a la nube con la identidad del equipo (sync_identidades), que
-- no está en empleados: la función siempre respondía «Solo un administrador» y
-- la propina y el cambio de precio se apagaban al volver a leer la nube.
-- Misma regla de 0129: un empleado de la web debe ser administrador; en
-- Electron lo restringe su pantalla.

create or replace function public.actualizar_mi_negocio(
  p_tipo_negocio text,
  p_nombre_negocio text,
  p_propina_activa boolean,
  p_porcentaje_propina numeric,
  p_permitir_modificar_precio boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid := public.current_cliente_id();
begin
  if v_cliente_id is null then
    raise exception 'Solo un administrador puede configurar el negocio';
  end if;
  if exists (select 1 from public.empleados e where e.id = auth.uid())
     and not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'Solo un administrador puede configurar el negocio';
  end if;
  if coalesce(btrim(p_tipo_negocio), '') = '' then
    raise exception 'Elige el tipo de negocio';
  end if;
  if coalesce(btrim(p_nombre_negocio), '') = '' then
    raise exception 'Escribe el nombre del negocio';
  end if;
  if p_porcentaje_propina is null or p_porcentaje_propina < 0 or p_porcentaje_propina > 100 then
    raise exception 'El porcentaje de propina debe estar entre 0 y 100';
  end if;
  update public.clientes_pos set
    tipo_negocio = public.normalizar_tipo_negocio(p_tipo_negocio),
    nombre_negocio = left(btrim(p_nombre_negocio), 120),
    propina_activa = coalesce(p_propina_activa, false),
    porcentaje_propina_predeterminado = p_porcentaje_propina,
    permitir_modificar_precio = coalesce(p_permitir_modificar_precio, false),
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_mi_negocio(text, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.actualizar_mi_negocio(text, text, boolean, numeric, boolean) to authenticated;
