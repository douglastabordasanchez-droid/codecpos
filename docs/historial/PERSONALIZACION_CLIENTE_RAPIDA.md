# 🎨 PERSONALIZACIÓN POR CLIENTE - GUÍA RÁPIDA

## ⚡ Proceso de 3 Pasos para Personalizar CODEC POS

---

## 📋 PASO 1: Preparar Logo del Cliente

### Requisitos del Logo:
- ✅ **Formato:** PNG con transparencia
- ✅ **Tamaño:** 1024×1024 píxeles (mínimo 512×512)
- ✅ **Fondo:** Transparente
- ✅ **Calidad:** Alta resolución
- ✅ **Colores:** Preferible usar colores corporativos del cliente

### Herramientas Recomendadas:
1. **Quitar fondo:** https://remove.bg
2. **Redimensionar:** https://onlinepngtools.com/resize-png
3. **Optimizar:** https://tinypng.com

### Plantilla de Nombres:
```
Cliente_[NombreNegocio]_Logo.png
```

**Ejemplo:**
- `Cliente_MiniMercadoLosAndes_Logo.png`
- `Cliente_TiendaDonJuan_Logo.png`
- `Cliente_SuperEconomico_Logo.png`

---

## 📦 PASO 2: Instalar Logo en el Proyecto

### Opción A: Reemplazo Manual (Recomendado)

```bash
# 1. Navega a la carpeta del proyecto
cd codecpos

# 2. Copia el logo del cliente a public/
cp ~/Downloads/Logo_Cliente.png public/logo.png

# 3. Verifica que existe
ls -lh public/logo.png
```

### Opción B: Script Automatizado

Crea un script `cambiar-logo.sh`:

```bash
#!/bin/bash
# Script para cambiar logo de cliente

if [ -z "$1" ]; then
  echo "❌ Error: Debes proporcionar la ruta del logo"
  echo "Uso: ./cambiar-logo.sh /ruta/al/logo.png"
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "❌ Error: El archivo $1 no existe"
  exit 1
fi

# Copiar logo
cp "$1" public/logo.png
echo "✅ Logo actualizado correctamente"
echo "📁 Ubicación: public/logo.png"

# Verificar tamaño
file public/logo.png
```

**Uso:**
```bash
chmod +x cambiar-logo.sh
./cambiar-logo.sh ~/Desktop/LogoCliente.png
```

---

## 🔨 PASO 3: Compilar Instalador Personalizado

### Compilación Completa:

```bash
# 1. Limpiar builds anteriores
npm run compile:clean

# 2. Compilar instalador con logo personalizado
# Este proceso toma 3-5 minutos
npm run electron:build
```

### Compilación Rápida (Solo para pruebas):

```bash
# Solo empaqueta sin instalador (2 minutos)
npm run pack
```

---

## 📦 PASO 4: Ubicar y Entregar Instaladores

### Archivos Generados:

```
dist-electron/
├── CODECPOS-Setup-2.0.0.exe       ← 📦 INSTALADOR PRINCIPAL
├── CODECPOS-2.0.0-portable.exe    ← 🚀 VERSIÓN PORTABLE
└── win-unpacked/                  ← 📂 Archivos desempaquetados (ignorar)
```

### Renombrar para Cliente:

```bash
# Renombrar instalador con nombre del cliente
mv dist-electron/CODECPOS-Setup-2.0.0.exe \
   "CODECPOS_Cliente_MiniMercadoLosAndes_v2.0.0.exe"

# Renombrar portable
mv dist-electron/CODECPOS-2.0.0-portable.exe \
   "CODECPOS_Cliente_MiniMercadoLosAndes_v2.0.0_Portable.exe"
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

Antes de entregar al cliente:

- [ ] ✅ Logo personalizado visible en instalador (.exe)
- [ ] ✅ Logo personalizado visible en acceso directo
- [ ] ✅ Instalador ejecuta correctamente
- [ ] ✅ Logo aparece en pantalla de login
- [ ] ✅ Logo aparece en sidebar del POS
- [ ] ✅ Logo aparece en configuración
- [ ] ✅ Información de Codec Studio visible en instalador
- [ ] ✅ URL https://codecstudio.online/ presente

---

## 🔍 VERIFICACIÓN RÁPIDA

### Prueba Local (Antes de Entregar):

```bash
# 1. Instalar en máquina virtual o PC de prueba
# 2. Ejecutar CODECPOS-Setup-2.0.0.exe
# 3. Verificar:
#    ✅ Ícono del instalador muestra logo del cliente
#    ✅ Acceso directo tiene logo del cliente
#    ✅ Aplicación abre con logo del cliente
#    ✅ Todas las pantallas usan logo personalizado
```

### Verificación de Logo en Runtime:

1. **Abrir aplicación instalada**
2. **Pantalla Login:** Debe mostrar logo del cliente (64px)
3. **Sidebar:** Debe mostrar logo del cliente (48px circular)
4. **Configuración:** Debe mostrar logo horizontal con texto

---

## 📝 PLANTILLA DE ENTREGA AL CLIENTE

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CODEC POS v2.0 - Instalador Personalizado
  Cliente: [Nombre del Negocio]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 ARCHIVOS INCLUIDOS:
  • CODECPOS-Setup-2.0.0.exe (Instalador profesional)
  • CODECPOS-Portable.exe (Versión sin instalación)
  • Manual_Usuario.pdf
  • Guia_Instalacion.pdf

🖼️ PERSONALIZACIÓN:
  ✅ Logo de su negocio integrado
  ✅ Colores corporativos aplicados
  ✅ Sistema 100% offline (sin costos recurrentes)

📋 INSTRUCCIONES DE INSTALACIÓN:
  1. Ejecutar CODECPOS-Setup-2.0.0.exe
  2. Seguir asistente de instalación
  3. Aceptar términos de licencia
  4. Seleccionar carpeta de instalación
  5. ¡Listo! Aplicación instalada permanentemente

💻 REQUISITOS DEL SISTEMA:
  • Windows 10/11 (64 bits)
  • 4 GB RAM mínimo
  • 500 MB espacio en disco
  • Conexión USB (para impresoras térmicas)

📞 SOPORTE TÉCNICO:
  • Web: https://codecstudio.online/
  • Email: contacto@codecstudio.com
  • WhatsApp: [Tu número]

🔐 LICENCIA:
  Ver archivo LICENSE.txt incluido en el instalador

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Desarrollado por Codec Studio
  © 2026 Todos los derechos reservados
  https://codecstudio.online/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🚀 AUTOMATIZACIÓN AVANZADA

### Script de Personalización Completa:

Crea `personalizar-cliente.sh`:

```bash
#!/bin/bash
# Script de personalización automática para clientes

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CODEC POS - Personalizador de Cliente"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Solicitar datos
read -p "📝 Nombre del cliente: " CLIENTE_NOMBRE
read -p "📁 Ruta del logo (PNG): " LOGO_PATH

