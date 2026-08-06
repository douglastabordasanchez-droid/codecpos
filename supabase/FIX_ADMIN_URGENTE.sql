-- ========================================
-- DIAGNÓSTICO Y CORRECCIÓN URGENTE
-- ========================================
-- Ejecuta este script para diagnosticar y corregir el problema

-- PASO 1: Ver el estado actual del usuario admin
SELECT
    'ESTADO ACTUAL' as tipo,
    id,
    username,
    nombre_completo,
    rol,
    activo,
    hardware_id_autorizado,
    password_hash,
    permisos,
    created_at
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- PASO 2: CORRECCIÓN COMPLETA Y DIRECTA
UPDATE usuarios_pos
SET
    rol = 'super_usuario',
    activo = true,
    hardware_id_autorizado = 'any',
    password_hash = 'Tm9ydWVnYTIwMjUrKyo=',
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

-- PASO 3: Verificación final
SELECT
    'DESPUÉS DE CORRECCIÓN' as tipo,
    username,
    rol,
    activo,
    hardware_id_autorizado,
    CASE
        WHEN password_hash = 'Tm9ydWVnYTIwMjUrKyo=' THEN '✅ Correcto'
        ELSE '❌ Incorrecto: ' || password_hash
    END as password_check,
    CASE
        WHEN rol = 'super_usuario' THEN '✅ Correcto'
        ELSE '❌ Incorrecto: ' || rol
    END as rol_check
FROM usuarios_pos
WHERE username = 'admin@codec.com';

-- IMPORTANTE: Después de ejecutar este script:
-- 1. Cierra sesión en el POS
-- 2. Recarga la página (F5)
-- 3. Vuelve a iniciar sesión con admin@codec.com
-- 4. Deberías ser redirigido al Panel de Desarrollador
