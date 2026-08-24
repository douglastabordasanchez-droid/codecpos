# 🔧 TROUBLESHOOTING - CODEC POS v2.0 Compilación

## 🚨 ERRORES COMUNES Y SOLUCIONES

---

## ❌ ERROR: "icon.ico not found"

### **Síntomas:**
```
Error: ENOENT: no such file or directory
  at electron/assets/icon.ico
```

### **Solución:**
```bash
# 1. Crear el icono siguiendo la guía
Ver: /scripts/generate-icon.md

# 2. Descargar icono temporal
# https://www.iconarchive.com/download/i103476/paomedia/small-n-flat/shop.ico
# Guardar como: electron/assets/icon.ico

# 3. Verificar ubicación
Test-Path electron/assets/icon.ico  # Debe mostrar "True"
```

---

## ❌ ERROR: "node-gyp not found"

### **Síntomas:**
```
gyp ERR! node-gyp not found
npm ERR! prebuild-install FAILED
```

### **Solución 1: Instalar node-gyp globalmente**
```bash
npm install -g node-gyp
```

### **Solución 2: Instalar Build Tools para Windows**
```bash
# PowerShell como Administrador
npm install -g windows-build-tools

# O instalar manualmente:
# 1. Visual Studio Build Tools
#    https://visualstudio.microsoft.com/downloads/
# 2. Seleccionar "Desktop development with C++"
```

### **Solución 3: Usar Python 2.7**
```bash
# node-gyp necesita Python 2.7 o 3.x
npm config set python C:\Python27\python.exe
```

---

## ❌ ERROR: "serialport binding failed"

### **Síntomas:**
```
Error: The module 'serialport.node' was compiled against a different Node.js version
```

### **Solución 1: Rebuild Forzado**
```bash
# Eliminar node_modules
rm -rf node_modules

# Reinstalar
npm install

# Rebuild específico
npm run rebuild
```

### **Solución 2: Rebuild Manual de Serialport**
```bash
npm rebuild serialport --update-binary
```

### **Solución 3: Forzar Versión de Electron**
```bash
# En package.json, verificar:
"electron": "^40.4.1"

# Ejecutar:
npm run rebuild
```

### **Solución 4: Usar electron-rebuild**
```bash
npx electron-rebuild -f -w serialport
```

---

## ❌ ERROR: "Out of Memory" (Heap Out of Memory)

### **Síntomas:**
```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

### **Solución 1: Aumentar Memoria de Node.js**
```powershell
# PowerShell
$env:NODE_OPTIONS="--max-old-space-size=8192"
npm run electron:build:win

# Bash
export NODE_OPTIONS="--max-old-space-size=8192"
npm run electron:build:win
```

### **Solución 2: Cerrar Aplicaciones Pesadas**
- Chrome/Firefox
- Visual Studio Code
- Docker
- Photoshop/GIMP

### **Solución 3: Aumentar RAM Virtual**
```
1. Panel de Control → Sistema → Configuración Avanzada
2. Rendimiento → Configuración
3. Opciones Avanzadas → Memoria Virtual
4. Aumentar a 16 GB o más
```

---

## ❌ ERROR: "EPERM: operation not permitted"

### **Síntomas:**
```
Error: EPERM: operation not permitted, unlink 'dist/...'
```

### **Solución 1: Ejecutar como Administrador**
```powershell
# PowerShell como Administrador
.\scripts\build.ps1
```

### **Solución 2: Desactivar Antivirus Temporalmente**
```
1. Windows Security → Virus & threat protection
2. Manage settings → Real-time protection → OFF
3. Ejecutar build
4. Volver a activar protección
```

### **Solución 3: Agregar Excepción en Windows Defender**
```
1. Windows Security → Virus & threat protection
2. Manage settings → Exclusions
3. Add exclusion → Folder
4. Seleccionar carpeta del proyecto
```

### **Solución 4: Cerrar Procesos que Bloquean**
```powershell
# Ver procesos usando archivos
Get-Process | Where-Object {$_.Path -like "*dist*"}

