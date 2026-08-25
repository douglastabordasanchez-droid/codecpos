-- Corrige la migración 0072: esa apuntaba a empleados.username = 'Admin',
-- pero esa columna está vacía para todos los empleados (nadie la usa hoy) --
-- no actualizó nada. "Usuario es Admin" se refería al ROL ('admin') del
-- empleado del dueño, no a un username. Se activa la bandera directamente
-- sobre el registro confirmado por id (Douglas Taborda, rol admin, negocio
-- de prueba "Codec Document" creado 2026-08-25) para no depender de nombre
-- ni rol (ambos se repiten entre negocios) y evitar tocar otras cuentas.
update public.empleados
set es_staff_codec = true
where id = 'a99c9ca3-0acd-47e2-9fb2-770ce7f2da4d';
