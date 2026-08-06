# 🎯 CÓMO GENERAR EL INSTALADOR DE CODEC POS v2.0

## 📌 **OBJETIVO:**

Generar el archivo `CODECPOS-Setup-2.0.0.exe` que puedes instalar en **otros PCs** sin necesidad de Node.js ni ninguna dependencia técnica.

---

## 🚀 **MÉTODO 1: SOLUCIÓN RECOMENDADA** ⭐

### **Paso 1: Ejecutar el script solucionador**

```
1. Doble click en: SOLUCIONAR_BUILDER.bat
2. Espera a que limpie archivos
```

---

### **Paso 2: Agregar exclusión en Windows Defender**

**ESTO ES OBLIGATORIO** para que funcione:

#### **2.1 Abrir configuración:**

```
1. Presiona: Windows + I (teclas simultáneas)
2. En el buscador escribe: "Seguridad de Windows"
3. Click en: "Protección contra virus y amenazas"
```

#### **2.2 Ir a exclusiones:**

```
4. Click en: "Administrar configuración"
5. Scroll hacia abajo
6. Encuentra la sección: "Exclusiones"
7. Click en: "Agregar o quitar exclusiones"
```

#### **2.3 Agregar tu carpeta del proyecto:**

```
8. Click en: "Agregar una exclusión"
9. Selecciona: "Carpeta"
10. Navega a la ubicación de tu proyecto

    Ejemplo: C:\Users\hp\Downloads\Codecpos2.10

11. Selecciona la CARPETA COMPLETA del proyecto
12. Click en: "Seleccionar carpeta"
```

#### **2.4 Verificar:**

```
✅ Debes ver tu carpeta en la lista de exclusiones:

   C:\Users\hp\Downloads\Codecpos2.10
```

---

### **Paso 3: Continuar compilación**

```
13. Vuelve a la ventana del script
14. Presiona cualquier tecla para continuar
15. El script instalará dependencias (5-10 min)
16. Luego compilará el instalador (20-30 min)
```

---

### **Paso 4: Esperar resultado**

```
⏱️ TIEMPO TOTAL: 25-40 minutos

Durante este tiempo verás:
- npm install (progreso de instalación)
- Vite build (compilando interfaz)
- Electron builder (empaquetando aplicación)
```

---

### **Paso 5: ¡Listo!**

```
═══════════════════════════════════════════════════════════════
 [OK] COMPILACION EXITOSA
═══════════════════════════════════════════════════════════════

Archivos generados en: dist-electron\

  [OK] CODECPOS-Setup-2.0.0.exe    (INSTALADOR) ← ESTE
  [OK] CODECPOS-2.0.0.exe          (PORTABLE)

═══════════════════════════════════════════════════════════════
```

---

## 🔥 **MÉTODO 2: SI EL MÉTODO 1 FALLA**

### **Solo si aparece el error: ERR_ELECTRON_BUILDER_CANNOT_EXECUTE**

```
1. Doble click en: COMPILAR_DESACTIVANDO_ANTIVIRUS.bat
2. DESACTIVA temporalmente Windows Defender:
   - Windows + I
   - Seguridad de Windows
   - Protección contra virus y amenazas
   - Administrar configuración
   - Desactiva: "Protección en tiempo real"
3. Vuelve al script y presiona cualquier tecla
4. Espera 25-40 minutos
5. ⚠️ REACTIVA el antivirus cuando termine
```

---

## 📦 **QUÉ OBTIENES:**

### **Archivo generado:**

```
📁 dist-electron\
  └─ 📦 CODECPOS-Setup-2.0.0.exe

Tamaño:  100-150 MB
Tipo:    Instalador NSIS profesional
```

---

### **Características del instalador:**

```
✅ 5 pantallas profesionales de instalación
✅ Logo personalizado de CODEC POS
✅ Instalación en: C:\Program Files\CODEC POS
✅ Ícono en el escritorio
✅ Acceso directo en el menú inicio
✅ Desinstalador incluido
✅ Funciona sin internet
✅ 100% autónomo (localStorage + IndexedDB)
```

---

## 🖥️ **INSTALAR EN OTRO PC:**

### **Requisitos del PC cliente:**

```
Sistema:       Windows 7 / 8 / 10 / 11 (64 bits)
RAM:          Mínimo 4GB
Espacio:      500 MB libres

❌ NO REQUIERE:
   - Node.js
   - npm
   - Git
   - Visual Studio
   - Internet (después de instalar)
```

---

### **Proceso de instalación:**

```
EN EL PC DEL CLIENTE:

1. Copia CODECPOS-Setup-2.0.0.exe al PC
2. Doble click en el archivo
3. Sigue el asistente:

   Pantalla 1: Bienvenida a CODEC POS v2.0
   Pantalla 2: Acuerdo de licencia
   Pantalla 3: Seleccionar carpeta de destino
   Pantalla 4: Crear accesos directos
   Pantalla 5: Instalando archivos...
   Pantalla 6: ¡Instalación completada!

4. Click en: "Finalizar"
5. La aplicación se abre automáticamente
6. Sistema listo para usar
```

