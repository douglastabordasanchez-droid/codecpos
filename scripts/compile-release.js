/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CODEC POS v2.0 - Script de Compilación para Distribución
 * Compila el instalador profesional listo para distribución
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('🚀 CODEC POS v2.0 - Compilación para Distribución');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// ── Función para ejecutar comandos y mostrar salida ──
function runCommand(command, description) {
  console.log(`\n📦 ${description}...\n`);
  console.log(`   Comando: ${command}\n`);
  
  try {
    execSync(command, { 
      stdio: 'inherit',
      cwd: ROOT 
    });
    console.log(`\n✅ ${description} completado exitosamente\n`);
    return true;
  } catch (error) {
    console.log(`\n❌ ERROR en ${description}\n`);
    console.error(error.message);
    return false;
  }
}

// ── Función para calcular tamaño de archivo ──
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    return sizeInMB;
  } catch (err) {
    return 'N/A';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 1: LIMPIEZA DE BUILDS ANTERIORES
// ═══════════════════════════════════════════════════════════════════════════

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('PASO 1: Limpiando builds anteriores...');
console.log('───────────────────────────────────────────────────────────────────────────\n');

const foldersToClean = ['dist', 'dist-electron'];

foldersToClean.forEach(folder => {
  const folderPath = path.join(ROOT, folder);
  if (fs.existsSync(folderPath)) {
    console.log(`🗑️  Eliminando carpeta: ${folder}/`);
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
});

console.log('\n✅ Limpieza completada\n');

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2: VERIFICACIÓN PRE-COMPILACIÓN
// ═══════════════════════════════════════════════════════════════════════════

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('PASO 2: Verificación de archivos necesarios...');
console.log('───────────────────────────────────────────────────────────────────────────\n');

const success = runCommand('node scripts/pre-build-check.js', 'Verificación pre-compilación');

if (!success) {
  console.log('\n❌ La verificación falló. Corrige los errores antes de continuar.\n');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 3: BUILD DE VITE (FRONTEND)
// ═══════════════════════════════════════════════════════════════════════════

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('PASO 3: Compilando frontend con Vite...');
console.log('───────────────────────────────────────────────────────────────────────────\n');

const viteBuildSuccess = runCommand('npx vite build', 'Build de Vite');

if (!viteBuildSuccess) {
  console.log('\n❌ El build de Vite falló. Verifica los errores.\n');
  process.exit(1);
}

// Verificar que /dist existe y no está vacío
const distPath = path.join(ROOT, 'dist');
if (!fs.existsSync(distPath)) {
  console.log('\n❌ ERROR: La carpeta /dist no se creó.\n');
  process.exit(1);
}

const distFiles = fs.readdirSync(distPath);
if (distFiles.length === 0) {
  console.log('\n❌ ERROR: La carpeta /dist está vacía.\n');
  process.exit(1);
}

console.log(`✅ Build de Vite exitoso (${distFiles.length} archivos generados)\n`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 4: COMPILACIÓN DE ELECTRON BUILDER
// ═══════════════════════════════════════════════════════════════════════════

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('PASO 4: Compilando instalador NSIS con Electron Builder...');
console.log('───────────────────────────────────────────────────────────────────────────\n');

console.log('⏳ Este proceso puede tardar 5-10 minutos dependiendo de tu equipo...\n');

const electronBuildSuccess = runCommand(
  'cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --win --x64 --config electron/builder-config.js',
  'Compilación de Electron Builder'
);

if (!electronBuildSuccess) {
  console.log('\n❌ La compilación de Electron falló. Verifica los errores.\n');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 5: VERIFICACIÓN DE ARCHIVOS GENERADOS
// ═══════════════════════════════════════════════════════════════════════════

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('PASO 5: Verificando archivos generados...');
console.log('───────────────────────────────────────────────────────────────────────────\n');

const distElectronPath = path.join(ROOT, 'dist-electron');

if (!fs.existsSync(distElectronPath)) {
  console.log('\n❌ ERROR: La carpeta dist-electron no se creó.\n');
  process.exit(1);
}

// Buscar archivos generados
const generatedFiles = fs.readdirSync(distElectronPath);

const installerFile = generatedFiles.find(f => f.includes('Setup') && f.endsWith('.exe'));
const portableFile = generatedFiles.find(f => !f.includes('Setup') && f.endsWith('.exe') && !f.includes('Uninstall'));

console.log('📦 Archivos generados:\n');

if (installerFile) {
  const installerPath = path.join(distElectronPath, installerFile);
  const installerSize = getFileSize(installerPath);
  console.log(`   ✅ Instalador NSIS: ${installerFile}`);
  console.log(`      Tamaño: ${installerSize} MB`);
  console.log(`      Ruta: dist-electron/${installerFile}\n`);
}

if (portableFile) {
  const portablePath = path.join(distElectronPath, portableFile);
  const portableSize = getFileSize(portablePath);
  console.log(`   ✅ Versión Portable: ${portableFile}`);
  console.log(`      Tamaño: ${portableSize} MB`);
  console.log(`      Ruta: dist-electron/${portableFile}\n`);
}

// Buscar carpeta desempaquetada
const unpackedDir = generatedFiles.find(f => f.includes('win-unpacked'));
if (unpackedDir) {
  console.log(`   📁 Carpeta desempaquetada: ${unpackedDir}/\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN FINAL
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('✅ COMPILACIÓN COMPLETADA EXITOSAMENTE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('🎉 ¡Tu instalador profesional está listo para distribución!\n');

if (installerFile) {
  console.log('📦 INSTALADOR PRINCIPAL (para distribución):');
  console.log(`   → dist-electron/${installerFile}\n`);
  console.log('   Este es el archivo que debes compartir con tus clientes.\n');
}

console.log('───────────────────────────────────────────────────────────────────────────');
console.log('📋 PRÓXIMOS PASOS:');
console.log('───────────────────────────────────────────────────────────────────────────\n');

console.log('1️⃣  Probar el instalador en un equipo limpio:');
if (installerFile) {
  console.log(`   → Ejecutar: dist-electron/${installerFile}\n`);
}

console.log('2️⃣  Verificar la instalación completa:');
console.log('   ✓ Pantalla de bienvenida');
console.log('   ✓ Términos y condiciones');
console.log('   ✓ Selección de carpeta');
console.log('   ✓ Instalación exitosa');
console.log('   ✓ Accesos directos creados');
console.log('   ✓ Aplicación funciona correctamente\n');

console.log('3️⃣  Probar el desinstalador:');
console.log('   ✓ Panel de Control > Programas');
console.log('   ✓ Verificar que conserva/elimina datos correctamente\n');

console.log('4️⃣  Distribuir el instalador:');
console.log('   ✓ Subir a tu servidor/sitio web');
console.log('   ✓ Compartir con clientes');
console.log('   ✓ Proporcionar claves de licencia\n');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('INFORMACIÓN TÉCNICA:');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('📊 Características del instalador:');
console.log('   • Instalador: NSIS profesional');
console.log('   • Idioma: Español (es_ES)');
console.log('   • Compresión: LZMA (máxima)');
console.log('   • Arquitectura: Windows x64');
console.log('   • Compatibilidad: Windows 7/8/10/11');
console.log('   • Permisos: Requiere administrador');
console.log('   • Desinstalador: Incluido automáticamente\n');

console.log('🔧 Configuración instalada:');
console.log('   • Carpeta: C:\\Program Files\\CODECPOS');
console.log('   • Datos: %AppData%\\codecpos');
console.log('   • Accesos: Escritorio + Menú Inicio');
console.log('   • Registro: Windows Registry\n');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('📞 SOPORTE TÉCNICO:');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('   🌐 Web:      https://codecstudio.online/');
console.log('   📧 Email:    contacto@codecstudio.com');
console.log('   📱 WhatsApp: +57 323 864 6844\n');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('Copyright © 2026 Codec Studio - Todos los derechos reservados');
console.log('═══════════════════════════════════════════════════════════════════════════\n');
