@echo off
setlocal EnableExtensions
title Respaldo CODECPOS

echo ==============================================
echo      RESPALDO DE DATOS - CODECPOS
echo ==============================================
echo.

set "SRC=%APPDATA%\codecpos\CODEC_POS_Data"
set "DEST_BASE=%USERPROFILE%\Desktop\CODECPOS_RESPALDO"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "DEST=%DEST_BASE%_%STAMP%"

if not exist "%SRC%" (
  echo [ERROR] No se encontro la carpeta de datos:
  echo %SRC%
  echo.
  echo Asegurate de haber iniciado CODECPOS al menos una vez en este equipo.
  pause
  exit /b 1
)

mkdir "%DEST%" >nul 2>&1

echo Copiando datos desde:
echo %SRC%
echo hacia:
echo %DEST%
echo.

robocopy "%SRC%" "%DEST%\CODEC_POS_Data" /E /R:2 /W:1 >nul

if errorlevel 8 (
  echo [ERROR] Ocurrio un problema durante la copia.
  pause
  exit /b 1
)

echo [OK] Respaldo completado correctamente.
echo Carpeta de respaldo:
echo %DEST%
echo.
pause
exit /b 0
