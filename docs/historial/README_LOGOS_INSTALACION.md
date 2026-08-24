# 🎨 GUÍA COMPLETA: Logos e Instalación - CODEC POS v2.0

## 📁 Estructura de Carpetas para tu Logo Personalizado

### 🎯 Ubicación Recomendada (PRIORIDAD 1)
```
/public/logo.png
```
**Características requeridas:**
- Formato: PNG con transparencia
- Tamaño mínimo: 512×512 píxeles
- Tamaño recomendado: 1024×1024 píxeles
- Fondo: Transparente (alpha channel)

### 📂 Ubicaciones Alternativas (Fallback)
```
/public/icon.png              → Prioridad 2
/electron/assets/icon.png     → Prioridad 3
/electron/assets/logo.png     → Prioridad 4
```

---

## 🖼️ Dónde Aparece tu Logo

### ✅ En la Aplicación React (Runtime)
1. **Pantalla de Login** (`/src/app/components/auth/LoginPage.tsx`)
   - Usa: `CodecLogoFull` component
   - Lee: `/public/logo.png` → Si no existe, muestra SVG fallback

2. **Sidebar del POS** (`/src/app/components/pos/POSLayoutSidebar.tsx`)
   - Usa: `CodecFavicon` component
   - Lee: `/public/logo.png` → Si no existe, muestra SVG fallback

3. **Dashboard y otras secciones**
   - Usa: `CodecLogoHorizontal` o `CodecLogoIcon`
   - Lee: `/public/logo.png` → Si no existe, muestra SVG fallback

### ✅ En el Instalador y Sistema Operativo

#### 🪟 Windows
1. **Ícono del instalador NSIS** (`CODECPOS-Setup-2.0.0.exe`)
   - Lee: `/public/logo.png` (convertido automáticamente a .ico)
   - Fallback: `/electron/assets/icon.ico`
   
2. **Ícono del ejecutable** (`CODECPOS.exe` en Program Files)
   - Lee: `/public/logo.png`
   
3. **Acceso directo del escritorio**
   - Lee: `/public/logo.png`

4. **Menú inicio de Windows**
   - Lee: `/public/logo.png`

5. **Barra de tareas** (taskbar)
   - Lee: `/public/logo.png`

6. **Panel de Control → Programas**
   - Lee: `/public/logo.png`

#### 🌐 Splash Screen (Pantalla de carga)
El splash screen (`/electron/splash.html`) usa un emoji por defecto (🏪).

**Para personalizarlo con tu logo:**
- Modifica línea 177-178 de `/electron/splash.html`:
  ```html
  <!-- ANTES -->
  <div class="logo-icon">🏪</div>
  
  <!-- DESPUÉS -->
  <img src="./logo.png" alt="Logo" style="width: 64px; height: 64px;" />
  ```

---

## 🚀 Proceso de Instalación Completo

### 📦 Compilar el Instalador
```bash
# 1. Compilar el proyecto React
npm run build

# 2. Generar el instalador Windows
npm run electron:build
```

**Resultado:**
```
📂 dist-electron/
  ├── CODECPOS-Setup-2.0.0.exe    ← Instalador NSIS profesional
  └── CODECPOS-2.0.0-portable.exe ← Versión portable (sin instalación)
```

### 💾 Instalación en PC del Cliente

#### Opción 1: Instalador NSIS (Recomendado)
1. **Ejecutar** `CODECPOS-Setup-2.0.0.exe`
2. **Seleccionar idioma:** Español (Colombia)
3. **Aceptar términos** (si existe LICENSE.txt)
4. **Elegir carpeta:** Por defecto `C:\Users\[Usuario]\AppData\Local\CODECPOS`
   - ⚠️ **Para instalación global:** Marcar "Instalar para todos los usuarios" (requiere Admin)
   - Carpeta global: `C:\Program Files\CODECPOS`
5. **Crear acceso directo:** ✅ Escritorio, ✅ Menú Inicio
6. **Instalar**

**Resultado:**
- ✅ Aplicación instalada permanentemente
- ✅ Acceso directo en Escritorio
- ✅ Acceso directo en Menú Inicio (Carpeta "CODEC Studio")
- ✅ Registro en Panel de Control → Programas
- ✅ **Puedes eliminar el instalador** `CODECPOS-Setup-2.0.0.exe`

