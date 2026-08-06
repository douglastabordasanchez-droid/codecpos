@echo off
cls
echo.
echo ============================================
echo  CODEC POS - CREAR INSTALADOR
echo ============================================
echo.
echo Tiempo estimado: 20 minutos
echo NO cierres esta ventana
echo.
pause

cd /d %~dp0

echo.
echo [1/6] Verificando Node.js...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js NO instalado
    echo Descarga: https://nodejs.org/
    pause
    exit /b 1
)
echo OK
pause

echo.
echo [2/6] Verificando npm...
npm --version
if %errorlevel% neq 0 (
    echo ERROR: npm NO disponible
    pause
    exit /b 1
)
echo OK
pause

echo.
echo [3/6] Verificando dependencias...
if not exist node_modules (
    echo Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR en instalacion
        pause
        exit /b 1
    )
)
echo OK
pause

echo.
echo [4/6] Limpiando carpetas...
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron
echo OK
pause

echo.
echo [5/6] Construyendo interfaz...
echo Ejecutando: npm run build
npm run build
if %errorlevel% neq 0 (
    echo ERROR en build
    pause
    exit /b 1
)
echo OK
pause

echo.
echo [6/6] Creando instalador...
echo IMPORTANTE: Esto tarda 15-20 minutos
echo NO cierres esta ventana
echo.
npx electron-builder --win nsis --config electron/builder-config.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR en electron-builder
    echo.
    echo Soluciones:
    echo 1. Desactiva Windows Defender
    echo 2. Ejecuta como Administrador
    echo 3. Reinicia el PC
    pause
    exit /b 1
)

echo.
echo Buscando instalador...
if exist dist-electron\CODECPOS-Setup-2.0.0.exe (
    echo.
    echo ============================================
    echo  EXITO - INSTALADOR CREADO
    echo ============================================
    echo.
    echo Archivo: dist-electron\CODECPOS-Setup-2.0.0.exe
    echo.
    start explorer dist-electron
) else (
    if exist dist-electron\nsis\CODECPOS-Setup-2.0.0.exe (
        echo.
        echo ============================================
        echo  EXITO - INSTALADOR CREADO
        echo ============================================
        echo.
        echo Archivo: dist-electron\nsis\CODECPOS-Setup-2.0.0.exe
        echo.
        start explorer dist-electron\nsis
    ) else (
        echo ERROR: No se encontro el instalador
    )
)

echo.
pause
