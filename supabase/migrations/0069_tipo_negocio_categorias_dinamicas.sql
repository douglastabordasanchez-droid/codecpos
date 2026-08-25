-- Categorías de producto dinámicas según el tipo de negocio: ya existía un
-- catálogo completo en src/data/tipos-negocio.ts, ya usado por Electron al
-- crear productos (ModalNuevoProducto.tsx/EditProductModal.tsx) -- pero la
-- PWA (ProductoFormPage.tsx) sugiere categorías sacadas de los productos que
-- YA existen (vacío para un negocio nuevo, y sin relación con "papelería" vs
-- "ropa" en negocios con pocos productos cargados).
--
-- `clientes_pos.tipo_negocio` (migración 0055) se llena al registrarse, pero
-- nunca se actualiza si el dueño cambia el tipo de negocio después desde
-- Configuración en Electron -- BusinessContext.tsx es 100% local
-- (localStorage) y nunca escribe de vuelta a la nube. Esta migración agrega
-- el RPC de autoservicio (mismo patrón que actualizar_perfil_negocio, ver
-- migración 0050 -- UPDATE directo sobre clientes_pos está bloqueado para
-- no-staff desde esa migración) para que Electron pueda mantenerlo
-- sincronizado, y así la PWA pueda leerlo y usar el mismo catálogo.

create or replace function public.actualizar_tipo_negocio(p_tipo_negocio text)
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
    raise exception 'No autorizado para modificar el tipo de negocio';
  end if;
  if p_tipo_negocio is null or length(trim(p_tipo_negocio)) = 0 then
    raise exception 'El tipo de negocio no puede estar vacío';
  end if;

  update public.clientes_pos set
    tipo_negocio = p_tipo_negocio,
    updated_at = now()
  where id = v_cliente_id;
end;
$function$;

revoke all on function public.actualizar_tipo_negocio(text) from public, anon;
grant execute on function public.actualizar_tipo_negocio(text) to authenticated;
