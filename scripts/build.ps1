# CODEC POS v2.0 - Script de Compilación para Windows PowerShell
# Ejecutar como Administrador

param(
    [switch]$Quick,       # Build rápido sin instalador
    [switch]$Clean,       # Limpiar antes de compilar
    [switch]$Verbose      # Logs detallados
)

Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🚀 CODEC POS v2.0 - COMPILADOR AUTOMATIZADO PARA WINDOWS" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`n"

# Función para mostrar encabezados
function Show-Header {
    param([string]$Message)
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkCyan
    Write-Host "  $Message" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkCyan
}

# Función para ejecutar comandos con manejo de errores
function Invoke-Step {
    param(
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "⏳ $Description..." -ForegroundColor Cyan
    
    try {
        if ($Verbose) {
            Invoke-Expression $Command
        } else {
            Invoke-Expression "$Command 2>&1 | Out-Null"
        }
        Write-Host "✅ $Description - COMPLETO`n" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ Error en: $Description" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $false
    }
}

# Verificar permisos de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  ADVERTENCIA: No estás ejecutando como Administrador" -ForegroundColor Yellow
    Write-Host "   El rebuild de serialport puede fallar sin permisos elevados`n" -ForegroundColor Yellow
    
    $continue = Read-Host "¿Continuar de todas formas? (s/n)"
    if ($continue -ne "s") {
        Write-Host "❌ Compilación cancelada" -ForegroundColor Red
        exit 1
    }
}

# ==================== PASO 1: VERIFICACIONES ====================
Show-Header "PASO 1: Verificando Requisitos"

