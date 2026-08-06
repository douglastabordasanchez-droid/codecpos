@echo off
setlocal EnableExtensions
title Restaurar datos CODECPOS

echo ==============================================
echo      RESTAURAR DATOS - CODECPOS
echo ==============================================
echo.
echo IMPORTANTE:
echo - Cierra CODECPOS antes de continuar.
echo - Indica la carpeta del respaldo que contiene CODEC_POS_Data.
echo.

set /p BACKUP_PATH=Ruta de la carpeta de respaldo: 

if "%BACKUP_PATH%"=="" (
  echo [ERROR] No ingresaste ninguna ruta.
  pause
  exit /b 1
)

set "SRC=%BACKUP_PATH%\CODEC_POS_Data"
set "DEST=%APPDATA%\codecpos\CODEC_POS_Data"

if not exist "%SRC%" (
  echo [ERROR] No se encontro la carpeta origen:
  echo %SRC%
  echo.
  echo Verifica que elegiste la carpeta correcta del respaldo.
  pause
  exit /b 1
)

mkdir "%DEST%" >nul 2>&1

echo.
echo Restaurando datos desde:
echo %SRC%
echo hacia:
echo %DEST%
echo.

robocopy "%SRC%" "%DEST%" /E /R:2 /W:1 >nul

if errorlevel 8 (
  echo [ERROR] Ocurrio un problema durante la restauracion.
  pause
  exit /b 1
)

echo [OK] Restauracion completada correctamente.
echo Ya puedes abrir CODECPOS e intentar iniciar sesion.
echo.
pause
exit /b 0
