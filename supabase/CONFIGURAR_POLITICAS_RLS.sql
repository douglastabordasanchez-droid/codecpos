-- ========================================
-- POLÍTICAS DE SEGURIDAD PARA PANEL DE DESARROLLADOR
-- ========================================
-- Este script configura Row Level Security (RLS) si está habilitado

-- 1️⃣ VERIFICAR SI RLS ESTÁ HABILITADO
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'usuarios_pos';

-- 2️⃣ SI RLS ESTÁ HABILITADO, CREAR POLÍTICAS PERMISIVAS
-- (Si RLS no está habilitado, estas políticas no afectarán nada)

-- Política para SELECT - Permitir leer todos los usuarios
DROP POLICY IF EXISTS "Permitir leer usuarios" ON usuarios_pos;
CREATE POLICY "Permitir leer usuarios"
ON usuarios_pos
FOR SELECT
USING (true);

-- Política para INSERT - Permitir crear usuarios
DROP POLICY IF EXISTS "Permitir crear usuarios" ON usuarios_pos;
CREATE POLICY "Permitir crear usuarios"
ON usuarios_pos
FOR INSERT
WITH CHECK (true);

-- Política para UPDATE - Permitir actualizar usuarios
DROP POLICY IF EXISTS "Permitir actualizar usuarios" ON usuarios_pos;
CREATE POLICY "Permitir actualizar usuarios"
ON usuarios_pos
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Política para DELETE - Permitir eliminar usuarios
DROP POLICY IF EXISTS "Permitir eliminar usuarios" ON usuarios_pos;
CREATE POLICY "Permitir eliminar usuarios"
ON usuarios_pos
FOR DELETE
USING (true);

-- 3️⃣ VERIFICAR POLÍTICAS CREADAS
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'usuarios_pos';

-- ========================================
-- ALTERNATIVA: DESACTIVAR RLS (SI PREFIERES)
-- ========================================
-- Si prefieres desactivar RLS completamente para simplificar:
-- ALTER TABLE usuarios_pos DISABLE ROW LEVEL SECURITY;

-- ========================================
-- NOTA IMPORTANTE
-- ========================================
-- Las políticas actuales permiten acceso total (true).
-- Esto está bien para desarrollo, pero en producción deberías
-- implementar políticas más restrictivas basadas en roles.
