-- 0133 · Un producto a granel no pierde el granel cuando Electron lo sube.
--
-- Electron (hasta 2.0.11) guardaba en su lista de caja los productos bajados
-- de la nube sin tipo_producto, es_bulto, peso_bulto_kg ni precio_por_kilo, y
-- al subirlos los mandaba vacíos: el bulto quedaba como un producto normal y
-- la báscula no lo reconocía. Ninguna pantalla deja tipo_producto en null a
-- propósito, así que si llega null sobre un granel se conserva el granel.

create or replace function public.conservar_granel_si_llega_vacio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.tipo_producto = 'granel' and new.tipo_producto is null then
    new.tipo_producto := old.tipo_producto;
    new.es_bulto := old.es_bulto;
    new.permitir_fraccion := true;
    new.unidad := coalesce(new.unidad, old.unidad);
    new.peso_bulto_kg := coalesce(new.peso_bulto_kg, old.peso_bulto_kg);
    new.precio_por_kilo := coalesce(new.precio_por_kilo, new.precio_venta, old.precio_por_kilo);
    new.rendimiento_raciones := coalesce(new.rendimiento_raciones, old.rendimiento_raciones);
    new.especie := coalesce(new.especie, old.especie);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_productos_conservar_granel on public.productos;
create trigger trg_productos_conservar_granel before update on public.productos
  for each row execute function public.conservar_granel_si_llega_vacio();
