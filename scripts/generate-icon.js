/**
 * CODEC POS v2.0 - Generador de Íconos
 * Genera icon.ico para el instalador y la aplicación
 * Ejecutar con: node scripts/generate-icon.js
 *
 * Requiere: npm install -D sharp png-to-ico
 */

import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Asegurar que existe la carpeta electron/assets
const assetsDir = path.join(ROOT, 'electron/assets');
if (!existsSync(assetsDir)) {
  mkdirSync(assetsDir, { recursive: true });
}

// ============================================
// GENERAR PNG DEL LOGO CODEC POS
// ============================================
function generateCodecPOSIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const padding = size * 0.08;
  const radius = size * 0.22;

  // Fondo degradado azul oscuro
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  // Borde sutil
  const borderGrad = ctx.createLinearGradient(0, 0, size, size);
  borderGrad.addColorStop(0, 'rgba(16,185,129,0.6)');
  borderGrad.addColorStop(1, 'rgba(6,182,212,0.3)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = size * 0.03;
  roundRect(ctx, size * 0.015, size * 0.015, size * 0.97, size * 0.97, radius * 0.9);
  ctx.stroke();

  // Círculo central verde esmeralda
  const cx = size / 2;
  const cy = size / 2;
  const circleR = size * 0.3;

  const circleGrad = ctx.createRadialGradient(cx - circleR * 0.2, cy - circleR * 0.2, 0, cx, cy, circleR);
  circleGrad.addColorStop(0, '#34d399');
  circleGrad.addColorStop(0.5, '#10b981');
  circleGrad.addColorStop(1, '#059669');

  ctx.beginPath();
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
  ctx.fillStyle = circleGrad;
  ctx.fill();

  // Brillo interior del círculo
  const shineGrad = ctx.createRadialGradient(cx - circleR * 0.3, cy - circleR * 0.3, 0, cx, cy, circleR * 0.6);
  shineGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
  shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
  ctx.fillStyle = shineGrad;
  ctx.fill();

  // Texto "CP" centrado
  const fontSize = size * 0.28;
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = size * 0.04;
  ctx.fillText('CP', cx, cy + size * 0.02);
  ctx.shadowBlur = 0;

  // Punto decorativo verde brillante abajo-derecha
  const dotR = size * 0.06;
  const dotX = cx + circleR * 0.65;
  const dotY = cy + circleR * 0.65;
  const dotGrad = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotR);
  dotGrad.addColorStop(0, '#6ee7b7');
  dotGrad.addColorStop(1, '#10b981');
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.fillStyle = dotGrad;
  ctx.fill();

  // Línea decorativa arriba
  const lineY = size * 0.14;
  const lineGrad = ctx.createLinearGradient(size * 0.2, lineY, size * 0.8, lineY);
  lineGrad.addColorStop(0, 'rgba(16,185,129,0)');
  lineGrad.addColorStop(0.5, 'rgba(16,185,129,0.8)');
  lineGrad.addColorStop(1, 'rgba(16,185,129,0)');
  ctx.beginPath();
  ctx.moveTo(size * 0.2, lineY);
  ctx.lineTo(size * 0.8, lineY);
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = size * 0.015;
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Generar PNG de 256x256 para public/icon.png
console.log('🎨 Generando ícono CODEC POS...');
const png256 = generateCodecPOSIcon(256);
const publicDir = path.join(ROOT, 'public');
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, 'icon.png'), png256);
console.log('✅ public/icon.png generado (256x256)');

// Guardar también versión 512
const png512 = generateCodecPOSIcon(512);
writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
console.log('✅ public/icon-512.png generado (512x512)');

console.log('\n📌 Para convertir a .ico, instala png-to-ico y ejecuta:');
console.log('   npx png-to-ico public/icon.png > electron/assets/icon.ico');
console.log('\n✨ O usa: https://convertio.co/es/png-ico/ para convertir online');
console.log('   → Sube public/icon.png');
console.log('   → Descarga icon.ico');
console.log('   → Guárdalo en electron/assets/icon.ico');
