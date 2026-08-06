# 🔐 CONFIGURACIÓN DE SUPABASE - CODEC POS

## ✅ PROYECTO CONECTADO

CODEC POS está configurado para conectarse al siguiente proyecto de Supabase:

```
URL del Proyecto: https://ophsckohhjajcsqniqvw.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 ESTADO DE LA CONEXIÓN

✅ **Conexión exitosa al proyecto Supabase**
✅ **Tabla `usuarios_clientes` disponible**
⚠️  **Tabla `clientes_pos` requiere configuración**

---

## 🏗️ ESQUEMA DE BASE DE DATOS REQUERIDO

Para que CODEC POS funcione correctamente con Supabase, necesitas crear las siguientes tablas:

### 1. Tabla `clientes_pos`

Esta tabla almacena la información de los clientes/negocios que usan CODEC POS.

```sql
-- Crear tabla de clientes POS
CREATE TABLE public.clientes_pos (
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
CREATE INDEX idx_clientes_pos_nit ON public.clientes_pos(nit);
CREATE INDEX idx_clientes_pos_machine_id ON public.clientes_pos(machine_id);
CREATE INDEX idx_clientes_pos_estado ON public.clientes_pos(estado);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.clientes_pos ENABLE ROW LEVEL SECURITY;

-- Política: Permitir lectura pública (para que el POS pueda verificar licencias)
CREATE POLICY "Allow public read access" ON public.clientes_pos
  FOR SELECT
  USING (true);

-- Política: Solo admin puede insertar/actualizar
-- (Puedes ajustar esto según tus necesidades de seguridad)
CREATE POLICY "Allow authenticated insert" ON public.clientes_pos
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON public.clientes_pos
  FOR UPDATE
  USING (true);
```

---

### 2. Tabla `usuarios_clientes`

Esta tabla almacena los usuarios que pueden acceder al POS de cada cliente.

```sql
-- Crear tabla de usuarios por cliente
CREATE TABLE public.usuarios_clientes (
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
CREATE INDEX idx_usuarios_clientes_cliente_id ON public.usuarios_clientes(cliente_id);
CREATE INDEX idx_usuarios_clientes_username ON public.usuarios_clientes(username);

-- Habilitar RLS
ALTER TABLE public.usuarios_clientes ENABLE ROW LEVEL SECURITY;

-- Política: Permitir lectura pública
CREATE POLICY "Allow public read access" ON public.usuarios_clientes
  FOR SELECT
  USING (true);

-- Política: Permitir inserts/updates autenticados
CREATE POLICY "Allow authenticated insert" ON public.usuarios_clientes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON public.usuarios_clientes
  FOR UPDATE
  USING (true);
```

---

### 3. Trigger para actualizar `updated_at`

```sql
-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para clientes_pos
CREATE TRIGGER update_clientes_pos_updated_at
    BEFORE UPDATE ON public.clientes_pos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔧 INSTRUCCIONES DE CONFIGURACIÓN

### Opción 1: Desde Supabase Dashboard (Recomendado)

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard/project/ophsckohhjajcsqniqvw

2. Haz clic en **SQL Editor** en el menú lateral

3. Copia y pega el SQL completo de arriba (todas las secciones)

4. Haz clic en **Run** para ejecutar

5. Verifica que las tablas se crearon:
   - Ve a **Table Editor**
   - Deberías ver:
     - `clientes_pos`
     - `usuarios_clientes`

---

### Opción 2: Desde la CLI de Supabase

```bash
# Instalar Supabase CLI (si no la tienes)
npm install -g supabase

# Ejecutar el SQL
supabase db execute --project-ref ophsckohhjajcsqniqvw < schema.sql
```

---

## 🧪 VERIFICAR LA CONFIGURACIÓN

### Desde el código (Script de prueba ya incluido)

```bash
# Ejecutar script de prueba
pnpm exec tsx test-supabase-connection.ts
```

**Resultado esperado:**
```
✅ Conexión exitosa a tabla "clientes_pos"
✅ Clientes encontrados: 0
✅ Conexión exitosa a tabla "usuarios_clientes"
```

---

### Desde Supabase Dashboard

1. Ve a **Table Editor**
2. Selecciona la tabla `clientes_pos`
3. Deberías ver las columnas:
   - id, nombre_negocio, nit, contacto, telefono, email
   - plan, duracion, fecha_activacion, fecha_expiracion
   - estado, machine_id, suspendido, motivo_suspension
   - en_prueba, dias_prueba_restantes
   - created_at, updated_at

---

## 📝 DATOS DE PRUEBA (Opcional)

Para probar que todo funciona, puedes insertar un cliente de prueba:

```sql
-- Insertar cliente de prueba
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
) RETURNING id;

-- Guarda el ID que se retorna y úsalo en el siguiente INSERT

-- Insertar usuario para ese cliente
INSERT INTO public.usuarios_clientes (
  cliente_id,
  username,
  contraseña,
  rol
) VALUES (
  'ID_DEL_CLIENTE_DE_ARRIBA',  -- Reemplaza con el UUID real
  'prueba',
  'demo123',
  'super_usuario'
);
```

Luego, en CODEC POS puedes hacer login con:
```
Usuario: prueba
Contraseña: demo123
```

---

## 🔐 CONFIGURACIÓN ACTUAL EN EL CÓDIGO

### Archivo: `src/app/lib/supabase/config.ts`

```typescript
const SUPABASE_URL = 'https://ophsckohhjajcsqniqvw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

✅ **Ya está configurado correctamente**

---

### Archivo: `.env.local`

```env
VITE_SUPABASE_URL=https://ophsckohhjajcsqniqvw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

✅ **Ya creado para referencia**

---

## ⚙️ DEPENDENCIAS INSTALADAS

```json
{
  "@supabase/supabase-js": "2.105.4",
  "@supabase/ssr": "0.10.3"
}
```

✅ **Ya instaladas**

---

## 🎯 SIGUIENTE PASO

**Crear las tablas en Supabase:**

1. Ve a: https://supabase.com/dashboard/project/ophsckohhjajcsqniqvw/editor
2. Copia el SQL de la sección "ESQUEMA DE BASE DE DATOS REQUERIDO"
3. Pégalo en el SQL Editor
4. Ejecuta
5. Verifica que las tablas aparezcan en Table Editor

Una vez creadas las tablas, CODEC POS estará completamente integrado con Supabase y podrás:

- ✅ Crear clientes desde el Panel de Admin Clientes
- ✅ Suspender/activar licencias remotamente
- ✅ Validar Machine ID automáticamente
- ✅ Sistema de autenticación en la nube

---

## 📞 SOPORTE

**Desarrollado por Codec Studio**
- 🌐 https://www.codecstudio.online/
- 📱 +57 323 864 6844

Si tienes problemas con la configuración de Supabase, verifica:
1. Que las tablas estén creadas correctamente
2. Que RLS (Row Level Security) esté habilitado
3. Que las políticas permitan acceso público para lectura
4. Que el Anon Key sea correcto