# Cerrar Node.js zombies
taskkill /F /IM node.exe

# Cerrar Electron zombies
taskkill /F /IM electron.exe
```

---

## ❌ ERROR: "Cannot find module 'vite'"

### **Síntomas:**
```
Error: Cannot find module 'vite'
```

### **Solución:**
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# Verificar Vite
npm ls vite
```

---

## ❌ ERROR: "electron-builder not found"

### **Síntomas:**
```
'electron-builder' is not recognized as an internal or external command
```

### **Solución:**
```bash
# Verificar instalación
npm ls electron-builder

# Si no está instalado
npm install --save-dev electron-builder

# O instalar globalmente
npm install -g electron-builder
```

---

## ❌ ERROR: Build se congela en "packaging"

### **Síntomas:**
- Build se detiene en "packaging platform=win32 arch=x64"
- No hay errores, solo se queda colgado

### **Solución 1: Limpiar Cache**
```bash
# Limpiar cache de electron-builder
rm -rf ~\AppData\Local\electron-builder\Cache

# Windows PowerShell
Remove-Item -Recurse -Force $env:LOCALAPPDATA\electron-builder\Cache
```

### **Solución 2: Desactivar Asar Temporalmente**
```javascript
// En electron/builder-config.js
asar: false  // Cambiar de true a false temporalmente
```

### **Solución 3: Reducir Compresión**
```bash
npm run electron:build:win -- --config.compression=store
```

---

## ❌ ERROR: "Failed to get local issuer certificate"

### **Síntomas:**
```
Error: unable to get local issuer certificate
```

### **Solución:**
```bash
# Desactivar verificación SSL (solo para debugging)
npm config set strict-ssl false

# O usar proxy
npm config set proxy http://proxy.company.com:8080
```

---

## ❌ ERROR: Instalador no ejecuta en Windows 7/8

### **Síntomas:**
- El .exe no abre en Windows 7/8
- Error: "This app can't run on your PC"

### **Solución:**
CODEC POS v2.0 requiere **Windows 10+** por:
- Electron 40.x solo soporta Windows 10+
- APIs modernas de Windows

**Alternativa:**
```javascript
// Usar Electron 22.x para Windows 7/8 (no recomendado)
// En package.json:
"electron": "^22.3.27"
```

---

## ❌ ERROR: "Unable to commit changes" (Git)

### **Síntomas:**
```
Error: fatal: Unable to commit changes
```

### **Solución:**
```bash
# Esto es solo una advertencia de Git
# No afecta el build

# Para desactivar:
git config --global core.autocrlf false
```

---

## ❌ ERROR: El instalador es demasiado grande (>500 MB)

### **Síntomas:**
- Instalador NSIS > 500 MB

### **Solución 1: Excluir node_modules innecesarios**
```javascript
// En electron/builder-config.js
files: [
  '!node_modules/**/{README,readme,CHANGELOG,changelog,LICENSE,license,*.md}',
  '!node_modules/**/{test,tests,__tests__}/**',
  '!node_modules/**/*.map'
]
```

### **Solución 2: Usar compresión máxima**
```javascript
// Ya configurado en electron/builder-config.js
compression: 'maximum'
```

### **Solución 3: Excluir devDependencies**
```bash
# Verificar que devDependencies no se incluyen
npm prune --production
```

---

## ❌ ERROR: Impresora Oneposi 85 no funciona

### **Síntomas:**
- La app compila bien
- La impresora no se detecta

### **Solución 1: Verificar Drivers**
```
1. Instalar driver de Oneposi 85
2. Verificar en Administrador de Dispositivos
3. Probar con otra app (Notepad)
```

### **Solución 2: Verificar Rebuild de Serialport**
```bash
npm run rebuild
npm ls serialport  # Verificar versión
```

### **Solución 3: Permisos de Administrador**
```
1. Click derecho en CODECPOS.exe
2. Propiedades → Compatibilidad
3. ☑ Ejecutar como administrador
```

