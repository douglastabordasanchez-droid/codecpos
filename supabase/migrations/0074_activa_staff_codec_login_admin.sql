-- Corrige 0073: esa apuntaba al empleado de la cuenta "Codec Document"
-- (creada el mismo día por registro de prueba gratis con correo/contraseña),
-- pero el login con el usuario de licencia "Admin" (resolver_login_licencia,
-- migración 0014) resuelve a una identidad SINTÉTICA distinta:
-- owner+1e7dea0e-181b-4b4d-aeb9-e809b2f1db65@codecpos.internal, cuyo
-- empleados.id es 0e2d7899-9ba4-42db-ae99-8efc313f0eda ("CODEC ADMIN
-- CENTRAL") -- confirmado vía /auth/v1/admin/users buscando ese correo
-- sintético. Ese es el registro que realmente carga la app cuando el
-- dueño entra con "Admin" en vez de su correo.
update public.empleados
set es_staff_codec = true
where id = '0e2d7899-9ba4-42db-ae99-8efc313f0eda';
