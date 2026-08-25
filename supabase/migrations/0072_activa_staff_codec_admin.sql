-- El dueño pidió ver el Panel Desarrollador (ruta /desarrollador en la PWA,
-- gated por empleados.es_staff_codec -- ver SideMenu.tsx) desde su propia
-- cuenta de negocio. Activa esa bandera para el empleado cuyo username de
-- login es 'Admin'. Update, no insert: si el username no existe (aún) esto
-- no hace nada, en vez de fallar.
update public.empleados
set es_staff_codec = true
where username ilike 'Admin';
