# 🎨 CODEC POS v2.0 - SISTEMA DE LOGOS

## 📁 UBICACIÓN DE LOS LOGOS OFICIALES

Todos los logos del sistema **DEBEN** estar en la carpeta `/public`:

```
/public/
  ├── logo.png    ← Logo principal (úsalo SIEMPRE)
  └── icon.ico    ← Ícono del instalador
```

---

## ✅ LO QUE SE HIZO

### 1. **Sistema Centralizado de Logos**

Se creó `/src/app/components/shared/CodecLogos.tsx` que:

- ✅ Usa **SOLO** `/logo.png` de la carpeta `/public`
- ✅ Tiene un SVG de fallback profesional si no encuentra la imagen
- ✅ Proporciona múltiples variantes del logo para diferentes usos
- ✅ **NO** usa ningún otro logo que no sea `logo.png`

### 2. **Componentes Disponibles**

```tsx
import { 
  CodecLogoIcon,       // Logo simple
  CodecLogoHorizontal, // Logo + texto "CODEC POS v2.0"
  CodecFavicon,        // Logo circular con borde
  CodecLogoFull,       // Logo grande con glow
  CodecLogoMinimal     // Logo para impresos
} from './components/shared/CodecLogos';
```

### 3. **Actualización del Instalador**

`/electron/builder-config.js` ahora busca los logos en este orden:

```javascript
PRIORIDAD 1: /public/logo.png  ← Tu logo principal
PRIORIDAD 2: /public/icon.ico  ← Ícono del instalador
```

---

## 🎯 CÓMO FUNCIONA

### Cuando pones tu logo en `/public/logo.png`:

1. **TODO el sistema** lo usará automáticamente
2. La página de bienvenida mostrará tu logo
3. La página de login mostrará tu logo
4. El dashboard mostrará tu logo
5. La configuración mostrará tu logo
6. El instalador usará tu logo

### Si NO pones un logo:

- El sistema usará un **SVG profesional** de fallback
- Todo seguirá funcionando perfectamente

---

## 📐 ESPECIFICACIONES RECOMENDADAS

### Logo Principal (`logo.png`)

```
Tamaño mínimo:   512×512 px
Tamaño óptimo:   1024×1024 px
Formato:         PNG con transparencia
Fondo:           Transparente (recomendado)
Peso máximo:     500 KB
```

### Ícono del Instalador (`icon.ico`)

```
Tamaño:          256×256 px
Formato:         ICO o PNG
Fondo:           Transparente o blanco
Peso máximo:     200 KB
```

---

## 🚀 CÓMO USAR TUS LOGOS

### Paso 1: Preparar tus logos

```bash
# Coloca tus archivos en /public/
/public/
  ├── logo.png    ← Tu logo (512×512 px mínimo)
  └── icon.ico    ← Ícono del instalador (256×256 px)
```

### Paso 2: Compilar

```bash
npm run compile
```

**¡Eso es todo!** El sistema usará tus logos automáticamente.

---

## 🎨 DÓNDE APARECERÁ TU LOGO

### Pantallas del Sistema

| Ubicación | Componente Usado | Tamaño |
|-----------|------------------|--------|
| **Página de Bienvenida** | `<img src="/logo.png">` | 128px |
| **Página de Login** | `<CodecLogoFull>` | 120px |
| **Dashboard Principal** | `<CodecLogoHorizontal>` | 34px |
| **Configuración** | `<CodecLogoHorizontal>` | 40px |
| **Sidebar** | `<CodecFavicon>` | 48px |

### Instalador de Windows

| Elemento | Logo Usado |
|----------|------------|
| Ícono del instalador | `icon.ico` o `logo.png` |
| Ícono del ejecutable | `icon.ico` o `logo.png` |
| Acceso directo escritorio | `icon.ico` o `logo.png` |
| Menú inicio | `icon.ico` o `logo.png` |

---

## 🔧 CÓDIGO TÉCNICO

