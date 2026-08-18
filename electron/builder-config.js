/**
 * CODEC POS v2.0 - Electron Builder Configuration
 * Genera instalador NSIS profesional + portable para Windows
 *
 * FIX v2.2 (Marzo 7, 2026):
 *   - SOLO opciones válidas según API de electron-builder 26.8.1
 *   - createDesktopShortcut: 'always' (no 'ask', que no es válido)
 *   - Eliminadas TODAS las opciones deprecadas
 *   - Configuración minimalista pero funcional
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');

// ── Resolver ícono ──────────────────────────────────────────────────────────
function resolveIcon() {
  const candidates = [
    path.join(ROOT, 'public', 'icon.ico'),      // PRIORIDAD 1: Ícono oficial para instalador/shortcut
    path.join(ROOT, 'public', 'logo.png'),      // PRIORIDAD 2: Logo oficial (fallback)
    path.join(ROOT, 'public', 'icon.png'),
    path.join(ROOT, 'electron', 'assets', 'icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`✅ Ícono encontrado: ${p}`);
      return p;
    }
  }
  console.warn('⚠️  Sin ícono personalizado — se usará el ícono por defecto de Electron.');
  return undefined;
}

// ── Verificar archivos opcionales NSIS ─────────────────────────────────────
const licencePath   = path.join(ROOT, 'LICENSE.txt');  // NUEVO: Licencia en la raíz
const installerNsh  = path.join(ROOT, 'electron', 'installer.nsh');
const hasLicense    = fs.existsSync(licencePath);
const hasInstallerNsh = fs.existsSync(installerNsh);

const iconPath = resolveIcon();
const iconIcoPath = path.join(ROOT, 'public', 'icon.ico');
const logoPngPath = path.join(ROOT, 'public', 'logo.png');
const winIconPath = fs.existsSync(iconIcoPath)
  ? iconIcoPath
  : (fs.existsSync(logoPngPath) ? logoPngPath : iconPath);

// ── Configuración base ──────────────────────────────────────────────────────
const config = {
  appId:        'com.codecstudio.codecpos',
  productName:  'CODECPOS',
  copyright:    'Copyright © 2026 Codec Studio',

  directories: {
    output:         'dist-electron',
    buildResources: 'electron/assets',
  },

  // ── Archivos a empaquetar ───────────────────────────────────────────────
  files: [
    'dist/**/*',
    'electron/**/*',
    // Va como extraResources (arriba), no aquí — evita duplicar ~120MB
    // dentro del .asar además de en resources/piper.
    '!electron/resources/piper/**/*',
    'package.json',
    {
      from:   'node_modules',
      to:     'node_modules',
      filter: [
        '**/*',
        '!**/*.{md,markdown,MD,txt}',
        '!**/{test,tests,__tests__,spec,specs}/**',
        '!**/*.map',
        '!**/.*',
        '!**/LICENSE*',
        '!**/CHANGELOG*',
        '!**/{example,examples,docs,doc}/**',
        '!**/tsconfig.json',
        '!**/.git*',
      ],
    },
  ],

  // ── Recursos extra fuera del ASAR: motor de voz Piper (binario nativo +
  // modelo .onnx) — necesita poder spawnearse y leer archivos directo del
  // disco, así que va en resources/piper, no empaquetado en el .asar.
  extraResources: [
    {
      from: 'electron/resources/piper',
      to: 'piper',
      filter: ['**/*'],
    },
  ],

  // ── ASAR: Empaquetar todo menos binarios nativos ────────────────────────
  asar: true,
  asarUnpack: [
    '**/*.node',
    '**/node_modules/serialport/**/*',
    '**/node_modules/@serialport/**/*',
    '**/node_modules/bindings/**/*',
    '**/node_modules/file-uri-to-path/**/*',
    '**/node_modules/@serialport/bindings-cpp/**/*',
    '**/node_modules/usb/**/*',
    '**/node_modules/node-gyp-build/**/*',
  ],

  // ── WINDOWS ────────────────────────────────────────────────────────────
  win: {
    target: [
      { target: 'nsis',     arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: winIconPath,
  },

  // ── NSIS - Instalador Profesional ──────────────────────────────────────
  nsis: {
    // Instalador con múltiples páginas
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    
    // Accesos directos (SOLO valores válidos: 'always', true, false)
    createDesktopShortcut: 'always',    // Crear siempre
    createStartMenuShortcut: true,
    
    // Instalación para todo el sistema
    perMachine: true,
    allowElevation: true,
    
    // Comportamiento post-instalación
    runAfterFinish: true,
    
    // Íconos
    installerIcon: winIconPath,
    uninstallerIcon: winIconPath,
    installerHeaderIcon: winIconPath,
    
    // Idioma
    installerLanguages: ['es'],
    
    // Nombre del archivo de salida
    artifactName: 'CODECPOS-Setup-${version}.${ext}',
  },

  // ── Optimización de build ───────────────────────────────────────────────
  compression: 'normal',
  nodeGypRebuild: false,
  npmRebuild: false,

  extraMetadata: { 
    main: 'electron/main.js' 
  },

  // Sin auto-updater
  publish: null,
};

// Forzar coherencia de branding final para Windows/NSIS
if (winIconPath) {
  config.win.icon = winIconPath;
}

// Agregar license solo si el archivo existe
if (hasLicense) {
  config.nsis.license = licencePath;
  console.log('✅ LICENSE.txt encontrado - Se incluirá en el instalador');
} else {
  console.warn('⚠️  LICENSE.txt no encontrado - Se omitirá la pantalla de licencia');
}

// Agregar script NSIS personalizado solo si existe
// TEMPORALMENTE DESACTIVADO: El archivo installer.nsh usa sintaxis avanzada
// que causa errores en electron-builder. Se activará en versión futura.
// if (hasInstallerNsh) {
//   config.nsis.include = installerNsh;
//   console.log('✅ installer.nsh encontrado - Se usará personalización NSIS');
// } else {
//   console.warn('⚠️  installer.nsh no encontrado - Se usará instalador estándar');
// }
console.log('ℹ️  Script NSIS personalizado desactivado temporalmente');
console.log('   (Se usará instalador estándar de electron-builder)');

export default config;