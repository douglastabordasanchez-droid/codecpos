/**
 * Instalador de CODECPOS para Windows 7/8/8.1 de 32 bits.
 *
 * Electron 23 en adelante ya no abre en Windows 7/8, así que esta versión se
 * arma con Electron 22 (el último que sí lo hace) a partir del MISMO código:
 * no hay una copia aparte de la app. Los pasos:
 *
 *   1. Toma el build web de la raíz (dist/, `npx vite build`).
 *   2. Junta el proceso principal (electron/main.js, ESM) en un solo
 *      main.cjs, porque Electron 22 no arranca un main en ESM.
 *   3. Adapta lo que Chromium 108 no entiende: los colores oklch() de
 *      Tailwind 4 pasan a rgb() y se agregan polyfills de JS (core-js).
 *   4. Instala solo las dependencias que usa el proceso principal y empaqueta
 *      con electron-builder para ia32.
 *
 * Uso (desde la raíz): npm run electron:build:win8
 * El instalador normal de 64 bits no cambia en nada.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP = path.join(__dirname, 'app');
const require = createRequire(import.meta.url);
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Lo que el proceso principal carga en tiempo de ejecución (se resuelve desde
// app/node_modules, no se empaqueta dentro de main.cjs).
const DEPENDENCIAS_MAIN = [
  'serialport',
  '@serialport/parser-readline',
  '@serialport/bindings-cpp',
  'usb',
  'electron-updater',
  'node-forge',
  'xml-crypto',
  '@xmldom/xmldom',
  'fflate',
  'bcryptjs',
];

function paso(texto) {
  console.log(`\n▶ ${texto}`);
}

function copiar(origen, destino, filtro = () => true) {
  fs.cpSync(origen, destino, { recursive: true, filter: filtro });
}

// ── 1. Carpeta de la app ────────────────────────────────────────────────────
paso('Preparando legacy-win8/app');
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  throw new Error('Falta dist/index.html: corre primero `npx vite build` en la raíz');
}
for (const sub of ['dist', 'electron', 'public']) {
  fs.rmSync(path.join(APP, sub), { recursive: true, force: true });
}
fs.mkdirSync(APP, { recursive: true });

copiar(path.join(ROOT, 'dist'), path.join(APP, 'dist'));
fs.mkdirSync(path.join(APP, 'public'), { recursive: true });
for (const archivo of ['logo.png', 'icon.png', 'icon.ico']) {
  const origen = path.join(ROOT, 'public', archivo);
  if (fs.existsSync(origen)) fs.copyFileSync(origen, path.join(APP, 'public', archivo));
}
copiar(path.join(ROOT, 'electron'), path.join(APP, 'electron'), (src) => {
  const rel = path.relative(path.join(ROOT, 'electron'), src).replace(/\\/g, '/');
  if (rel.startsWith('resources/piper')) return false; // piper.exe es solo de 64 bits
  if (/\.test\.js$/.test(rel)) return false;
  return true;
});

// ── 2. Proceso principal en CommonJS ────────────────────────────────────────
paso('Juntando electron/main.js en main.cjs (Electron 22 no arranca ESM)');
await build({
  entryPoints: [path.join(ROOT, 'electron', 'main.js')],
  outfile: path.join(APP, 'electron', 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  packages: 'external',
  define: { 'import.meta.url': '__codecImportMetaUrl' },
  banner: {
    js: [
      "const __codecImportMetaUrl = require('url').pathToFileURL(__filename).href;",
      // fetch global llegó en Node 18; Electron 22 trae Node 16.
      "if (typeof globalThis.fetch !== 'function') { globalThis.fetch = require('node-fetch'); }",
    ].join('\n'),
  },
  logLevel: 'warning',
});

// ── 3. Interfaz compatible con Chromium 108 ─────────────────────────────────
paso('Adaptando colores oklch() a rgb() para Chromium 108');

function oklchARgb(L, C, H, alfa) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lineal = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, bl] = lineal.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  return alfa == null || alfa >= 1 ? `rgb(${r},${g},${bl})` : `rgba(${r},${g},${bl},${+alfa.toFixed(3)})`;
}

function numero(token, escalaPorcentaje) {
  if (token === 'none') return 0;
  if (token.endsWith('%')) return (parseFloat(token) / 100) * escalaPorcentaje;
  return parseFloat(token.replace(/deg$/, ''));
}

let colores = 0;
for (const archivo of fs.readdirSync(path.join(APP, 'dist'))) {
  if (!archivo.endsWith('.css')) continue;
  const ruta = path.join(APP, 'dist', archivo);
  const css = fs.readFileSync(ruta, 'utf8').replace(/oklch\(([^()]*)\)/g, (original, cuerpo) => {
    const [canales, alfaTexto] = cuerpo.split('/').map((p) => p.trim());
    const partes = canales.split(/\s+/);
    if (partes.length !== 3 || partes.some((p) => p.startsWith('var'))) return original;
    const [L, C, H] = [numero(partes[0], 1), numero(partes[1], 0.4), numero(partes[2], 1)];
    if ([L, C, H].some(Number.isNaN)) return original;
    colores++;
    return oklchARgb(L, C, H, alfaTexto ? numero(alfaTexto, 1) : null);
  });
  fs.writeFileSync(ruta, css);
}
console.log(`  ${colores} colores convertidos`);

paso('Agregando polyfills de JavaScript (core-js)');
const coreJs = require.resolve('core-js-bundle/minified.js', { paths: [__dirname, ROOT] });
fs.copyFileSync(coreJs, path.join(APP, 'dist', 'polyfills-win8.js'));
const indexPath = path.join(APP, 'dist', 'index.html');
const index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes('polyfills-win8.js')) {
  fs.writeFileSync(indexPath, index.replace(/<script/i, '<script src="./polyfills-win8.js"></script>\n    <script'));
}

// ── 4. package.json y dependencias del proceso principal ────────────────────
paso('Instalando dependencias del proceso principal');
const versionDe = (nombre) => rootPkg.dependencies?.[nombre] || rootPkg.devDependencies?.[nombre];
const dependencias = Object.fromEntries(
  DEPENDENCIAS_MAIN.filter((d) => versionDe(d)).map((d) => [d, versionDe(d)])
);
dependencias['node-fetch'] = '^2.7.0';
fs.writeFileSync(
  path.join(APP, 'package.json'),
  JSON.stringify(
    {
      name: rootPkg.name,
      productName: 'CODECPOS',
      version: rootPkg.version,
      description: rootPkg.description || 'CODECPOS',
      author: rootPkg.author || 'Codec Studio',
      main: 'electron/main.cjs',
      dependencies: dependencias,
    },
    null,
    2
  )
);
execSync('npm install --omit=dev --no-audit --no-fund --ignore-scripts', { cwd: APP, stdio: 'inherit' });

paso('Empaquetando con Electron 22 para ia32');
execSync(
  `npx electron-builder --win --ia32 --config "${path.join(__dirname, 'builder-config.cjs')}"`,
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } }
);
console.log('\n✅ Listo: dist-electron-win8/');
