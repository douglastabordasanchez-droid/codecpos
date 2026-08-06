@echo off
cls
echo.
echo COMPILACION RAPIDA - Sin instalador, solo empaquetado
echo.
pause

cd /d "%~dp0"

echo Limpiando...
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron

echo Construyendo interfaz...
call npm run build
if errorlevel 1 (
    echo ERROR
    pause
    exit /b 1
)

echo Empaquetando...
call npm run pack
if errorlevel 1 (
    echo ERROR
    pause
    exit /b 1
)

echo.
echo LISTO - Revisa carpeta dist-electron
echo.
start explorer dist-electron
pause
