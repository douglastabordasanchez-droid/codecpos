-- 0165: el almuerzo del día solo aparece en los negocios donde Codec Studio lo activa.
-- Viene apagado para todos; se enciende por negocio (Tierra Colombiana lo usa).
alter table public.clientes_pos add column if not exists almuerzo_activo boolean not null default false;
update public.clientes_pos set almuerzo_activo = true where id = '09ad6ebf-5c42-4222-bd27-977c192a79d7';
