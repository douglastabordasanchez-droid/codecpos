-- Falta una referencia directa al código usado (no solo el texto) para que
-- el webhook pueda incrementar su contador de usos sin tener que volver a
-- buscarlo por nombre.
begin;
alter table public.pagos_licencia add column if not exists codigo_descuento_id uuid references public.codigos_descuento(id);
commit;
