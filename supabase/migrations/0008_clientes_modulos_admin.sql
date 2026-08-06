-- Panel de administración de clientes (Panel Desarrollador > Clientes) pasa de
-- datos 100% locales a la tabla real de licenciamiento. Único cambio de
-- esquema necesario: dónde vive qué módulos tiene activos cada cliente.
-- null = "usa los módulos por defecto de su plan" (mismo comportamiento que
-- hoy cuando no hay config local guardada).
alter table public.clientes_pos
  add column if not exists modulos_activos text[];