### Componente Base (CodecLogos.tsx)

```tsx
// Carga logo.png con fallback a SVG
const CodecLogoImage = ({ size = 64, className = '' }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <CodecSVGLogo size={size} className={className} />;
  }

  return (
    <img
      src="/logo.png"           // ← SOLO usa este archivo
      alt="CODEC POS"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
      onError={() => setImgError(true)}
    />
  );
};
```

### Configuración del Builder

```javascript
// /electron/builder-config.js
function resolveIcon() {
  const candidates = [
    path.join(ROOT, 'public', 'logo.png'),  // ← PRIORIDAD 1
    path.join(ROOT, 'public', 'icon.ico'),  // ← PRIORIDAD 2
  ];
  // ...
}
```

---

## ✅ VERIFICACIÓN

### Comprobar que tus logos se usan correctamente:

```bash
# 1. Ejecuta el sistema en desarrollo
npm run dev

# 2. Verifica estos lugares:
#    - Página de login (logo grande)
#    - Dashboard (logo horizontal)
#    - Configuración (logo horizontal)

# 3. Compila el instalador
npm run compile

# 4. Verifica el instalador:
#    - Ícono del .exe
#    - Ícono en menú inicio
#    - Ícono en escritorio
```

---

## 🚫 LO QUE SE ELIMINÓ

### Antes (múltiples fuentes de logos):

```
❌ /electron/assets/icon.png
❌ Logos SVG inline en múltiples archivos
❌ Referencias a logos externos
❌ Múltiples rutas de búsqueda
```

### Ahora (una sola fuente):

```
✅ /public/logo.png          ← ÚNICO logo oficial
✅ /public/icon.ico          ← ÚNICO ícono oficial
✅ SVG de fallback interno   ← Solo si no hay logo.png
```

---

## 🎨 PERSONALIZACIÓN AVANZADA

### Si quieres cambiar el logo en un componente específico:

```tsx
// Opción 1: Cambiar el tamaño
<CodecLogoHorizontal height={60} />

// Opción 2: Usar solo el ícono
<CodecLogoIcon size={80} />

// Opción 3: Logo con efecto glow
<CodecLogoFull size={150} />
```

### Si quieres usar tu propio logo directamente:

```tsx
// Usa la ruta directa
<img src="/logo.png" alt="Mi Logo" className="w-20 h-20" />
```

---

## 📦 RESULTADO FINAL

### Al compilar con tus logos:

```
dist-electron/
  ├── CODECPOS-Setup-2.0.0.exe  ← Con tu logo como ícono
  └── CODECPOS 2.0.0.exe         ← Con tu logo como ícono
```

### Al instalar:

```
C:\Program Files\CODECPOS\
  └── CODECPOS.exe               ← Con tu logo como ícono

Escritorio\
  └── CODECPOS.lnk               ← Acceso directo con tu logo

Menú Inicio\
  └── CODECPOS.lnk               ← Acceso directo con tu logo
```

---

## 🎯 RESUMEN

### Para usar tus logos:

1. **Pon tus archivos en `/public/`:**
   - `logo.png` (512×512 px mínimo)
   - `icon.ico` (256×256 px)

2. **Compila:**
   ```bash
   npm run compile
   ```

3. **¡Listo!** Todo el sistema usará tus logos automáticamente.

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Mi logo no aparece:

1. Verifica que el archivo se llama exactamente `logo.png`
2. Verifica que está en `/public/logo.png`
3. Verifica que tiene transparencia (PNG)
4. Recarga el navegador (Ctrl + F5)

### El instalador no usa mi logo:

1. Verifica que tienes `icon.ico` en `/public/`
2. Limpia y recompila:
   ```bash
   npm run clean
   npm run compile
   ```

### Veo el SVG en lugar de mi logo:

- Esto es normal si `logo.png` no existe
- Pon tu `logo.png` en `/public/` y recarga

---

**¡Ahora el sistema está 100% listo para usar TUS logos!** 🎉
