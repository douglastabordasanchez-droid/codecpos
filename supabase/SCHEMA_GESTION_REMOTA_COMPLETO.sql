-- ========================================
-- SCHEMA COMPLETO PARA GESTIÓN REMOTA DE CLIENTES
-- ========================================
-- Este schema permite gestionar clientes, planes y usuarios remotamente

-- 1️⃣ TABLA: clientes_pos (nuevos clientes/negocios)
CREATE TABLE IF NOT EXISTS clientes_pos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Información del negocio
    nombre_negocio TEXT NOT NULL,
    nit TEXT NOT NULL UNIQUE,
    contacto TEXT NOT NULL,
    telefono TEXT NOT NULL,
    email TEXT NOT NULL,
    direccion TEXT,
    ciudad TEXT,

    -- Plan y licencia
    plan TEXT NOT NULL CHECK (plan IN ('BASICO', 'PREMIUM')),
    duracion TEXT NOT NULL CHECK (duracion IN ('1_MES', '3_MESES', '1_ANO', 'VITALICIA')),
    fecha_activacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_expiracion TIMESTAMPTZ,
    estado TEXT NOT NULL CHECK (estado IN ('ACTIVA', 'VENCIDA', 'SUSPENDIDA', 'PRUEBA')) DEFAULT 'ACTIVA',

    -- Hardware y seguridad
    machine_id TEXT NOT NULL,
    license_key TEXT NOT NULL UNIQUE,

    -- Control de pago y suspensión
    ultimo_pago TIMESTAMPTZ,
    monto_ultimo_pago NUMERIC(10,2),
    proximo_pago TIMESTAMPTZ,
    suspendido BOOLEAN DEFAULT FALSE,
    motivo_suspension TEXT,

    -- Modo prueba
    en_prueba BOOLEAN DEFAULT FALSE,
    dias_prueba_restantes INTEGER DEFAULT 0,

    -- Notas internas
    notas TEXT,

    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'ADMIN'
);

-- 2️⃣ TABLA: usuarios_pos (actualizada con referencia a cliente)
-- Agregar columna de cliente_id a la tabla existente
ALTER TABLE usuarios_pos
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes_pos(id) ON DELETE CASCADE;

-- Agregar columna de plan del usuario (para usuarios individuales)
ALTER TABLE usuarios_pos
ADD COLUMN IF NOT EXISTS plan_usuario TEXT CHECK (plan_usuario IN ('BASICO', 'PREMIUM', 'ADMIN'));

-- 3️⃣ TABLA: historial_cambios_plan
CREATE TABLE IF NOT EXISTS historial_cambios_plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes_pos(id) ON DELETE CASCADE,
    plan_anterior TEXT NOT NULL,
    plan_nuevo TEXT NOT NULL,
    duracion_anterior TEXT,
    duracion_nueva TEXT NOT NULL,
    fecha_cambio TIMESTAMPTZ DEFAULT NOW(),
    motivo TEXT,
    realizado_por TEXT NOT NULL,
    monto_cobrado NUMERIC(10,2)
);

-- 4️⃣ TABLA: pagos_clientes
CREATE TABLE IF NOT EXISTS pagos_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes_pos(id) ON DELETE CASCADE,
    monto NUMERIC(10,2) NOT NULL,
    fecha_pago TIMESTAMPTZ DEFAULT NOW(),
    metodo_pago TEXT,
    comprobante TEXT,
    concepto TEXT NOT NULL,
    notas TEXT,
    registrado_por TEXT NOT NULL
);

-- 5️⃣ TABLA: logs_suspension
CREATE TABLE IF NOT EXISTS logs_suspension (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes_pos(id) ON DELETE CASCADE,
    accion TEXT NOT NULL CHECK (accion IN ('SUSPENDER', 'ACTIVAR')),
    motivo TEXT NOT NULL,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    realizado_por TEXT NOT NULL
);

-- 6️⃣ ÍNDICES para rendimiento
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes_pos(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_plan ON clientes_pos(plan);
CREATE INDEX IF NOT EXISTS idx_clientes_fecha_exp ON clientes_pos(fecha_expiracion);
CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON usuarios_pos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos_clientes(cliente_id);

-- 7️⃣ FUNCIÓN: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clientes_updated_at
    BEFORE UPDATE ON clientes_pos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 8️⃣ VISTA: Clientes con información completa
CREATE OR REPLACE VIEW vista_clientes_completa AS
SELECT
    c.*,
    COUNT(DISTINCT u.id) as total_usuarios,
    COUNT(DISTINCT CASE WHEN u.activo THEN u.id END) as usuarios_activos,
    (SELECT SUM(monto) FROM pagos_clientes WHERE cliente_id = c.id) as total_pagado,
    (SELECT MAX(fecha_pago) FROM pagos_clientes WHERE cliente_id = c.id) as ultimo_pago_fecha,
    CASE
        WHEN c.suspendido THEN 'SUSPENDIDO'
        WHEN c.estado = 'VENCIDA' THEN 'VENCIDA'
        WHEN c.en_prueba THEN 'PRUEBA'
        ELSE c.estado
    END as estado_real
FROM clientes_pos c
LEFT JOIN usuarios_pos u ON u.cliente_id = c.id
GROUP BY c.id;

-- 9️⃣ INSERTAR CLIENTE DE PRUEBA INICIAL (el admin)
INSERT INTO clientes_pos (
    nombre_negocio,
    nit,
    contacto,
    telefono,
    email,
    plan,
    duracion,
    fecha_activacion,
    fecha_expiracion,
    estado,
    machine_id,
    license_key,
    en_prueba
) VALUES (
    'CODEC STUDIO - Admin',
    '000000000-0',
    'Administrador del Sistema',
    '0000000000',
    'admin@codec.com',
    'PREMIUM',
    'VITALICIA',
    NOW(),
    NULL, -- Sin expiración
    'ACTIVA',
    'ADMIN-MACHINE-001',
    'CODEC-ADMIN-MASTER-KEY',
    FALSE
) ON CONFLICT (nit) DO NOTHING;

-- 🔟 VINCULAR usuario admin con cliente admin
UPDATE usuarios_pos
SET
    cliente_id = (SELECT id FROM clientes_pos WHERE nit = '000000000-0'),
    plan_usuario = 'ADMIN'
WHERE username = 'admin@codec.com';

-- ✅ VERIFICACIÓN FINAL
SELECT 'Schema creado correctamente' as status;

SELECT
    'Cliente Admin' as tipo,
    nombre_negocio,
    plan,
    duracion,
    estado
FROM clientes_pos
WHERE nit = '000000000-0';

SELECT
    'Usuario Admin' as tipo,
    username,
    nombre_completo,
    rol,
    plan_usuario
FROM usuarios_pos
WHERE username = 'admin@codec.com';
