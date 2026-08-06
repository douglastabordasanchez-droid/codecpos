@echo off
cls
echo.
echo ============================================
echo  CODEC POS - INSTALAR DEPENDENCIAS
echo ============================================
echo.
echo Tiempo: 5-10 minutos
echo NO cierres esta ventana
echo.
pause

cd /d %~dp0

echo.
echo Verificando Node.js...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js NO instalado
    echo Descarga: https://nodejs.org/
    pause
    exit /b 1
)
echo OK
echo.

echo Verificando npm...
npm --version
if %errorlevel% neq 0 (
    echo ERROR: npm NO disponible
    pause
    exit /b 1
)
echo OK
echo.

echo Instalando dependencias...
echo Espera 5-10 minutos...
echo.
npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR en instalacion
    echo.
    echo Soluciones:
    echo 1. Verifica internet
    echo 2. Ejecuta como Administrador
    echo 3. Reinicia el PC
    pause
    exit /b 1
)

echo.
echo ============================================
echo  DEPENDENCIAS INSTALADAS
echo ============================================
echo.
echo Ahora ejecuta: VERIFICAR.bat
echo.
pause
