# 🎨 LOGO PERSONALIZADO - REFERENCIA RÁPIDA

## ⚡ Cambio Inmediato de Logo

### Ubicación del Archivo:
```
/public/logo.png
```

### Requisitos Mínimos:
- ✅ Formato: **PNG con transparencia**
- ✅ Tamaño: **512×512 px mínimo** (recomendado 1024×1024)
- ✅ Fondo: **Transparente**

---

## 🚀 Proceso de 3 Pasos

### 1️⃣ Copiar Logo
```bash
# Windows (PowerShell)
Copy-Item C:\ruta\al\logo.png public\logo.png

# Linux/Mac
cp /ruta/al/logo.png public/logo.png
```

### 2️⃣ Compilar Instalador
```bash
npm run electron:build
```

### 3️⃣ Ubicar Instalador
```
dist-electron/CODECPOS-Setup-2.0.0.exe
```

---

## 🤖 Script Automático (Windows)

### Ejecutar Script PowerShell:
```powershell
.\personalizar-cliente.ps1
```

**El script automáticamente:**
- ✅ Solicita nombre del cliente
- ✅ Solicita ruta del logo
- ✅ Valida dimensiones del logo
- ✅ Copia logo a /public/
- ✅ Compila instalador
- ✅ Renombra archivos con nombre del cliente
- ✅ Crea carpeta de entrega con documentación

---

## 📍 Dónde Aparece el Logo

### En la Aplicación:
- ✅ **Login:** Logo grande (120px)
- ✅ **Sidebar:** Logo circular (48px)
- ✅ **Header:** Logo horizontal con texto
- ✅ **Configuración:** Logo en secciones

### En el Sistema:
- ✅ **Instalador NSIS:** Ícono del .exe
- ✅ **Acceso directo:** Escritorio + Menú Inicio
- ✅ **Barra de tareas:** Cuando la app está abierta
- ✅ **Panel de Control:** En lista de programas

---

## 🔄 Fallback Automático

Si **NO** existe `/public/logo.png`:
- ✅ Sistema muestra **SVG inline profesional**
- ✅ Logo "CP" verde esmeralda con gradiente
- ✅ **Sin errores de compilación**

---

## 📋 Ejemplo de Flujo Completo

```powershell
# 1. Preparar logo del cliente
$logo = "C:\Clientes\MiniMercado\logo.png"

# 2. Copiar a proyecto
Copy-Item $logo public\logo.png

# 3. Compilar
npm run electron:build

# 4. Renombrar
Rename-Item `
  dist-electron\CODECPOS-Setup-2.0.0.exe `
  CODECPOS_MiniMercado_v2.0.0.exe

# 5. Entregar al cliente
# ✅ Listo para distribución
```

---

## 🌐 URLs del Sistema

**Todas las referencias ahora apuntan a:**
```
https://codecstudio.online/
```

**Ubicaciones actualizadas:**
- ✅ `/package.json` → `homepage`, `author`
- ✅ `/electron/builder-config.js` → `copyright`
- ✅ `/electron/assets/LICENSE.txt` → URL de términos
- ✅ Instalador NSIS → Información de contacto

---

## 📞 Soporte Rápido

| Tema | Contacto |
|------|----------|
| **Web oficial** | https://codecstudio.online/ |
| **Email** | contacto@codecstudio.com |
| **Documentación completa** | Ver `/README_LOGOS_INSTALACION.md` |
| **Guía de compilación** | Ver `/PERSONALIZACION_CLIENTE_RAPIDA.md` |

---

## 🔐 Notas de Seguridad

### ⚠️ Importante:
- **NO** subir logos de clientes al repositorio Git
- **SÍ** mantener `/public/logo.png` en `.gitignore` (opcional)
- **NO** compartir instaladores entre clientes
- **SÍ** crear instalador único por cliente

### Organización Recomendada:
```
codecpos-builds/
├── cliente-a/
│   ├── logo.png
│   └── CODECPOS_cliente_a_v2.0.0.exe
├── cliente-b/
│   ├── logo.png
│   └── CODECPOS_cliente_b_v2.0.0.exe
└── plantillas/
    └── logo-template.psd
```

---

## ✅ Verificación Rápida

Antes de entregar al cliente:

```bash
# 1. Verificar que logo existe
Test-Path public\logo.png  # Windows
ls public/logo.png         # Linux/Mac

# 2. Verificar dimensiones (PowerShell)
[System.Drawing.Image]::FromFile("public\logo.png").Size

# 3. Compilar
npm run electron:build

# 4. Probar instalador
# Ejecutar en VM o PC limpia
```

---

## 🎯 Comandos Útiles

```bash
# Limpiar y compilar desde cero
npm run compile:clean

# Solo empaquetar (sin instalador, más rápido)
npm run pack

# Compilación completa
npm run electron:build

# Verificar logo en desarrollo
npm run dev
```

---

**© 2026 CODEC POS v2.0 • Codec Studio**  
https://codecstudio.online/
