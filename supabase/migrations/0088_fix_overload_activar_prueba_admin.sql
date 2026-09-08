-- `create or replace function activar_prueba_admin(p_cliente_id uuid, p_dias integer default 14)`
-- en 0087 NO reemplazó la función original de 1 argumento (0082) -- Postgres
-- las trata como sobrecargas DISTINTAS porque difieren en el número de
-- parámetros (el default no cuenta para la resolución de sobrecarga). Quedó
-- la vieja función de 1 argumento con los 14 días fijos en el cuerpo,
-- conviviendo con la nueva. Ningún código de la app llama esta función con
-- un solo argumento (todos los call sites en TypeScript pasan p_dias
-- explícitamente), así que se puede eliminar sin romper nada.
drop function if exists public.activar_prueba_admin(uuid);
