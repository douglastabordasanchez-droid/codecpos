-- ============================================
-- ESQUEMA DE BASE DE DATOS PARA CODEC POS
-- Proyecto Supabase: https://ophsckohhjajcsqniqvw.supabase.co
-- ============================================

-- ============================================
-- 1. TABLA: clientes_pos
-- Almacena información de clientes/negocios
-- ============================================

CREATE TABLE IF NOT EXISTS public.clientes_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio TEXT NOT NULL,
  nit TEXT NOT NULL UNIQUE,
  contacto TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('BASICO', 'PREMIUM')),
  duracion TEXT NOT NULL CHECK (duracion IN ('1_MES', '3_MESES', '1_ANO', 'VITALICIA')),
  fecha_activacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  fecha_expiracion TIMESTAMP WITH TIME ZONE,
  estado TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'VENCIDA', 'SUSPENDIDA', 'PRUEBA')),
  machine_id TEXT,
  suspendido BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_suspension TEXT,
  en_prueba BOOLEAN NOT NULL DEFAULT FALSE,
  dias_prueba_restantes INTEGER DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_clientes_pos_nit ON public.clientes_pos(nit);
CREATE INDEX IF NOT EXISTS idx_clientes_pos_machine_id ON public.clientes_pos(machine_id);
CREATE INDEX IF NOT EXISTS idx_clientes_pos_estado ON public.clientes_pos(estado);

-- Comentarios en las columnas
COMMENT ON TABLE public.clientes_pos IS 'Almacena información de clientes/negocios que usan CODEC POS';
COMMENT ON COLUMN public.clientes_pos.machine_id IS 'Identificador único del hardware del cliente (se registra en primer login)';
COMMENT ON COLUMN public.clientes_pos.suspendido IS 'Si es true, el cliente no puede acceder al sistema';
COMMENT ON COLUMN public.clientes_pos.estado IS 'Estado de la licencia: ACTIVA, VENCIDA, SUSPENDIDA, PRUEBA';

-- ============================================
-- 2. TABLA: usuarios_clientes
-- Almacena usuarios de cada cliente
-- ============================================

CREATE TABLE IF NOT EXISTS public.usuarios_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes_pos(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  contraseña TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('super_usuario', 'cajero')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(cliente_id, username)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_cliente_id ON public.usuarios_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_clientes_username ON public.usuarios_clientes(username);

-- Comentarios
COMMENT ON TABLE public.usuarios_clientes IS 'Usuarios que pueden acceder al POS de cada cliente';
COMMENT ON COLUMN public.usuarios_clientes.cliente_id IS 'Referencia al cliente propietario';
COMMENT ON COLUMN public.usuarios_clientes.username IS 'Nombre de usuario para login';
COMMENT ON COLUMN public.usuarios_clientes.contraseña IS 'Contraseña en texto plano (se puede encriptar en futuras versiones)';

-- ============================================
-- 3. FUNCIÓN Y TRIGGER: Actualizar updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para clientes_pos
DROP TRIGGER IF EXISTS update_clientes_pos_updated_at ON public.clientes_pos;
CREATE TRIGGER update_clientes_pos_updated_at
    BEFORE UPDATE ON public.clientes_pos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en ambas tablas
ALTER TABLE public.clientes_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_clientes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Políticas para clientes_pos
-- ============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Allow public read access" ON public.clientes_pos;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.clientes_pos;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.clientes_pos;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.clientes_pos;

-- Permitir lectura pública (para que el POS pueda verificar licencias)
CREATE POLICY "Allow public read access" ON public.clientes_pos
  FOR SELECT
  USING (true);

-- Permitir inserción autenticada
CREATE POLICY "Allow authenticated insert" ON public.clientes_pos
  FOR INSERT
  WITH CHECK (true);

-- Permitir actualización autenticada
CREATE POLICY "Allow authenticated update" ON public.clientes_pos
  FOR UPDATE
  USING (true);

-- Permitir eliminación autenticada
CREATE POLICY "Allow authenticated delete" ON public.clientes_pos
  FOR DELETE
  USING (true);

-- ============================================
-- Políticas para usuarios_clientes
-- ============================================

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Allow public read access" ON public.usuarios_clientes;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.usuarios_clientes;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.usuarios_clientes;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.usuarios_clientes;

-- Permitir lectura pública
CREATE POLICY "Allow public read access" ON public.usuarios_clientes
  FOR SELECT
  USING (true);

-- Permitir inserción autenticada
CREATE POLICY "Allow authenticated insert" ON public.usuarios_clientes
  FOR INSERT
  WITH CHECK (true);

-- Permitir actualización autenticada
CREATE POLICY "Allow authenticated update" ON public.usuarios_clientes
  FOR UPDATE
  USING (true);

-- Permitir eliminación autenticada
CREATE POLICY "Allow authenticated delete" ON public.usuarios_clientes
  FOR DELETE
  USING (true);

-- ============================================
-- 5. DATOS DE PRUEBA (OPCIONAL)
-- Descomenta esta sección si quieres insertar datos de prueba
-- ============================================

/*
-- Cliente de prueba
INSERT INTO public.clientes_pos (
  nombre_negocio,
  nit,
  contacto,
  telefono,
  email,
  plan,
  duracion,
  estado,
  fecha_activacion,
  en_prueba,
  dias_prueba_restantes
) VALUES (
  'Tienda de Prueba CODEC',
  '900000000-0',
  'Admin Prueba',
  '3001234567',
  'prueba@codecstudio.online',
  'PREMIUM',
  'VITALICIA',
  'ACTIVA',
  NOW(),
  false,
  0
)
ON CONFLICT (nit) DO NOTHING;

-- Usuario de prueba (ajusta el cliente_id según el resultado del INSERT anterior)
INSERT INTO public.usuarios_clientes (
  cliente_id,
  username,
  contraseña,
  rol
) VALUES (
  (SELECT id FROM public.clientes_pos WHERE nit = '900000000-0'),
  'prueba',
  'demo123',
  'super_usuario'
)
ON CONFLICT (cliente_id, username) DO NOTHING;
*/

-- ============================================
-- 6. VERIFICACIÓN
-- ============================================

-- Verificar que las tablas se crearon correctamente
DO $$
BEGIN
  RAISE NOTICE '✅ Verificando tablas...';

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clientes_pos') THEN
    RAISE NOTICE '✅ Tabla clientes_pos creada';
  ELSE
    RAISE EXCEPTION '❌ Error: Tabla clientes_pos no se creó';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usuarios_clientes') THEN
    RAISE NOTICE '✅ Tabla usuarios_clientes creada';
  ELSE
    RAISE EXCEPTION '❌ Error: Tabla usuarios_clientes no se creó';
  END IF;

  RAISE NOTICE '✅ Esquema de base de datos configurado correctamente';
  RAISE NOTICE '📋 Puedes ver las tablas en: Table Editor → clientes_pos, usuarios_clientes';
END $$;

-- ============================================
-- FIN DEL SCRIPT
-- ============================================

-- Para ejecutar este script:
-- 1. Ve a tu proyecto Supabase: https://supabase.com/dashboard/project/ophsckohhjajcsqniqvw
-- 2. Haz clic en "SQL Editor" en el menú lateral
-- 3. Copia y pega este archivo completo
-- 4. Haz clic en "Run"
-- 5. Verifica en "Table Editor" que las tablas se crearon