#### Opción 2: Versión Portable
1. **Ejecutar** `CODECPOS-2.0.0-portable.exe`
2. **No requiere instalación** - Se ejecuta directamente
3. **Desventaja:** No aparece en Panel de Control, no crea accesos directos

---

## 🗑️ Desinstalación

### Método 1: Panel de Control
1. `Panel de Control` → `Programas y características`
2. Buscar **"CODECPOS"**
3. Click derecho → **"Desinstalar"**

### Método 2: Desinstalador directo
```
C:\Users\[Usuario]\AppData\Local\CODECPOS\Uninstall CODECPOS.exe
```

### Método 3: Configuración de Windows 10/11
1. `Configuración` → `Aplicaciones` → `Aplicaciones instaladas`
2. Buscar **"CODECPOS"**
3. Click → **"Desinstalar"**

---

## 🔧 Configuración Avanzada del Instalador

### 📝 Archivo: `/electron/builder-config.js`

#### Cambiar nombre del instalador
```javascript
artifactName: 'MiEmpresa-POS-Setup-${version}.${ext}',
```

#### Instalar para todos los usuarios por defecto
```javascript
nsis: {
  perMachine: true,  // Cambiar de false → true
  allowElevation: true,
}
```

#### Cambiar carpeta de instalación por defecto
```javascript
nsis: {
  // Solo para perMachine: true
  // Por defecto: C:\Program Files\CODECPOS
}
```

#### Agregar licencia al instalador
1. Crear archivo `/electron/assets/LICENSE.txt`
2. El instalador lo detectará automáticamente
3. Mostrará pantalla de aceptación de términos

---

## 🎨 Personalizar Logos

### 🖌️ Opción 1: Reemplazar logo.png (Recomendado)
```bash
# 1. Prepara tu logo (PNG, 1024×1024, fondo transparente)
# 2. Renómbralo a "logo.png"
# 3. Cópialo a:
/public/logo.png
```

### 🖌️ Opción 2: Generar ícono .ico para Windows
```bash
# Instalar herramienta
npm install --save-dev icon-gen

# Crear script en package.json
"scripts": {
  "generate-icon": "icon-gen -i public/logo.png -o electron/assets -r"
}

# Ejecutar
npm run generate-icon
```

**Resultado:**
```
/electron/assets/icon.ico  ← Ícono multipunto para Windows
```

---

## 📋 Checklist de Compilación

Antes de generar el instalador final para clientes:

- [ ] ✅ Logo personalizado en `/public/logo.png` (1024×1024)
- [ ] ✅ Versión actualizada en `/package.json` (`"version": "2.0.0"`)
- [ ] ✅ Información de empresa en `/electron/builder-config.js`
  - [ ] `appId`: Tu identificador único (ej: `com.tuempresa.codecpos`)
  - [ ] `productName`: Nombre del producto
  - [ ] `copyright`: Copyright de tu empresa
- [ ] ✅ Licencia en `/electron/assets/LICENSE.txt` (opcional)
- [ ] ✅ Compilar: `npm run build && npm run electron:build`
- [ ] ✅ Probar instalador en PC limpia
- [ ] ✅ Verificar desinstalación funciona correctamente

---

## 🐛 Solución de Problemas

### ❌ "Logo no aparece en el instalador"
**Solución:**
```bash
# 1. Verificar que existe
ls public/logo.png

# 2. Limpiar cache de Electron Builder
rm -rf dist-electron/
rm -rf node_modules/.cache/electron-builder

# 3. Recompilar
npm run electron:build
```

### ❌ "Logo no aparece en la aplicación"
**Solución:**
```bash
# 1. Verificar ruta
ls public/logo.png

# 2. Limpiar build de Vite
rm -rf dist/

# 3. Recompilar React
npm run build

# 4. Recompilar Electron
npm run electron:build
```

### ❌ "Instalador pide permisos de administrador"
**Causa:** `perMachine: true` en builder-config.js

**Soluciones:**
1. **Opción A:** Mantener perMachine: false (instala solo para usuario actual)
2. **Opción B:** Aceptar UAC (instala en Program Files, requiere admin)

---

## 📞 Soporte

Para más información sobre Electron Builder:
- 📖 Documentación: https://www.electron.build/
- 🎨 Guía de íconos: https://www.electron.build/icons

---

**© 2026 CODEC POS v2.0 • Codec Studio**
