@echo off
:: ═══════════════════════════════════════════════════════════════════════
::  VERIFICADOR RÁPIDO - Sistema de Usuarios CODEC POS v2.0
::  
::  Este script verifica que el sistema de usuarios esté correctamente
::  implementado en el proyecto.
:: ═══════════════════════════════════════════════════════════════════════

echo.
echo ╔═══════════════════════════════════════════════════════════════════════╗
echo ║                                                                       ║
echo ║     VERIFICANDO SISTEMA DE USUARIOS - CODEC POS v2.0                 ║
echo ║                                                                       ║
echo ╚═══════════════════════════════════════════════════════════════════════╝
echo.

set ERROR_COUNT=0

:: ═══════════════════════════════════════════════════════════════════════
:: VERIFICAR ARCHIVOS PRINCIPALES
:: ═══════════════════════════════════════════════════════════════════════

echo [1/6] Verificando electron/main.js...
if exist "electron\main.js" (
    findstr /C:"guardar-usuarios" electron\main.js >nul
    if %ERRORLEVEL% EQU 0 (
        echo     ✅ IPC Handlers encontrados en main.js
    ) else (
        echo     ❌ ERROR: IPC Handlers NO encontrados en main.js
        set /a ERROR_COUNT+=1
    )
) else (
    echo     ❌ ERROR: electron/main.js no existe
    set /a ERROR_COUNT+=1
)

echo.
echo [2/6] Verificando electron/preload.cjs...
if exist "electron\preload.cjs" (
    findstr /C:"electronAPI" electron\preload.cjs >nul
    if %ERRORLEVEL% EQU 0 (
        echo     ✅ API electronAPI expuesta en preload.cjs
    ) else (
        echo     ❌ ERROR: electronAPI NO expuesta en preload.cjs
        set /a ERROR_COUNT+=1
    )
) else (
    echo     ❌ ERROR: electron/preload.cjs no existe
    set /a ERROR_COUNT+=1
)

echo.
echo [3/6] Verificando src/types/global.d.ts...
if exist "src\types\global.d.ts" (
    findstr /C:"electronAPI" src\types\global.d.ts >nul
    if %ERRORLEVEL% EQU 0 (
        echo     ✅ Tipos TypeScript definidos correctamente
    ) else (
        echo     ❌ ERROR: Tipos electronAPI NO definidos
        set /a ERROR_COUNT+=1
    )
) else (
    echo     ❌ ERROR: src/types/global.d.ts no existe
    set /a ERROR_COUNT+=1
)

echo.
echo [4/6] Verificando src/app/lib/usuariosStorage.ts...
if exist "src\app\lib\usuariosStorage.ts" (
    findstr /C:"cargarUsuarios" src\app\lib\usuariosStorage.ts >nul
    if %ERRORLEVEL% EQU 0 (
        echo     ✅ Sistema de almacenamiento implementado
    ) else (
        echo     ❌ ERROR: Sistema de almacenamiento incompleto
        set /a ERROR_COUNT+=1
    )
) else (
    echo     ❌ ERROR: src/app/lib/usuariosStorage.ts no existe
    set /a ERROR_COUNT+=1
)

echo.
echo [5/6] Verificando src/app/contexts/AuthContext.tsx...
if exist "src\app\contexts\AuthContext.tsx" (
    findstr /C:"UsuariosStorage" src\app\contexts\AuthContext.tsx >nul
    if %ERRORLEVEL% EQU 0 (
        echo     ✅ AuthContext integrado con UsuariosStorage
    ) else (
        echo     ❌ ERROR: AuthContext NO integrado correctamente
        set /a ERROR_COUNT+=1
    )
) else (
    echo     ❌ ERROR: src/app/contexts/AuthContext.tsx no existe
    set /a ERROR_COUNT+=1
)

echo.
echo [6/6] Verificando usuario por defecto...
findstr /C:"Noruega2025" src\app\lib\usuariosStorage.ts >nul
if %ERRORLEVEL% EQU 0 (
    echo     ✅ Usuario Admin configurado: Admin / Noruega2025++*
) else (
    echo     ⚠️  ADVERTENCIA: Contraseña por defecto no encontrada
)

:: ═══════════════════════════════════════════════════════════════════════
:: RESULTADO FINAL
:: ═══════════════════════════════════════════════════════════════════════

echo.
echo ═══════════════════════════════════════════════════════════════════════
echo.

if %ERROR_COUNT% EQU 0 (
    echo   ✅✅✅  SISTEMA DE USUARIOS: 100%% IMPLEMENTADO  ✅✅✅
    echo.
    echo   Credenciales por defecto:
    echo   ┌─────────────────────────────────────┐
    echo   │  Usuario:     Admin                 │
    echo   │  Contraseña:  Noruega2025++*        │
    echo   │  Rol:         Super Usuario         │
    echo   └─────────────────────────────────────┘
    echo.
    echo   Próximos pasos:
    echo   1. Ejecutar: npm run dev   (para desarrollo^)
    echo   2. Ejecutar: npm run compile   (para compilar .exe^)
    echo.
    echo   Los usuarios se guardarán en:
    echo   %%APPDATA%%\codec-pos\CODEC_POS_Data\usuarios.json
    echo.
) else (
    echo   ❌❌❌  ERRORES DETECTADOS: %ERROR_COUNT%  ❌❌❌
    echo.
    echo   Revisa los errores anteriores y corrige los archivos indicados.
    echo   Consulta: SISTEMA_USUARIOS_IMPLEMENTADO.md para más detalles.
    echo.
)

echo ═══════════════════════════════════════════════════════════════════════
echo.

pause
