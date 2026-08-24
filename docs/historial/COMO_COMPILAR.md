# 🚀 CODEC POS v2.0 - COMPILAR INSTALADOR

## 🎯 OPCIÓN 1: VISUAL STUDIO CODE (Recomendado)

### Paso 1: Abrir VS Code
```
Abre la carpeta del proyecto en VS Code
```

### Paso 2: Abrir Terminal
```
Ctrl + Ñ  (o View > Terminal)
```

### Paso 3: Ejecutar comando
```bash
npm run compile
```

O si prefieres el proceso completo con limpieza:
```bash
npm run compile:clean
```

### Paso 4: Esperar
```
⏳ 15-20 minutos
```

### Paso 5: Listo
```
✅ dist-electron/CODECPOS-Setup-2.0.0.exe
```

---

## 🎯 OPCIÓN 2: DESDE TERMINAL (Rápido)

```bash
# Abrir PowerShell o CMD en la carpeta del proyecto

# Ejecutar:
npm run compile
```

---

## 🎯 OPCIÓN 3: .BAT (Más visual)

```
Click derecho en: BUILD.bat
→ Ejecutar como administrador
→ Seguir los pasos
```

---

## 📋 COMANDOS DISPONIBLES

| Comando | Descripción |
|---------|-------------|
| `npm run compile` | Crear instalador completo |
| `npm run compile:clean` | Limpiar + crear instalador |
| `npm run compile:quick` | Solo empaquetar (más rápido) |
| `npm run build` | Solo construir interfaz |

---

## ⚡ MÉTODO ULTRA RÁPIDO

Si solo quieres probar (sin crear instalador):

```bash
npm run pack
```

Esto crea una versión empaquetada en `dist-electron/` en 5 minutos.

---

## 🔧 USANDO TAREAS DE VS CODE

### Opción 1: Desde el menú
```
1. Ctrl + Shift + P
2. Escribe: "Tasks: Run Task"
3. Selecciona: "🚀 COMPILAR TODO"
4. Espera
```

### Opción 2: Atajo personalizado
```
1. Ctrl + Shift + B (Build)
2. Selecciona la tarea que quieras
```

### Tareas disponibles:
- ✅ `1️⃣ VERIFICAR` - Comprobar Node.js/npm
- 🧹 `2️⃣ LIMPIAR` - Borrar carpetas
- 🔨 `3️⃣ BUILD` - Construir interfaz
- 📦 `4️⃣ COMPILAR` - Crear instalador
- 🚀 `COMPILAR TODO` - Proceso completo
- ⚡ `COMPILAR RAPIDO` - Sin instalador

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### ❌ "node no se reconoce"
```bash
# Instala Node.js
https://nodejs.org/

# Reinicia VS Code
```

### ❌ "Error en build"
```bash
# Reinstala dependencias
npm install
```

### ❌ "Error en electron-builder"
```bash
# Desactiva Windows Defender
# Ejecuta como Administrador
# Libera espacio en disco (2 GB mínimo)
```

---

## ⏱️ TIEMPOS

| Proceso | Tiempo |
|---------|--------|
| npm run build | 2-5 min |
| npm run pack | 5-8 min |
| npm run compile | 20-25 min |

---

## ✅ PROCESO RECOMENDADO

### Primera vez:
```bash
1. npm install          # Instalar dependencias
2. npm run compile:clean # Compilar limpio
```

### Siguiente vez:
```bash
npm run compile         # Solo compilar
```

---

## 🎁 RESULTADO FINAL

```
dist-electron/
├── CODECPOS-Setup-2.0.0.exe     ← Instalador NSIS
└── CODECPOS 2.0.0.exe           ← Versión portable
```

Ambos archivos son funcionales y distribuibles.

---

## 💡 TIPS

✅ **Usa VS Code** - Es más cómodo que .bat  
✅ **Desactiva antivirus** - Antes de compilar  
✅ **Ten paciencia** - 20 minutos es normal  
✅ **No cierres ventanas** - Durante el proceso  

---

## 🚀 EMPIEZA AHORA

### Método más simple:

```bash
# 1. Abre VS Code
# 2. Abre terminal (Ctrl + Ñ)
# 3. Ejecuta:

npm run compile

# 4. Espera 20 minutos
# 5. ¡Listo!
```

---

**¿Listo para compilar? Abre VS Code y ejecuta `npm run compile`** 🎉
