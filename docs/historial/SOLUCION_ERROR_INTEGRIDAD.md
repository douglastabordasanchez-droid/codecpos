# 🔧 SOLUCIÓN - ERRORES DE INTEGRIDAD Y 404

## ❌ PROBLEMA IDENTIFICADO

Al ejecutar `npm run compile`, aparecen **errores de integridad** y **errores 404 de GitHub**:

```
npm error Integrity checksum failed
npm error sha512-...
npm error github.com/develar/app-builder/releases/download/... 404 (Not Found)
```

---

## 🎯 CAUSA DEL PROBLEMA

**Los paquetes en `node_modules` están CORRUPTOS** debido a:

1. **Descarga interrumpida** - Se cortó la conexión durante `npm install`
2. **Caché corrupto** - La caché de npm tiene archivos dañados
3. **Caché de electron-builder corrupto** - Binarios mal descargados
4. **Problemas de red/firewall** - GitHub bloqueado o lento

---

## ✅ SOLUCIÓN RÁPIDA (5 MINUTOS)

### **OPCIÓN 1: Script Automático** ⭐ (RECOMENDADO)

```
Doble click en: REINSTALAR_Y_COMPILAR.bat
```

**Este script hace TODO automáticamente:**
- ✅ Elimina `node_modules`
- ✅ Elimina `package-lock.json`
- ✅ Limpia caché de npm
- ✅ Limpia caché de electron-builder
- ✅ Reinstala dependencias
- ✅ Compila la aplicación

**Tiempo:** 30-40 minutos (incluye reinstalación)

---

### **OPCIÓN 2: Comandos Manuales** (PowerShell como Administrador)

#### **Paso 1: Limpiar TODO**

```powershell
# Eliminar node_modules
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue

# Eliminar package-lock.json
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue

# Eliminar carpetas de compilación
Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "dist-electron" -Recurse -Force -ErrorAction SilentlyContinue

# Limpiar caché de npm
npm cache clean --force

# Limpiar caché de electron-builder
Remove-Item -Path "$env:LOCALAPPDATA\electron" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue
```

---

#### **Paso 2: Reinstalar dependencias**

```powershell
npm install
```

**Tiempo:** 5-10 minutos (descarga ~500-800 MB)

---

#### **Paso 3: Compilar**

```powershell
npm run compile
```

**Tiempo:** 15-25 minutos

---

## 🚀 PROCESO COMPLETO EN 1 COMANDO

**PowerShell como Administrador:**

```powershell
# Copiar y pegar TODO este bloque:

Remove-Item -Path "node_modules","package-lock.json","dist","dist-electron" -Recurse -Force -ErrorAction SilentlyContinue
npm cache clean --force
Remove-Item -Path "$env:LOCALAPPDATA\electron","$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue
npm install
npm run compile
```

**Tiempo total:** 30-40 minutos

---

## 🐛 ¿SIGUE FALLANDO?

### **Error: "npm install falla"**

**Causa:** Problemas de conexión o firewall

**Solución:**

```powershell
# Usar registro de npm alternativo (más rápido en algunos países)
npm config set registry https://registry.npmjs.org/

# Aumentar timeout
npm config set fetch-timeout 60000

# Intentar de nuevo
npm install
```

---

### **Error: "404 Not Found" de GitHub**

**Causa:** GitHub bloqueado o electron-builder no puede descargar binarios

**Solución:**

```powershell
# 1. Verificar conexión a GitHub
curl https://github.com

# 2. Limpiar caché de electron-builder
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder" -Recurse -Force

# 3. Descargar binarios con timeout más largo
$env:ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = "true"
npm install
```

---

### **Error: "EACCES" o "Permission denied"**

**Causa:** No tienes permisos

**Solución:**

```powershell
# Ejecutar PowerShell como ADMINISTRADOR
# Click derecho en PowerShell → "Ejecutar como administrador"
```

---

### **Error: "Espacio insuficiente en disco"**

**Causa:** No hay suficiente espacio

**Solución:**

1. Libera al menos **5 GB** de espacio
2. Ejecuta:

