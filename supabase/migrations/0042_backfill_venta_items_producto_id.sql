-- 🛡️ Repara ventas ya sincronizadas: `venta_items.producto_id` quedaba
-- `null` porque el mapa local→Supabase que usaba `pushVentasPendientes`
-- leía de un almacén (IndexedDB) distinto al que de verdad usa la caja
-- (`pos-productos`) — ver el fix en syncService.ts (pushProductosLocalStorage
-- / pushVentasPendientes). Sin `producto_id`, cualquier cálculo de utilidad
-- que dependa de esa columna (Dashboard de la PWA) ve costo $0 aunque el
-- producto sí tenga costo registrado.
--
-- Backfill de una sola vez: relinkea por nombre exacto (sin distinguir
-- mayúsculas ni espacios extremos) dentro del MISMO negocio — no toca filas
-- que ya tienen producto_id, así que es seguro re-correrlo si hiciera falta.
update public.venta_items vi
set producto_id = p.id
from public.ventas v, public.productos p
where vi.producto_id is null
  and vi.venta_id = v.id
  and p.cliente_id = v.cliente_id
  and lower(trim(p.nombre)) = lower(trim(vi.nombre));
