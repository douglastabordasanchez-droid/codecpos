-- Altas/cambios de rol/activo en `empleados` deben reflejarse en caliente
-- entre Web Admin, Electron y PWA -- hoy cada plataforma solo hace
-- fetch-on-mount. Mismo patrón que productos/ventas/sesiones_activas/
-- notificaciones_pago (0001). RLS ya está activo en `empleados`
-- (empleados_select), Realtime la respeta igual que en esas tablas.
alter publication supabase_realtime add table public.empleados;
