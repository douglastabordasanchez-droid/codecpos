# 📊 TABLA DE UBICACIONES DE LOGOS - CODEC POS v2.0

## ⚠️ ACLARACIÓN IMPORTANTE

**CODEC POS v2.0 = Electron.js (Aplicación de ESCRITORIO)**

| Plataforma | ¿Funciona? |
|------------|------------|
| ✅ Windows | SÍ |
| ✅ macOS | SÍ |
| ✅ Linux | SÍ |
| ❌ Android | NO |
| ❌ iOS | NO |

---

## 📁 TABLA DE UBICACIONES Y NOMBRES

### **PARA EL INSTALADOR Y .EXE (Electron Builder)**

| # | Ubicación completa | Nombre EXACTO del archivo | Formato | Tamaño | Para qué sirve |
|---|-------------------|---------------------------|---------|--------|----------------|
| 1 | `/electron/assets/icon.ico` | `icon.ico` | ICO | 256x256px | Ícono del .exe en Windows |
| 2 | `/electron/assets/icon.icns` | `icon.icns` | ICNS | 512x512px | Ícono del .app en macOS |
| 3 | `/electron/assets/icon.png` | `icon.png` | PNG | 512x512px o 1024x1024px | Ícono en Linux |
| 4 | `/electron/assets/installer-header.bmp` | `installer-header.bmp` | BMP | 150x57px | Cabecera del instalador Windows |

---

### **PARA LA INTERFAZ DE USUARIO (React)**

| # | Ubicación completa | Nombre sugerido | Formato | Tamaño | Para qué sirve |
|---|-------------------|-----------------|---------|--------|----------------|
| 5 | `/public/mi-logo.png` | `mi-logo.png` (personalizable) | PNG/JPG | 200x200px recomendado | Logo en la interfaz (login, dashboard, etc.) |
| 6 | `/src/app/components/shared/CodecLogos.tsx` | `CodecLogos.tsx` (NO cambiar) | TSX | - | Archivo de componentes de logos |

---

## 🔄 TABLA DE REEMPLAZOS EN EL CÓDIGO

### **Archivos React que usan logos:**

| # | Archivo completo | Línea aprox. | Componente ACTUAL | Reemplazar por | Import necesario |
|---|-----------------|--------------|-------------------|----------------|------------------|
| 1 | `/src/app/components/auth/LoginPage.tsx` | 140 | `<CodecLogo />` | `<MiLogo height={64} />` | `import { MiLogo } from '../shared/CodecLogos';` |
| 2 | `/src/app/components/pos/POSLayoutSidebar.tsx` | 299, 317 | `<CodecFavicon />` | `<MiLogo size={40} />` | `import { MiLogo } from '../shared/CodecLogos';` |
| 3 | `/src/app/components/pos/DashboardPOSPage.tsx` | 506 | `<CodecLogoHorizontal height={48} />` | `<MiLogo height={48} />` | `import { MiLogo } from '../shared/CodecLogos';` |
| 4 | `/src/app/components/pos/ConfiguracionPage.tsx` | Variable | `<CodecLogoHorizontal />` | `<MiLogo height={40} />` | `import { MiLogo } from '../shared/CodecLogos';` |

---

## 🎨 TABLA DE FORMATOS Y CONVERSIÓN

### **Herramientas de conversión online:**

| Desde → Hasta | Herramienta | URL | Gratis |
|---------------|-------------|-----|--------|
| PNG → ICO | Convertio | https://convertio.co/es/png-ico/ | ✅ Sí |
| PNG → ICNS | CloudConvert | https://cloudconvert.com/png-to-icns | ✅ Sí (limitado) |
| PNG → BMP | Convertio | https://convertio.co/es/png-bmp/ | ✅ Sí |
| PNG → SVG | Convertio | https://convertio.co/es/png-svg/ | ✅ Sí |
| JPG → PNG | TinyPNG | https://tinypng.com/ | ✅ Sí |

