-- 0170 · De dónde salió una venta hecha fuera de la caja del PC.
--
-- Las ventas de la web y del celular llegan con terminal_id = 'PWA' y no se
-- podían distinguir. `origen` dice 'celular' o 'web'; las de la caja del PC
-- (con local_id) lo dejan vacío. Las ventas viejas quedan sin origen.

alter table public.ventas add column if not exists origen text;

alter table public.ventas drop constraint if exists ventas_origen_check;
alter table public.ventas add constraint ventas_origen_check
  check (origen is null or origen in ('celular', 'web'));
