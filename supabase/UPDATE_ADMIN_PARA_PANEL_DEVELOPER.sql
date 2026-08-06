-- ========================================
-- ACTUALIZAR ADMIN PARA PANEL DE DESARROLLADOR
-- ========================================
-- Este script configura correctamente el usuario admin@codec.com
-- para que pueda acceder al Panel de Desarrollador con todas las funciones

-- 1️⃣ VERIFICAR ESTRUCTURA ACTUAL
SELECT
    username,
    nombre_completo,
    rol,
    activo,
    hardware_id_autorizado,
    password_hash,
    permisos
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- 2️⃣ ACTUALIZAR USUARIO ADMIN CON CONFIGURACIÓN COMPLETA
UPDATE usuarios_pos
SET
    rol = 'super_usuario',
    activo = true,
    hardware_id_autorizado = 'any', -- Puede acceder desde cualquier dispositivo
    permisos = '{
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
        "fidelizacion": true,
        "monitoreo": true
    }'::jsonb
WHERE username = 'admin@codec.com';

-- 3️⃣ VERIFICAR QUE EL PASSWORD_HASH SEA CORRECTO
-- Debe ser: Tm9ydWVnYTIwMjUrKyo= (Base64 de "Noruega2025++*")
UPDATE usuarios_pos
SET password_hash = 'Tm9ydWVnYTIwMjUrKyo='
WHERE username = 'admin@codec.com'
  AND password_hash != 'Tm9ydWVnYTIwMjUrKyo=';

-- 4️⃣ VERIFICACIÓN FINAL
SELECT
    'Usuario configurado correctamente' as status,
    username,
    nombre_completo,
    rol,
    activo,
    hardware_id_autorizado,
    CASE
        WHEN password_hash = 'Tm9ydWVnYTIwMjUrKyo=' THEN '✅ Password correcto'
        ELSE '❌ Password incorrecto'
    END as password_status,
    permisos
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- 5️⃣ VERIFICAR QUE LA TABLA TENGA TODOS LOS CAMPOS NECESARIOS
-- (Solo para diagnóstico - no modifica nada)
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios_pos'
ORDER BY ordinal_position;
