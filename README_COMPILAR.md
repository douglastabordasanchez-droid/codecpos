# 🚀 CODEC POS v2.0 - Crear Instalador

## ⚡ INICIO RÁPIDO

1. **Click derecho** en `VERIFICAR.bat` → **Ejecutar como administrador**
2. Si falta algo: **Click derecho** en `INSTALAR.bat` → **Ejecutar como administrador**
3. **Desactivar Windows Defender** (crítico)
4. **Click derecho** en `COMPILAR.bat` → **Ejecutar como administrador**
5. **Esperar 20 minutos** ☕
6. **¡LISTO!** → `dist-electron\CODECPOS-Setup-2.0.0.exe`

---

## 📋 PREREQUISITOS

### ✅ Node.js
- Descargar: https://nodejs.org/
- Versión: LTS (recomendada)
- Reiniciar PC después de instalar

### ✅ npm
- Se instala automáticamente con Node.js

### ✅ node_modules
- Ejecutar: `INSTALAR.bat` (como administrador)

---

## 🛠️ ARCHIVOS DISPONIBLES

| Archivo | Descripción |
|---------|-------------|
| `VERIFICAR.bat` | Verifica que todo esté listo |
| `INSTALAR.bat` | Instala dependencias (node_modules) |
| `COMPILAR.bat` | Crea el instalador Setup.exe |
| `LEEME.txt` | Instrucciones completas |
| `EMPIEZA_AQUI.txt` | Guía rápida |

---

## 🔧 PROCESO COMPLETO

### **PASO 1: Verificar**
```
Click derecho en: VERIFICAR.bat
→ Ejecutar como administrador
```

**Resultado esperado:**
```
[1/5] Verificando Node.js... OK
[2/5] Verificando npm... OK
[3/5] Verificando package.json... OK
[4/5] Verificando node_modules... OK
[5/5] Verificando builder-config.js... OK

TODO LISTO PARA COMPILAR
```

---

### **PASO 2: Instalar dependencias (si falta)**
```
Click derecho en: INSTALAR.bat
→ Ejecutar como administrador
→ Esperar 5-10 minutos
```

---

### **PASO 3: Desactivar Windows Defender**

**⚠️ CRÍTICO - Sin esto NO funcionará**

1. Presiona `Windows + I`
2. Ve a: **Privacidad y seguridad**
3. Click en: **Seguridad de Windows**
4. Click en: **Protección contra virus y amenazas**
5. Click en: **Administrar configuración**
6. Desactiva: **Protección en tiempo real** ❌

---

### **PASO 4: Compilar**
```
Click derecho en: COMPILAR.bat
→ Ejecutar como administrador
→ Presionar ENTER en cada pausa
→ Esperar 20 minutos
→ NO cerrar la ventana
```

**El .bat hará:**
1. Verificar Node.js y npm
2. Instalar dependencias (si faltan)
3. Limpiar carpetas anteriores
4. Ejecutar `npm run build`
5. Ejecutar `electron-builder`
6. Buscar el instalador
7. Abrir la carpeta con el resultado

---

## 📦 RESULTADO FINAL

```
dist-electron\CODECPOS-Setup-2.0.0.exe
```

Este es tu **instalador profesional** que puedes:
- ✅ Copiar a USB
- ✅ Enviar por email/WhatsApp
- ✅ Subir a Google Drive
- ✅ Llevar a otro PC
- ✅ Doble click para instalar

---

## ⏱️ TIEMPOS ESTIMADOS

| Tarea | Tiempo |
|-------|--------|
| Verificar | 10 segundos |
| Instalar Node.js | 5 minutos |
| Instalar dependencias | 5-10 minutos |
| Compilar | 15-20 minutos |
| **TOTAL (primera vez)** | **30-40 minutos** |
| **TOTAL (siguiente vez)** | **20 minutos** |

---

## 🐛 PROBLEMAS COMUNES

### ❌ "El .bat se cierra inmediatamente"
**SOLUCIÓN:**
- ✗ NO hagas doble click
- ✓ Click derecho → Ejecutar como administrador

### ❌ "'node' no se reconoce como comando"
**SOLUCIÓN:**
1. Instala Node.js: https://nodejs.org/
2. Reinicia el PC
3. Vuelve a intentar

### ❌ "npm run build falla"
**SOLUCIÓN:**
1. Ejecuta `INSTALAR.bat` como administrador
2. Espera a que termine
3. Ejecuta `COMPILAR.bat` de nuevo

### ❌ "electron-builder falla"
**SOLUCIÓN:**
1. Desactiva Windows Defender **COMPLETAMENTE**
2. Ejecuta como **Administrador**
3. Verifica espacio en disco (mínimo 2 GB)
4. Reinicia el PC si persiste

### ❌ "No se encuentra el instalador"
**SOLUCIÓN:**
1. Revisa los errores en la ventana
2. Asegúrate que Windows Defender esté **OFF**
3. Busca manualmente en `dist-electron\`

---

## 💡 CONSEJOS

- ✅ **SIEMPRE** ejecuta como Administrador
- ✅ **SIEMPRE** desactiva Windows Defender antes de compilar
- ✅ **NO** cierres las ventanas mientras trabajan
- ✅ Ten **PACIENCIA** - 20 minutos es normal
- ✅ Ejecuta `VERIFICAR.bat` primero para evitar errores

---

## 📞 SOPORTE

Si después de seguir todos los pasos aún tienes problemas:

1. Revisa el archivo `LEEME.txt` para más detalles
2. Verifica que Windows Defender esté desactivado
3. Asegúrate de ejecutar como Administrador
4. Reinicia el PC y vuelve a intentar

---

## ✨ CARACTERÍSTICAS DEL SISTEMA

- 🎯 Sistema POS completo para minimercados
- 💰 6 métodos de pago (Efectivo, Nequi, Daviplata, etc.)
- 📊 Control de inventario y vencimientos
- 🔄 Multi-tienda
- 🎨 Interfaz moderna Glassmorphism
- 💾 100% Autónomo (sin internet)
- 🎁 **Prueba gratis: 10 días**

---

**¡Ahora ejecuta `VERIFICAR.bat`!** 🚀
