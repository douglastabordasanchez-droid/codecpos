# 🔄 MIGRACIÓN DE LOGOS - COMANDOS EXACTOS

## 📋 RESUMEN RÁPIDO

**Nombres recomendados para evitar conflictos en Electron:**

```
Logo horizontal:  codec-logo.png
Ícono cuadrado:   codec-icon.png
```

---

## ⚡ MIGRACIÓN EN 3 PASOS

### **PASO 1: Descargar los logos actuales**

Los logos actuales están en Figma con estos hashes:
- `482f796c31016dc684e50c0f42a23411e23b97f4.png` → Logo horizontal
- `c801f768bae83508391e9d98b8555082d5a2c7da.png` → Ícono cuadrado

**Descárgalos desde Figma Make y guárdalos temporalmente.**

---

### **PASO 2: Crear estructura de carpetas**

```bash
# Crear carpeta para imágenes
mkdir -p public/assets/images

# Crear carpeta para íconos de Electron
mkdir -p public/assets/icons/win
mkdir -p public/assets/icons/mac
mkdir -p public/assets/icons/linux
```

---

### **PASO 3: Copiar logos con nombres correctos**

```bash
# Copiar logo horizontal
# (Asumiendo que descargaste el archivo como logo-horizontal.png)
cp ~/Downloads/logo-horizontal.png public/assets/images/codec-logo.png

# Copiar ícono cuadrado
# (Asumiendo que descargaste el archivo como icono.png)
cp ~/Downloads/icono.png public/assets/images/codec-icon.png
```

---

## 📝 ARCHIVOS A MODIFICAR

### **1. /src/app/components/pos/POSLayoutSidebar.tsx**

**Buscar:**
```typescript
import favico from 'figma:asset/c801f768bae83508391e9d98b8555082d5a2c7da.png';
```

**Reemplazar por:**
```typescript
import codecIcon from '/assets/images/codec-icon.png';
```

**Buscar (línea ~305):**
```typescript
<img 
  src={favico} 
  alt="CODEC POS Icon" 
  className="w-full h-full object-contain"
/>
```

**Reemplazar por:**
```typescript
<img 
  src={codecIcon} 
  alt="CODEC POS Icon" 
  className="w-full h-full object-contain"
/>
```

**Buscar (línea ~319 - modo colapsado):**
```typescript
<img 
  src={favico} 
  alt="CODEC POS" 
  className="w-full h-full object-contain"
/>
```

**Reemplazar por:**
```typescript
<img 
  src={codecIcon} 
  alt="CODEC POS" 
  className="w-full h-full object-contain"
/>
```

---

### **2. /src/app/components/pos/ConfiguracionPage.tsx**

**Buscar:**
```typescript
import logo from 'figma:asset/482f796c31016dc684e50c0f42a23411e23b97f4.png';
import favico from 'figma:asset/c801f768bae83508391e9d98b8555082d5a2c7da.png';
```

**Reemplazar por:**
```typescript
import codecLogo from '/assets/images/codec-logo.png';
import codecIcon from '/assets/images/codec-icon.png';
```

**Buscar todas las referencias a `logo` y `favico` en el archivo y cambiarlas por `codecLogo` y `codecIcon`**

---

### **3. /src/app/components/pos/DashboardPOSPage.tsx**

**Buscar:**
```typescript
import logo from 'figma:asset/482f796c31016dc684e50c0f42a23411e23b97f4.png';
```

**Reemplazar por:**
```typescript
import codecLogo from '/assets/images/codec-logo.png';
```

**Buscar todas las referencias a `logo` en el archivo y cambiarlas por `codecLogo`**

---

## 🖼️ CREAR ÍCONOS PARA ELECTRON

### **Windows (.ico)**

**Opción 1: Herramienta online (más fácil)**
```
1. Ve a https://convertico.com/
2. Sube public/assets/images/codec-icon.png
3. Selecciona tamaños: 16, 32, 48, 64, 128, 256
4. Descarga icon.ico
5. Guarda en: public/assets/icons/win/icon.ico
```