# Verificar Node.js
Write-Host "📌 Verificando Node.js..." -ForegroundColor Blue
try {
    $nodeVersion = node --version
    Write-Host "   Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js no está instalado" -ForegroundColor Red
    Write-Host "   Descarga desde: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Verificar npm
try {
    $npmVersion = npm --version
    Write-Host "   npm: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm no está instalado" -ForegroundColor Red
    exit 1
}

# Verificar Git (opcional)
try {
    $gitVersion = git --version
    Write-Host "   Git: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "   Git: No instalado (opcional)" -ForegroundColor Yellow
}

# Verificar assets
Write-Host "`n📌 Verificando Assets del Instalador..." -ForegroundColor Blue

$assetsToCheck = @{
    "electron/assets/icon.ico" = "Icono de la aplicación (.ico)"
    "electron/assets/LICENSE.txt" = "Licencia del software"
    "electron/builder-config.js" = "Configuración de Electron Builder"
    "electron/main.js" = "Proceso principal de Electron"
}

$missingAssets = @()

foreach ($asset in $assetsToCheck.GetEnumerator()) {
    if (Test-Path $asset.Key) {
        Write-Host "   ✅ $($asset.Value) encontrado" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $($asset.Value) NO encontrado: $($asset.Key)" -ForegroundColor Yellow
        $missingAssets += $asset.Key
    }
}

if ($missingAssets.Count -gt 0) {
    Write-Host "`n⚠️  ADVERTENCIA: Faltan algunos assets:" -ForegroundColor Yellow
    $missingAssets | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
    Write-Host "`n   Revisa /COMPILACION.md para crear los assets faltantes`n" -ForegroundColor Yellow
    
    $continue = Read-Host "¿Continuar de todas formas? (s/n)"
    if ($continue -ne "s") {
        Write-Host "❌ Compilación cancelada" -ForegroundColor Red
        exit 0
    }
}

# ==================== PASO 2: LIMPIEZA (Opcional) ====================
if ($Clean) {
    Show-Header "PASO 2: Limpiando Builds Anteriores"
    
    if (Test-Path "dist") {
        Write-Host "🗑️  Eliminando /dist..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force "dist"
    }
    
    if (Test-Path "dist-electron") {
        Write-Host "🗑️  Eliminando /dist-electron..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force "dist-electron"
    }
    
    Write-Host "✅ Limpieza completada`n" -ForegroundColor Green
}

# ==================== PASO 3: INSTALACIÓN ====================
Show-Header "PASO $(if($Clean){3}else{2}): Instalando Dependencias"

if (-not (Test-Path "node_modules")) {
    if (-not (Invoke-Step "npm install" "Instalando dependencias")) {
        exit 1
    }
} else {
    Write-Host "✅ node_modules ya existe, saltando instalación`n" -ForegroundColor Green
}

# ==================== PASO 4: REBUILD NATIVOS ====================
Show-Header "PASO $(if($Clean){4}else{3}): Rebuild de Módulos Nativos"

if (-not (Invoke-Step "npm run rebuild" "Rebuild de serialport y módulos nativos")) {
    Write-Host "⚠️  El rebuild falló. Intentando alternativa..." -ForegroundColor Yellow
    Invoke-Step "npm rebuild serialport --update-binary" "Rebuild alternativo de serialport"
}

# ==================== PASO 5: SERVIDOR ====================
Show-Header "PASO $(if($Clean){5}else{4}): Instalando Dependencias del Servidor"

if (Test-Path "server") {
    Invoke-Step "npm run server:install" "Instalación de dependencias del servidor"
} else {
    Write-Host "⚠️  Directorio /server no encontrado, saltando...`n" -ForegroundColor Yellow
}

# ==================== PASO 6: BUILD FRONTEND ====================
Show-Header "PASO $(if($Clean){6}else{5}): Compilando Frontend (React + Vite)"

if (-not (Invoke-Step "npx vite build" "Compilación de React con Vite")) {
    Write-Host "❌ La compilación del frontend falló" -ForegroundColor Red
    exit 1
}

# Verificar que dist/ se creó
if (-not (Test-Path "dist")) {
    Write-Host "❌ Error: La carpeta /dist no se generó" -ForegroundColor Red
    exit 1
}

# ==================== PASO 7: BUILD ELECTRON ====================
Show-Header "PASO $(if($Clean){7}else{6}): Empaquetando con Electron Builder"

Write-Host "📦 Iniciando Electron Builder..." -ForegroundColor Magenta
Write-Host "   ⏱️  Esto puede tomar 5-10 minutos" -ForegroundColor Yellow
Write-Host "   🔥 CPU y RAM estarán al máximo`n" -ForegroundColor Yellow

# Aumentar límite de memoria para Node.js
$env:NODE_OPTIONS = "--max-old-space-size=8192"

if ($Quick) {
    # Build rápido sin instalador
    $buildCommand = "npm run pack"
    $buildDescription = "Empaquetado rápido (sin instalador)"
} else {
    # Build completo con instalador NSIS
    $buildCommand = "npm run electron:build:win"
    $buildDescription = "Empaquetado completo con instalador NSIS"
}

if (-not (Invoke-Step $buildCommand $buildDescription)) {
    Write-Host "❌ La compilación de Electron falló" -ForegroundColor Red
    exit 1
}

# ==================== PASO 8: VERIFICACIÓN FINAL ====================
Show-Header "PASO $(if($Clean){8}else{7}): Verificación del Build"

if (-not (Test-Path "dist-electron")) {
    Write-Host "❌ Error: La carpeta /dist-electron no se generó" -ForegroundColor Red
    exit 1
}

# Buscar archivos generados
$installerFiles = Get-ChildItem "dist-electron" -Filter "*.exe"

if ($installerFiles.Count -eq 0) {
    Write-Host "⚠️  No se encontró el archivo instalador .exe" -ForegroundColor Yellow
} else {
    Write-Host "`n📦 Archivos generados:" -ForegroundColor Green
    foreach ($file in $installerFiles) {
        $sizeMB = [math]::Round($file.Length / 1MB, 2)
        Write-Host "   ✅ $($file.Name) ($sizeMB MB)" -ForegroundColor Cyan
    }
}

# Verificar carpeta unpacked
$unpackedPath = "dist-electron\win-unpacked"
if (Test-Path $unpackedPath) {
    Write-Host "`n📂 Carpeta desempaquetada: /win-unpacked" -ForegroundColor Green
    if (Test-Path "$unpackedPath\CODECPOS.exe") {
        Write-Host "   ✅ CODECPOS.exe encontrado" -ForegroundColor Green
        
        # Obtener tamaño del .exe
        $exeSize = [math]::Round((Get-Item "$unpackedPath\CODECPOS.exe").Length / 1MB, 2)
        Write-Host "   📊 Tamaño: $exeSize MB" -ForegroundColor Cyan
    }
}

# ==================== FINALIZACIÓN ====================
Write-Host "`n"
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✨ COMPILACIÓN COMPLETADA EXITOSAMENTE ✨" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "`n"

Write-Host "📋 PRÓXIMOS PASOS:" -ForegroundColor Yellow
Write-Host "   1. Probar el instalador en un entorno limpio" -ForegroundColor Cyan
Write-Host "   2. Verificar que la impresora Oneposi 85 funciona" -ForegroundColor Cyan
Write-Host "   3. Validar el sistema de margen de ganancia personalizado" -ForegroundColor Cyan
Write-Host "   4. Confirmar que los 8 usuarios de prueba están activos" -ForegroundColor Cyan
Write-Host "   5. Distribuir a clientes`n" -ForegroundColor Cyan

Write-Host "📁 Ubicación del instalador:" -ForegroundColor Yellow
$distPath = (Get-Item "dist-electron").FullName
Write-Host "   $distPath`n" -ForegroundColor Green

Write-Host "💡 TIPS:" -ForegroundColor Yellow
Write-Host "   • Para debugging, usa la carpeta 'win-unpacked'" -ForegroundColor White
Write-Host "   • Documentación completa: /COMPILACION.md" -ForegroundColor White
Write-Host "   • Build rápido: .\scripts\build.ps1 -Quick" -ForegroundColor White
Write-Host "   • Limpiar + Build: .\scripts\build.ps1 -Clean`n" -ForegroundColor White

Write-Host "🎉 ¡Felicidades! CODEC POS v2.0 está listo para distribución" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
