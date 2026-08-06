-- =========================================
-- CODEC POS v2.0 - ESTRUCTURA DE BASE DE DATOS SUPABASE
-- =========================================
--
-- INSTRUCCIONES:
-- 1. Ve a tu proyecto en https://supabase.com
-- 2. En el menú lateral, ve a "SQL Editor"
-- 3. Crea una nueva query
-- 4. Copia y pega TODO este script
-- 5. Ejecuta el script (botón "RUN" o Ctrl+Enter)
-- 6. Verifica que las tablas se hayan creado en "Table Editor"
--
-- =========================================

-- ✅ TABLA: usuarios_pos
-- Almacena todos los usuarios del sistema POS
CREATE TABLE IF NOT EXISTS usuarios_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('super_usuario', 'cajero')),
  activo BOOLEAN NOT NULL DEFAULT true,
  hardware_id_autorizado TEXT, -- UUID del equipo autorizado, NULL = cualquier equipo
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_login TIMESTAMPTZ,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  permisos JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Índices para búsquedas rápidas
  CONSTRAINT username_lowercase CHECK (username = LOWER(username))
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios_pos(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_cedula ON usuarios_pos(cedula);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios_pos(activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_hardware ON usuarios_pos(hardware_id_autorizado);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON usuarios_pos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ✅ TABLA: sesiones_pos
-- Registro de todas las sesiones de usuario
CREATE TABLE IF NOT EXISTS sesiones_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_pos(id) ON DELETE CASCADE,
  hardware_id TEXT NOT NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  sincronizado BOOLEAN NOT NULL DEFAULT true,

  -- Campos calculados
  duracion_minutos INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN fecha_fin IS NOT NULL THEN
        EXTRACT(EPOCH FROM (fecha_fin - fecha_inicio)) / 60
      ELSE NULL
    END
  ) STORED
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_pos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha_inicio ON sesiones_pos(fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_hardware ON sesiones_pos(hardware_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_activas ON sesiones_pos(usuario_id, fecha_fin) WHERE fecha_fin IS NULL;


-- ✅ TABLA: validaciones_hardware
-- Registro de validaciones de hardware (auditoría)
CREATE TABLE IF NOT EXISTS validaciones_hardware (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_pos(id) ON DELETE CASCADE,
  hardware_id_actual TEXT NOT NULL,
  hardware_id_autorizado TEXT,
  fecha_validacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado TEXT NOT NULL CHECK (resultado IN ('aprobado', 'rechazado', 'primera_vez')),
  detalles TEXT
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_validaciones_usuario ON validaciones_hardware(usuario_id);
CREATE INDEX IF NOT EXISTS idx_validaciones_fecha ON validaciones_hardware(fecha_validacion DESC);
CREATE INDEX IF NOT EXISTS idx_validaciones_resultado ON validaciones_hardware(resultado);


-- =========================================
-- DATOS DE PRUEBA (OPCIONAL)
-- =========================================
-- Descomentar las siguientes líneas si deseas crear usuarios de prueba

/*
-- Usuario Administrador de Prueba
-- Username: admin
-- Password: admin123 (hash en base64)
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
  'admin',
  'YWRtaW4xMjM=', -- Base64 de "admin123"
  'Administrador Sistema',
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
) ON CONFLICT (username) DO NOTHING;

-- Usuario Cajero de Prueba
-- Username: cajero1
-- Password: cajero123 (hash en base64)
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
  'cajero1',
  'Y2FqZXJvMTIz', -- Base64 de "cajero123"
  'Cajero Demo',
  '1000000001',
  'cajero',
  true,
  'auto', -- Se registrará automáticamente en el primer inicio
  '{
    "dashboard": false,
    "ventas": true,
    "productos": true,
    "alertas": true,
    "configuracion": false,
    "usuarios": false,
    "cierreCaja": true,
    "reportes": false,
    "gastos": false,
    "codecVerify": false,
    "devoluciones": true,
    "empleados": false,
    "multitienda": false,
    "fidelizacion": false
  }'::JSONB
) ON CONFLICT (username) DO NOTHING;
*/


-- =========================================
-- POLÍTICAS DE SEGURIDAD RLS (Row Level Security)
-- =========================================
-- IMPORTANTE: Por seguridad, habilita RLS y crea políticas adecuadas en producción

-- Habilitar RLS (descomentado solo si vas a configurar políticas)
-- ALTER TABLE usuarios_pos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sesiones_pos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE validaciones_hardware ENABLE ROW LEVEL SECURITY;

-- Política de ejemplo (permitir lectura a todos por ahora)
-- En producción, deberías crear políticas más restrictivas
-- CREATE POLICY "Permitir lectura pública" ON usuarios_pos FOR SELECT USING (true);
-- CREATE POLICY "Permitir inserción pública" ON usuarios_pos FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Permitir actualización pública" ON usuarios_pos FOR UPDATE USING (true);


-- =========================================
-- VISTAS ÚTILES
-- =========================================

-- Vista de usuarios activos
CREATE OR REPLACE VIEW v_usuarios_activos AS
SELECT
  id,
  username,
  nombre_completo,
  cedula,
  rol,
  hardware_id_autorizado,
  ultimo_login,
  created_at
FROM usuarios_pos
WHERE activo = true
ORDER BY nombre_completo;

-- Vista de sesiones recientes
CREATE OR REPLACE VIEW v_sesiones_recientes AS
SELECT
  s.id,
  s.usuario_id,
  u.nombre_completo,
  u.username,
  s.hardware_id,
  s.fecha_inicio,
  s.fecha_fin,
  s.duracion_minutos
FROM sesiones_pos s
JOIN usuarios_pos u ON s.usuario_id = u.id
ORDER BY s.fecha_inicio DESC
LIMIT 100;

-- Vista de validaciones de hardware recientes
CREATE OR REPLACE VIEW v_validaciones_recientes AS
SELECT
  v.id,
  v.usuario_id,
  u.nombre_completo,
  u.username,
  v.hardware_id_actual,
  v.hardware_id_autorizado,
  v.resultado,
  v.detalles,
  v.fecha_validacion
FROM validaciones_hardware v
JOIN usuarios_pos u ON v.usuario_id = u.id
ORDER BY v.fecha_validacion DESC
LIMIT 100;


-- =========================================
-- FUNCIONES ÚTILES
-- =========================================

-- Función para desactivar usuario
CREATE OR REPLACE FUNCTION desactivar_usuario(p_usuario_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE usuarios_pos
  SET activo = false,
      updated_at = NOW()
  WHERE id = p_usuario_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función para activar usuario
CREATE OR REPLACE FUNCTION activar_usuario(p_usuario_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE usuarios_pos
  SET activo = true,
      intentos_fallidos = 0,
      bloqueado_hasta = NULL,
      updated_at = NOW()
  WHERE id = p_usuario_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función para cerrar sesión abierta
CREATE OR REPLACE FUNCTION cerrar_sesion(p_sesion_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE sesiones_pos
  SET fecha_fin = NOW()
  WHERE id = p_sesion_id AND fecha_fin IS NULL;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;


-- =========================================
-- VERIFICACIÓN FINAL
-- =========================================
-- Ejecuta estos comandos para verificar que todo se creó correctamente

SELECT 'usuarios_pos' as tabla, COUNT(*) as registros FROM usuarios_pos
UNION ALL
SELECT 'sesiones_pos', COUNT(*) FROM sesiones_pos
UNION ALL
SELECT 'validaciones_hardware', COUNT(*) FROM validaciones_hardware;

-- ✅ ¡Script completado exitosamente!
-- Ahora puedes configurar las credenciales en tu aplicación:
-- 1. Copia tu Project URL desde Settings → API
-- 2. Copia tu anon/public key desde Settings → API
-- 3. Pégalas en src/app/lib/supabase/config.ts
