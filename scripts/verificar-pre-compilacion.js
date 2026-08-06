#!/usr/bin/env node

/**
 * CODEC POS v2.0 - Script de Verificación Pre-Compilación
 * Verifica que todo esté correcto antes de compilar
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 CODEC POS v2.0 - VERIFICACIÓN PRE-COMPILACIÓN');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

let errores = 0;
let advertencias = 0;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Verificar archivo existe
// ═══════════════════════════════════════════════════════════════════════════
function verificarArchivo(rutaRelativa, descripcion) {
  const rutaCompleta = path.join(rootDir, rutaRelativa);
  if (fs.existsSync(rutaCompleta)) {
    console.log(`✅ ${descripcion}`);
    return true;
  } else {
    console.log(`❌ ${descripcion} - NO ENCONTRADO: ${rutaRelativa}`);
    errores++;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Leer y parsear JSON
// ═══════════════════════════════════════════════════════════════════════════
function leerJSON(rutaRelativa) {
  try {
    const rutaCompleta = path.join(rootDir, rutaRelativa);
    const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
    return JSON.parse(contenido);
  } catch (error) {
    console.log(`❌ Error leyendo ${rutaRelativa}:`, error.message);
    errores++;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Verificar dependencia en package.json
// ═══════════════════════════════════════════════════════════════════════════
function verificarDependencia(pkg, nombre, tipo = 'dependencies') {
  const deps = pkg[tipo] || {};
  if (deps[nombre]) {
    console.log(`  ✅ ${nombre}: ${deps[nombre]}`);
    return true;
  } else {
    console.log(`  ❌ ${nombre} NO encontrado en ${tipo}`);
    errores++;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. VERIFICAR ARCHIVOS PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════
console.log('📁 1. VERIFICANDO ARCHIVOS PRINCIPALES...');
console.log('');

verificarArchivo('package.json', 'package.json');
verificarArchivo('tsconfig.json', 'tsconfig.json');
verificarArchivo('vite.config.ts', 'vite.config.ts');
verificarArchivo('electron/main.js', 'electron/main.js');
verificarArchivo('electron/preload.cjs', 'electron/preload.cjs');
verificarArchivo('electron/builder-config.js', 'electron/builder-config.js');
verificarArchivo('src/app/App.tsx', 'src/app/App.tsx');
verificarArchivo('src/app/routes-pos.tsx', 'src/app/routes-pos.tsx');
verificarArchivo('index.html', 'index.html');
verificarArchivo('public/icon.ico', 'public/icon.ico');

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 2. VERIFICAR CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════
console.log('🔧 2. VERIFICANDO CONTEXTS...');
console.log('');

verificarArchivo('src/app/contexts/AuthContext.tsx', 'AuthContext.tsx');
verificarArchivo('src/app/contexts/POSContext.tsx', 'POSContext.tsx');
verificarArchivo('src/app/contexts/LicenseContext.tsx', 'LicenseContext.tsx');
verificarArchivo('src/app/contexts/MultitiendaContext.tsx', 'MultitiendaContext.tsx');

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 3. VERIFICAR COMPONENTES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════
console.log('⚛️  3. VERIFICANDO COMPONENTES PRINCIPALES...');
console.log('');

verificarArchivo('src/app/components/auth/LoginPage.tsx', 'LoginPage.tsx');
verificarArchivo('src/app/components/pos/ProtectedLayout.tsx', 'ProtectedLayout.tsx');
verificarArchivo('src/app/components/pos/POSPageNew.tsx', 'POSPageNew.tsx');
verificarArchivo('src/app/components/pos/ProductosPage.tsx', 'ProductosPage.tsx');
verificarArchivo('src/app/components/pos/DashboardPOSPage.tsx', 'DashboardPOSPage.tsx');
verificarArchivo('src/app/components/ErrorBoundary.tsx', 'ErrorBoundary.tsx');

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 4. VERIFICAR DEPENDENCIAS CRÍTICAS
// ═══════════════════════════════════════════════════════════════════════════
console.log('📦 4. VERIFICANDO DEPENDENCIAS CRÍTICAS...');
console.log('');

const pkg = leerJSON('package.json');

if (pkg) {
  console.log('Dependencies:');
  verificarDependencia(pkg, 'react', 'dependencies');
  verificarDependencia(pkg, 'react-dom', 'dependencies');
  verificarDependencia(pkg, 'react-router', 'dependencies');
  verificarDependencia(pkg, 'motion', 'dependencies');
  verificarDependencia(pkg, 'lucide-react', 'dependencies');
  verificarDependencia(pkg, 'sonner', 'dependencies');
  verificarDependencia(pkg, 'tailwind-merge', 'dependencies');
  
  console.log('');
  console.log('DevDependencies:');
  verificarDependencia(pkg, 'vite', 'devDependencies');
  verificarDependencia(pkg, 'electron', 'devDependencies');
  verificarDependencia(pkg, 'electron-builder', 'devDependencies');
  verificarDependencia(pkg, 'typescript', 'devDependencies');
  verificarDependencia(pkg, '@tailwindcss/vite', 'devDependencies');
  verificarDependencia(pkg, '@vitejs/plugin-react', 'devDependencies');
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 5. VERIFICAR CONFIGURACIÓN DE ELECTRON
// ═══════════════════════════════════════════════════════════════════════════
console.log('⚡ 5. VERIFICANDO CONFIGURACIÓN ELECTRON...');
console.log('');

const builderConfig = path.join(rootDir, 'electron/builder-config.js');
if (fs.existsSync(builderConfig)) {
  console.log('✅ builder-config.js existe');
  
  // Verificar que tiene las propiedades necesarias
  try {
    const content = fs.readFileSync(builderConfig, 'utf-8');
    if (content.includes('appId')) {
      console.log('  ✅ appId configurado');
    } else {
      console.log('  ⚠️  appId no encontrado');
      advertencias++;
    }
    
    if (content.includes('productName')) {
      console.log('  ✅ productName configurado');
    } else {
      console.log('  ⚠️  productName no encontrado');
      advertencias++;
    }
    
    if (content.includes('win')) {
      console.log('  ✅ Configuración Windows presente');
    } else {
      console.log('  ❌ Configuración Windows no encontrada');
      errores++;
    }
  } catch (error) {
    console.log('  ❌ Error leyendo builder-config.js:', error.message);
    errores++;
  }
} else {
  console.log('❌ builder-config.js NO encontrado');
  errores++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 6. VERIFICAR SCRIPTS EN PACKAGE.JSON
// ═══════════════════════════════════════════════════════════════════════════
console.log('📝 6. VERIFICANDO SCRIPTS EN PACKAGE.JSON...');
console.log('');

if (pkg && pkg.scripts) {
  const scriptsRequeridos = [
    'build',
    'dev',
    'compile',
    'electron:build:win'
  ];
  
  scriptsRequeridos.forEach(script => {
    if (pkg.scripts[script]) {
      console.log(`  ✅ Script "${script}" configurado`);
    } else {
      console.log(`  ❌ Script "${script}" NO encontrado`);
      errores++;
    }
  });
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 7. VERIFICAR DIRECTORIOS NECESARIOS
// ═══════════════════════════════════════════════════════════════════════════
console.log('📂 7. VERIFICANDO DIRECTORIOS NECESARIOS...');
console.log('');

const directorios = [
  'src/app',
  'src/app/components',
  'src/app/contexts',
  'src/app/hooks',
  'src/app/lib',
  'src/app/utils',
  'electron',
  'public',
  'scripts'
];

directorios.forEach(dir => {
  const rutaCompleta = path.join(rootDir, dir);
  if (fs.existsSync(rutaCompleta)) {
    console.log(`  ✅ ${dir}/`);
  } else {
    console.log(`  ⚠️  ${dir}/ NO encontrado`);
    advertencias++;
  }
});

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// 8. VERIFICAR NODE_MODULES
// ═══════════════════════════════════════════════════════════════════════════
console.log('📚 8. VERIFICANDO NODE_MODULES...');
console.log('');

const nodeModules = path.join(rootDir, 'node_modules');
if (fs.existsSync(nodeModules)) {
  console.log('✅ node_modules existe');
  
  // Verificar algunos paquetes críticos
  const paquetesCriticos = ['react', 'electron', 'vite'];
  paquetesCriticos.forEach(paquete => {
    const rutaPaquete = path.join(nodeModules, paquete);
    if (fs.existsSync(rutaPaquete)) {
      console.log(`  ✅ ${paquete} instalado`);
    } else {
      console.log(`  ❌ ${paquete} NO instalado`);
      errores++;
    }
  });
} else {
  console.log('❌ node_modules NO existe');
  console.log('   Ejecuta: npm install');
  errores++;
}

console.log('');

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN FINAL
// ═══════════════════════════════════════════════════════════════════════════
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 RESUMEN DE VERIFICACIÓN');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

if (errores === 0 && advertencias === 0) {
  console.log('✅ ¡PERFECTO! No se encontraron errores ni advertencias');
  console.log('');
  console.log('🚀 EL SISTEMA ESTÁ LISTO PARA COMPILAR');
  console.log('');
  console.log('Ejecuta: npm run compile');
  console.log('');
  process.exit(0);
} else {
  if (errores > 0) {
    console.log(`❌ Errores encontrados: ${errores}`);
  }
  if (advertencias > 0) {
    console.log(`⚠️  Advertencias encontradas: ${advertencias}`);
  }
  console.log('');
  
  if (errores > 0) {
    console.log('❌ DEBES CORREGIR LOS ERRORES ANTES DE COMPILAR');
    console.log('');
    process.exit(1);
  } else {
    console.log('⚠️  PUEDES COMPILAR, PERO HAY ADVERTENCIAS');
    console.log('');
    console.log('Ejecuta: npm run compile');
    console.log('');
    process.exit(0);
  }
}
