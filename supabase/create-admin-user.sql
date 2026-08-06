-- =========================================
-- CREAR USUARIO ADMINISTRADOR PARA CODEC POS
-- =========================================
--
-- Este script crea el usuario administrador principal
-- Username: admin@codec.com
-- Password: Noruega2025++*
-- Hardware: any (puede iniciar en cualquier equipo)
--
-- INSTRUCCIONES:
-- 1. Ve a tu proyecto Supabase → SQL Editor
-- 2. Copia y pega este script
-- 3. Ejecuta (RUN o Ctrl+Enter)
-- =========================================

INSERT INTO usuarios_pos (
  username,
  password_hash,
  nombre_completo,
  cedula,
  rol,
  activo,
  hardware_id_autorizado,
  permisos
) VALUES (
  'admin@codec.com',
  'Tm9ydWVnYTIwMjUrKyo=', -- Base64 de "Noruega2025++*"
  'Administrador CODEC',
  '1000000000',
  'super_usuario',
  true,
  'any', -- Puede iniciar en cualquier equipo
  '{
    "dashboard": true,
    "ventas": true,
    "productos": true,
    "alertas": true,
    "configuracion": true,
    "usuarios": true,
    "cierreCaja": true,
    "reportes": true,
    "gastos": true,
    "codecVerify": true,
    "devoluciones": true,
    "empleados": true,
    "multitienda": true,
    "fidelizacion": true
  }'::JSONB
) ON CONFLICT (username) DO UPDATE SET
  activo = true,
  hardware_id_autorizado = 'any',
  updated_at = NOW();

-- Verificar que se creó correctamente
SELECT
  id,
  username,
  nombre_completo,
  cedula,
  rol,
  activo,
  hardware_id_autorizado,
  created_at
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- ✅ ¡Usuario creado exitosamente!
-- Ahora puedes iniciar sesión con:
--   Usuario: admin@codec.com
--   Contraseña: Noruega2025++*