### **Software profesional:**

| Software | Plataforma | Precio | Exporta a |
|----------|-----------|--------|-----------|
| GIMP | Windows, macOS, Linux | Gratis | ICO, PNG, BMP, SVG |
| Photoshop | Windows, macOS | Pago | ICO, PNG, BMP, SVG |
| Inkscape | Windows, macOS, Linux | Gratis | SVG, PNG |
| Paint.NET | Windows | Gratis | ICO, PNG, BMP |

---

## 📐 TABLA DE TAMAÑOS RECOMENDADOS

| Archivo | Ancho | Alto | Relación de aspecto | Fondo | Notas |
|---------|-------|------|---------------------|-------|-------|
| `icon.ico` | 256px | 256px | 1:1 (cuadrado) | Transparente | Puede contener múltiples tamaños (16, 32, 48, 256) |
| `icon.icns` | 512px | 512px | 1:1 (cuadrado) | Transparente | También soporta 1024x1024 |
| `icon.png` | 512px | 512px | 1:1 (cuadrado) | Transparente | Mejor calidad con 1024x1024 |
| `installer-header.bmp` | 150px | 57px | ~2.63:1 (horizontal) | Sólido | Aparece en el instalador NSIS |
| `/public/mi-logo.png` | 200px+ | Variable | Flexible | Transparente | Escala automáticamente |

---

## 🛠️ TABLA DE COMANDOS

### **Comandos de desarrollo y compilación:**

| Comando | Para qué sirve | Cuándo usarlo |
|---------|----------------|---------------|
| `npm run dev` | Ejecutar en modo desarrollo | Para probar cambios sin compilar |
| `npm run electron:build:win` | Compilar instalador Windows | Para crear el .exe con tu logo |
| `npm run electron:build` | Compilar para la plataforma actual | Compilación automática |
| `npm run electron:build:all` | Compilar para Windows, macOS y Linux | Distribución multiplataforma |

---

## ✅ CHECKLIST DE VERIFICACIÓN

### **Antes de compilar:**

| # | Verificación | Estado |
|---|--------------|--------|
| 1 | ¿Existe `/electron/assets/icon.ico`? | ☐ |
| 2 | ¿El archivo se llama EXACTAMENTE `icon.ico`? | ☐ |
| 3 | ¿El tamaño es 256x256px? | ☐ |
| 4 | ¿Existe `/electron/assets/icon.icns`? (si compilas para macOS) | ☐ |
| 5 | ¿Existe `/electron/assets/icon.png`? (si compilas para Linux) | ☐ |
| 6 | ¿Existe `/public/mi-logo.png`? | ☐ |
| 7 | ¿Creé el componente `MiLogo` en `CodecLogos.tsx`? | ☐ |
| 8 | ¿Reemplacé `<CodecLogo />` en `LoginPage.tsx`? | ☐ |
| 9 | ¿Reemplacé `<CodecLogoHorizontal />` en `DashboardPOSPage.tsx`? | ☐ |
| 10 | ¿Probé con `npm run dev`? | ☐ |

### **Después de compilar:**

| # | Verificación | Estado |
|---|--------------|--------|
| 1 | ¿El instalador tiene mi logo como ícono? | ☐ |
| 2 | ¿Al instalar, el .exe tiene mi logo? | ☐ |
| 3 | ¿En el login aparece mi logo? | ☐ |
| 4 | ¿En el dashboard aparece mi logo? | ☐ |
| 5 | ¿En el sidebar aparece mi logo? | ☐ |

---

## 🐛 TABLA DE SOLUCIÓN DE PROBLEMAS

