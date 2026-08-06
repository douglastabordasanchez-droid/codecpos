-- ========================================
-- SCRIPT URGENTE: VERIFICAR Y CORREGIR ADMIN
-- ========================================

-- PASO 1: Ver estado actual COMPLETO
SELECT
    'ANTES DE CORREGIR' as momento,
    id,
    username,
    nombre_completo,
    cedula,
    rol,
    activo,
    hardware_id_autorizado,
    password_hash,
    permisos::text,
    created_at
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- PASO 2: FORZAR CORRECCIÓN
UPDATE usuarios_pos
SET
    rol = 'super_usuario',
    activo = true,
    hardware_id_autorizado = 'any',
    password_hash = 'Tm9ydWVnYTIwMjUrKyo='
WHERE username = 'admin@codec.com';

-- PASO 3: VERIFICAR QUE SE GUARDÓ
SELECT
    'DESPUES DE CORREGIR' as momento,
    id,
    username,
    rol,
    activo,
    hardware_id_autorizado,
    password_hash,
    CASE
        WHEN rol = 'super_usuario' THEN '✅ ROL CORRECTO'
        ELSE '❌ ROL INCORRECTO: ' || rol
    END as verificacion_rol,
    CASE
        WHEN hardware_id_autorizado = 'any' THEN '✅ HARDWARE CORRECTO'
        ELSE '❌ HARDWARE: ' || COALESCE(hardware_id_autorizado, 'NULL')
    END as verificacion_hardware,
    CASE
        WHEN password_hash = 'Tm9ydWVnYTIwMjUrKyo=' THEN '✅ PASSWORD CORRECTO'
        ELSE '❌ PASSWORD INCORRECTO'
    END as verificacion_password
FROM usuarios_pos
WHERE username = 'admin@codec.com';
