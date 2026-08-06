-- =========================================
-- CODEC POS - RECREAR TABLAS CORRECTAMENTE
-- =========================================
-- ADVERTENCIA: Este script ELIMINA las tablas existentes
-- Si tienes datos importantes, haz backup primero
-- =========================================

-- 1. ELIMINAR TABLAS EXISTENTES (si existen)
DROP TABLE IF EXISTS validaciones_hardware CASCADE;
DROP TABLE IF EXISTS sesiones_pos CASCADE;
DROP TABLE IF EXISTS usuarios_pos CASCADE;

-- 2. ELIMINAR FUNCIONES
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS desactivar_usuario(UUID) CASCADE;
DROP FUNCTION IF EXISTS activar_usuario(UUID) CASCADE;
DROP FUNCTION IF EXISTS cerrar_sesion(UUID) CASCADE;

-- =========================================
-- CREAR ESTRUCTURA COMPLETA
-- =========================================

-- TABLA: usuarios_pos
CREATE TABLE usuarios_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('super_usuario', 'cajero')),
  activo BOOLEAN NOT NULL DEFAULT true,
  hardware_id_autorizado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_login TIMESTAMPTZ,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  permisos JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT username_lowercase CHECK (username = LOWER(username))
);

-- Índices
CREATE INDEX idx_usuarios_username ON usuarios_pos(username);
CREATE INDEX idx_usuarios_cedula ON usuarios_pos(cedula);
CREATE INDEX idx_usuarios_activo ON usuarios_pos(activo);
CREATE INDEX idx_usuarios_hardware ON usuarios_pos(hardware_id_autorizado);

-- Trigger para updated_at
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

-- TABLA: sesiones_pos
CREATE TABLE sesiones_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_pos(id) ON DELETE CASCADE,
  hardware_id TEXT NOT NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  sincronizado BOOLEAN NOT NULL DEFAULT true,
  duracion_minutos INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN fecha_fin IS NOT NULL THEN
        EXTRACT(EPOCH FROM (fecha_fin - fecha_inicio)) / 60
      ELSE NULL
    END
  ) STORED
);

CREATE INDEX idx_sesiones_usuario ON sesiones_pos(usuario_id);
CREATE INDEX idx_sesiones_fecha_inicio ON sesiones_pos(fecha_inicio DESC);
CREATE INDEX idx_sesiones_hardware ON sesiones_pos(hardware_id);

-- TABLA: validaciones_hardware
CREATE TABLE validaciones_hardware (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_pos(id) ON DELETE CASCADE,
  hardware_id_actual TEXT NOT NULL,
  hardware_id_autorizado TEXT,
  fecha_validacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado TEXT NOT NULL CHECK (resultado IN ('aprobado', 'rechazado', 'primera_vez')),
  detalles TEXT
);

CREATE INDEX idx_validaciones_usuario ON validaciones_hardware(usuario_id);
CREATE INDEX idx_validaciones_fecha ON validaciones_hardware(fecha_validacion DESC);

-- =========================================
-- CREAR USUARIO ADMINISTRADOR
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
  'Tm9ydWVnYTIwMjUrKyo=',
  'Administrador CODEC',
  '1000000000',
  'super_usuario',
  true,
  'any',
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
);

-- =========================================
-- VERIFICACIÓN
-- =========================================

-- Ver el usuario creado
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

-- Contar registros en cada tabla
SELECT 'usuarios_pos' as tabla, COUNT(*) as registros FROM usuarios_pos
UNION ALL
SELECT 'sesiones_pos', COUNT(*) FROM sesiones_pos
UNION ALL
SELECT 'validaciones_hardware', COUNT(*) FROM validaciones_hardware;

-- ✅ ¡COMPLETADO!
-- Ahora puedes iniciar sesión con:
--   Usuario: admin@codec.com
--   Contraseña: Noruega2025++*
