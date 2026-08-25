-- Revierte 0073: ese id (a99c9ca3, negocio de prueba "Codec Document"
-- creado por registro con correo/contraseña) no tiene relación con el
-- login de usuario de licencia "Admin" -- ese es un negocio de prueba
-- normal y no debe ver "Panel Desarrollador" (administra todos los
-- negocios). El fix correcto quedó en 0074, sobre la identidad sintética
-- que sí resuelve el usuario "Admin".
update public.empleados
set es_staff_codec = false
where id = 'a99c9ca3-0acd-47e2-9fb2-770ce7f2da4d';
