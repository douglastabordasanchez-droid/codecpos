-- Complementa 0050: clientes_pos conservaba GRANT INSERT/UPDATE/DELETE para
-- anon a nivel de tabla (defensa en profundidad -- el RLS ya los bloqueaba,
-- pero no debe existir el permiso de base).
begin;
revoke insert, update, delete on public.clientes_pos from anon;
commit;
