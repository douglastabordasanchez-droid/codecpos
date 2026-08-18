-- Unifica Devoluciones entre Electron y la PWA — hasta ahora eran dos
-- sistemas aislados (Electron 100% local en 'codecpos_devoluciones', PWA
-- 100% en la tabla `devoluciones`). Mismo patrón idempotente de
-- productos/ventas/cierres_caja: local_id + unique constraint para poder
-- usar upsert con onConflict desde Electron.
alter table public.devoluciones
  add column if not exists local_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devoluciones_cliente_local_id_key'
  ) then
    alter table public.devoluciones
      add constraint devoluciones_cliente_local_id_key unique (cliente_id, local_id);
  end if;
end $$;
