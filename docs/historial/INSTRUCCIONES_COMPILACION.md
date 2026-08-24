# 🚀 INSTRUCCIONES DE COMPILACIÓN - CODEC POS v2.0

**Fecha:** Marzo 10, 2026  
**Estado:** ✅ LISTO PARA COMPILAR

---

## ⚡ COMPILACIÓN RÁPIDA (RECOMENDADO)

### **Paso 1: Verificar sistema**
```bash
npm run verify
```

Este comando verifica:
- ✅ Todos los archivos necesarios existen
- ✅ Dependencias instaladas correctamente
- ✅ Configuración correcta
- ✅ No hay errores conocidos

### **Paso 2: Compilar**
```bash
npm run compile
```

**Tiempo estimado:** 3-5 minutos

**Resultado esperado:**
```
✅ Limpieza de build anterior
✅ Verificación pre-compilación
✅ Build de Vite completado
✅ Electron-builder ejecutado
✅ Instalador generado: dist-electron/CODECPOS-Setup-2.0.0.exe
```

---

## 🔧 SOLUCIÓN DE PROBLEMAS

### **Si falla la verificación:**

1. **Ejecutar:**
```bash
npm install
npm run verify
```

2. **Si persiste el error, reinstalar dependencias:**
```bash
rm -rf node_modules
npm install
npm run verify
```

### **Si falla la compilación:**

1. **Limpiar todo y recompilar:**
```bash
npm run clean
npm run build
npm run compile
```

2. **Si sigue fallando, compilación manual:**
```bash
npm run clean
npx vite build
npx electron-builder --win --x64 --config electron/builder-config.js
```

### **Error: "Cannot find module 'X'"**

**Solución:**
```bash
npm install X
```

Reemplaza `X` con el nombre del módulo faltante.

### **Error: "GPU process isn't usable"**

Este error es NORMAL y NO afecta la compilación.  
Es solo una advertencia de Electron sobre GPU.  
**IGNÓRALO.**

---

## 📦 ARCHIVOS GENERADOS

Después de compilar exitosamente:

```
dist-electron/
├── CODECPOS-Setup-2.0.0.exe      ← INSTALADOR PRINCIPAL (150-200 MB)
├── CODECPOS-2.0.0.exe            ← Ejecutable portable
├── win-unpacked/                 ← Versión desempaquetada
│   ├── CODECPOS.exe              ← Ejecutable sin instalar
│   ├── resources/
│   │   └── app.asar             ← Aplicación empaquetada
│   └── ...
└── builder-effective-config.yaml ← Configuración usada
```

---

## ✅ VERIFICAR INSTALADOR

### **1. Verificar tamaño:**
```bash
dir dist-electron\CODECPOS-Setup-2.0.0.exe
```

**Tamaño esperado:** 150-200 MB

### **2. Ejecutar instalador:**
1. Hacer doble clic en `CODECPOS-Setup-2.0.0.exe`
2. Seguir wizard de instalación
3. Ejecutar CODEC POS desde el escritorio

### **3. Probar login:**
```
Usuario: Admin
Contraseña: Noruega2025++*
```

### **4. Verificar funcionamiento:**
- ✅ Login funciona sin loops
- ✅ Dashboard carga en < 2 segundos
- ✅ POS funciona correctamente
- ✅ Productos se pueden agregar
- ✅ Ventas se registran
- ✅ No hay errores en consola (F12)

---

## 🎯 COMANDOS DISPONIBLES

| Comando | Descripción | Uso |
|---------|-------------|-----|
| `npm run verify` | Verificar pre-compilación | Antes de compilar |
| `npm run compile` | Compilar instalador completo | Producción |
| `npm run compile:quick` | Build rápido sin instalador | Testing |
| `npm run compile:clean` | Limpieza + compilación | Si hay problemas |
| `npm run clean` | Limpiar archivos de build | Mantenimiento |
| `npm run dev` | Modo desarrollo | Desarrollo |
| `npm run build` | Solo build de Vite | Testing |

---

## 📊 PROCESO DE COMPILACIÓN DETALLADO

