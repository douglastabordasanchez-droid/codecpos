-- 0129 · Poner la tarifa de IVA en la ficha de todos los productos de una vez.
--
-- «A todos los productos» (0128) ya cobra el IVA aunque el producto diga 0 %;
-- esto además lo deja escrito en cada producto, para que la ficha, el
-- inventario y Electron (aplicaIVA = iva > 0) lo muestren. Lo usa el
-- administrador desde Configurar mi negocio (web y celular) o el computador
-- vinculado desde Configuración › IVA (Electron entra con sync_identidades).

create or replace function public.aplicar_iva_a_productos(p_porcentaje numeric, p_solo_sin_iva boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_id uuid := public.current_cliente_id();
  v_total integer;
begin
  if v_cliente_id is null then
    raise exception 'No autenticado';
  end if;
  -- Un empleado de la web debe ser administrador; Electron ya lo restringe en su pantalla.
  if exists (select 1 from public.empleados e where e.id = auth.uid())
     and not public.empleado_es_admin_de(v_cliente_id) then
    raise exception 'Solo un administrador puede cambiar el IVA de los productos';
  end if;
  if p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 100 then
    raise exception 'El porcentaje de IVA debe ser mayor que 0 y hasta 100';
  end if;

  update public.productos
  set iva = p_porcentaje, updated_at = now()
  where cliente_id = v_cliente_id
    and coalesce(iva, 0) <> p_porcentaje
    and (not coalesce(p_solo_sin_iva, true) or coalesce(iva, 0) = 0);
  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

revoke all on function public.aplicar_iva_a_productos(numeric, boolean) from public, anon;
grant execute on function public.aplicar_iva_a_productos(numeric, boolean) to authenticated;

-- Cuántos productos del negocio están sin IVA (para mostrarlo antes de aplicar).
create or replace function public.contar_productos_sin_iva()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*)::integer from public.productos
  where cliente_id = public.current_cliente_id() and coalesce(iva, 0) = 0;
$function$;

revoke all on function public.contar_productos_sin_iva() from public, anon;
grant execute on function public.contar_productos_sin_iva() to authenticated;
