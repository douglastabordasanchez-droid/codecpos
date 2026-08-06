# 📸 INSTRUCCIONES: Cómo Usar Tu Logo Personalizado en CODEC POS

## 🎯 Objetivo
Asegurar que tu logo personalizado aparezca en **TODAS** las partes del sistema cuando compiles a `.exe`, desde el login hasta el footer, **sin que aparezca el logo SVG de fallback**.

---

## 📋 Paso 1: Preparar Tu Logo

### ✅ Requisitos del Logo:

1. **Formato:** PNG (recomendado) o JPG
2. **Tamaño mínimo:** 512 x 512 píxeles (ideal: 1024 x 1024 píxeles)
3. **Fondo:** **TRANSPARENTE** (PNG con canal alpha)
4. **Forma:** Cuadrada o con proporciones similares
5. **Nombre del archivo:** `logo.png` (exactamente así, en minúsculas)

### 💡 Consejos de Diseño:
- ✅ Usa colores que contrasten bien en fondos oscuros Y claros
- ✅ Evita textos muy pequeños (el logo se redimensiona en diferentes tamaños)
- ✅ Si tu logo tiene fondo blanco, conviértelo a **transparente**
- ✅ Asegúrate de que el logo se vea bien en tamaños pequeños (48x48px) y grandes (512x512px)

---

## 📂 Paso 2: Colocar Tu Logo

### 🗂️ Ubicación del archivo:

```
/workspaces/default/code/
├── public/
│   └── logo.png    ← **AQUÍ VA TU LOGO**
├── src/
├── electron/
└── ...
```

### 🔧 Instrucciones:

1. **Elimina el logo actual** (si existe):
   ```bash
   rm public/logo.png
   ```

2. **Copia tu logo personalizado**:
   - Arrastra tu archivo `logo.png` a la carpeta `public/`
   - O usa el comando:
   ```bash
   cp /ruta/a/tu/logo.png public/logo.png
   ```

3. **Verifica que el nombre sea correcto**:
   ```bash
   ls -lh public/logo.png
   ```
   Deberías ver algo como: `-rw-r--r-- 1 user user 45K Apr 8 14:30 public/logo.png`

---

## ✅ Paso 3: Verificar la Configuración

### 🔍 Archivos que YA están configurados:

Estos archivos **ya usan el import correcto** y mostrarán tu logo automáticamente:

#### 1. **Login y Bienvenida:**
- ✅ `src/app/components/auth/LoginPage.tsx`
- ✅ `src/app/components/auth/WelcomePage.tsx`
- ✅ `src/app/pages/SetupWizard.tsx`

#### 2. **Menú Lateral:**
- ✅ `src/app/components/pos/POSLayoutSidebar.tsx`

#### 3. **Dashboard:**
- ✅ `src/app/components/pos/DashboardPOSPage.tsx`

#### 4. **Tirillas de Impresión:**
- ✅ `src/app/components/pos/TicketReceipt.tsx`

#### 5. **Footer de Configuración:**
- ✅ `src/app/components/pos/ConfiguracionPage.tsx`

#### 6. **Sistema de Logos (Core):**
- ✅ `src/app/components/shared/CodecLogos.tsx`

### 🔒 Sistema de Fallback:

Si por alguna razón tu logo no se encuentra, el sistema mostrará automáticamente:
- Un logo SVG con las iniciales "CP" (CODEC POS)
- Esto **solo aparecerá si falta el archivo logo.png**

---

## 🧪 Paso 4: Probar en Desarrollo

### 1. **Inicia el servidor de desarrollo:**
```bash
npm run dev
```

### 2. **Verifica que tu logo aparezca en:**
- ✅ Pantalla de login
- ✅ Pantalla de bienvenida (Setup Wizard)
- ✅ Menú lateral (header del sidebar)
- ✅ Dashboard (esquina superior)
- ✅ Footer de configuración
- ✅ Vista previa de tirilla (si haces una venta de prueba)

### 3. **Prueba el fallback (opcional):**
```bash
# Renombra temporalmente el logo
mv public/logo.png public/logo-backup.png

# Recarga la página - deberías ver el logo SVG "CP"

# Restaura el logo
mv public/logo-backup.png public/logo.png
```

---

