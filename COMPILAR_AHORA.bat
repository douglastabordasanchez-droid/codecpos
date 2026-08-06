@echo off
cls
title CODEC POS - Compilando Instalador
color 0A

echo.
echo ==========================================
echo   CODEC POS v2.0
echo   Creando instalador profesional
echo ==========================================
echo.
echo Tiempo estimado: 20 minutos
echo.
pause

cd /d "%~dp0"

echo.
echo Iniciando compilacion...
echo.

npm run compile

if %errorlevel% equ 0 (
    echo.
    echo ==========================================
    echo   EXITO - Compilacion completada
    echo ==========================================
    echo.
    echo Abriendo carpeta con el instalador...
    start explorer dist-electron
) else (
    echo.
    echo ==========================================
    echo   ERROR - Algo salio mal
    echo ==========================================
    echo.
    echo Soluciones:
    echo - Desactiva Windows Defender
    echo - Ejecuta como Administrador
    echo - Verifica que tengas espacio en disco
    echo.
)

echo.
pause