| Problema | Posible causa | Solución |
|----------|--------------|----------|
| El .exe no tiene mi logo | El archivo no se llama `icon.ico` | Renombra a EXACTAMENTE `icon.ico` |
| El instalador no tiene mi logo | El archivo está en la carpeta incorrecta | Mueve a `/electron/assets/icon.ico` |
| La interfaz no muestra mi logo | El archivo no está en `/public/` | Mueve a `/public/mi-logo.png` |
| Error "Cannot find module" | La ruta está mal escrita | Usa `'/mi-logo.png'` (con `/` inicial) |
| El logo se ve pixelado | La resolución es muy baja | Usa al menos 256x256px |
| El logo se ve cortado | El tamaño del componente es pequeño | Aumenta el `height`: `<MiLogo height={64} />` |

---

## 📊 COMPARACIÓN: ANTES vs DESPUÉS

### **ANTES (Logos de CODEC):**

| Ubicación | Componente | Descripción |
|-----------|-----------|-------------|
| `/electron/assets/icon.ico` | - | Logo de CODEC (rayo azul) |
| `/src/app/components/shared/CodecLogos.tsx` | `<CodecLogo />` | SVG inline del rayo |
| `LoginPage.tsx` | `<CodecLogo />` | Rayo de CODEC |
| `DashboardPOSPage.tsx` | `<CodecLogoHorizontal />` | "CODEC POS v2.0" |

### **DESPUÉS (Logos personalizados):**

| Ubicación | Componente | Descripción |
|-----------|-----------|-------------|
| `/electron/assets/icon.ico` | - | **TU LOGO** |
| `/public/mi-logo.png` | `<MiLogo />` | **TU LOGO** |
| `LoginPage.tsx` | `<MiLogo />` | **TU LOGO** |
| `DashboardPOSPage.tsx` | `<MiLogo />` | **TU LOGO** |

---

## 🎯 RESUMEN EJECUTIVO

### **2 UBICACIONES PRINCIPALES:**

| # | Ubicación | Para qué | Nombre del archivo |
|---|-----------|----------|-------------------|
| 1️⃣ | `/electron/assets/` | Instalador y .exe | `icon.ico`, `icon.icns`, `icon.png` |
| 2️⃣ | `/public/` | Interfaz de usuario | `mi-logo.png` (o el nombre que quieras) |

### **4 ARCHIVOS A MODIFICAR:**

| # | Archivo | Cambio |
|---|---------|--------|
| 1️⃣ | `LoginPage.tsx` | Reemplazar `<CodecLogo />` |
| 2️⃣ | `POSLayoutSidebar.tsx` | Reemplazar `<CodecFavicon />` |
| 3️⃣ | `DashboardPOSPage.tsx` | Reemplazar `<CodecLogoHorizontal />` |
| 4️⃣ | `CodecLogos.tsx` | Agregar componente `<MiLogo />` |

### **2 COMANDOS CLAVE:**

| # | Comando | Cuándo |
|---|---------|--------|
| 1️⃣ | `npm run dev` | Para probar en desarrollo |
| 2️⃣ | `npm run electron:build:win` | Para compilar el instalador |

---

## 📞 SOPORTE

Si sigues teniendo problemas:

1. ✅ Verifica que el nombre del archivo es EXACTAMENTE `icon.ico`
2. ✅ Verifica que está en `/electron/assets/`
3. ✅ Ejecuta `npm run electron:build:win` de nuevo
4. ✅ Revisa la consola del navegador (F12) para errores

---

**Documentación creada:** 23 de Febrero, 2026  
**Sistema:** CODEC POS v2.0  
**Tecnología:** Electron.js + React + Vite  
**Plataformas:** Windows, macOS, Linux (NO Android)  

---

## 🚫 IMPORTANTE: NO ES ANDROID

Si necesitas compilar para Android:

- ❌ CODEC POS v2.0 NO está configurado para Android
- ✅ Necesitarías **React Native** o **Capacitor**
- ✅ La estructura sería completamente diferente
- ✅ Requeriría Android Studio y Java/Kotlin
- ✅ Los logos irían en `android/app/src/main/res/mipmap-*/`

**Para Android, contacta al equipo de desarrollo para una cotización de migración.**

---

**¡Tu logo estará en TODAS partes de CODEC POS! 🚀**