## 🏗️ Paso 5: Compilar para Producción (.exe)

### 1. **Verifica que el logo esté en su lugar:**
```bash
ls -lh public/logo.png
```

### 2. **Compila la aplicación:**
```bash
npm run build
npm run electron:build
```

### 3. **Ubicación del .exe compilado:**
```
dist/CODEC POS Setup X.X.X.exe
```

### 4. **Instala y prueba:**
- Instala el `.exe` en una máquina de prueba
- Inicia sesión y verifica que tu logo aparezca en todas las secciones

---

## 🎨 Lugares Donde Aparecerá Tu Logo

| Ubicación | Tamaño | Descripción |
|-----------|--------|-------------|
| **Login** | 64x64 | Logo principal con efecto glow |
| **Bienvenida** | 128x128 | Logo grande con animación |
| **Setup Wizard** | 128x128 | Logo inicial de configuración |
| **Sidebar (expandido)** | 48x48 | Header del menú lateral |
| **Sidebar (colapsado)** | 40x40 | Versión reducida |
| **Dashboard** | 34px height | Logo horizontal con texto |
| **Tirilla de Venta** | Max 120x80 | Logo en facturas impresas |
| **Footer Config** | 40x40 | Logo en footer de configuración |
| **Modal Admin Clientes** | Variable | En el panel de administración |

---

## 🔧 Solución de Problemas

### ❌ Problema: "Veo el logo SVG con 'CP' en lugar de mi logo"

**Causa:** El archivo `logo.png` no existe o no se encuentra.

**Solución:**
1. Verifica que el archivo exista:
   ```bash
   ls -lh public/logo.png
   ```
2. Verifica el nombre (debe ser exactamente `logo.png`)
3. Reinicia el servidor de desarrollo

---

### ❌ Problema: "Mi logo se ve pixelado o borroso"

**Causa:** El logo es muy pequeño.

**Solución:**
1. Usa un logo de al menos 512x512 píxeles
2. Formatos recomendados: PNG con alta resolución
3. Si tu logo es vectorial (SVG), conviértelo a PNG de 1024x1024px

---

### ❌ Problema: "Mi logo tiene un fondo blanco que no quiero"

**Causa:** El logo tiene un fondo opaco en lugar de transparente.

**Solución:**
1. Abre tu logo en un editor de imágenes (Photoshop, GIMP, Figma)
2. Elimina el fondo blanco
3. Exporta como PNG con transparencia activada
4. Reemplaza el archivo en `public/logo.png`

---

### ❌ Problema: "En la compilación .exe no aparece mi logo"

**Causa:** El logo no se incluyó en el bundle.

**Solución:**
1. Asegúrate de que el logo esté en `public/logo.png` **antes** de compilar
2. Limpia y vuelve a compilar:
   ```bash
   npm run clean
   npm run build
   npm run electron:build
   ```

---

## 🎯 Checklist Final

Antes de compilar a producción, verifica:

- [ ] ✅ El archivo `logo.png` existe en `public/`
- [ ] ✅ El logo tiene fondo transparente
- [ ] ✅ El logo tiene al menos 512x512 píxeles
- [ ] ✅ Probaste en desarrollo y se ve correctamente
- [ ] ✅ El logo se ve bien en fondos claros Y oscuros
- [ ] ✅ Todos los archivos de código usan `import logoImage from '/logo.png'`
- [ ] ✅ No hay referencias a rutas absolutas como `src="/logo.png"`

---

## 📞 Soporte

Si después de seguir estas instrucciones tu logo no aparece:

1. **Verifica la consola del navegador** (F12) en modo desarrollo
2. **Busca errores relacionados con** `/logo.png`
3. **Contacta a soporte** con capturas de pantalla

---

## 🎉 ¡Listo!

Siguiendo estos pasos, tu logo personalizado aparecerá en **TODO** el sistema CODEC POS, tanto en desarrollo como en la aplicación compilada (.exe).

**Recuerda:** El logo en `public/logo.png` es la única fuente de verdad. Si ese archivo existe y es válido, se mostrará en todos lados. Si no existe, verás el fallback SVG con "CP".

---

**Desarrollado por Codec Studio**
🌐 https://www.codecstudio.online/
📱 WhatsApp: +57 323 864 6844
