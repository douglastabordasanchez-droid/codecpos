-- Fase 6: Dashboard admin móvil (PWA). Soporte para sincronizar cierres de
-- caja y sesiones activas desde Electron, que hasta ahora solo vivían en
-- localStorage/IndexedDB local y nunca llegaban a Supabase. Estrictamente
-- additivo: no toca columnas ni datos existentes.

-- ============================================================
-- CIERRES_CAJA: mismo patrón idempotente de productos/ventas (local_id +
-- unique constraint para poder usar upsert con onConflict).
-- ============================================================
alter table public.cierres_caja
  add column if not exists local_id text;

alter table public.cierres_caja
  add constraint cierres_caja_cliente_local_id_key unique (cliente_id, local_id);

-- ============================================================
-- SESIONES_ACTIVAS: heartbeat "quién está usando esta caja ahora mismo".
-- Un negocio local puede tener el cajero operando sin cuenta Supabase
-- individual (Electron usa identidad de sync de máquina) — se guarda el
-- nombre tal cual aparece localmente, sin depender de empleado_id.
-- Upsert por (cliente_id, terminal_id): una fila por terminal, se
-- sobreescribe en cada heartbeat.
-- ============================================================
alter table public.sesiones_activas
  add column if not exists cajero_nombre text;

alter table public.sesiones_activas
  add constraint sesiones_activas_cliente_terminal_key unique (cliente_id, terminal_id);
