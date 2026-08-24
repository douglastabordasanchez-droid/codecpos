# 🚀 INSTRUCCIONES RÁPIDAS DE COMPILACIÓN - CODEC POS v2.0

## ⚡ Compilación Express (3 pasos)

### 1️⃣ Preparar Logo (Opcional)
```bash
# Copiar tu logo.png (1024×1024, transparente) a:
cp /ruta/a/tu/logo.png public/logo.png
```

### 2️⃣ Compilar Aplicación React
```bash
npm run build
```

### 3️⃣ Generar Instalador Windows
```bash
npm run electron:build
```

**✅ LISTO! Archivos generados en `/dist-electron/`:**
- `CODECPOS-Setup-2.0.0.exe` ← Instalador profesional
- `CODECPOS-2.0.0-portable.exe` ← Versión portable

---

## 📦 Distribuir a Clientes

### Opción A: Instalador (Recomendado)
```
1. Enviar: CODECPOS-Setup-2.0.0.exe
2. Cliente ejecuta el instalador
3. Sigue el asistente (2 clicks)
4. ✅ Aplicación instalada en su PC
5. Cliente puede eliminar el instalador
```

### Opción B: Portable
```
1. Enviar: CODECPOS-2.0.0-portable.exe
2. Cliente ejecuta directamente
3. ✅ No requiere instalación
```

---

## 🎨 Personalizar Logo

### Sin Recompilar:
```
❌ No es posible cambiar el logo sin recompilar
```

### Recompilar con Nuevo Logo:
```bash
# 1. Reemplazar logo:
cp nuevo-logo.png public/logo.png

# 2. Limpiar compilación anterior:
rm -rf dist/
rm -rf dist-electron/

# 3. Recompilar:
npm run build
npm run electron:build
```

---

## 🔧 Comandos Útiles

### Desarrollo Local:
```bash
npm run dev              # Iniciar en modo desarrollo (http://localhost:5173)
npm run dev:electron     # Iniciar Electron en desarrollo
```

### Limpieza:
```bash
rm -rf dist/                              # Limpiar build de React
rm -rf dist-electron/                     # Limpiar instaladores
rm -rf node_modules/.cache/electron-builder  # Limpiar cache
```

### Verificación:
```bash
ls public/logo.png       # Verificar logo existe
cat package.json | grep version  # Ver versión actual
```

---

## ⚠️ Solución de Problemas

### Error: "Cannot find module 'xxx'"
```bash
rm -rf node_modules/
npm install
```

### Error: "Vite build failed"
```bash
rm -rf dist/
npm run build
```

### Error: "electron-builder failed"
```bash
rm -rf dist-electron/
rm -rf node_modules/.cache/electron-builder
npm run electron:build
```

### Logo no aparece en instalador:
```bash
# Verificar que logo.png existe:
ls public/logo.png

# Limpiar y recompilar:
rm -rf dist-electron/
npm run electron:build
```

---

## 📊 Tiempos Estimados

```
npm run build           → 30-60 segundos
npm run electron:build  → 2-5 minutos

Total: ~3-6 minutos
```

---

## ✅ Checklist Pre-Compilación

- [ ] Logo personalizado en `/public/logo.png`
- [ ] Versión actualizada en `/package.json`
- [ ] `npm install` ejecutado sin errores
- [ ] `npm run build` completa exitosamente
- [ ] `npm run electron:build` genera instalador
- [ ] Probar instalador en PC de prueba

---

## 🎯 Resultado Final

```
📂 dist-electron/
  ├── CODECPOS-Setup-2.0.0.exe     (Instalador NSIS - ~150-200 MB)
  ├── CODECPOS-2.0.0-portable.exe  (Portable - ~150-200 MB)
  └── win-unpacked/                (Archivos descomprimidos)
```

---

**© 2026 CODEC POS v2.0 • Sistema POS Profesional**