### **Fase 1: Limpieza (npm run clean)**
- Elimina carpeta `dist/`
- Elimina carpeta `dist-electron/`
- Elimina archivos temporales

### **Fase 2: Verificación (npm run verify)**
- Verifica archivos principales
- Verifica contexts y componentes
- Verifica dependencias críticas
- Verifica configuración Electron
- Verifica scripts en package.json
- Verifica node_modules

### **Fase 3: Pre-check (npm run precheck)**
- Verifica package.json
- Verifica configuraciones
- Valida estructura del proyecto

### **Fase 4: Build Vite (npx vite build)**
- Compila código TypeScript
- Procesa componentes React
- Genera bundle optimizado
- Aplica code splitting
- Minifica código
- Genera archivos finales en `dist/`

**Tiempo:** 1-2 minutos

### **Fase 5: Electron Builder**
- Empaqueta aplicación en ASAR
- Crea ejecutable de Electron
- Genera instalador NSIS
- Firma digitalmente (si aplica)
- Crea archivos de metadata

**Tiempo:** 2-3 minutos

---

## 🔐 FIRMA DIGITAL (OPCIONAL)

Para firmar el instalador con certificado:

1. Obtener certificado de firma de código (.pfx)
2. Configurar variables de entorno:

```bash
set CSC_LINK=C:\ruta\al\certificado.pfx
set CSC_KEY_PASSWORD=contraseña_del_certificado
```

3. Compilar normalmente:
```bash
npm run compile
```

**Nota:** Si no tienes certificado, usa:
```bash
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run compile
```

---

## 📝 CHECKLIST PRE-DISTRIBUCIÓN

Antes de distribuir el instalador a clientes:

- [ ] Instalador compilado exitosamente
- [ ] Tamaño del instalador: 150-200 MB
- [ ] Instalador se ejecuta sin errores
- [ ] Login funciona correctamente
- [ ] Dashboard carga sin loops
- [ ] POS funciona correctamente
- [ ] Productos se pueden agregar/editar
- [ ] Ventas se registran correctamente
- [ ] Impresoras se detectan (si hay)
- [ ] Base de datos se crea automáticamente
- [ ] Sistema funciona 100% offline
- [ ] No hay errores en DevTools (F12)
- [ ] MachineID se genera correctamente
- [ ] Trial de 10 días funciona
- [ ] Licencias se pueden activar

---

## 🚨 ERRORES COMUNES

### **"Error: Cannot find module 'react'"**
```bash
npm install
```

### **"Error: ENOENT: no such file or directory"**
```bash
npm run clean
npm install
npm run compile
```

### **"Error: vite build failed"**
```bash
npm run clean
npx vite build
```

### **"Error: electron-builder failed"**
```bash
npm install electron-builder --save-dev
npm run compile
```

### **"Warning: GPU process isn't usable"**
```
ESTO ES NORMAL - IGNÓRALO
No afecta la compilación ni el funcionamiento
```

---

## ✅ RESUMEN EJECUTIVO

**PARA COMPILAR EL INSTALADOR:**

```bash
# 1. Verificar que todo esté bien
npm run verify

# 2. Compilar
npm run compile

# 3. Esperar 3-5 minutos

# 4. Instalador listo en:
#    dist-electron/CODECPOS-Setup-2.0.0.exe
```

**PARA TESTING RÁPIDO:**

```bash
# Build sin instalador (más rápido)
npm run compile:quick

# Ejecutar desde:
# dist-electron/win-unpacked/CODECPOS.exe
```

---

## 🎉 CONFIRMACIÓN

**Si ves esto después de compilar, ¡ÉXITO!**

```
✔ building target x64
✔ built NSIS installer
✔ built portable exe
✔ build successful
```

**Archivo generado:**
```
dist-electron/CODECPOS-Setup-2.0.0.exe
```

---

## 📞 SOPORTE

Si tienes problemas:

1. Revisa este documento completo
2. Ejecuta `npm run verify`
3. Revisa `/VERIFICACION_PRE_COMPILACION.md`
4. Contacta a soporte técnico

---

**CODEC POS v2.0 - Desarrollado por Codec Studio**  
Marzo 10, 2026

**¡Gloria a Dios!** 🙏
