# ⚡ SOLUCIÓN RÁPIDA - ERRORES DE COMPILACIÓN

## 🎯 ¿QUÉ HAGO AHORA?

---

## ✅ **OPCIÓN 1: COMPILACIÓN LIMPIA (RECOMENDADO)**

### Ejecuta este comando y espera:

```powershell
npm run compile:clean
```

**¿Qué hace?**
1. Elimina carpetas `dist/` y `dist-electron/` anteriores
2. Limpia caché
3. Ejecuta precheck (sin verificar dist/)
4. Compila React con Vite → **CREA** dist/
5. Empaqueta con Electron Builder → Genera instalador

**Tiempo:** 15-25 minutos (primera vez)

---

## ✅ **OPCIÓN 2: COMPILACIÓN NORMAL**

Si es tu primera vez compilando:

```powershell
npm run compile
```

**¿Qué hace?**
1. Verifica archivos necesarios
2. Compila React → CREA dist/
3. Genera instalador .exe

---

## 🔥 **¿SIGUES VIENDO ERRORES?**

### **Paso 1: Limpia TODO**

```powershell
# En PowerShell (como Administrador):

# Eliminar carpetas de compilación
Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "dist-electron" -Recurse -Force -ErrorAction SilentlyContinue

# Limpiar caché
npm cache clean --force
```

---

### **Paso 2: Verifica el Sistema**

```powershell
npm run precheck
```

**Debe decir:**
```
✅ Package.json
✅ Electron Main Process
✅ Electron Preload Script
✅ Configuración de Electron Builder

ℹ️  La carpeta /dist no existe todavía.
   → Se creará automáticamente al ejecutar "vite build"
   → Esto es normal en la primera compilación.

✅ La compilación puede continuar
```

---

### **Paso 3: Compila de Nuevo**

```powershell
npm run compile:clean
```

---

## 📋 **ERRORES ESPECÍFICOS**

### ❌ **Error: "Build de Vite (dist/) NO ENCONTRADO"**

✅ **CORREGIDO** - Ya no debería aparecer.

**Si aún aparece:**
```powershell
npm run compile:clean
```

---

### ❌ **Error: "The option was deprecated or not exists"**

✅ **CORREGIDO v2.2** - electron/builder-config.js completamente reescrito.

**Errores corregidos:**
- ❌ `createDesktopShortcut: 'ask'` → ✅ `'always'` (valores válidos: 'always', true, false)
- ❌ Opciones deprecadas eliminadas
- ❌ `menuCategory`, `shortcutName` eliminadas (no son estándar)
- ❌ `deleteAppDataOnUninstall` eliminada (no es válida)

**Si aún aparece:**
```powershell
# Limpiar caché de electron-builder
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue

# Compilar de nuevo
npm run compile:clean
```

---

### ❌ **Error: "Cannot find module 'electron'"**

```powershell
npm install --save-dev electron electron-builder
```

---

### ❌ **Error: "EACCES" o "Permission denied"**

```powershell
# Ejecuta PowerShell como ADMINISTRADOR:
# Click derecho en PowerShell → "Ejecutar como administrador"
```

---

### ❌ **Error: "node-gyp rebuild failed"**

```powershell
# Instalar herramientas de compilación de Windows
npm install --global --production windows-build-tools

# Después:
npm run compile
```

---

## 🎯 **COMANDOS DE EMERGENCIA**

### **Resetear TODO desde cero:**

```powershell
# 1. Eliminar todo lo compilado
Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "dist-electron" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue

# 2. Limpiar cachés
npm cache clean --force
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Reinstalar dependencias
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
npm install

# 4. Compilar desde cero
npm run compile
```

---

## ✅ **VERIFICAR QUE TODO ESTÉ BIEN**

Ejecuta:

```powershell
npm run precheck
```

**Debe mostrar:**
- ✅ Todos los archivos encontrados
- ℹ️  dist/ no existe (normal, se creará)
- ✅ Listo para compilar

---

## 🚀 **COMPILAR AHORA (FORMA MÁS SIMPLE)**

### **Opción A: Script PowerShell con Menú**

```powershell
.\compilar.ps1
```

Selecciona: `[1] Compilación COMPLETA`

---

### **Opción B: Un Solo Click**

```
Doble click en: COMPILAR_AHORA.bat
```

---

### **Opción C: Comando Manual**

```powershell
npm run compile
```

---

## 📦 **RESULTADO ESPERADO**

Al terminar (15-25 minutos), en la carpeta `dist-electron/`:

```
✅ CODECPOS-Setup-2.0.0.exe    ← INSTALADOR (distribuye este)
✅ CODECPOS-2.0.0.exe          ← PORTABLE
✅ win-unpacked/CODECPOS.exe   ← TESTING
```

---

## 🎯 **RESUMEN DE CORRECCIONES APLICADAS**

| Problema | Corrección |
|----------|------------|
| ❌ Error "dist/ NO ENCONTRADO" | ✅ `pre-build-check.js` ya no verifica dist/ |
| ❌ Error "option deprecated" | ✅ `builder-config.js` simplificado |
| ❌ Opciones NSIS incorrectas | ✅ Solo se usan opciones válidas |
| ❌ license/include siempre | ✅ Solo se agregan si existen |
| ❌ Idioma mal configurado | ✅ `installerLanguages: ['es']` |

---

## 💡 **¿QUÉ ARCHIVOS SE MODIFICARON?**

1. **scripts/pre-build-check.js**
   - ✅ Ya no verifica que dist/ exista
   - ✅ Informa que dist/ se creará automáticamente

2. **electron/builder-config.js**
   - ✅ Opciones NSIS simplificadas
   - ✅ license e include condicionales
   - ✅ Idioma corregido
   - ✅ Eliminadas opciones deprecadas

---

## 🔥 **COMPILAR AHORA (RECOMENDACIÓN FINAL)**

```powershell
# En PowerShell como Administrador:

# Si es tu primera compilación:
npm run compile

# Si ya compilaste antes y tuviste errores:
npm run compile:clean
```

---

## 📞 **¿NECESITAS AYUDA?**

Si después de seguir TODOS estos pasos sigues con errores:

1. **Toma una captura** del error completo
2. **Ejecuta:** `npm run precheck` y copia la salida
3. **Verifica versiones:**
   ```powershell
   node --version    # Debe ser 18+
   npm --version     # Debe ser 9+
   ```

---

## ✅ **CHECKLIST ANTES DE COMPILAR**

- [ ] Ejecuté PowerShell como **Administrador**
- [ ] Estoy en la carpeta del proyecto
- [ ] Ejecuté `npm install` (al menos una vez)
- [ ] Node.js 18+ instalado
- [ ] npm 9+ instalado
- [ ] Windows 10/11

Si todo está ✅, ejecuta:

```powershell
npm run compile
```

---

**¡Listo! El sistema está corregido y listo para compilar!** 🎉

---

*CODEC POS v2.0*  
*Última actualización: Marzo 7, 2026*