**Opción 2: ImageMagick (línea de comandos)**
```bash
# Instalar ImageMagick primero
# Windows: choco install imagemagick
# Mac: brew install imagemagick
# Linux: sudo apt install imagemagick

# Convertir PNG a ICO multi-resolución
convert public/assets/images/codec-icon.png \
  -define icon:auto-resize=256,128,96,64,48,32,16 \
  public/assets/icons/win/icon.ico
```

---

### **macOS (.icns)**

**Opción 1: Herramienta online**
```
1. Ve a https://cloudconvert.com/png-to-icns
2. Sube public/assets/images/codec-icon.png
3. Descarga icon.icns
4. Guarda en: public/assets/icons/mac/icon.icns
```

**Opción 2: Comando macOS nativo**
```bash
# Crear iconset
mkdir MyIcon.iconset

# Generar múltiples tamaños
sips -z 16 16     public/assets/images/codec-icon.png --out MyIcon.iconset/icon_16x16.png
sips -z 32 32     public/assets/images/codec-icon.png --out MyIcon.iconset/icon_16x16@2x.png
sips -z 32 32     public/assets/images/codec-icon.png --out MyIcon.iconset/icon_32x32.png
sips -z 64 64     public/assets/images/codec-icon.png --out MyIcon.iconset/icon_32x32@2x.png
sips -z 128 128   public/assets/images/codec-icon.png --out MyIcon.iconset/icon_128x128.png
sips -z 256 256   public/assets/images/codec-icon.png --out MyIcon.iconset/icon_128x128@2x.png
sips -z 256 256   public/assets/images/codec-icon.png --out MyIcon.iconset/icon_256x256.png
sips -z 512 512   public/assets/images/codec-icon.png --out MyIcon.iconset/icon_256x256@2x.png
sips -z 512 512   public/assets/images/codec-icon.png --out MyIcon.iconset/icon_512x512.png
sips -z 1024 1024 public/assets/images/codec-icon.png --out MyIcon.iconset/icon_512x512@2x.png

# Convertir a ICNS
iconutil -c icns MyIcon.iconset
mv MyIcon.icns public/assets/icons/mac/icon.icns

# Limpiar
rm -rf MyIcon.iconset
```

---

### **Linux (.png)**

```bash
# Copiar directamente (Linux usa PNG)
cp public/assets/images/codec-icon.png public/assets/icons/linux/icon.png

# O redimensionar a 512x512 si es necesario
convert public/assets/images/codec-icon.png \
  -resize 512x512 \
  public/assets/icons/linux/icon.png
```

---

## 🔧 CONFIGURAR ELECTRON BUILDER

### **Crear electron-builder.json** (en la raíz del proyecto)

```json
{
  "appId": "com.codecstudio.codecpos",
  "productName": "CODEC POS",
  "directories": {
    "output": "dist-electron",
    "buildResources": "public/assets/icons"
  },
  "files": [
    "build/**/*",
    "public/**/*",
    "!public/assets/icons/**/*"
  ],
  "extraResources": [
    {
      "from": "public/assets/images",
      "to": "assets/images",
      "filter": ["**/*"]
    }
  ],
  "win": {
    "icon": "public/assets/icons/win/icon.ico",
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "CODEC POS"
  },
  "mac": {
    "icon": "public/assets/icons/mac/icon.icns",
    "category": "public.app-category.business",
    "target": ["dmg", "zip"]
  },
  "linux": {
    "icon": "public/assets/icons/linux/icon.png",
    "category": "Office",
    "target": ["AppImage", "deb"]
  }
}
```

---

## 🧪 VERIFICAR QUE TODO FUNCIONA

### **1. Probar en desarrollo**

```bash
# Limpiar caché
rm -rf node_modules/.cache

# Reiniciar servidor de desarrollo
npm run dev
```

**Verificar:**
- Sidebar muestra el ícono correctamente
- Configuración muestra el logo
- Dashboard muestra el logo
- No hay errores 404 en la consola (F12)

---

### **2. Probar build de Electron**

```bash
# Instalar dependencias de Electron (si no las tienes)
npm install --save-dev electron electron-builder

# Generar .exe para Windows
npm run electron:build:win

# El archivo estará en: dist-electron/CODEC POS Setup.exe
```

