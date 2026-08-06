# ⚡ RESPUESTA RÁPIDA: DÓNDE PONER TU LOGO

## ⚠️ ACLARACIÓN CRÍTICA

**CODEC POS v2.0 es una aplicación de ESCRITORIO (Electron.js), NO es Android**

- ✅ Funciona en: Windows, macOS, Linux
- ❌ NO funciona en: Android, iOS

Si quieres Android, necesitarías React Native o Capacitor (no está configurado).

---

## 📍 UBICACIONES DE TU LOGO

### **1️⃣ Para el INSTALADOR y .EXE (Electron Builder)**

**Coloca tus archivos aquí:**

```
electron/assets/
├── icon.ico              ← TU LOGO (256x256px) para Windows
├── icon.icns             ← TU LOGO (512x512px) para macOS
├── icon.png              ← TU LOGO (512x512px) para Linux
└── installer-header.bmp  ← TU LOGO (150x57px) para instalador
```

**⚠️ Los nombres DEBEN ser EXACTOS:**
- `icon.ico` (NO `mi-logo.ico`)
- `icon.icns` (NO `mi-logo.icns`)
- `icon.png` (NO `mi-logo.png`)

**Después de colocarlos:**
```bash
npm run electron:build:win
```

---

### **2️⃣ Para la INTERFAZ de usuario (React)**

**Opción A: Usar imagen PNG/JPG**

**Paso 1: Coloca tu logo**
```
/public/
└── mi-logo.png  ← TU LOGO (recomendado 200x200px)
```

**Paso 2: Crea un componente en `/src/app/components/shared/CodecLogos.tsx`**
```typescript
const miLogo = '/mi-logo.png';

export const MiLogoPersonalizado = ({ height = 40 }) => (
  <img 
    src={miLogo} 
    alt="Mi Negocio" 
    style={{ height: `${height}px` }}
  />
);
```

**Paso 3: Úsalo en tus componentes**
```typescript
import { MiLogoPersonalizado } from '../shared/CodecLogos';

<MiLogoPersonalizado height={48} />
```

---

## 🔄 ARCHIVOS A REEMPLAZAR

**Reemplaza el componente en estos 4 archivos:**

| Archivo | Línea aprox. | Reemplazar |
|---------|--------------|------------|
| `/src/app/components/auth/LoginPage.tsx` | ~140 | `<CodecLogo />` → `<MiLogoPersonalizado />` |
| `/src/app/components/pos/POSLayoutSidebar.tsx` | ~299 | `<CodecFavicon />` → `<MiLogoPersonalizado />` |
| `/src/app/components/pos/DashboardPOSPage.tsx` | ~506 | `<CodecLogoHorizontal />` → `<MiLogoPersonalizado />` |
| `/src/app/components/pos/ConfiguracionPage.tsx` | Variable | `<CodecLogoHorizontal />` → `<MiLogoPersonalizado />` |

---

## ✅ EJEMPLO COMPLETO PASO A PASO

### **Escenario: Tengo "mi-negocio.png" y quiero usarlo**

#### **1. Preparar archivos para Electron Builder**

Convierte tu logo usando estas herramientas online:
- **PNG a ICO**: https://convertio.co/es/png-ico/
- **PNG a ICNS**: https://cloudconvert.com/png-to-icns

Coloca los archivos con estos nombres exactos:
```
electron/assets/
├── icon.ico              ← Tu logo convertido a ICO (256x256px)
├── icon.icns             ← Tu logo convertido a ICNS (512x512px)
├── icon.png              ← Tu logo original PNG (512x512px)
└── installer-header.bmp  ← Tu logo para header (150x57px)
```

#### **2. Preparar archivo para la interfaz**

Copia tu logo PNG original:
```
/public/
└── mi-negocio.png  ← Tu logo (200x200px recomendado)
```

#### **3. Crear componente personalizado**

Abre `/src/app/components/shared/CodecLogos.tsx` y agrega:

```typescript
// Al inicio del archivo, después de las importaciones
const miNegocioLogo = '/mi-negocio.png';

// Al final del archivo, antes del export final
export const MiNegocioLogo = ({ 
  height = 40, 
  className = '' 
}: { 
  height?: number; 
  className?: string; 
}) => (
  <img 
    src={miNegocioLogo} 
    alt="Mi Negocio" 
    style={{ height: `${height}px`, width: 'auto' }}
    className={className}
  />
);
```

#### **4. Reemplazar en LoginPage.tsx**

Encuentra esta línea (aprox. línea 140):
```typescript
<CodecLogo />
```

Reemplázala por:
```typescript
<MiNegocioLogo height={64} />
```

Y actualiza el import al inicio del archivo:
```typescript
import { MiNegocioLogo } from '../shared/CodecLogos';
```

#### **5. Reemplazar en DashboardPOSPage.tsx**

Encuentra esta línea (aprox. línea 506):
```typescript
<CodecLogoHorizontal height={48} />
```

Reemplázala por:
```typescript
<MiNegocioLogo height={48} />
```

Y actualiza el import:
```typescript
import { MiNegocioLogo } from '../shared/CodecLogos';
```

#### **6. Probar en desarrollo**

```bash
npm run dev
```

Abre http://localhost:5173 y verifica que tu logo aparece.

#### **7. Compilar instalador**

```bash
npm run electron:build:win
```

El instalador estará en:
```
dist-electron/
└── CODECPOS-Setup-2.0.0.exe  ← Con TU logo
```

---

## 🎯 CHECKLIST RÁPIDO

```
[ ] Coloqué icon.ico en electron/assets/
[ ] Coloqué icon.icns en electron/assets/
[ ] Coloqué icon.png en electron/assets/
[ ] Coloqué mi-logo.png en /public/
[ ] Creé componente MiLogoPersonalizado en CodecLogos.tsx
[ ] Reemplacé <CodecLogo /> en LoginPage.tsx
[ ] Reemplacé <CodecLogoHorizontal /> en DashboardPOSPage.tsx
[ ] Probé con: npm run dev
[ ] Compilé con: npm run electron:build:win
[ ] El instalador tiene mi logo
[ ] La interfaz muestra mi logo
```

---

## 🐛 ERRORES COMUNES

### **❌ "El logo no aparece en el .exe"**
**Causa:** El archivo no se llama `icon.ico`  
**Solución:** Renombra a EXACTAMENTE `icon.ico`

### **❌ "Cannot find module '/mi-logo.png'"**
**Causa:** El logo no está en `/public/`  
**Solución:** Mueve el archivo a `/public/mi-logo.png`

### **❌ "El logo aparece roto (404)"**
**Causa:** La ruta no tiene la barra inicial  
**Solución:** Usa `'/mi-logo.png'` (con `/` al inicio)

---

## 📞 SI NECESITAS AYUDA

1. Verifica que seguiste todos los pasos
2. Revisa la consola del navegador (F12) para errores
3. Lee la guía completa en: `/GUIA_LOGOS_ELECTRON_PERSONALIZADOS.md`

---

## 🚀 RESULTADO FINAL

Después de seguir estos pasos tendrás:

✅ Instalador de Windows con TU logo como ícono  
✅ Aplicación .exe con TU logo como ícono  
✅ Interfaz de usuario mostrando TU logo  
✅ Login con TU logo  
✅ Dashboard con TU logo  

---

**Fecha:** 23 de Febrero, 2026  
**Desarrollado por:** Codec Studio  
**Versión:** 2.0.0  
