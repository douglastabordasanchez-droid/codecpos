# 🚀 CODEC POS v2.0 - COMPILAR INSTALADOR

## ⚡ INICIO ULTRA RÁPIDO

### Opción 1: VS Code (Recomendado) ✅

```bash
# 1. Abre VS Code en la carpeta del proyecto
# 2. Abre terminal (Ctrl + ñ)
# 3. Ejecuta:

npm run compile

# 4. Espera 20 minutos
# 5. LISTO ✅
```

### Opción 2: Archivo .bat 📁

```
1. Doble click en: COMPILAR_AHORA.bat
2. Presiona ENTER
3. Espera 20 minutos
4. LISTO ✅
```

### Opción 3: Terminal CMD/PowerShell 💻

```cmd
npm run compile
```

---

## 📦 RESULTADO

```
dist-electron/
├── CODECPOS-Setup-2.0.0.exe    ← Instalador (25-30 MB)
└── CODECPOS 2.0.0.exe          ← Portable (25-30 MB)
```

---

## 🎯 COMANDOS DISPONIBLES

| Comando | Qué hace | Tiempo |
|---------|----------|--------|
| `npm run compile` | Crea instalador completo | 20 min |
| `npm run compile:clean` | Limpia + crea instalador | 20 min |
| `npm run compile:quick` | Solo empaqueta (sin instalador) | 5 min |
| `npm run build` | Solo construye interfaz | 3 min |
| `npm run start:compile` | Build + compilar directo | 20 min |

---

## ⚠️ ANTES DE COMPILAR

### 1. Verifica Node.js
```bash
node --version  # Debe mostrar v18 o superior
npm --version   # Debe mostrar 9 o superior
```

Si no tienes Node.js: https://nodejs.org/

### 2. Instala dependencias (primera vez)
```bash
npm install
```

### 3. Desactiva Windows Defender
```
Windows + I → Seguridad → Protección contra virus → OFF
```

---

## 🎬 PROCESO COMPLETO

```bash
# Paso 1: Verificar
node --version
npm --version

# Paso 2: Instalar dependencias (solo primera vez)
npm install

# Paso 3: Desactivar Windows Defender

# Paso 4: Compilar
npm run compile

# Paso 5: Esperar ☕
# 15-20 minutos...

# Paso 6: ¡Listo! ✅
# Archivo en: dist-electron/CODECPOS-Setup-2.0.0.exe
```

---

## 🔧 USANDO TAREAS DE VS CODE

1. Presiona `Ctrl + Shift + P`
2. Escribe: `Tasks: Run Task`
3. Selecciona: `🚀 COMPILAR TODO`
4. Espera el resultado

### Tareas disponibles:
- ✅ `1️⃣ VERIFICAR` - Verifica Node/npm
- 🧹 `2️⃣ LIMPIAR` - Borra carpetas dist
- 🔨 `3️⃣ BUILD` - Construye interfaz
- 📦 `4️⃣ COMPILAR` - Crea instalador
- 🚀 `COMPILAR TODO` - Proceso completo automático
- ⚡ `COMPILAR RAPIDO` - Sin instalador (más rápido)

---

## 🐛 PROBLEMAS COMUNES

### ❌ "'node' no se reconoce"
**Solución:**
1. Instala Node.js: https://nodejs.org/
2. Reinicia VS Code
3. Vuelve a intentar

### ❌ "Error en build"
**Solución:**
```bash
npm install
npm run compile
```

### ❌ "Error en electron-builder"
**Solución:**
1. Desactiva Windows Defender **COMPLETAMENTE**
2. Ejecuta como Administrador
3. Libera espacio (mínimo 2 GB)
4. Reinicia Windows

### ❌ ".bat no funciona"
**Solución:**
- Usa VS Code en su lugar
- O ejecuta directamente: `npm run compile`

---

## 📁 ARCHIVOS DISPONIBLES

| Archivo | Para qué sirve |
|---------|----------------|
| `COMPILAR_AHORA.bat` | Compilar con .bat simple |
| `BUILD.bat` | Compilar con pasos detallados |
| `QUICK.bat` | Compilación rápida sin instalador |
| `COMO_COMPILAR.md` | Guía detallada |
| `EJECUTA_ESTO.txt` | Instrucciones rápidas |

---

## ⏱️ TIEMPOS ESTIMADOS

| Proceso | Primera vez | Siguiente vez |
|---------|-------------|---------------|
| npm install | 10 min | 0 min |
| npm run build | 3-5 min | 3-5 min |
| npm run compile | 20-25 min | 15-20 min |
| npm run compile:quick | 8-10 min | 5-8 min |

---

## 💡 TIPS

- ✅ **Desactiva antivirus** - Es crítico
- ✅ **Usa VS Code** - Es más cómodo
- ✅ **Ten paciencia** - 20 minutos es normal
- ✅ **No cierres ventanas** - Durante el proceso
- ✅ **Verifica espacio** - Mínimo 2 GB libres

---

## 🎁 CARACTERÍSTICAS DEL INSTALADOR

✨ Instalador profesional NSIS  
✨ Versión portable incluida  
✨ Accesos directos automáticos  
✨ Desinstalador integrado  
✨ Compatible con Windows 10/11  
✨ Tamaño optimizado (25-30 MB)  

---

## 🚀 EMPIEZA AHORA

### Método más fácil:

1. Abre VS Code
2. Presiona `Ctrl + ñ` (abre terminal)
3. Escribe: `npm run compile`
4. Presiona ENTER
5. ☕ Espera 20 minutos
6. ✅ ¡LISTO!

---

## 📞 NOTAS

- El proceso **no requiere internet** (después de instalar dependencias)
- El instalador es **100% funcional** y listo para distribuir
- Puedes **copiarlo a USB** y llevarlo a cualquier PC
- **No expira** - Es instalador permanente

---

## ✅ VERIFICAR RESULTADO

Después de compilar, verifica:

```
✅ Existe: dist-electron/CODECPOS-Setup-2.0.0.exe
✅ Tamaño: ~25-30 MB
✅ Se puede ejecutar sin errores
✅ Instala correctamente en Windows
```

---

**¿Listo? Ejecuta `npm run compile` y espera el resultado.** 🎉