**Verificar:**
- El instalador muestra el ícono correcto
- La aplicación instalada muestra el ícono en:
  - Barra de tareas
  - Escritorio (acceso directo)
  - Menú inicio
  - Lista de programas
- Al abrir la app, el ícono se muestra en la ventana

---

## 📊 ESTRUCTURA FINAL

```
proyecto/
├── public/
│   └── assets/
│       ├── images/
│       │   ├── codec-logo.png          ✅ Logo horizontal
│       │   └── codec-icon.png          ✅ Ícono cuadrado
│       └── icons/
│           ├── win/
│           │   └── icon.ico            ✅ Ícono Windows
│           ├── mac/
│           │   └── icon.icns           ✅ Ícono macOS
│           └── linux/
│               └── icon.png            ✅ Ícono Linux
│
├── src/
│   └── app/
│       └── components/
│           └── pos/
│               ├── POSLayoutSidebar.tsx    ✅ Actualizado
│               ├── ConfiguracionPage.tsx   ✅ Actualizado
│               └── DashboardPOSPage.tsx    ✅ Actualizado
│
└── electron-builder.json                   ✅ Creado
```

---

## ⚡ SCRIPT AUTOMATIZADO (opcional)

**Crear archivo: scripts/setup-logos.sh**

```bash
#!/bin/bash

echo "🎨 Configurando logos para CODEC POS..."

# Crear carpetas
mkdir -p public/assets/images
mkdir -p public/assets/icons/win
mkdir -p public/assets/icons/mac
mkdir -p public/assets/icons/linux

echo "✅ Carpetas creadas"

# Verificar que los logos descargados existen
if [ ! -f "logo-horizontal.png" ]; then
  echo "❌ Error: logo-horizontal.png no encontrado"
  echo "   Descárgalo de Figma primero"
  exit 1
fi

if [ ! -f "icono.png" ]; then
  echo "❌ Error: icono.png no encontrado"
  echo "   Descárgalo de Figma primero"
  exit 1
fi

# Copiar logos
cp logo-horizontal.png public/assets/images/codec-logo.png
cp icono.png public/assets/images/codec-icon.png
echo "✅ Logos copiados"

# Generar ícono para Linux
cp icono.png public/assets/icons/linux/icon.png
echo "✅ Ícono Linux creado"

echo ""
echo "✅ ¡Logos configurados correctamente!"
echo ""
echo "Ahora debes:"
echo "1. Generar icon.ico para Windows (usa https://convertico.com/)"
echo "2. Generar icon.icns para macOS (usa https://cloudconvert.com/png-to-icns)"
echo "3. Actualizar las importaciones en los archivos .tsx"
echo ""
```

**Usar el script:**
```bash
# Dar permisos de ejecución
chmod +x scripts/setup-logos.sh

# Ejecutar (con los logos descargados en la raíz)
./scripts/setup-logos.sh
```

---

## ✅ CHECKLIST FINAL

```
□ Descargar logos desde Figma
□ Crear carpetas: public/assets/images/ y public/assets/icons/
□ Copiar codec-logo.png
□ Copiar codec-icon.png
□ Generar icon.ico (Windows)
□ Generar icon.icns (macOS)
□ Copiar icon.png (Linux)
□ Actualizar POSLayoutSidebar.tsx
□ Actualizar ConfiguracionPage.tsx
□ Actualizar DashboardPOSPage.tsx
□ Crear electron-builder.json
□ Probar en desarrollo (npm run dev)
□ Generar .exe (npm run electron:build:win)
□ Verificar íconos en el .exe instalado
```

---

## 🎯 NOMBRES FINALES

```
📂 public/assets/images/
   ├── codec-logo.png       ← Logo horizontal (400-800px ancho)
   └── codec-icon.png       ← Ícono cuadrado (256x256px)

📂 public/assets/icons/
   ├── win/icon.ico         ← Ícono Windows (multi-resolución)
   ├── mac/icon.icns        ← Ícono macOS (multi-resolución)
   └── linux/icon.png       ← Ícono Linux (512x512px)
```

**¡Con estos nombres NO habrá conflictos al generar el .exe!** ✅

---

**Fecha**: 23 de Febrero, 2026  
**Estado**: ✅ COMANDOS LISTOS PARA EJECUTAR
