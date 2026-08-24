# 🚀 CODEC POS v2.0 - Crear Instalador Setup.exe

## ⚡ PROCESO COMPLETO (4 PASOS)

---

## ✅ **PASO 1: Instalar Node.js** (si no lo tienes)

### Verificar si ya tienes Node.js:
1. Abre **PowerShell** o **CMD**
2. Ejecuta: `node --version`
3. Si aparece un número de versión (ej: v20.x.x) → **YA LO TIENES** ✅
4. Si dice "no se reconoce" → **Necesitas instalarlo** ⬇️

### Instalar Node.js:
1. Ve a: **https://nodejs.org/**
2. Descarga la versión **LTS** (recomendada - botón verde)
3. Ejecuta el instalador
4. Click en **Next → Next → Install**
5. **Reinicia el PC**

---

## ✅ **PASO 2: Instalar dependencias** (SOLO LA PRIMERA VEZ)

1. **Opción A - Usar VERIFICAR.bat:**
   ```
   Click derecho en: VERIFICAR.bat
   → Ejecutar como administrador
   ```
   
   Si dice "node_modules NO encontrado":

2. **Opción B - Manual:**
   ```
   1. Abre PowerShell en esta carpeta
   2. Ejecuta: npm install
   3. Espera 5-10 minutos
   ```

---

## ✅ **PASO 3: Desactivar Windows Defender**

⚠️ **CRÍTICO - No saltees este paso**

```
1. Presiona: Windows + I
2. Privacidad y seguridad
3. Seguridad de Windows
4. Protección contra virus y amenazas
5. Administrar configuración
6. Protección en tiempo real: ❌ OFF
```

---

## ✅ **PASO 4: Crear el instalador**

```
1. Click derecho en: COMPILAR.bat
2. Ejecutar como administrador
3. Lee las instrucciones en pantalla
4. Presiona ENTER cuando te pida
5. Espera 20 minutos ☕
6. NO cierres la ventana
```

El script hará:
- ✅ Limpiar archivos anteriores
- ✅ Construir la interfaz web (npm run build)
- ✅ Crear el instalador con electron-builder
- ✅ Abrir la carpeta con el resultado

---

## 📦 **RESULTADO:**

```
dist-electron/CODECPOS-Setup-2.0.0.exe
```

Este es tu **instalador profesional** que puedes:
- 💾 Copiar a USB
- 📧 Enviar por email/WhatsApp
- 🌐 Subir a Drive/Dropbox
- 💻 Instalar en otros PCs

---

## 🔧 **SOLUCIÓN DE PROBLEMAS:**

### **El .bat se cierra inmediatamente**
```
❌ NO hagas doble click
✅ Click derecho → Ejecutar como administrador
```

### **"node no se reconoce como comando"**
```
→ Instala Node.js (Paso 1)
→ Reinicia el PC
```

### **"npm run build" falla**
```
→ Ejecuta: npm install
→ Espera a que termine
→ Vuelve a ejecutar COMPILAR.bat
```

### **"electron-builder" falla**
```
→ Desactiva Windows Defender COMPLETAMENTE
→ Ejecuta como Administrador
→ Verifica espacio en disco (mínimo 2 GB)
→ Reinicia el PC
```

### **No se encuentra el instalador**
```
→ Revisa los errores en la ventana del .bat
→ Asegúrate que Windows Defender esté OFF
→ Busca manualmente en: dist-electron/
```

---

## 📝 **VERIFICACIÓN ANTES DE COMPILAR:**

Ejecuta: **VERIFICAR.bat** para asegurarte que todo esté listo.

Debe mostrar:
```
[OK] Node.js instalado
[OK] npm disponible
[OK] package.json encontrado
[OK] node_modules encontrado
[OK] builder-config.js encontrado
```

---

## ⏱️ **TIEMPOS ESTIMADOS:**

| Paso | Tiempo |
|------|--------|
| Instalar Node.js | 5 min |
| npm install | 5-10 min |
| Desactivar Defender | 1 min |
| COMPILAR.bat | 15-20 min |
| **TOTAL** | **30-40 min** |

---

## 💡 **CONSEJOS:**

✅ **Ejecuta VERIFICAR.bat primero** para verificar prerequisitos  
✅ **Desactiva COMPLETAMENTE Windows Defender** antes de compilar  
✅ **Ejecuta siempre como Administrador** el .bat  
✅ **NO cierres la ventana** mientras compila  
✅ **Ten paciencia** - son 20 minutos normales  

---

## 🎯 **RESUMEN RÁPIDO:**

```
1. Node.js instalado? → npm install
2. Desactivar Defender
3. COMPILAR.bat (como admin)
4. Esperar 20 minutos
5. ¡Listo! → dist-electron\CODECPOS-Setup-2.0.0.exe
```

---

## 📞 **¿NECESITAS AYUDA?**

Si sigues teniendo problemas:
1. Ejecuta **VERIFICAR.bat** y revisa los errores
2. Lee **LEEME.txt** para más detalles
3. Revisa que Windows Defender esté desactivado
4. Reinicia el PC e intenta de nuevo

---

**¡TODO LISTO!** Ahora ejecuta **COMPILAR.bat** 🚀