---

## 📤 **CÓMO DISTRIBUIR EL INSTALADOR:**

### **Opción 1: Google Drive** (Recomendada)

```
1. Sube CODECPOS-Setup-2.0.0.exe a Google Drive
2. Click derecho en el archivo → Compartir
3. Cambia permisos a: "Cualquier persona con el enlace"
4. Copia el enlace
5. Comparte con tus clientes
```

---

### **Opción 2: WeTransfer** (Archivos grandes)

```
1. Ve a: https://wetransfer.com/
2. Sube: CODECPOS-Setup-2.0.0.exe
3. Ingresa email del destinatario
4. Envía
5. El cliente recibe un link de descarga
```

---

### **Opción 3: Dropbox**

```
1. Sube el archivo a Dropbox
2. Click derecho → Compartir
3. Copia enlace
4. Comparte con tus clientes
```

---

### **Opción 4: USB / Físico**

```
Simplemente copia el archivo a una USB
```

---

## ⚠️ **ERRORES COMUNES Y SOLUCIONES:**

### **Error 1: "ERR_ELECTRON_BUILDER_CANNOT_EXECUTE"**

```
CAUSA: 
   Tu antivirus está bloqueando app-builder.exe

SOLUCIÓN:
   1. Ejecuta: SOLUCIONAR_BUILDER.bat
   2. Agrega la exclusión en Windows Defender
   3. Intenta de nuevo
```

---

### **Error 2: "npm install falla"**

```
CAUSA:
   Problemas de red o cache corrupto

SOLUCIÓN:
   1. Verifica tu conexión a internet
   2. Ejecuta: npm cache clean --force
   3. Ejecuta: SOLUCIONAR_BUILDER.bat
```

---

### **Error 3: "No se genera el .exe"**

```
CAUSA:
   Antivirus eliminó el archivo durante la compilación

SOLUCIÓN:
   1. Agrega la carpeta completa en exclusiones
   2. Ejecuta: COMPILAR_DESACTIVANDO_ANTIVIRUS.bat
   3. Reactiva el antivirus al terminar
```

---

### **Error 4: "Out of memory" o "JavaScript heap out of memory"**

```
CAUSA:
   Node.js se quedó sin memoria RAM

SOLUCIÓN:
   1. Cierra programas pesados (Chrome, etc)
   2. Libera al menos 4GB de RAM
   3. Intenta de nuevo
```

---

## 📊 **CHECKLIST COMPLETO:**

```
ANTES DE COMPILAR:
□ Tengo Node.js instalado
□ Tengo internet activo
□ Tengo al menos 4GB RAM libres
□ Tengo al menos 5GB espacio en disco

DURANTE LA COMPILACIÓN:
□ Ejecuté SOLUCIONAR_BUILDER.bat
□ Agregué exclusión en Windows Defender
□ No cerré la ventana durante 25-40 minutos
□ Esperé a ver "COMPILACION EXITOSA"

DESPUÉS DE COMPILAR:
□ Verifiqué que existe dist-electron\CODECPOS-Setup-2.0.0.exe
□ Probé el instalador en mi PC
□ Funciona correctamente
□ Listo para distribuir
```

---

## 🎯 **RESUMEN ULTRA RÁPIDO:**

```
MÉTODO SIMPLE (99% de los casos):

1. Doble click: SOLUCIONAR_BUILDER.bat
2. Agrega exclusión en Windows Defender cuando te lo pida
3. Espera 25-40 minutos
4. ¡Listo! Archivo en dist-electron\CODECPOS-Setup-2.0.0.exe

────────────────────────────────────────────────────────

MÉTODO ALTERNATIVO (si el simple falla):

1. Desactiva Windows Defender temporalmente
2. Doble click: COMPILAR_DESACTIVANDO_ANTIVIRUS.bat
3. Espera 25-40 minutos
4. Reactiva Windows Defender
5. ¡Listo! Archivo en dist-electron\CODECPOS-Setup-2.0.0.exe
```

---

## 🚀 **EMPIEZA AHORA:**

```
PASO 1: Doble click en → SOLUCIONAR_BUILDER.bat
```

---

## 📞 **SI NECESITAS AYUDA:**

```
Si después de seguir TODOS los pasos aún tienes problemas, envíame:

1. Captura de pantalla del error COMPLETO
2. Captura de las exclusiones en Windows Defender
3. Resultado de: npm --version
4. Resultado de: node --version
```

---

**¡ÉXITO EN TU COMPILACIÓN!** 🎉

---

*CODEC POS v2.0*  
*Guía de Instalador*  
*Actualizada: 7/03/2026*  
*Versión: 2.5 FINAL*
