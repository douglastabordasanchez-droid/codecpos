-- Permite que un cliente creado desde la PWA (sin local_id de Electron) se
-- guarde en `clientes_fidelizacion` -- hasta ahora `local_id` era NOT NULL,
-- lo cual solo permitía filas creadas por Electron (que sí genera un id
-- local). Mismo patrón ya usado en `ventas`/`gastos`/`devoluciones`/
-- `cuentas_cartera`: local_id nulo = fila creada remotamente, Electron la
-- "hala" en su próximo ciclo de sync filtrando por `local_id is null`.
alter table public.clientes_fidelizacion alter column local_id drop not null;
