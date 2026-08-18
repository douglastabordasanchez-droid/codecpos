#!/usr/bin/env node

/**
 * Script para detectar errores de sintaxis comunes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔍 BUSCANDO ERRORES DE SINTAXIS...\n');

let erroresEncontrados = 0;

// Archivos críticos a verificar
const archivosCriticos = [
  'src/app/App.tsx',
  'src/app/routes-pos.tsx',
  'src/app/contexts/AuthContext.tsx',
  'src/app/contexts/POSContext.tsx',
  'src/app/contexts/MultitiendaContext.tsx',
  'src/app/hooks/usePlanRestrictions.ts',
  'src/app/hooks/useCodecVerifyWebSocket.ts',
  'src/app/components/auth/LoginPage.tsx',
  'src/app/components/pos/ProtectedLayout.tsx',
];

function verificarArchivo(rutaRelativa) {
  const rutaCompleta = path.join(rootDir, rutaRelativa);
  
  if (!fs.existsSync(rutaCompleta)) {
    console.log(`❌ ${rutaRelativa} - NO EXISTE`);
    erroresEncontrados++;
    return;
  }
  
  try {
    const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
    
    // Verificar cierre de archivo
    if (!contenido.trim().endsWith('}') && !contenido.trim().endsWith(';') && !contenido.trim().endsWith(')')) {
      console.log(`⚠️  ${rutaRelativa} - Posible problema de cierre`);
    }
    
    // Verificar balanceo de llaves
    const llaves = contenido.match(/[{}]/g) || [];
    let balance = 0;
    llaves.forEach(llave => {
      balance += llave === '{' ? 1 : -1;
    });
    
    if (balance !== 0) {
      console.log(`❌ ${rutaRelativa} - Llaves desbalanceadas (balance: ${balance})`);
      erroresEncontrados++;
      return;
    }
    
    // Verificar balanceo de paréntesis
    const parentesis = contenido.match(/[()]/g) || [];
    balance = 0;
    parentesis.forEach(p => {
      balance += p === '(' ? 1 : -1;
    });
    
    if (balance !== 0) {
      console.log(`❌ ${rutaRelativa} - Paréntesis desbalanceados (balance: ${balance})`);
      erroresEncontrados++;
      return;
    }
    
    // Verificar balanceo de corchetes
    const corchetes = contenido.match(/[\[\]]/g) || [];
    balance = 0;
    corchetes.forEach(c => {
      balance += c === '[' ? 1 : -1;
    });
    
    if (balance !== 0) {
      console.log(`❌ ${rutaRelativa} - Corchetes desbalanceados (balance: ${balance})`);
      erroresEncontrados++;
      return;
    }
    
    // Verificar imports
    const imports = contenido.match(/^import .+ from .+;$/gm) || [];
    imports.forEach(imp => {
      if (!imp.includes("'") && !imp.includes('"')) {
        console.log(`❌ ${rutaRelativa} - Import sin comillas: ${imp}`);
        erroresEncontrados++;
      }
    });
    
    // Verificar exports
    if (rutaRelativa.endsWith('.tsx') || rutaRelativa.endsWith('.ts')) {
      const hasExport = contenido.includes('export ');
      if (!hasExport) {
        console.log(`⚠️  ${rutaRelativa} - Sin exports`);
      }
    }
    
    console.log(`✅ ${rutaRelativa} - OK`);
    
  } catch (error) {
    console.log(`❌ ${rutaRelativa} - Error leyendo: ${error.message}`);
    erroresEncontrados++;
  }
}

console.log('Verificando archivos críticos...\n');
archivosCriticos.forEach(archivo => verificarArchivo(archivo));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RESUMEN');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (erroresEncontrados === 0) {
  console.log('✅ NO SE ENCONTRARON ERRORES DE SINTAXIS');
  console.log('\nEl código está listo para compilar.\n');
  process.exit(0);
} else {
  console.log(`❌ SE ENCONTRARON ${erroresEncontrados} ERRORES`);
  console.log('\nCorrege los errores antes de compilar.\n');
  process.exit(1);
}
