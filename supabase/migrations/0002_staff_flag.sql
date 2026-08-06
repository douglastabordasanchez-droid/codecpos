-- Marca cuentas de staff interno de Codec Studio (acceso al Panel Desarrollador
-- en cualquier instalación de cliente, reemplaza la contraseña maestra hardcodeada).
alter table public.empleados
  add column if not exists es_staff_codec boolean not null default false;
