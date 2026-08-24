# 🔐 Sistema de Autenticación Híbrida - CODEC POS v2.0

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Configuración Inicial](#configuración-inicial)
4. [Estructura de Base de Datos](#estructura-de-base-de-datos)
5. [Flujo de Autenticación](#flujo-de-autenticación)
6. [Gestión de Usuarios](#gestión-de-usuarios)
7. [Verificación de Hardware](#verificación-de-hardware)
8. [Solución de Problemas](#solución-de-problemas)

---

## 📖 Descripción General

El **Sistema de Autenticación Híbrida** permite control centralizado de usuarios vía Supabase mientras mantiene la capacidad de operar 100% offline. Características principales:

### ✨ Características

- **Cloud-First Authentication**: Intenta autenticar primero contra Supabase si hay conexión
- **Offline Fallback**: Si no hay internet, usa caché local (últimas credenciales validadas)
- **Hardware Binding**: Vincula usuarios a equipos específicos mediante Hardware ID
- **Remote User Management**: Activa/desactiva usuarios desde tu equipo administrador
- **Sincronización Automática**: Descarga usuarios activos de Supabase al iniciar sesión
- **Auditoría Completa**: Registra todas las sesiones y validaciones de hardware

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    CODEC POS (Cliente)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LoginPage.tsx                                       │   │
│  │    ↓                                                 │   │
│  │  authService.ts (Cloud-First Logic)                 │   │
│  │    ↓                 ↓                               │   │
│  │  [Online]        [Offline]                          │   │
│  │    ↓                 ↓                               │   │
│  │  Supabase       localStorage                        │   │
│  │    │                 │                               │   │
│  │    └─────────┬───────┘                               │   │
│  │              ↓                                       │   │
│  │        hardwareService.ts                           │   │
│  │              ↓                                       │   │
│  │        AuthContext (Usuario Autenticado)            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕️
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Nube)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • usuarios_pos (Tabla principal)                   │   │
│  │  • sesiones_pos (Registro de sesiones)              │   │
│  │  • validaciones_hardware (Auditoría)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Configuración Inicial

### Paso 1: Crear Proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Haz clic en **"New Project"**
3. Completa los datos:
   - **Name**: `codec-pos` (o el nombre que prefieras)
   - **Database Password**: Guarda esta contraseña de forma segura
   - **Region**: Selecciona la más cercana a Colombia (ej: `South America (São Paulo)`)
4. Espera 1-2 minutos mientras se crea el proyecto

### Paso 2: Obtener Credenciales

1. En tu proyecto de Supabase, ve al menú lateral → **Settings** → **API**
2. Copia los siguientes valores:
   - **Project URL** (ejemplo: `https://xyzcompany.supabase.co`)
   - **anon/public key** (es una clave larga que empieza con `eyJ...`)

### Paso 3: Configurar Credenciales en CODEC POS

1. Abre el archivo: `src/app/lib/supabase/config.ts`
2. Reemplaza las líneas 13 y 14:

```typescript
// ANTES:
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// DESPUÉS:
const SUPABASE_URL = 'https://xyzcompany.supabase.co'; // Tu URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Tu key
```

3. Guarda el archivo

### Paso 4: Crear Estructura de Base de Datos

1. En Supabase, ve al menú lateral → **SQL Editor**
2. Haz clic en **"New Query"**
3. Abre el archivo `supabase/schema.sql` de tu proyecto
4. Copia TODO el contenido del archivo SQL
5. Pégalo en el editor de Supabase
6. Haz clic en **"RUN"** (o presiona `Ctrl+Enter`)
7. Deberías ver un mensaje de éxito y una tabla con el conteo de registros

### Paso 5: Verificar Instalación

1. En Supabase, ve a **Table Editor**
2. Deberías ver 3 tablas nuevas:
   - `usuarios_pos`
   - `sesiones_pos`
   - `validaciones_hardware`

---

## 🗄️ Estructura de Base de Datos

### Tabla: `usuarios_pos`

| Campo                    | Tipo        | Descripción                                     |
| ------------------------ | ----------- | ----------------------------------------------- |
| `id`                     | UUID        | ID único del usuario                            |
| `username`               | TEXT        | Nombre de usuario (único)                       |
| `password_hash`          | TEXT        | Contraseña hasheada (Base64)                    |
| `nombre_completo`        | TEXT        | Nombre completo del usuario                     |
| `cedula`                 | TEXT        | Cédula/ID del empleado (único)                  |
| `rol`                    | TEXT        | `super_usuario` o `cajero`                      |
| `activo`                 | BOOLEAN     | Si el usuario puede iniciar sesión              |
| `hardware_id_autorizado` | TEXT        | UUID del equipo autorizado (`null` = cualquier) |
| `permisos`               | JSONB       | Objeto con permisos del usuario                 |
| `ultimo_login`           | TIMESTAMPTZ | Fecha del último inicio de sesión               |
| `created_at`             | TIMESTAMPTZ | Fecha de creación                               |
| `updated_at`             | TIMESTAMPTZ | Fecha de última modificación                    |

### Tabla: `sesiones_pos`

Registra todas las sesiones de usuario para auditoría.

### Tabla: `validaciones_hardware`

Registra todos los intentos de inicio de sesión con validación de hardware.

---

## 🔐 Flujo de Autenticación

### Diagrama de Flujo

```
Usuario ingresa credenciales
          ↓
¿Hay conexión a internet?
    ↓ Sí           ↓ No
    ↓              ↓
Supabase      localStorage
    ↓              ↓
Valida credenciales
    ↓
¿Usuario activo?
    ↓ Sí
    ↓
Verificar Hardware ID
    ↓
¿Hardware autorizado?
    ↓ Sí
    ↓
✅ Acceso Concedido
    ↓
Sincronizar a caché local
```

### Modos de Autenticación

#### 🌐 Modo Online (Cloud-First)

- **Cuándo**: Hay conexión a internet y Supabase está configurado
- **Proceso**:
  1. Busca usuario en Supabase por `username`
  2. Verifica que esté `activo = true`
  3. Compara contraseña hasheada
  4. Valida Hardware ID (si está configurado)
  5. Actualiza `ultimo_login`
  6. Registra sesión
  7. Sincroniza usuario a caché local

#### 📴 Modo Offline (Fallback)

- **Cuándo**: No hay internet o Supabase no responde
- **Proceso**:
  1. Busca usuario en caché local (IndexedDB/localStorage)
  2. Verifica que esté activo
  3. Compara contraseña
  4. Acceso concedido con advertencia de "Pendiente de sincronización"

---

## 👥 Gestión de Usuarios

### Desde tu Equipo Administrador

1. Ve a **Sección Desarrollador** en el menú lateral (solo visible para admin)
2. Accede a **Admin Remoto**
3. Verás la lista completa de usuarios en Supabase
4. Acciones disponibles:
   - ✅ **Activar Usuario**: El usuario podrá iniciar sesión
   - ❌ **Desactivar Usuario**: Bloquea acceso inmediato (la próxima vez que se conecte)
   - 🔗 **Autorizar Hardware**: Vincula al usuario con el equipo actual
   - 🔓 **Remover Hardware**: Permite iniciar en cualquier equipo

### Crear Usuarios desde Supabase

Puedes crear usuarios directamente en Supabase:

```sql
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
  'cajero2',
  'Y2FqZXJvMTIz', -- Base64 de "cajero123"
  'Juan Pérez',
  '1234567890',
  'cajero',
  true,
  'auto', -- Se autoriza automáticamente en primer login
  '{
    "ventas": true,
    "productos": true,
    "cierreCaja": true,
    "devoluciones": true
  }'::JSONB
);
```

---

## 🖥️ Verificación de Hardware

### Cómo Funciona

1. **Obtención del Hardware ID**:
   - En Electron: Lee UUID real del Motherboard (via `wmic`, PowerShell o Registry)
   - En navegador: Genera fingerprint basado en características del sistema

2. **Valores Especiales**:
   - `null` o no definido: Usuario puede iniciar en **cualquier equipo**
   - `'any'`: Usuario puede iniciar en **cualquier equipo**
   - `'auto'`: Se **registra automáticamente** el primer equipo donde inicia
   - UUID específico: Usuario **solo puede iniciar** en ese equipo

3. **Autorización**:
   - Desde el **Panel de Admin Remoto**, haz clic en **"Autorizar Este PC"**
   - El sistema vinculará ese usuario al Hardware ID de tu equipo actual
   - El usuario solo podrá iniciar sesión en ese equipo

---

## 🔧 Solución de Problemas

### ❌ Error: "Supabase no configurado"

**Causa**: Las credenciales no están configuradas en `config.ts`

**Solución**:
1. Verifica que hayas copiado correctamente la URL y la key
2. Asegúrate de que no contengan espacios al inicio o final
3. Verifica que la URL empiece con `https://`
4. Reinicia la aplicación

### ❌ Error: "Usuario desactivado por el administrador"

**Causa**: El usuario fue desactivado remotamente

**Solución**:
1. Ve al Panel de Admin Remoto desde tu equipo administrador
2. Busca el usuario en la lista
3. Haz clic en **"Activar"**
4. El usuario podrá iniciar sesión inmediatamente

### ❌ Error: "Este usuario no está autorizado para este equipo"

**Causa**: El usuario está vinculado a otro equipo

**Solución**:
1. Opción 1: Ve al Panel de Admin Remoto y haz clic en **"Remover Hardware"**
2. Opción 2: Autoriza el nuevo equipo con **"Autorizar Este PC"**

### ⚠️ Advertencia: "Modo offline - Caché local"

**Causa**: No hay conexión a internet

**Solución**:
1. Verifica tu conexión a internet
2. El sistema funcionará normalmente en modo offline
3. Los cambios se sincronizarán cuando se restablezca la conexión

---

## 📊 Indicadores de Estado

### En el Login

- **☁️ Modo Online - Sincronizado**: Conectado a Supabase, validando contra la nube
- **📴 Modo Offline - Caché Local**: Sin internet, usando últimas credenciales validadas
- **💾 Modo Local - Sin Nube**: Supabase no configurado, solo almacenamiento local

### En el Sidebar

- **🟢 Sincronizado**: Conectado a Supabase, sincronización activa
- **🟡 Caché Local**: Sin conexión, usando datos locales
- **⚪ Modo Local**: Sin Supabase configurado

---

## 🎯 Casos de Uso

### Caso 1: Instalar en un nuevo minimercado

1. Instala CODEC POS en la PC del cliente
2. Inicia sesión como Admin local
3. Ve a Admin Remoto → Crear usuario para el cliente
4. Autoriza el hardware de esa PC
5. El cliente podrá iniciar sesión solo en esa PC

### Caso 2: Desactivar un empleado despedido

1. Desde tu equipo administrador, accede a Admin Remoto
2. Busca el usuario del empleado
3. Haz clic en **"Desactivar"**
4. El empleado NO podrá iniciar sesión la próxima vez (si hay internet)
5. Si está offline, se bloqueará cuando se conecte

### Caso 3: Cliente necesita cambiar de PC

1. El cliente te contacta
2. Accedes a Admin Remoto
3. Haces clic en **"Remover Hardware"** en su usuario
4. Le indicas que inicie sesión en la nueva PC
5. Autorizas el nuevo hardware desde Admin Remoto

---

## 🔒 Seguridad

### Mejores Prácticas

1. **No compartas tu anon/public key de Supabase** en repositorios públicos
2. **Usa contraseñas fuertes** para los usuarios administradores
3. **Revisa el historial de sesiones** regularmente en Supabase
4. **Activa Row Level Security (RLS)** en Supabase para producción
5. **Cambia las contraseñas** de los usuarios de prueba

### Consideraciones

- El password se hashea con Base64 (simple para demo)
- En producción, considera usar bcrypt o argon2
- El Hardware ID puede cambiar si se cambian componentes de hardware
- Los datos locales están en IndexedDB (no encriptados)

---

## 📞 Soporte

Para soporte técnico o consultas:

- **Email**: contacto@codecstudio.com
- **Web**: https://codecstudio.online
- **Documentación adicional**: Ver archivos en `supabase/`

---

## ✅ Checklist de Implementación

- [ ] Crear proyecto en Supabase
- [ ] Obtener credenciales (URL y key)
- [ ] Configurar credenciales en `config.ts`
- [ ] Ejecutar script SQL (`schema.sql`)
- [ ] Verificar tablas creadas
- [ ] Probar conexión desde Admin Remoto
- [ ] Crear usuario de prueba
- [ ] Probar login online
- [ ] Desconectar internet y probar login offline
- [ ] Autorizar hardware en un equipo
- [ ] Desactivar usuario remotamente
- [ ] Verificar sincronización

---

**🎉 ¡Sistema de Autenticación Híbrida configurado exitosamente!**