# Validar logo
if [ ! -f "$LOGO_PATH" ]; then
  echo "❌ Error: Logo no encontrado en $LOGO_PATH"
  exit 1
fi

# Verificar que es PNG
if [[ ! "$LOGO_PATH" =~ \.png$ ]]; then
  echo "⚠️  Advertencia: El archivo no es PNG"
  read -p "¿Continuar? (s/n): " CONTINUAR
  if [ "$CONTINUAR" != "s" ]; then
    exit 1
  fi
fi

echo ""
echo "🔄 Procesando..."
echo ""

# 1. Copiar logo
echo "📋 [1/4] Copiando logo..."
cp "$LOGO_PATH" public/logo.png

# 2. Limpiar builds anteriores
echo "🧹 [2/4] Limpiando builds anteriores..."
rm -rf dist/ dist-electron/

# 3. Compilar
echo "🔨 [3/4] Compilando instalador (esto puede tardar 3-5 minutos)..."
npm run electron:build

# 4. Renombrar
echo "📦 [4/4] Renombrando archivos..."
NOMBRE_LIMPIO=$(echo "$CLIENTE_NOMBRE" | tr -d ' ' | tr '[:upper:]' '[:lower:]')
mv dist-electron/CODECPOS-Setup-2.0.0.exe \
   "dist-electron/CODECPOS_${NOMBRE_LIMPIO}_v2.0.0.exe"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ INSTALADOR PERSONALIZADO CREADO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Archivo: dist-electron/CODECPOS_${NOMBRE_LIMPIO}_v2.0.0.exe"
echo "💾 Tamaño: $(du -h dist-electron/CODECPOS_${NOMBRE_LIMPIO}_v2.0.0.exe | cut -f1)"
echo ""
echo "📋 Próximos pasos:"
echo "  1. Probar instalador en PC limpia"
echo "  2. Verificar logo personalizado"
echo "  3. Entregar al cliente"
echo ""
```

**Uso:**
```bash
chmod +x personalizar-cliente.sh
./personalizar-cliente.sh
```

---

## 📂 ORGANIZACIÓN DE CLIENTES

### Estructura Recomendada:

```
codecpos-builds/
├── clientes/
│   ├── minimercado-los-andes/
│   │   ├── logo.png
│   │   ├── CODECPOS_minimercado_los_andes_v2.0.0.exe
│   │   └── notas.txt
│   ├── tienda-don-juan/
│   │   ├── logo.png
│   │   ├── CODECPOS_tienda_don_juan_v2.0.0.exe
│   │   └── notas.txt
│   └── super-economico/
│       ├── logo.png
│       ├── CODECPOS_super_economico_v2.0.0.exe
│       └── notas.txt
└── plantillas/
    ├── logo-template.psd
    └── manual-instalacion.pdf
```

---

## 💡 TIPS PROFESIONALES

### 1. **Mantén un Registro:**
```
clientes.csv:
Nombre,Fecha,Version,Logo,Instalador
MiniMercado Los Andes,2026-03-06,2.0.0,✅,✅
Tienda Don Juan,2026-03-05,2.0.0,✅,✅
```

### 2. **Backup de Logos:**
```bash
# Crear backup de logos antes de cada build
mkdir -p backups/logos/$(date +%Y%m%d)
cp public/logo.png backups/logos/$(date +%Y%m%d)/logo_backup.png
```

### 3. **Versionado:**
```bash
# Crear tag de git por cliente
git tag -a "cliente-minimercado-v2.0.0" -m "Build para MiniMercado Los Andes"
git push origin --tags
```

---

## 🔐 SEGURIDAD

### ⚠️ IMPORTANTE:

- ✅ **NO** incluir logos de clientes en el repositorio Git
- ✅ **SÍ** mantener logos en carpeta externa segura
- ✅ **NO** compartir instaladores entre clientes diferentes
- ✅ **SÍ** generar instalador único por cliente

---

## 📞 SOPORTE

**Para problemas con la personalización:**
- 📧 Email: contacto@codecstudio.com
- 🌐 Web: https://codecstudio.online/
- 📚 Documentación completa: Ver `/README_LOGOS_INSTALACION.md`

---

**© 2026 CODEC POS v2.0 • Codec Studio**  
Desarrollado con ❤️ por Codec Studio  
https://codecstudio.online/
