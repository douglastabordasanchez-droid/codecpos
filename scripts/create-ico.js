/**
 * CODEC POS v2.0 - Generador de icon.ico
 * Crea el ícono para el .exe y el instalador NSIS
 * 
 * EJECUTAR: node scripts/create-ico.js
 * 
 * NO requiere instalaciones adicionales — usa solo APIs nativas de Node.js
 * El resultado se guarda en: electron/assets/icon.ico
 */

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');

// ─── VERIFICAR DEPENDENCIA canvas ────────────────────────────────────────────
let canvasAvailable = false;
try {
  await import('canvas');
  canvasAvailable = true;
} catch {
  console.log('⚠️  Módulo "canvas" no instalado. Usando método alternativo...\n');
}

if (!canvasAvailable) {
  // Método alternativo: Copiar logo-codec.png renombrado si existe
  const pngSource = path.join(ROOT, 'public', 'logo-codec.png');
  const assetsDir = path.join(ROOT, 'electron', 'assets');
  
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  
  if (existsSync(pngSource)) {
    console.log('✅ Encontrado logo-codec.png');
    console.log('\n📌 PASOS MANUALES para crear icon.ico:');
    console.log('   1. Ve a: https://convertico.com/ o https://convertio.co/es/png-ico/');
    console.log(`   2. Sube: ${pngSource}`);
    console.log('   3. Configura tamaños: 16, 32, 48, 64, 128, 256');
    console.log(`   4. Descarga y guarda en: ${path.join(assetsDir, 'icon.ico')}`);
  } else {
    console.log('❌ No se encontró public/logo-codec.png');
    console.log('\n📌 Para crear el ícono:');
    console.log('   1. Coloca tu logo en: public/logo-codec.png (mínimo 512×512px)');
    console.log('   2. Vuelve a ejecutar: node scripts/create-ico.js');
    console.log('\n   O convierte online:');
    console.log('   → https://convertico.com/');
    console.log('   → https://convertio.co/es/png-ico/');
    console.log(`   → Guarda el resultado en: electron/assets/icon.ico`);
  }
  process.exit(0);
}

// ─── GENERAR ÍCONO CON CANVAS ────────────────────────────────────────────────
const { createCanvas: makeCanvas } = await import('canvas');

/**
 * Dibuja el logo CODEC POS en un canvas
 */
function dibujarLogo(size) {
  const canvas = makeCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const r      = size * 0.20;   // border-radius

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e293b');
  redondearRect(ctx, 0, 0, size, size, r);
  ctx.fillStyle = bg;
  ctx.fill();

  // Borde esmeralda
  const border = ctx.createLinearGradient(0, 0, size, size);
  border.addColorStop(0, 'rgba(16,185,129,0.7)');
  border.addColorStop(1, 'rgba(6,182,212,0.3)');
  ctx.strokeStyle = border;
  ctx.lineWidth   = Math.max(size * 0.025, 2);
  redondearRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, r * 0.9);
  ctx.stroke();

  // Círculo esmeralda central
  const cx = size / 2;
  const cy = size / 2;
  const cr = size * 0.30;
  const cg = ctx.createRadialGradient(cx - cr * 0.25, cy - cr * 0.25, 0, cx, cy, cr);
  cg.addColorStop(0,   '#34d399');
  cg.addColorStop(0.5, '#10b981');
  cg.addColorStop(1,   '#059669');
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = cg;
  ctx.fill();

  // Brillo del círculo
  const shine = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr * 0.7);
  shine.addColorStop(0, 'rgba(255,255,255,0.3)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();

  // Texto "CP"
  if (size >= 32) {
    const fs = size * 0.28;
    ctx.font         = `900 ${fs}px Arial`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'white';
    ctx.shadowColor  = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur   = size * 0.04;
    ctx.fillText('CP', cx, cy + size * 0.02);
    ctx.shadowBlur   = 0;
  }

  // Punto verde
  if (size >= 48) {
    const dr  = size * 0.065;
    const dx  = cx + cr * 0.65;
    const dy  = cy + cr * 0.65;
    const dg  = ctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
    dg.addColorStop(0, '#6ee7b7');
    dg.addColorStop(1, '#10b981');
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fillStyle = dg;
    ctx.fill();
  }

  // Línea decorativa superior
  if (size >= 32) {
    const ly  = size * 0.14;
    const lg  = ctx.createLinearGradient(size * 0.2, ly, size * 0.8, ly);
    lg.addColorStop(0,   'rgba(16,185,129,0)');
    lg.addColorStop(0.5, 'rgba(16,185,129,0.8)');
    lg.addColorStop(1,   'rgba(16,185,129,0)');
    ctx.beginPath();
    ctx.moveTo(size * 0.2, ly);
    ctx.lineTo(size * 0.8, ly);
    ctx.strokeStyle = lg;
    ctx.lineWidth   = Math.max(size * 0.015, 1);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

function redondearRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── CREAR ICO DESDE PNGs ─────────────────────────────────────────────────────
/**
 * Formato ICO: header + directory + image data
 * Ref: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function crearIco(pngs) {
  const count = pngs.length;
  
  // Header ICO: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0,     0); // Reserved
  header.writeUInt16LE(1,     2); // Type: 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  // Directory: 16 bytes por imagen
  const dirSize  = count * 16;
  const dataOffset = 6 + dirSize;
  
  const dirs = [];
  const datas = [];
  let offset = dataOffset;

  for (const { size, png } of pngs) {
    const dir = Buffer.alloc(16);
    // Width y Height: 0 = 256 en formato ICO
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt8(0,  2); // Color palette
    dir.writeUInt8(0,  3); // Reserved
    dir.writeUInt16LE(1,  4); // Color planes
    dir.writeUInt16LE(32, 6); // Bits per pixel
    dir.writeUInt32LE(png.length, 8);  // Tamaño datos
    dir.writeUInt32LE(offset,     12); // Offset datos
    
    dirs.push(dir);
    datas.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirs, ...datas]);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
console.log('🎨 Generando ícono CODEC POS v2.0...\n');

// Asegurar que exista la carpeta
const assetsDir = path.join(ROOT, 'electron', 'assets');
if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

const publicDir = path.join(ROOT, 'public');
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

// Generar PNGs en todos los tamaños necesarios para ICO
const sizes = [16, 24, 32, 48, 64, 128, 256];
console.log('📐 Generando tamaños:', sizes.join(', '), 'px');

const pngs = sizes.map(size => ({ size, png: dibujarLogo(size) }));

// Crear icon.ico
const icoBuffer = crearIco(pngs);
const icoPath   = path.join(assetsDir, 'icon.ico');
writeFileSync(icoPath, icoBuffer);
console.log(`✅ icon.ico creado → ${icoPath}`);

// Guardar PNG 256x256 para public/icon.png
const png256 = dibujarLogo(256);
writeFileSync(path.join(publicDir, 'icon.png'), png256);
console.log(`✅ icon.png creado → ${path.join(publicDir, 'icon.png')}`);

// Guardar PNG 512x512
const png512 = dibujarLogo(512);
writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
console.log(`✅ icon-512.png creado → ${path.join(publicDir, 'icon-512.png')}`);

console.log('\n✨ ¡Listo! Ahora ejecuta: npm run electron:build:win');
console.log('\n💡 TIP: Para usar TU propio logo:');
console.log('   → Coloca tu logo en: public/logo-codec.png (mínimo 512×512px)');
console.log('   → Convierte a .ico en: https://convertico.com/');
console.log(`   → Guarda en: electron/assets/icon.ico`);