---

## 🧪 TESTING DEL BUILD

### **Test Rápido (2 min):**
```bash
# 1. Build rápido
npm run pack

# 2. Ejecutar sin instalar
cd dist-electron/win-unpacked
./CODECPOS.exe

# 3. Verificar consola
Press F12 → Console → Revisar errores
```

### **Test Completo (10 min):**
```bash
# 1. Crear máquina virtual limpia
# - Windows 10/11 sin desarrollo instalado
# - Sin Visual Studio, Node.js, Python

# 2. Instalar CODECPOS-Setup-2.0.0.exe

# 3. Verificar:
# - Login
# - Nueva venta
# - Impresora
# - Dashboard
# - Margen personalizado
```

---

## 🔍 LOGS DETALLADOS

### **Habilitar Logs Verbosos:**
```bash
# PowerShell
.\scripts\build.ps1 -Verbose

# NPM
npm run electron:build:win -- --loglevel verbose

# Guardar logs en archivo
npm run electron:build:win 2>&1 | Tee-Object -FilePath build.log
```

### **Revisar Logs de Electron:**
```
Ubicación de logs:
Windows: %APPDATA%\CODECPOS\logs\
```

---

## 📞 SOPORTE AVANZADO

Si ninguna solución funciona:

### **1. Recopilar Información:**
```bash
# Sistema
systeminfo

# Node.js
node --version
npm --version

# Electron
npx electron --version

# Python
python --version

# Paquetes
npm ls
```

### **2. Crear Issue Report:**
```markdown
## Descripción del Error
[Descripción breve]

## Comando Ejecutado
[npm run ...]

## Log Completo
[Pegar log completo]

## Sistema
- OS: Windows 10/11
- Node.js: v18.x.x
- npm: v9.x.x
- RAM: XGB
- CPU: [modelo]
```

### **3. Contactar Soporte:**
- 📧 Email: soporte@codecstudio.com
- 💬 WhatsApp: +573238646844
- 🌐 Web: https://codecstudio.com/support

---

## 💡 PREVENCIÓN DE ERRORES

### **Checklist Pre-Build:**
```bash
# 1. Verificar Node.js
node --version  # Debe ser v18+

# 2. Verificar npm
npm --version   # Debe ser v9+

# 3. Limpiar cache
npm cache clean --force

# 4. Verificar espacio en disco
# Mínimo 10 GB libres

# 5. Cerrar apps pesadas
# Chrome, VSCode, Docker, etc.

# 6. Desactivar antivirus temporalmente

# 7. Ejecutar como Administrador

# 8. Verificar assets
Test-Path electron/assets/icon.ico
Test-Path electron/assets/LICENSE.txt
```

---

## 🎯 BUILD ALTERNATIVO (Si todo falla)

### **Método 1: Build en VM Limpia**
```
1. Crear VM con Windows 10/11
2. Instalar solo Node.js
3. Clonar proyecto
4. npm install
5. npm run electron:build:win
```

### **Método 2: Usar WSL (Windows Subsystem for Linux)**
```bash
# En WSL
npm run electron:build:win
```

### **Método 3: Docker (Avanzado)**
```dockerfile
# Usar imagen con build tools preinstalados
FROM electronuserland/builder:wine

COPY . /app
WORKDIR /app
RUN npm install
RUN npm run electron:build:win
```

---

## 📚 RECURSOS ADICIONALES

- 🔗 Electron Builder Docs: https://www.electron.build/
- 🔗 Node-gyp Guide: https://github.com/nodejs/node-gyp
- 🔗 Serialport Docs: https://serialport.io/
- 🔗 Stack Overflow: https://stackoverflow.com/questions/tagged/electron-builder

---

**¿Nada funciona? Usa el script de diagnóstico:**

```bash
# Windows PowerShell
.\scripts\diagnostics.ps1
```

*(Crear este script en el futuro si se necesita)*

---

**¡No te rindas! La mayoría de errores tienen solución rápida.** 🚀
