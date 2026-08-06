@echo off
chcp 65001 >nul
cls
color 0A
echo.
echo ═══════════════════════════════════════════════════════════
echo   CODEC POS v2.0 - COMPILACION LIMPIA
echo ═══════════════════════════════════════════════════════════
echo.
echo Este script:
echo   1. Limpia carpetas anteriores
echo   2. Construye interfaz desde cero
echo   3. Crea instalador profesional
echo.
echo Tiempo: 20-25 minutos
echo.
pause

cd /d "%~dp0"

echo.
echo ════════════════════════════════════════════════════════════
echo   PASO 1: Limpiando carpetas anteriores
echo ════════════════════════════════════════════════════════════
echo.

call npm run clean

if errorlevel 1 (
    echo.
    echo ⚠️  Advertencia: Error en limpieza (continuando...)
    echo.
)

echo.
echo ════════════════════════════════════════════════════════════
echo   PASO 2: Verificando prerequisitos
echo ════════════════════════════════════════════════════════════
echo.

node --version || (
    echo ❌ ERROR: Node.js NO instalado
    echo Descarga: https://nodejs.org/
    pause
    exit /b 1
)

npm --version || (
    echo ❌ ERROR: npm NO disponible
    pause
    exit /b 1
)

echo ✅ Prerequisitos OK
echo.
pause

echo.
echo ════════════════════════════════════════════════════════════
echo   PASO 3: Compilando instalador
echo ════════════════════════════════════════════════════════════
echo.
echo ⚠️  IMPORTANTE:
echo    - Esto tarda 20-25 minutos
echo    - NO cierres esta ventana
echo    - Asegurate que Windows Defender este DESACTIVADO
echo.
pause

call npm run compile

if errorlevel 1 (
    echo.
    echo ════════════════════════════════════════════════════════════
    echo   ❌ ERROR EN COMPILACION
    echo ════════════════════════════════════════════════════════════
    echo.
    echo Soluciones:
    echo   1. DESACTIVA Windows Defender COMPLETAMENTE
    echo   2. Ejecuta este .bat como Administrador
    echo   3. Libera espacio en disco (minimo 3 GB)
    echo   4. Cierra programas pesados
    echo   5. Reinicia Windows e intenta de nuevo
    echo.
    echo Si el error persiste, usa VS Code:
    echo   1. Abre VS Code
    echo   2. Abre terminal (Ctrl + ñ)
    echo   3. Ejecuta: npm run compile
    echo.
    pause
    exit /b 1
)

echo.
echo ════════════════════════════════════════════════════════════
echo   ✅ COMPILACION EXITOSA
echo ════════════════════════════════════════════════════════════
echo.
echo Buscando instalador...
echo.

if exist "dist-electron\CODECPOS-Setup-2.0.0.exe" (
    echo ✅ INSTALADOR CREADO:
    echo    📁 dist-electron\CODECPOS-Setup-2.0.0.exe
    echo.
    echo Abriendo carpeta...
    start explorer "dist-electron"
    goto :success
)

if exist "dist-electron\nsis\CODECPOS-Setup-2.0.0.exe" (
    echo ✅ INSTALADOR CREADO:
    echo    📁 dist-electron\nsis\CODECPOS-Setup-2.0.0.exe
    echo.
    echo Abriendo carpeta...
    start explorer "dist-electron\nsis"
    goto :success
)

echo ⚠️  No se encontro el instalador
echo    Revisa los mensajes de error arriba
echo.
pause
exit /b 1

:success
echo.
echo ════════════════════════════════════════════════════════════
echo   🎉 PROCESO COMPLETADO
echo ════════════════════════════════════════════════════════════
echo.
echo El instalador esta listo para:
echo   • Copiar a USB
echo   • Enviar por correo/WhatsApp
echo   • Ejecutar en cualquier PC Windows 10/11
echo.
echo También se creo version portable:
echo   • CODECPOS 2.0.0.exe (sin instalador)
echo.
pause
