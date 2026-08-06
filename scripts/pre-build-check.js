/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CODEC POS v2.0 - Script de Verificación Pre-Compilación
 * Verifica que todos los archivos necesarios existan antes de compilar
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('🔍 CODEC POS v2.0 - Verificación Pre-Compilación');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let hasErrors = false;
let hasWarnings = false;

// ── Función auxiliar para verificar archivos ──
function checkFile(filePath, description, required = true) {
  const fullPath = path.join(ROOT, filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    console.log(`✅ ${description}`);
    console.log(`   → ${filePath}`);
    return true;
  } else {
    if (required) {
      console.log(`❌ ERROR: ${description} NO ENCONTRADO`);
      console.log(`   → ${filePath}`);
      hasErrors = true;
    } else {
      console.log(`⚠️  ADVERTENCIA: ${description} no encontrado (opcional)`);
      console.log(`   → ${filePath}`);
      hasWarnings = true;
    }
    return false;
  }
}

// ── Función para verificar directorios ──
function checkDirectory(dirPath, description, required = true) {
  const fullPath = path.join(ROOT, dirPath);
  const exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  
  if (exists) {
    console.log(`✅ ${description}`);
    console.log(`   → ${dirPath}/`);
    return true;
  } else {
    if (required) {
      console.log(`❌ ERROR: ${description} NO ENCONTRADO`);
      console.log(`   → ${dirPath}/`);
      hasErrors = true;
    } else {
      console.log(`⚠️  ADVERTENCIA: ${description} no encontrado (opcional)`);
      console.log(`   → ${dirPath}/`);
      hasWarnings = true;
    }
    return false;
  }
}

console.log('📦 ARCHIVOS PRINCIPALES\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Archivos esenciales
checkFile('package.json', 'Package.json', true);
checkFile('electron/main.js', 'Electron Main Process', true);
checkFile('electron/preload.js', 'Electron Preload Script', true);
checkFile('electron/builder-config.js', 'Configuración de Electron Builder', true);

console.log('\n📁 DIRECTORIOS NECESARIOS\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Directorios esenciales
// NOTA: dist/ se genera automáticamente con "vite build", no es necesario verificarlo aquí
checkDirectory('electron', 'Carpeta Electron', true);
checkDirectory('public', 'Carpeta Public', true);

console.log('\n🎨 RECURSOS GRÁFICOS\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Íconos (al menos uno debe existir)
const hasLogoPng = checkFile('public/logo.png', 'Logo personalizado (logo.png)', false);
const hasIconPng = checkFile('public/icon.png', 'Ícono principal (icon.png)', false);
const hasElectronIcon = checkFile('electron/assets/icon.png', 'Ícono de Electron', false);
const hasIcoFile = checkFile('electron/assets/icon.ico', 'Archivo ICO', false);

if (!hasLogoPng && !hasIconPng && !hasElectronIcon && !hasIcoFile) {
  console.log('\n⚠️  ADVERTENCIA: No se encontró ningún ícono personalizado.');
  console.log('   → Se usará el ícono por defecto de Electron');
  console.log('   → Recomendación: Coloca tu logo en /public/logo.png\n');
  hasWarnings = true;
}

console.log('\n📄 ARCHIVOS DEL INSTALADOR\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Archivos del instalador (opcionales pero recomendados)
checkFile('electron/assets/LICENSE.txt', 'Términos y Condiciones (LICENSE.txt)', false);
checkFile('electron/installer.nsh', 'Script NSIS personalizado (installer.nsh)', false);

console.log('\n🔧 CONFIGURACIÓN DEL SISTEMA\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Verificar node_modules
if (checkDirectory('node_modules', 'Dependencias instaladas (node_modules/)', true)) {
  // Verificar dependencias críticas de Electron
  const criticalDeps = [
    'electron',
    'electron-builder',
    'react',
    'react-dom',
    'lucide-react'
  ];
  
  console.log('\n🔍 Verificando dependencias críticas:\n');
  criticalDeps.forEach(dep => {
    checkDirectory(`node_modules/${dep}`, `   ${dep}`, true);
  });
}

console.log('\n📊 TAMAÑO DE BUILD\n');
console.log('───────────────────────────────────────────────────────────────────────────\n');

// Calcular tamaño de dist/ (si existe, sino se creará durante la compilación)
const distPath = path.join(ROOT, 'dist');
if (fs.existsSync(distPath)) {
  const getDirectorySize = (dirPath) => {
    let size = 0;
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      });
    } catch (err) {
      console.log(`⚠️  Error al calcular tamaño: ${err.message}`);
    }
    return size;
  };
  
  const distSize = getDirectorySize(distPath);
  const distSizeMB = (distSize / (1024 * 1024)).toFixed(2);
  
  console.log(`📦 Tamaño de /dist: ${distSizeMB} MB`);
  
  if (distSize < 100000) {
    console.log('⚠️  ADVERTENCIA: El build parece muy pequeño.');
    console.log('   → Se reconstruirá automáticamente durante la compilación.');
    hasWarnings = true;
  }
} else {
  console.log('ℹ️  La carpeta /dist no existe todavía.');
  console.log('   → Se creará automáticamente al ejecutar "vite build"');
  console.log('   → Esto es normal en la primera compilación.\n');
}

console.log('\n═══════════════════════════════════════════════════════════════════════════');

// ── RESUMEN FINAL ──
if (hasErrors) {
  console.log('❌ VERIFICACIÓN FALLIDA - Se encontraron errores críticos');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('\n🛑 No se puede continuar con la compilación.');
  console.log('   Por favor, corrige los errores anteriores.\n');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  VERIFICACIÓN COMPLETADA CON ADVERTENCIAS');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('\n✅ La compilación puede continuar, pero revisa las advertencias.\n');
  process.exit(0);
} else {
  console.log('✅ VERIFICACIÓN COMPLETADA EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('\n🚀 Todos los archivos necesarios están presentes.');
  console.log('   Listo para compilar CODECPOS-Setup-2.0.0.exe\n');
  process.exit(0);
}