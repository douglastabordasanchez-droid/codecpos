// Instala y abre Codec POS en la terminal Android por Wi-Fi (ADB over TCP).
// Uso: npm run android:desplegar -- 192.168.1.50        (puerto 5555 por defecto)
//      npm run android:desplegar -- 192.168.1.50:5555 --compilar
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const args = process.argv.slice(2);
const destino = args.find((a) => !a.startsWith('--'));
const apk = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
const correr = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: 'inherit', ...opts });

if (!existsSync(adb)) { console.error(`No encontré adb en ${adb}`); process.exit(1); }
if (!destino) { console.error('Falta la IP de la terminal: npm run android:desplegar -- 192.168.1.50'); process.exit(1); }
const serie = destino.includes(':') ? destino : `${destino}:5555`;

if (args.includes('--compilar')) correr('npm', ['run', 'android:apk'], { shell: true });
if (!existsSync(apk)) { console.error('No hay APK; corre primero: npm run android:apk'); process.exit(1); }

correr(adb, ['connect', serie]);
const lista = execFileSync(adb, ['devices']).toString();
const linea = lista.split('\n').find((l) => l.startsWith(serie)) || '';
if (!/\tdevice\b/.test(linea)) {
  console.error(`La terminal ${serie} no está autorizada (${linea.trim() || 'no aparece'}). Acepta el aviso de depuración en su pantalla y vuelve a intentar.`);
  process.exit(1);
}
correr(adb, ['-s', serie, 'install', '-r', apk]);
correr(adb, ['-s', serie, 'shell', 'am', 'start', '-n', 'com.codecstudio.pos/.MainActivity']);
console.log('Codec POS instalado y abierto en la terminal.');
