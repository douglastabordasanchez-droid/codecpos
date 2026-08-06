/**
 * CODEC POS v2.0 - Script de limpieza antes de compilar
 * Elimina carpetas de build anteriores para evitar conflictos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const foldersToClean = [
  'dist',
  'dist-electron',
  '.vite',
];

console.log('🧹 Limpiando carpetas de build anteriores...\n');

let cleaned = 0;
let errors = 0;

for (const folder of foldersToClean) {
  const folderPath = path.join(ROOT, folder);
  
  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`✅ Eliminado: ${folder}/`);
      cleaned++;
    } else {
      console.log(`⏭️  No existe: ${folder}/`);
    }
  } catch (error) {
    console.error(`❌ Error eliminando ${folder}/:`, error.message);
    errors++;
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (errors === 0) {
  console.log(`✅ Limpieza completada (${cleaned} carpetas eliminadas)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
} else {
  console.log(`⚠️  Limpieza con errores (${errors} errores)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(1);
}
