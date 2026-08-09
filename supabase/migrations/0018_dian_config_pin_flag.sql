-- 🛡️ FIX de diseño: `dian_config.pin_cifrado` no tiene sentido tal como se
-- definió en 0017 — el cifrado de Electron `safeStorage` está atado a la
-- cuenta de Windows de ESA máquina específica; un ciphertext generado ahí
-- es indescifrable en cualquier otro lugar, incluido el propio backend de
-- Supabase. Replicar ese valor a la nube no aporta nada real y es un dato
-- sensible innecesario. El PIN vive exclusivamente local (ver
-- electron/dianSecrets.js) — Supabase solo necesita saber SI ya se
-- configuró, no el valor cifrado.
alter table public.dian_config drop column if exists pin_cifrado;
alter table public.dian_config add column if not exists pin_configurado boolean not null default false;
