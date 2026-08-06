#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 VERIFICACIÓN DEL LOGO - CODEC POS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar si existe el logo
echo "📂 Verificando archivo logo.png..."
if [ -f "public/logo.png" ]; then
    echo -e "${GREEN}✅ Archivo encontrado: public/logo.png${NC}"

    # Obtener tamaño del archivo
    SIZE=$(ls -lh public/logo.png | awk '{print $5}')
    echo -e "   📏 Tamaño: ${SIZE}"

    # Obtener dimensiones (requiere ImageMagick - opcional)
    if command -v identify &> /dev/null; then
        DIMENSIONS=$(identify -format "%wx%h" public/logo.png 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "   📐 Dimensiones: ${DIMENSIONS}"

            # Verificar tamaño mínimo recomendado
            WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
            if [ $WIDTH -lt 512 ]; then
                echo -e "${YELLOW}⚠️  ADVERTENCIA: El logo es muy pequeño. Recomendado: mínimo 512x512px${NC}"
            else
                echo -e "${GREEN}✅ Dimensiones óptimas${NC}"
            fi
        fi
    fi
else
    echo -e "${RED}❌ ERROR: No se encontró public/logo.png${NC}"
    echo -e "${YELLOW}   Por favor, coloca tu logo en la carpeta public/${NC}"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Verificando configuración de archivos..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Archivos a verificar
FILES=(
    "src/app/components/shared/CodecLogos.tsx"
    "src/app/components/pos/POSLayoutSidebar.tsx"
    "src/app/components/pos/TicketReceipt.tsx"
    "src/app/components/auth/WelcomePage.tsx"
    "src/app/pages/SetupWizard.tsx"
)

ERRORS=0

for FILE in "${FILES[@]}"; do
    if [ -f "$FILE" ]; then
        # Verificar que usa import logoImage
        if grep -q "import logoImage from '/logo.png'" "$FILE"; then
            echo -e "${GREEN}✅ $FILE - Configurado correctamente${NC}"
        else
            echo -e "${RED}❌ $FILE - NO usa import correcto${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "${RED}❌ $FILE - Archivo no encontrado${NC}"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ VERIFICACIÓN EXITOSA${NC}"
    echo -e "${GREEN}   Tu logo aparecerá en todo el sistema cuando compiles.${NC}"
    echo ""
    echo "📦 Para compilar, ejecuta:"
    echo "   npm run build"
    echo "   npm run electron:build"
else
    echo -e "${RED}❌ VERIFICACIÓN FALLIDA${NC}"
    echo -e "${RED}   Se encontraron $ERRORS error(es).${NC}"
    echo ""
    echo "📖 Lee las instrucciones en: INSTRUCCIONES_LOGO_PERSONALIZADO.md"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 UBICACIONES DONDE APARECERÁ TU LOGO:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  🔐 Login y Bienvenida"
echo "  📱 Menú Lateral (Sidebar)"
echo "  📊 Dashboard"
echo "  🧾 Tirillas de Venta"
echo "  ⚙️  Footer de Configuración"
echo "  👥 Panel de Admin Clientes"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Codec Studio - www.codecstudio.online"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
