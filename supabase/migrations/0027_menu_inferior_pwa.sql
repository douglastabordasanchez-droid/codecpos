-- Configuración del menú inferior de la PWA, por cliente.
--
-- Antes el 4º/5º botón se elegía automáticamente por prioridad entre los
-- módulos activos (podía terminar mostrando un módulo completo como
-- "Alimentos y Bebidas" en una barra de accesos rápidos, algo que el dueño
-- no controlaba). Ahora es configuración explícita, editable SOLO desde
-- Panel Desarrollador (staff Codec Studio) — el dueño del negocio no la
-- toca. Default: Inicio, Ventas | Vender (centro, fijo) | Caja, Menú.
alter table public.clientes_pos
  add column if not exists menu_inferior jsonb not null default
    '{"izquierda":["inicio","ventas"],"derecha":["caja","menu"]}'::jsonb;
