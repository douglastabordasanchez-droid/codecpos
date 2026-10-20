/**
 * electron-builder para el instalador de Windows 7/8 de 32 bits (ver build.mjs).
 * Mismo appId y nombre que el instalador normal, Electron 22 y su propio canal
 * de actualización ('win8.yml'), para que estas cajas nunca bajen la versión
 * de 64 bits ni al revés.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const icono = path.join(ROOT, 'public', 'icon.ico');
const licencia = path.join(ROOT, 'LICENSE.txt');

module.exports = {
  appId: 'com.codecstudio.codecpos',
  productName: 'CODECPOS',
  copyright: 'Copyright © 2026 Codec Studio',
  electronVersion: '22.3.27',

  directories: {
    app: path.join(__dirname, 'app'),
    output: path.join(ROOT, 'dist-electron-win8'),
    buildResources: path.join(ROOT, 'electron', 'assets'),
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'public/**/*',
    'package.json',
    'node_modules/**/*',
    '!**/*.map',
    '!**/{test,tests,__tests__,docs,doc,example,examples}/**',
  ],

  asarUnpack: [
    '**/node_modules/@serialport/bindings-cpp/**/*',
    '**/node_modules/usb/**/*',
  ],

  win: {
    target: [
      { target: 'nsis', arch: ['ia32'] },
      { target: 'portable', arch: ['ia32'] },
    ],
    icon: fs.existsSync(icono) ? icono : undefined,
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    perMachine: true,
    allowElevation: true,
    runAfterFinish: true,
    installerIcon: fs.existsSync(icono) ? icono : undefined,
    uninstallerIcon: fs.existsSync(icono) ? icono : undefined,
    installerHeaderIcon: fs.existsSync(icono) ? icono : undefined,
    installerLanguages: ['es'],
    license: fs.existsSync(licencia) ? licencia : undefined,
    artifactName: 'CODECPOS-Setup-${version}-Windows8-32bits.${ext}',
  },

  portable: { artifactName: 'CODECPOS ${version} Windows8 32bits.${ext}' },

  compression: 'normal',
  nodeGypRebuild: false,
  npmRebuild: false,

  publish: {
    provider: 'github',
    owner: 'douglastabordasanchez-droid',
    repo: 'codecpos',
    channel: 'win8',
  },
};
