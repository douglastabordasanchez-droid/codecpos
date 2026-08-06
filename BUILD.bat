@echo off
chcp 65001 >nul
cls
color 0A
echo.
echo ═══════════════════════════════════════════════════════════
echo   CODEC POS v2.0 - CREAR INSTALADOR PROFESIONAL
echo ═══════════════════════════════════════════════════════════
echo.

cd /d "%~dp0"

echo [PASO 1/5] Verificando Node.js y npm...
echo.
node --version || (
    echo ❌ ERROR: Node.js NO instalado
    echo.
    echo Descarga: https://nodejs.org/
    pause
    exit /b 1
)
npm --version || (
    echo ❌ ERROR: npm NO disponible
    pause
    exit /b 1
)
echo ✅ Node.js y npm OK
echo.
pause

echo [PASO 2/5] Verificando node_modules...
echo.
if not exist "node_modules\" (
    echo ⚠️  node_modules NO encontrado. Instalando...
    echo.
    npm install
    if errorlevel 1 (
        echo ❌ ERROR instalando dependencias
        pause
        exit /b 1
    )
)
echo ✅ Dependencias OK
echo.
pause

echo [PASO 3/5] Limpiando carpetas anteriores...
echo.
if exist "dist\" (
    rmdir /s /q "dist"
    echo    ✓ dist eliminado
)
if exist "dist-electron\" (
    rmdir /s /q "dist-electron"
    echo    ✓ dist-electron eliminado
)
echo ✅ Limpieza completa
echo.
pause

echo [PASO 4/5] Construyendo interfaz con Vite...
echo.
echo ⏳ Esto tarda 2-5 minutos...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo ❌ ERROR en build
    pause
    exit /b 1
)
echo.
echo ✅ Interfaz construida
echo.
pause

echo [PASO 5/5] Creando instalador con electron-builder...
echo.
echo ═══════════════════════════════════════════════════════════
echo   IMPORTANTE: Este proceso tarda 15-20 minutos
echo   NO cierres esta ventana
echo   Desactiva Windows Defender antes si no lo hiciste
echo ═══════════════════════════════════════════════════════════
echo.
pause
echo.
echo ⏳ Ejecutando electron-builder...
echo.

call npx electron-builder --win nsis --config electron/builder-config.js

if errorlevel 1 (
    echo.
    echo ═══════════════════════════════════════════════════════════
    echo   ❌ ERROR en electron-builder
    echo ═══════════════════════════════════════════════════════════
    echo.
    echo Soluciones:
    echo   1. Desactiva Windows Defender COMPLETAMENTE
    echo   2. Ejecuta este bat como Administrador
    echo   3. Libera espacio en disco (mínimo 2 GB)
    echo   4. Reinicia Windows y vuelve a intentar
    echo.
    pause
    exit /b 1
)

echo.
echo ═══════════════════════════════════════════════════════════
echo   ✅ COMPILACION EXITOSA
echo ═══════════════════════════════════════════════════════════
echo.
echo Buscando instalador...
echo.

if exist "dist-electron\CODECPOS-Setup-2.0.0.exe" (
    echo ✅ INSTALADOR ENCONTRADO:
    echo    📁 dist-electron\CODECPOS-Setup-2.0.0.exe
    echo.
    start explorer "dist-electron"
    goto :success
)

if exist "dist-electron\nsis\CODECPOS-Setup-2.0.0.exe" (
    echo ✅ INSTALADOR ENCONTRADO:
    echo    📁 dist-electron\nsis\CODECPOS-Setup-2.0.0.exe
    echo.
    start explorer "dist-electron\nsis"
    goto :success
)

echo ⚠️  No se encontró el instalador
echo    Revisa los mensajes arriba para ver errores
echo.
pause
exit /b 1

:success
echo.
echo ═══════════════════════════════════════════════════════════
echo   🎉 PROCESO COMPLETADO
echo ═══════════════════════════════════════════════════════════
echo.
echo Ya puedes:
echo   • Copiar el instalador a USB
echo   • Enviarlo por correo/WhatsApp
echo   • Ejecutarlo en cualquier PC Windows
echo.
pause