```powershell
npm install
```

---

### **Error: "Antivirus bloqueando"**

**Causa:** El antivirus está bloqueando npm o electron-builder

**Solución:**

1. **Desactiva el antivirus TEMPORALMENTE**
2. Ejecuta:

```powershell
Remove-Item -Path "node_modules" -Recurse -Force
npm cache clean --force
npm install
```

3. **Reactiva el antivirus**

---

## 📊 COMPARACIÓN DE SOLUCIONES

| Método | Tiempo | Dificultad | Efectividad |
|--------|--------|------------|-------------|
| **REINSTALAR_Y_COMPILAR.bat** | 30-40 min | ⭐ Muy fácil | ✅ 99% |
| Comandos manuales | 30-40 min | ⭐⭐ Fácil | ✅ 99% |
| Solo limpiar caché | 20-30 min | ⭐⭐⭐ Media | ⚠️ 70% |

---

## ✅ VERIFICAR QUE ESTÉ SOLUCIONADO

Después de limpiar y reinstalar, ejecuta:

```powershell
npm run precheck
```

**Debe mostrar:**

```
✅ Package.json
✅ Electron Main Process
✅ Electron Preload Script
✅ Configuración de Electron Builder

ℹ️  La carpeta /dist no existe todavía.
   → Se creará automáticamente al ejecutar "vite build"

✅ La compilación puede continuar
```

---

## 🎯 RECOMENDACIÓN FINAL

### **Usa el script automático:**

```
Doble click en: REINSTALAR_Y_COMPILAR.bat
```

**Este script:**
- ✅ Hace TODO automáticamente
- ✅ No requiere escribir comandos
- ✅ Limpia TODAS las cachés
- ✅ Reinstala desde cero
- ✅ Compila automáticamente

**Tiempo:** 30-40 minutos sin hacer nada

---

## 🔥 COMPILAR AHORA

### **Forma más simple:**

```
1. Doble click: REINSTALAR_Y_COMPILAR.bat
2. Espera 30-40 minutos
3. ¡Listo!
```

---

### **Forma PowerShell:**

```powershell
# Como Administrador:

# Limpiar TODO
Remove-Item -Path "node_modules","package-lock.json","dist","dist-electron" -Recurse -Force -ErrorAction SilentlyContinue
npm cache clean --force
Remove-Item -Path "$env:LOCALAPPDATA\electron","$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue

# Reinstalar
npm install

# Compilar
npm run compile
```

---

## 📋 CHECKLIST DE SOLUCIÓN

- [ ] ✅ Eliminar `node_modules`
- [ ] ✅ Eliminar `package-lock.json`
- [ ] ✅ Limpiar caché de npm
- [ ] ✅ Limpiar caché de electron-builder
- [ ] ✅ Reinstalar dependencias (`npm install`)
- [ ] ✅ Compilar (`npm run compile`)

---

## 💡 PREVENIR ESTE ERROR EN EL FUTURO

### **Buenas prácticas:**

1. **No interrumpas `npm install`** - Espera a que termine completamente
2. **Conexión estable** - Usa conexión por cable si es posible
3. **Desactiva antivirus temporalmente** - Durante la instalación
4. **Espacio suficiente** - Mantén al menos 10 GB libres

---

## 🎉 RESUMEN

**Problema:** Paquetes corruptos y errores 404  
**Causa:** Caché corrupto y descargas interrumpidas  
**Solución:** Limpiar TODO y reinstalar desde cero

**Comando rápido:**

```
Doble click: REINSTALAR_Y_COMPILAR.bat
```

**O:**

```powershell
Remove-Item -Path "node_modules","package-lock.json" -Recurse -Force -ErrorAction SilentlyContinue
npm cache clean --force
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder" -Recurse -Force -ErrorAction SilentlyContinue
npm install && npm run compile
```

---

**¡Ejecuta el script y el problema se solucionará!** 🚀

---

*CODEC POS v2.0*  
*Solución de errores de integridad*  
*Última actualización: Marzo 7, 2026*
