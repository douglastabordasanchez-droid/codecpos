#!/usr/bin/env node

/**
 * 🔍 DIAGNÓSTICO RÁPIDO - CODEC POS v2.0
 * Identifica el problema exacto y muestra solución
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  🔍 DIAGNÓSTICO RÁPIDO - CODEC POS v2.0');
console.log('═══════════════════════════════════════════════════════════════\n');

let problemas = 0;

// ✅ 1. VERIFICAR VITE.CONFIG.TS
console.log('1️⃣  Verificando vite.config.ts...');
try {
  const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf-8');
  
  if (viteConfig.includes('@babel/plugin-transform-runtime')) {
    console.log('   ❌ ERROR: Configuración de Babel encontrada');
    console.log('   📝 Problema: react({ babel: { plugins: [...] } })');
    console.log('   💡 Solución: Cambiar a react() sin configuración\n');
    problemas++;
  } else {
    console.log('   ✅ OK - Sin configuración de Babel\n');
  }
} catch (error) {
  console.log('   ❌ ERROR: No se pudo leer vite.config.ts');
  console.log(`   📝 ${error.message}\n`);
  problemas++;
}

// ✅ 2. VERIFICAR PACKAGE.JSON
console.log('2️⃣  Verificando package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  
  const dependenciasRequeridas = [
    'react',
    'react-dom',
    'react-router',
    'vite',
    '@vitejs/plugin-react',
    '@tailwindcss/vite'
  ];
  
  const faltantes = dependenciasRequeridas.filter(dep => 
    !packageJson.dependencies[dep] && !packageJson.devDependencies[dep]
  );
  
  if (faltantes.length > 0) {
    console.log('   ❌ ERROR: Dependencias faltantes');
    console.log(`   📝 Faltantes: ${faltantes.join(', ')}`);
    console.log('   💡 Solución: npm install\n');
    problemas++;
  } else {
    console.log('   ✅ OK - Todas las dependencias presentes\n');
  }
} catch (error) {
  console.log('   ❌ ERROR: No se pudo leer package.json');
  console.log(`   📝 ${error.message}\n`);
  problemas++;
}

// ✅ 3. VERIFICAR NODE_MODULES
console.log('3️⃣  Verificando node_modules...');
const nodeModulesPath = path.join(rootDir, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('   ❌ ERROR: node_modules no existe');
  console.log('   💡 Solución: npm install\n');
  problemas++;
} else {
  // Verificar módulos críticos
  const modulosCriticos = ['react', 'vite', '@vitejs/plugin-react'];
  const faltantes = modulosCriticos.filter(mod => 
    !fs.existsSync(path.join(nodeModulesPath, mod))
  );
  
  if (faltantes.length > 0) {
    console.log('   ❌ ERROR: Módulos críticos faltantes');
    console.log(`   📝 Faltantes: ${faltantes.join(', ')}`);
    console.log('   💡 Solución: npm install\n');
    problemas++;
  } else {
    console.log('   ✅ OK - Módulos críticos instalados\n');
  }
}

// ✅ 4. VERIFICAR ARCHIVOS PRINCIPALES
console.log('4️⃣  Verificando archivos principales...');
const archivosPrincipales = [
  'src/app/App.tsx',
  'src/app/routes-pos.tsx',
  'src/main.tsx',
  'index.html'
];

let archivosOK = true;
for (const archivo of archivosPrincipales) {
  const rutaCompleta = path.join(rootDir, archivo);
  if (!fs.existsSync(rutaCompleta)) {
    console.log(`   ❌ FALTA: ${archivo}`);
    archivosOK = false;
    problemas++;
  }
}

if (archivosOK) {
  console.log('   ✅ OK - Todos los archivos principales existen\n');
} else {
  console.log('   💡 Solución: Restaurar archivos faltantes\n');
}

// ✅ 5. VERIFICAR SINTAXIS BÁSICA
console.log('5️⃣  Verificando sintaxis básica...');
try {
  const appTsx = fs.readFileSync(path.join(rootDir, 'src/app/App.tsx'), 'utf-8');
  
  // Verificar export default
  if (!appTsx.includes('export default')) {
    console.log('   ❌ ERROR: App.tsx sin export default');
    problemas++;
  }
  
  // Verificar balanceo de llaves
  const llaves = appTsx.match(/[{}]/g) || [];
  let balance = 0;
  llaves.forEach(llave => balance += llave === '{' ? 1 : -1);
  
  if (balance !== 0) {
    console.log(`   ❌ ERROR: Llaves desbalanceadas en App.tsx (balance: ${balance})`);
    problemas++;
  }
  
  if (balance === 0 && appTsx.includes('export default')) {
    console.log('   ✅ OK - Sintaxis correcta en App.tsx\n');
  }
} catch (error) {
  console.log('   ❌ ERROR: No se pudo leer App.tsx');
  console.log(`   📝 ${error.message}\n`);
  problemas++;
}

// ═══════════════════════════════════════════════════════════════
// RESUMEN Y SOLUCIONES
// ═══════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('  📊 RESUMEN DEL DIAGNÓSTICO');
console.log('═══════════════════════════════════════════════════════════════\n');

if (problemas === 0) {
  console.log('✅ NO SE ENCONTRARON PROBLEMAS\n');
  console.log('El sistema está listo para ejecutar.\n');
  console.log('Comandos disponibles:\n');
  console.log('  npm run dev       → Modo desarrollo');
  console.log('  npm run build     → Compilar frontend');
  console.log('  npm run compile   → Generar instalador\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.log(`❌ SE ENCONTRARON ${problemas} PROBLEMA(S)\n`);
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ SOLUCIONES RECOMENDADAS (en orden)                         │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│                                                             │');
  console.log('│ 1. Eliminar node_modules y cache:                          │');
  console.log('│    rm -rf node_modules package-lock.json                   │');
  console.log('│    (Windows: rmdir /s /q node_modules)                     │');
  console.log('│                                                             │');
  console.log('│ 2. Reinstalar dependencias:                                │');
  console.log('│    npm install                                              │');
  console.log('│                                                             │');
  console.log('│ 3. Limpiar cache de Vite:                                  │');
  console.log('│    npm run clean                                            │');
  console.log('│                                                             │');
  console.log('│ 4. Intentar iniciar de nuevo:                              │');
  console.log('│    npm run dev                                              │');
  console.log('│                                                             │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(1);
}
