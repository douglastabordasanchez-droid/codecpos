@echo off
cls
echo.
echo ============================================
echo  CODEC POS - VERIFICAR PREREQUISITOS
echo ============================================
echo.

cd /d %~dp0

set OK=1

echo [1/5] Node.js...
node --version
if %errorlevel% neq 0 (
    echo ERROR - Node.js NO instalado
    echo Descarga: https://nodejs.org/
    set OK=0
) else (
    echo OK
)
echo.

echo [2/5] npm...
npm --version
if %errorlevel% neq 0 (
    echo ERROR - npm NO disponible
    set OK=0
) else (
    echo OK
)
echo.

echo [3/5] package.json...
if not exist package.json (
    echo ERROR - package.json NO encontrado
    set OK=0
) else (
    echo OK
)
echo.

echo [4/5] node_modules...
if not exist node_modules (
    echo FALTA - Ejecuta INSTALAR.bat
    set OK=0
) else (
    echo OK
)
echo.

echo [5/5] builder-config.js...
if not exist electron\builder-config.js (
    echo ERROR - builder-config.js NO encontrado
    set OK=0
) else (
    echo OK
)
echo.

echo ============================================
if %OK%==1 (
    echo  TODO LISTO PARA COMPILAR
    echo.
    echo Ahora ejecuta: COMPILAR.bat
) else (
    echo  HAY ERRORES
    echo.
    echo Si falta Node.js: https://nodejs.org/
    echo Si falta node_modules: INSTALAR.bat
)
echo ============================================
echo.
pause
