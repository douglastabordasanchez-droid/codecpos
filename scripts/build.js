/**
 * CODEC POS v2.0 - Script de Compilación Optimizado
 * Automatiza todo el proceso de build para Electron
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${step}. ${message}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function execCommand(command, description) {
  return new Promise((resolve, reject) => {
    log(`\n▶️  ${description}...`, 'blue');
    
    const child = exec(command, { maxBuffer: 10 * 1024 * 1024 });
    
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${description} completado`, 'green');
        resolve();
      } else {
        log(`❌ Error en ${description} (código: ${code})`, 'red');
        reject(new Error(`${description} falló`));
      }
    });
  });
}

async function build() {
  const startTime = Date.now();
  
  log('\n' + '█'.repeat(60), 'green');
  log('🚀 CODEC POS v2.0 - COMPILACIÓN PARA ELECTRON', 'bright');
  log('█'.repeat(60) + '\n', 'green');
  
  try {
    // PASO 1: Verificación
    logStep('1', 'VERIFICACIÓN PRE-COMPILACIÓN');
    await execCommand('node scripts/pre-build-check.js', 'Verificación del sistema');
    
    // PASO 2: Limpiar build anterior
    logStep('2', 'LIMPIEZA DE ARCHIVOS ANTIGUOS');
    if (fs.existsSync('dist')) {
      log('Eliminando carpeta dist/...', 'yellow');
      fs.rmSync('dist', { recursive: true, force: true });
    }
    if (fs.existsSync('dist-electron')) {
      log('Eliminando carpeta dist-electron/...', 'yellow');
      fs.rmSync('dist-electron', { recursive: true, force: true });
    }
    log('✅ Limpieza completada', 'green');
    
    // PASO 3: Rebuild módulos nativos
    logStep('3', 'REBUILD DE MÓDULOS NATIVOS');
    await execCommand('npm run rebuild', 'Reconstruyendo serialport y módulos nativos');
    
    // PASO 4: Compilar React con Vite
    logStep('4', 'COMPILACIÓN DE APLICACIÓN REACT');
    await execCommand('npx vite build', 'Compilando con Vite');
    
    // PASO 5: Verificar salida de Vite
    if (!fs.existsSync('dist/index.html')) {
      throw new Error('❌ La compilación de Vite no generó dist/index.html');
    }
    log('✅ Build de React exitoso', 'green');
    
    // PASO 6: Compilar Electron
    logStep('5', 'COMPILACIÓN DE ELECTRON');
    await execCommand(
      'electron-builder --win --x64 --config electron/builder-config.js',
      'Creando instalador Windows'
    );
    
    // PASO 7: Verificar instalador
    logStep('6', 'VERIFICACIÓN FINAL');
    
    const installerPath = path.join('dist-electron', 'CODECPOS-Setup-2.0.0.exe');
    if (fs.existsSync(installerPath)) {
      const stats = fs.statSync(installerPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      log('✅ Instalador creado exitosamente', 'green');
      log(`📦 Ubicación: ${installerPath}`, 'cyan');
      log(`📊 Tamaño: ${sizeMB} MB`, 'cyan');
    } else {
      throw new Error('❌ No se encontró el instalador en dist-electron/');
    }
    
    // RESUMEN
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    
    log('\n' + '█'.repeat(60), 'green');
    log('🎉 COMPILACIÓN COMPLETADA EXITOSAMENTE', 'bright');
    log('█'.repeat(60), 'green');
    log(`⏱️  Tiempo total: ${duration} minutos`, 'cyan');
    log(`📦 Instalador: dist-electron/CODECPOS-Setup-2.0.0.exe`, 'cyan');
    log('\n✅ Sistema listo para distribución\n', 'green');
    
  } catch (error) {
    log('\n' + '█'.repeat(60), 'red');
    log('❌ ERROR EN LA COMPILACIÓN', 'bright');
    log('█'.repeat(60), 'red');
    log(`\n${error.message}\n`, 'red');
    
    log('💡 Sugerencias:', 'yellow');
    log('  1. Verifica que node_modules esté instalado: npm install', 'yellow');
    log('  2. Limpia y reintenta: npm run compile:clean', 'yellow');
    log('  3. Revisa los logs arriba para más detalles', 'yellow');
    
    process.exit(1);
  }
}

// Ejecutar build
build();
