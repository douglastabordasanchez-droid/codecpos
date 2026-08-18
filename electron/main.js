/**
 * CODEC POS v2.0 - Electron Main Process
 * Sistema POS de alto tráfico para minimercados colombianos
 *
 * FIX v2.1:
 *   - Búsqueda robusta de index.html dentro de ASAR y fuera
 *   - Splash screen premium con HTML puro (no depende de React)
 *   - Flags GPU para glassmorphism en Windows 10/11
 *   - Ícono buscado en múltiples rutas
 */

import { app, BrowserWindow, ipcMain, Notification, shell, Menu, dialog, session } from 'electron';
import path       from 'path';
import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import os         from 'os';
import crypto     from 'crypto';
import dgram      from 'dgram';
import http       from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { promises as fsPromises } from 'fs';
import { deviceManager } from './hardware/deviceManager.js';
import { lanServer } from './lan/lanServer.js';
import { lanClient } from './lan/lanClient.js';
import * as backupManager from './backupManager.js';
import * as fileLogger from './fileLogger.js';
import * as dianSecrets from './dianSecrets.js';
import * as dianSigner from './dianSigner.js';
import * as dianSoapClient from './dianSoapClient.js';

const STORAGE_PARTITION = 'persist:codecpos';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);
const execAsync  = promisify(exec);
const fs         = require('fs');

const PRINTER_TARGET_NAME = 'POS-80';
const PRINTER_FALLBACK_PORT = 'USB008';

// ── BLINDAJE: modo seguro de GPU ─────────────────────────────────────────────
// Si el proceso de render se cae (pantalla negra) dos veces seguidas, se
// escribe esta bandera y el próximo arranque deshabilita la aceleración por
// hardware por completo (app.disableHardwareAcceleration() SOLO puede
// llamarse antes de app.whenReady(), por eso se decide aquí arriba, leyendo
// un archivo en vez de un estado en memoria de la sesión anterior).
const GPU_SAFE_MODE_FLAG = path.join(app.getPath('userData'), 'gpu-safe-mode.flag');
let gpuSafeModeActivo = false;
try {
  gpuSafeModeActivo = fs.existsSync(GPU_SAFE_MODE_FLAG);
} catch { /* no-op */ }

if (gpuSafeModeActivo) {
  console.warn('⚠️ Modo seguro de GPU activo (crashes previos detectados): aceleración por hardware desactivada.');
  app.disableHardwareAcceleration();
} else {
  // ── FLAGS GPU para Glassmorphism / backdrop-filter en Windows ──────────────
  // Sin esto, backdrop-blur aparece como blanco sólido en Windows.
  // NOTA: ya NO se usan 'ignore-gpu-blacklist' ni 'disable-software-rasterizer'
  // — esas dos banderas fuerzan el compositing por hardware incluso en GPUs
  // que Chromium marca como problemáticas y eliminan la caída a renderizado
  // por software, que es exactamente lo que produce pantalla NEGRA (no un
  // error de React) en equipos con drivers de GPU viejos o inestables.
  app.commandLine.appendSwitch('enable-features',
    'CSSBackdropFilter,UseSkiaRenderer,VaapiVideoDecoder');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('disable-gpu-vsync'); // Menos lag
}

// ⚡ OPTIMIZACIONES EXTREMAS PARA BAJOS RECURSOS (NUEVO)
app.commandLine.appendSwitch('disable-background-timer-throttling'); // Mejor rendimiento
app.commandLine.appendSwitch('disable-renderer-backgrounding'); // No pausar renderer
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); // Mejor UX
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // Menos CPU
// 🛡️ FIX CIERRE TOTAL: '--js-flags' es un switch de Chromium, no solo de Node —
// Electron lo reenvía a CADA proceso renderer al lanzarlo, así que este límite
// no acotaba el proceso principal (la intención original) sino el heap de V8
// del renderer que pinta toda la UI. Con 512MB, la app moría con
// render-process-gone(reason:"crashed") ~15-30s después del login (justo
// cuando el renderer empieza a cargar catálogo/empleados en memoria), lo que
// el usuario percibía como "la app se cierra sola y vuelve al escritorio".
// Evidencia: C:\CodecStudio\CODECPOS\logs\codecpos-*.log, mismo patrón en
// 3 arranques consecutivos. Se retira el límite artificial.
app.commandLine.appendSwitch('disable-dev-shm-usage'); // Menos memoria compartida
app.commandLine.appendSwitch('no-sandbox'); // ⚡ Más rápido (menos seguro pero OK para POS local)

// ─────────────────────────────────────────────────────────────────────────────

let mainWindow   = null;
let splashWindow = null;
let isRunningAsAdmin = false;
let renderCrashCount = 0;
let lastRenderCrashAt = 0;

// ── Estado de red LAN ─────────────────────────────────────────────────────────
let lanMode = 'none'; // 'none' | 'server' | 'client'
let lanListenersAttached = false;

// ── Recuperar foco de teclado tras diálogos/ventanas nativas ──────────────────
// 🛡️ FIX BUG CRÍTICO: "inputs dejan de aceptar escritura hasta reiniciar".
// Causa raíz: cualquier diálogo nativo de Windows (el diálogo de impresión de
// webContents.print() con silent:false, o dialog.showMessageBox) toma el foco
// de teclado a nivel de SISTEMA OPERATIVO. Cuando ese diálogo pertenece a una
// ventana oculta (printWin, creada con show:false para imprimir HTML) y esa
// ventana se destruye apenas el diálogo se cierra, Windows no tiene a quién
// devolverle el foco — mainWindow queda visible y clicable, pero sin foco de
// teclado real, así que NINGÚN input en NINGÚN formulario recibe eventos de
// teclado hasta que el usuario fuerce un cambio de foco manual (alt-tab, clic
// en la barra de título) — algo que un cajero normalmente no sabe hacer, por
// eso el único "arreglo" que encontraban era reiniciar la app por completo.
// La ventana Chromium NO se re-sincroniza sola: hay que pedirle explícitamente
// el foco de vuelta después de que el diálogo nativo termina. El setTimeout
// deja que el message loop nativo de Windows termine de cerrar el diálogo
// antes de reclamar el foco (pedirlo en el mismo tick a veces no tiene efecto).
function refocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setTimeout(() => {
    try {
      if (mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.focus();
    } catch (e) {
      console.warn('[Focus] No se pudo recuperar el foco de mainWindow:', e.message);
    }
  }, 80);
}

// ── Verificar privilegios de administrador ────────────────────────────────────
function checkAdminPrivileges() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    isRunningAsAdmin = true;
    return true;
  } catch {
    isRunningAsAdmin = false;
    return false;
  }
}

// ── Configurar Firewall de Windows para puertos LAN (silencioso) ─────────────
// 🛡️ FIX ARRANQUE: antes esto se ejecutaba en CADA arranque, incluso cuando
// las 6 reglas ya existían de una corrida anterior — igual lanzaba 6
// procesos "netsh" secuenciales (uno por regla) solo para confirmar "ya
// existe". Eso es CPU/IO gastado en cada inicio, en cualquier PC, para nada.
// Ahora, tras la primera configuración exitosa, se guarda una bandera y los
// arranques siguientes se saltan esto por completo.
const FIREWALL_CONFIGURED_FLAG = path.join(app.getPath('userData'), 'firewall-configured.flag');

async function setupWindowsFirewall() {
  if (process.platform !== 'win32') return;
  try {
    if (fs.existsSync(FIREWALL_CONFIGURED_FLAG)) return;
  } catch { /* no-op */ }
  const rules = [
    { name: 'CODEC-POS-LAN-TCP-4000-IN', port: 4000, protocol: 'TCP', dir: 'in' },
    { name: 'CODEC-POS-LAN-UDP-4001-IN', port: 4001, protocol: 'UDP', dir: 'in' },
    { name: 'CODEC-POS-HTTP-4002-IN',    port: 4002, protocol: 'TCP', dir: 'in' },
    { name: 'CODEC-POS-PUSH-4003-IN',    port: 4003, protocol: 'TCP', dir: 'in' },
    { name: 'CODEC-POS-LAN-TCP-4000-OUT', port: 4000, protocol: 'TCP', dir: 'out' },
    { name: 'CODEC-POS-LAN-UDP-4001-OUT', port: 4001, protocol: 'UDP', dir: 'out' },
  ];
  for (const { name, port, protocol, dir } of rules) {
    try {
      const { stdout = '' } = await execAsync(
        `netsh advfirewall firewall show rule name="${name}"`,
        { windowsHide: true, timeout: 3000, encoding: 'utf8' }
      ).catch(() => ({ stdout: '' }));
      if (stdout.includes(name)) continue;
      await execAsync(
        `netsh advfirewall firewall add rule name="${name}" protocol=${protocol} dir=${dir} action=allow localport=${port}`,
        { windowsHide: true, timeout: 5000 }
      );
      console.log(`[Firewall] Regla creada: ${name}`);
    } catch (e) {
      console.warn(`[Firewall] No se pudo configurar ${name}:`, e.message);
    }
  }
  try { fs.writeFileSync(FIREWALL_CONFIGURED_FLAG, String(Date.now()), 'utf8'); } catch { /* no-op */ }
}

// ── Obtener UUID real del equipo (MEJORADO - SIEMPRE OBTIENE UUID REAL) ──────
async function getRealMachineUUID() {
  console.log('🔍 Intentando obtener UUID real del hardware...');
  
  try {
    if (process.platform === 'win32') {
      // ✅ MÉTODO 1: WMIC (más rápido, no requiere admin si el usuario tiene permisos)
      try {
        console.log('📌 Método 1: Intentando WMIC...');
        const { stdout } = await execAsync('wmic csproduct get uuid', { 
          windowsHide: true, 
          timeout: 3000,
          encoding: 'utf8'
        });
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2 && lines[1] !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') {
          const uuid = lines[1].trim().toUpperCase();
          console.log('✅ UUID obtenido con WMIC:', uuid);
          return uuid;
        }
      } catch (e) {
        console.log('⚠️ WMIC falló:', e.message);
      }

      // ✅ MÉTODO 2: PowerShell Win32_ComputerSystemProduct
      try {
        console.log('📌 Método 2: Intentando PowerShell Win32_ComputerSystemProduct...');
        const { stdout } = await execAsync(
          'powershell.exe -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"',
          { windowsHide: true, timeout: 3000, encoding: 'utf8' }
        );
        const uuid = stdout.trim().toUpperCase();
        if (uuid && uuid !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF' && uuid.length > 10) {
          console.log('✅ UUID obtenido con PowerShell:', uuid);
          return uuid;
        }
      } catch (e) {
        console.log('⚠️ PowerShell falló:', e.message);
      }

      // ✅ MÉTODO 3: Registry (NO requiere permisos de admin) - MÁS CONFIABLE
      try {
        console.log('📌 Método 3: Intentando Registry MachineGuid...');
        const { stdout } = await execAsync(
          'reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
          { windowsHide: true, timeout: 2000, encoding: 'utf8' }
        );
        const match = stdout.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/);
        if (match && match[1]) {
          const guid = match[1].toUpperCase();
          console.log('✅ MachineGuid obtenido del Registry:', guid);
          return guid;
        }
      } catch (e) {
        console.log('⚠️ Registry falló:', e.message);
      }

      // ✅ MÉTODO 4: Volume Serial Number + MAC (más confiable que fingerprint)
      try {
        console.log('📌 Método 4: Intentando Volume Serial + MAC...');
        const { stdout } = await execAsync('vol C:', { 
          windowsHide: true, 
          timeout: 2000,
          encoding: 'utf8'
        });
        const volMatch = stdout.match(/Serial Number is ([A-F0-9]{4}-[A-F0-9]{4})/i);
        if (volMatch) {
          const volSerial = volMatch[1].replace('-', '');
          const macHash = getMACBasedHash();
          const combined = `${volSerial}${macHash}`.padEnd(32, '0').substring(0, 32);
          const uuid = formatMachineIdAsUUID(combined);
          console.log('✅ UUID generado con Vol Serial + MAC:', uuid);
          return uuid;
        }
      } catch (e) {
        console.log('⚠️ Volume Serial falló:', e.message);
      }

    } else if (process.platform === 'darwin') {
      // macOS - system_profiler
      try {
        const { stdout } = await execAsync(
          "system_profiler SPHardwareDataType | grep 'Hardware UUID' | awk '{print $3}'",
          { timeout: 3000 }
        );
        if (stdout.trim()) {
          const uuid = stdout.trim().toUpperCase();
          console.log('✅ UUID obtenido en macOS:', uuid);
          return uuid;
        }
      } catch (e) {
        console.log('⚠️ macOS UUID falló:', e.message);
      }
      
    } else {
      // Linux - machine-id
      try {
        const { stdout } = await execAsync('cat /etc/machine-id', { timeout: 2000 });
        if (stdout.trim()) {
          const uuid = formatMachineIdAsUUID(stdout.trim()).toUpperCase();
          console.log('✅ UUID obtenido en Linux:', uuid);
          return uuid;
        }
      } catch (e) {
        console.log('⚠️ Linux machine-id falló:', e.message);
      }
    }
  } catch (e) {
    console.error('❌ Error crítico obteniendo UUID:', e.message);
  }
  
  // ✅ FALLBACK ROBUSTO: Basado en hardware real (MAC + hostname + CPU)
  console.log('⚠️ Usando fallback robusto basado en hardware...');
  return generateFallbackUUID();
}

// ── Helper: Obtener hash basado en MAC ────────────────────────────────────────
function getMACBasedHash() {
  const ifaces = os.networkInterfaces();
  let mac = '';
  for (const iface of Object.values(ifaces)) {
    for (const cfg of iface) {
      if (!cfg.internal && cfg.mac && cfg.mac !== '00:00:00:00:00:00') {
        mac = cfg.mac.replace(/:/g, '');
        break;
      }
    }
    if (mac) break;
  }
  return mac || 'UNKNOWN';
}

function formatMachineIdAsUUID(id) {
  const p = id.padEnd(32, '0').substring(0, 32);
  return `${p.slice(0,8)}-${p.slice(8,12)}-${p.slice(12,16)}-${p.slice(16,20)}-${p.slice(20,32)}`;
}

function generateFallbackUUID() {
  const hostname = os.hostname();
  const ifaces   = os.networkInterfaces();
  let mac = '';
  for (const iface of Object.values(ifaces)) {
    for (const cfg of iface) {
      if (!cfg.internal && cfg.mac && cfg.mac !== '00:00:00:00:00:00') { mac = cfg.mac; break; }
    }
    if (mac) break;
  }
  const hash = crypto.createHash('md5')
    .update(`${hostname}-${mac}-${os.type()}-${os.arch()}`)
    .digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`.toUpperCase();
}

// ── Buscar ícono en múltiples rutas ────────────────────────────────────────────
function findIcon() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'logo.png'),
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'assets', 'icon.ico'),
    // Dentro de ASAR empaquetado
    path.join(app.getAppPath(), 'public', 'logo.png'),
    path.join(app.getAppPath(), 'public', 'icon.png'),
    path.join(app.getAppPath(), 'electron', 'assets', 'icon.png'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

// ── Buscar index.html del build de Vite ─────────────────────────────────────
function findIndexHtml() {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(__dirname, 'dist', 'index.html'),
    // En resourcesPath (portable / asar)
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'index.html'),
    path.join(process.resourcesPath || '', 'app', 'dist', 'index.html'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  // Fallback: la primera candidata aunque no exista (dará error descriptivo)
  return candidates[0];
}

// ── Buscar preload ─────────────────────────────────────────────────────────────
function findPreload() {
  const candidates = [
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return candidates[0];
}

async function listSystemPrinters() {
  try {
    const win = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!win) return [];
    return await win.webContents.getPrintersAsync();
  } catch (error) {
    console.error('❌ Error obteniendo impresoras del sistema:', error);
    return [];
  }
}

async function resolvePrinterTarget() {
  const printers = await listSystemPrinters();

  const exact = printers.find((p) => p.name === PRINTER_TARGET_NAME);
  if (exact) {
    return {
      found: true,
      deviceName: exact.name,
      reason: 'exact-name',
      fallbackPort: PRINTER_FALLBACK_PORT,
    };
  }

  const byName = printers.find((p) => (p.name || '').toUpperCase().includes(PRINTER_TARGET_NAME));
  if (byName) {
    return {
      found: true,
      deviceName: byName.name,
      reason: 'name-contains-pos-80',
      fallbackPort: PRINTER_FALLBACK_PORT,
    };
  }

  const byPort = printers.find((p) => {
    const port = `${p.options?.['printer-info'] || ''} ${p.description || ''}`.toUpperCase();
    return port.includes(PRINTER_FALLBACK_PORT);
  });
  if (byPort) {
    return {
      found: true,
      deviceName: byPort.name,
      reason: 'fallback-usb008',
      fallbackPort: PRINTER_FALLBACK_PORT,
    };
  }

  // 🖨️ Auto-configuración: si ninguna impresora coincide con el modelo Codec
  // esperado (nombre "POS-80" / puerto USB008), usa la impresora predeterminada
  // del sistema operativo en vez de fallar. Antes esto devolvía found:false y
  // bloqueaba toda impresión térmica en cualquier instalación cuya impresora
  // real tuviera otro nombre/puerto — es decir, la mayoría de negocios.
  const byDefault = printers.find((p) => p.isDefault);
  if (byDefault) {
    return {
      found: true,
      deviceName: byDefault.name,
      reason: 'system-default',
      fallbackPort: PRINTER_FALLBACK_PORT,
    };
  }

  return {
    found: false,
    deviceName: PRINTER_TARGET_NAME,
    reason: 'no-printers-found',
    fallbackPort: PRINTER_FALLBACK_PORT,
  };
}

async function resolvePrinterTargetByPreference(preferredPrinterName) {
  const printers = await listSystemPrinters();

  if (preferredPrinterName) {
    const exactPreferred = printers.find((p) => p.name === preferredPrinterName);
    if (exactPreferred) {
      return {
        found: true,
        deviceName: exactPreferred.name,
        reason: 'preferred-exact-name',
        fallbackPort: PRINTER_FALLBACK_PORT,
      };
    }

    // 🖨️ FIX: el nombre guardado (elegido antes en Dispositivos, o proveniente
    // de una detección USB genérica tipo "USB POS-80 Printer") puede dejar de
    // coincidir EXACTO con el nombre real de Windows tras reinstalar el driver,
    // renombrar la impresora, o simplemente porque el usuario seleccionó la
    // entrada de escaneo USB en vez de la entrada real del spooler. Antes esto
    // devolvía found:false y BLOQUEABA toda impresión (ticket de venta, cajón
    // monedero) hasta que el usuario reconfigurara manualmente — el síntoma
    // reportado era "dejó de imprimir de un día para otro" sin causa aparente.
    // Ahora se intenta una coincidencia parcial insensible a mayúsculas en
    // cualquier dirección (el nombre guardado contiene al real, o viceversa)
    // antes de recurrir a la misma cadena de resolución inteligente que ya usa
    // resolvePrinterTarget() (nombre POS-80 → puerto USB008 → predeterminada
    // del sistema), en vez de fallar duro.
    const preferredUpper = String(preferredPrinterName).toUpperCase();
    const byPartialName = printers.find((p) => {
      const nameUpper = (p.name || '').toUpperCase();
      return nameUpper.includes(preferredUpper) || preferredUpper.includes(nameUpper);
    });
    if (byPartialName) {
      return {
        found: true,
        deviceName: byPartialName.name,
        reason: 'preferred-partial-name',
        fallbackPort: PRINTER_FALLBACK_PORT,
      };
    }

    const fallback = await resolvePrinterTarget();
    if (fallback.found) {
      return { ...fallback, reason: `preferred-not-found-fallback-${fallback.reason}` };
    }

    return {
      found: false,
      deviceName: preferredPrinterName,
      reason: 'preferred-not-found',
      fallbackPort: PRINTER_FALLBACK_PORT,
    };
  }

  return resolvePrinterTarget();
}

// 🚀 FIX rendimiento (popup de factura → botón Imprimir): la parte lenta de
// esta función NUNCA fue el spooler de Windows (WritePrinter es instantáneo)
// sino `Add-Type -TypeDefinition`, que invoca al compilador de C# de .NET
// desde CERO en cada impresión — 1-2 segundos solo para compilar la misma
// clase de siempre, en cada ticket. Se compila UNA sola vez a un .dll
// cacheado en userData (persiste entre reinicios de la app); de ahí en
// adelante cada impresión solo lo CARGA con `Add-Type -Path` (sin
// recompilar), que es prácticamente instantáneo. El mecanismo de impresión
// en sí (WinSpool RAW vía P/Invoke) no cambia.
async function sendRawEscPosToWindowsSpool(printerName, rawBuffer) {
  const tempDir = app.getPath('temp');
  const jobId = `codecpos-${Date.now()}`;
  const dataPath = path.join(tempDir, `${jobId}.bin`);
  const psPath = path.join(tempDir, `${jobId}.ps1`);
  const dllPath = path.join(app.getPath('userData'), 'RawPrinterHelper.dll');

  await fsPromises.writeFile(dataPath, rawBuffer);

  const escapedData = dataPath.replace(/'/g, "''");
  const escapedPrinter = printerName.replace(/'/g, "''");
  const escapedDllPath = dllPath.replace(/'/g, "''");

  const psScript = `
$ErrorActionPreference = 'Stop'

$dllPath = '${escapedDllPath}'
if (-not (Test-Path $dllPath)) {
  Add-Type -OutputAssembly $dllPath -OutputType Library -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@
}
Add-Type -Path $dllPath

$bytes = [System.IO.File]::ReadAllBytes('${escapedData}')
$h = [IntPtr]::Zero

if (-not [RawPrinterHelper]::OpenPrinter('${escapedPrinter}', [ref]$h, [IntPtr]::Zero)) {
  throw "No se pudo abrir la impresora: ${escapedPrinter}"
}

try {
  $doc = New-Object RawPrinterHelper+DOCINFOA
  $doc.pDocName = 'CODECPOS_ESC_POS_RAW'
  $doc.pDataType = 'RAW'

  if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, $doc)) { throw 'StartDocPrinter falló' }
  if (-not [RawPrinterHelper]::StartPagePrinter($h)) { throw 'StartPagePrinter falló' }

  $written = 0
  if (-not [RawPrinterHelper]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) {
    throw 'WritePrinter falló'
  }

  [RawPrinterHelper]::EndPagePrinter($h) | Out-Null
  [RawPrinterHelper]::EndDocPrinter($h) | Out-Null
} finally {
  [RawPrinterHelper]::ClosePrinter($h) | Out-Null
}
`;

  await fsPromises.writeFile(psPath, psScript, 'utf8');

  try {
    await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, {
      windowsHide: true,
      timeout: 15000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } finally {
    await fsPromises.unlink(dataPath).catch(() => {});
    await fsPromises.unlink(psPath).catch(() => {});
  }
}

// ── Splash Screen Premium ─────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:           480,
    height:          320,
    frame:           false,
    transparent:     true,
    alwaysOnTop:     true,
    center:          true,
    resizable:       false,
    skipTaskbar:     true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Splash inline — no depende de ningún archivo externo
  const splashHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: transparent;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; overflow: hidden;
      -webkit-app-region: drag;
    }
    .card {
      background: linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.98) 100%);
      border: 1px solid rgba(16,185,129,0.3);
      border-radius: 24px;
      padding: 40px 48px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05),
                  inset 0 1px 0 rgba(255,255,255,0.1);
      animation: slideIn .4s cubic-bezier(.34,1.56,.64,1);
      width: 440px;
    }
    @keyframes slideIn {
      from { opacity:0; transform: scale(.92) translateY(16px); }
      to   { opacity:1; transform: scale(1)  translateY(0); }
    }
    .logo-wrap {
      width: 88px; height: 88px;
      margin: 0 auto 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 60%, #047857 100%);
      border-radius: 22px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 16px 40px rgba(16,185,129,.45), 0 0 0 1px rgba(16,185,129,.2);
      animation: breathe 2.4s ease-in-out infinite;
      position: relative;
      overflow: hidden;
    }
    .logo-wrap::before {
      content: '';
      position: absolute;
      top: -30%; left: -30%;
      width: 70%; height: 70%;
      background: rgba(255,255,255,.18);
      border-radius: 50%;
      filter: blur(8px);
    }
    @keyframes breathe {
      0%,100% { transform: scale(1); box-shadow: 0 16px 40px rgba(16,185,129,.45); }
      50%      { transform: scale(1.04); box-shadow: 0 20px 50px rgba(16,185,129,.6); }
    }
    .logo-text {
      font-size: 32px; font-weight: 900;
      color: white; letter-spacing: -1px;
      text-shadow: 0 2px 8px rgba(0,0,0,.4);
      position: relative; z-index: 1;
    }
    h1 {
      color: #f1f5f9; font-size: 22px; font-weight: 700;
      letter-spacing: -.5px; margin-bottom: 4px;
    }
    .sub {
      color: #64748b; font-size: 12px; font-weight: 500;
      text-transform: uppercase; letter-spacing: 1.5px;
      margin-bottom: 28px;
    }
    .bar-wrap {
      width: 100%; height: 3px;
      background: rgba(255,255,255,.08);
      border-radius: 99px; overflow: hidden;
    }
    .bar {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #34d399, #10b981);
      background-size: 200% 100%;
      border-radius: 99px;
      animation: load 2.4s ease-in-out forwards, shimmer 1.2s linear infinite;
    }
    @keyframes load {
      0%   { width: 5%; }
      40%  { width: 65%; }
      80%  { width: 90%; }
      100% { width: 99%; }
    }
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .status {
      margin-top: 14px; color: #475569;
      font-size: 11px; font-weight: 500; letter-spacing: .5px;
    }
    .dots span {
      display: inline-block;
      animation: dot .8s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: .15s; }
    .dots span:nth-child(3) { animation-delay: .3s; }
    @keyframes dot { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      margin-top: 20px; padding: 4px 12px;
      background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.2);
      border-radius: 99px; color: #34d399;
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
    }
    .dot-green { width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: breathe 1s ease-in-out infinite; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap"><div class="logo-text">CP</div></div>
    <h1>CODEC POS</h1>
    <p class="sub">Sistema Punto de Venta</p>
    <div class="bar-wrap"><div class="bar"></div></div>
    <p class="status" id="st">Iniciando sistema<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>
    <div class="badge"><div class="dot-green"></div>v2.0 · Codec Studio</div>
  </div>
  <script>
    const msgs = ['Cargando módulos','Inicializando POS','Conectando hardware','Preparando interfaz','¡Sistema listo!'];
    let i = 0;
    const el = document.getElementById('st');
    setInterval(() => {
      if (i < msgs.length) { el.innerHTML = msgs[i++] + '<span class="dots"><span>.</span><span>.</span><span>.</span></span>'; }
    }, 550);
  </script>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.on('closed', () => { splashWindow = null; });
}

// ── Ventana principal (OPTIMIZADA PARA BAJOS RECURSOS) ───────────────────────
function createWindow() {
  const iconPath   = findIcon();
  const preloadPath = findPreload();
  const indexPath  = findIndexHtml();

  const winOpts = {
    width:     1440,
    height:    900,
    minWidth:  1100,
    minHeight: 700,
    center:    true,
    webPreferences: {
      preload:             preloadPath,
      nodeIntegration:     false,
      contextIsolation:    true,
      webSecurity:         true,
      enableBlinkFeatures: 'CSSBackdropFilter',
      // Permitir reproducción de audio (impresora, escáner)
      autoplayPolicy:      'no-user-gesture-required',
      
      // ✅ OPTIMIZACIONES PARA BAJOS RECURSOS
      backgroundThrottling: true,  // Throttle cuando está en background
      offscreen: false,             // No renderizar offscreen
      
      // ✅ Reducir uso de memoria
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      
      // ✅ Deshabilitar características no usadas
      webgl: false,                 // No usamos WebGL
      plugins: false,               // No plugins
      
      // ✅ Limitar cache para reducir memoria
      partition: 'persist:codecpos',
    },
    backgroundColor: '#0f172a',
    title:           'CODEC POS v2.0 — Sistema Punto de Venta',
    autoHideMenuBar: true,
    transparent:     false,
    frame:           true,
    // No mostrar hasta que esté listo → evita flash blanco
    show:            false,
  };

  if (iconPath) winOpts.icon = iconPath;

  mainWindow = new BrowserWindow(winOpts);
  
  // ✅ OPTIMIZACIÓN: Limitar memoria de la ventana
  mainWindow.webContents.setMaxListeners(10); // Reducir listeners
  
  // ✅ OPTIMIZACIÓN: Garbage collection más frecuente
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.session.clearCache();
    }
  }, 600000); // Cada 10 minutos

  // Deshabilitar menú nativo en producción
  Menu.setApplicationMenu(null);

  checkAdminPrivileges();

  // ── Cargar la app ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('❌ No se pudo conectar al servidor de Vite (localhost:5173):', err.message);
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><style>
          body { background:#0f172a; color:#f1f5f9; font-family:system-ui; display:flex;
                 align-items:center; justify-content:center; height:100vh; margin:0; }
          .box { text-align:center; padding:40px; background:rgba(239,68,68,.1);
                 border:1px solid rgba(239,68,68,.3); border-radius:16px; max-width:520px; }
          h2 { color:#ef4444; margin-bottom:16px; }
          p { color:#94a3b8; font-size:14px; line-height:1.6; }
          code { background:rgba(255,255,255,.1); padding:2px 8px; border-radius:4px; font-family:monospace; font-size:12px; }
        </style></head>
        <body><div class="box">
          <h2>⚠️ No se pudo conectar al servidor de desarrollo</h2>
          <p>Electron no logró cargar <code>http://localhost:5173</code>.</p>
          <p>Verifica que <code>npm run dev</code> (Vite) esté corriendo antes de abrir Electron.</p>
          <p>Error: <code>${err.message}</code></p>
        </div></body></html>
      `)}`);
    });
    // DevTools abiertas en desarrollo para ver cualquier error de renderer al instante.
    mainWindow.webContents.openDevTools();
  } else {
    console.log('📂 Cargando:', indexPath);
    // Diagnóstico silencioso (sin abrir ventana de DevTools): estos listeners
    // solo escriben a consola/log si algo falla, no interrumpen al usuario.
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
      console.error('❌ did-fail-load:', errorCode, errorDescription);
    });
    // 🛡️ BLINDAJE contra pantalla negra: si el proceso de render se cae
    // (crash, GPU inestable, sin memoria), Electron deja la ventana pintada
    // en negro y no vuelve a intentar nada por sí solo. Antes esto solo se
    // registraba en consola — el usuario se quedaba con una pantalla negra
    // permanente hasta cerrar el proceso manualmente. Ahora:
    //   1) Se recarga la ventana automáticamente.
    //   2) Si vuelve a caerse en menos de 15s (crash-loop → casi siempre GPU),
    //      se activa el modo seguro de GPU para el PRÓXIMO arranque
    //      (ver GPU_SAFE_MODE_FLAG arriba) y se relanza la app ya mismo.
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.error('❌ render-process-gone:', details.reason, details.exitCode);
      fileLogger.writeLog('CRITICAL', 'Render process gone — recuperando automáticamente', {
        reason: details.reason,
        exitCode: details.exitCode,
      });

      const ahora = Date.now();
      renderCrashCount = (ahora - lastRenderCrashAt < 15000) ? renderCrashCount + 1 : 1;
      lastRenderCrashAt = ahora;

      if (renderCrashCount >= 2 && !gpuSafeModeActivo) {
        try {
          fs.writeFileSync(GPU_SAFE_MODE_FLAG, 'crash-loop', 'utf8');
        } catch { /* no-op */ }
        fileLogger.writeLog('WARN', 'Crash-loop de renderer detectado — modo seguro de GPU activado para el próximo arranque');
        app.relaunch();
        app.exit(0);
        return;
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    });
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) console.log(`🖥️ [renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    // Si la app cargó y se mantuvo estable, el modo seguro de GPU (si estaba
    // activo por un crash previo) ya cumplió su propósito — se retira para
    // que el próximo arranque vuelva a intentar aceleración por hardware.
    // 🛡️ EXCEPCIÓN: si el modo seguro se activó porque este equipo YA
    // DEMOSTRÓ (vía app.getGPUFeatureStatus()) que no tiene compositing por
    // hardware real — no un crash transitorio — no tiene sentido volver a
    // intentarlo cada sesión: ese hardware seguirá sin acelerar y solo se
    // pierde tiempo de arranque en la negociación de GPU. En ese caso el
    // modo seguro se queda activo de forma permanente.
    mainWindow.webContents.on('did-finish-load', () => {
      if (!gpuSafeModeActivo) return;
      let motivo = '';
      try { motivo = fs.readFileSync(GPU_SAFE_MODE_FLAG, 'utf8').trim(); } catch { /* no-op */ }
      if (motivo === 'software-detected') return;
      setTimeout(() => {
        try { fs.unlinkSync(GPU_SAFE_MODE_FLAG); } catch { /* no-op */ }
      }, 20000);
    });
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('❌ Error cargando index.html:', err.message);
      // Mostrar página de error descriptiva
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <style>
            body { background:#0f172a; color:#f1f5f9; font-family:system-ui; display:flex;
                   align-items:center; justify-content:center; height:100vh; margin:0; }
            .box { text-align:center; padding:40px; background:rgba(239,68,68,.1);
                   border:1px solid rgba(239,68,68,.3); border-radius:16px; max-width:500px; }
            h2 { color:#ef4444; margin-bottom:16px; }
            p { color:#94a3b8; font-size:14px; line-height:1.6; }
            code { background:rgba(255,255,255,.1); padding:2px 8px; border-radius:4px;
                   font-family:monospace; font-size:12px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>⚠️ Error al cargar CODEC POS</h2>
            <p>No se encontró el archivo de la aplicación.</p>
            <p>Ruta buscada: <code>${indexPath}</code></p>
            <p>Error: <code>${err.message}</code></p>
            <p style="margin-top:20px">Contacta soporte: <strong>codecstudio.online</strong></p>
          </div>
        </body>
        </html>
      `)}`);
    });
  }

  // ── Mostrar ventana cuando esté lista y cerrar splash ─────────────────
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      // Pequeño delay para que el splash se vea al menos 1.2s
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
        mainWindow.show();
        mainWindow.focus();
      }, 1200);
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Abrir links externos en el navegador, nunca en Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-machine-id', async () => {
  try { return await getRealMachineUUID(); }
  catch { return 'CODEC-0000-0000-0000'; }
});

ipcMain.handle('is-admin', async () => isRunningAsAdmin);

// 🛡️ Le dice al renderer si este equipo ya fue detectado sin compositing por
// GPU real (ver gpuSafeModeActivo arriba), para que pueda apagar los efectos
// de backdrop-blur más costosos en toda la app — no solo en el login.
ipcMain.handle('system:is-software-rendering', async () => gpuSafeModeActivo);

ipcMain.handle('request-admin-restart', async () => {
  if (process.platform === 'win32') {
    spawn('powershell.exe', ['Start-Process', `"${process.execPath}"`, '-Verb', 'RunAs'],
      { detached: true, stdio: 'ignore' });
    app.quit();
  }
});

ipcMain.handle('get-os-info', async () => ({
  platform: process.platform,
  release:  os.release(),
  version:  os.version ? os.version() : '',
  arch:     os.arch(),
  hostname: os.hostname(),
  isAdmin:  isRunningAsAdmin,
}));

// Versión instalada de la app — usada por backupService.verificarYAutoRecuperar()
// para detectar si el arranque actual es justo después de una actualización.
ipcMain.handle('app:get-version', async () => app.getVersion());

ipcMain.handle('save-backup', async (_, { fileName, data }) => {
  try {
    const folder = path.join(app.getPath('documents'), 'CODEC_POS_Backups');
    await fsPromises.mkdir(folder, { recursive: true });
    const filePath = path.join(folder, fileName);
    await fsPromises.writeFile(filePath, data, 'utf8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── BLINDAJE: Respaldo automático en ruta segura fuera de %AppData% ─────────
// Ver electron/backupManager.js y electron/fileLogger.js para el detalle
// arquitectónico completo (por qué el JSON se serializa en el renderer y por
// qué "reparar" no toca los archivos internos de LevelDB directamente).

ipcMain.handle('backup:save-safe', async (_, jsonString) => {
  try {
    const result = backupManager.saveBackup(jsonString);
    fileLogger.writeLog('INFO', `Backup blindado creado: ${result.fileName}`, { bytes: result.bytes });
    return { success: true, ...result };
  } catch (e) {
    fileLogger.writeLog('ERROR', 'Falló la creación del backup blindado', { error: e.message });
    return { success: false, error: e.message };
  }
});

ipcMain.handle('backup:list', async () => {
  try { return { success: true, backups: backupManager.listBackups() }; }
  catch (e) { return { success: false, error: e.message, backups: [] }; }
});

ipcMain.handle('backup:read', async (_, fileName) => {
  try { return { success: true, data: backupManager.readBackup(fileName) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('backup:get-last-info', async () => {
  try { return { success: true, info: backupManager.getLastBackupInfo() }; }
  catch (e) { return { success: false, error: e.message, info: null }; }
});

ipcMain.handle('backup:get-dir', async () => backupManager.getBackupsDir());

// "Reparar base de datos": la única operación honesta y segura que Node puede
// ejecutar sobre un IndexedDB de Chromium dañado es descartar el storage de
// la partición (que es justo lo que ya está corrupto/vacío/bloqueado) para
// que Chromium lo reconstruya limpio. El renderer, al reiniciar, detecta que
// quedó vacío y ofrece restaurar automáticamente el último backup blindado.
ipcMain.handle('backup:repair', async () => {
  try {
    const ses = session.fromPartition(STORAGE_PARTITION);
    await ses.clearStorageData({ storages: ['indexdb', 'localstorage', 'cachestorage'] });
    fileLogger.writeLog('WARN', 'Reparación ejecutada: se limpió el storage local corrupto (IndexedDB/localStorage)');
    return { success: true };
  } catch (e) {
    fileLogger.writeLog('ERROR', 'Falló la reparación del storage local', { error: e.message });
    return { success: false, error: e.message };
  }
});

// ── Facturación electrónica DIAN: certificado/PIN cifrados con safeStorage ──
// El contenido real (buffer del .p12, PIN en claro) nunca vuelve al renderer
// — estos handlers solo devuelven metadata o booleanos de éxito/fallo.
ipcMain.handle('dian:guardar-certificado', async (_, { perfilFiscalId, base64, nombreArchivo }) => {
  try {
    const meta = dianSecrets.guardarCertificado(perfilFiscalId, base64, nombreArchivo);
    return { success: true, meta };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dian:obtener-metadata-certificado', async (_, perfilFiscalId) => {
  return dianSecrets.obtenerMetadataCertificado(perfilFiscalId);
});

ipcMain.handle('dian:existe-certificado', async (_, perfilFiscalId) => {
  return dianSecrets.existeCertificado(perfilFiscalId);
});

ipcMain.handle('dian:eliminar-certificado', async (_, perfilFiscalId) => {
  dianSecrets.eliminarCertificado(perfilFiscalId);
  return { success: true };
});

ipcMain.handle('dian:guardar-pin', async (_, { perfilFiscalId, pin }) => {
  try {
    dianSecrets.guardarPin(perfilFiscalId, pin);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dian:existe-pin', async (_, perfilFiscalId) => {
  return dianSecrets.existePin(perfilFiscalId);
});

ipcMain.handle('dian:eliminar-pin', async (_, perfilFiscalId) => {
  dianSecrets.eliminarPin(perfilFiscalId);
  return { success: true };
});

// Firma XAdES-EPES real — ver electron/dianSigner.js / dianXadesSigner.js.
ipcMain.handle('dian:firmar-documento', async (_, perfilFiscalId, base64) => {
  try {
    const xmlSinFirmar = Buffer.from(base64, 'base64');
    const xmlFirmado = await dianSigner.firmarXml(perfilFiscalId, xmlSinFirmar);
    return { success: true, base64Firmado: xmlFirmado.toString('base64') };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Transmisión SOAP real a la DIAN — ver electron/dianSoapClient.js.
ipcMain.handle('dian:enviar-factura-sync', async (_, perfilFiscalId, fileName, xmlFirmado, ambiente) => {
  try {
    if (!dianSecrets.existeCertificado(perfilFiscalId)) throw new Error('No hay certificado digital configurado para este perfil fiscal.');
    if (!dianSecrets.existePin(perfilFiscalId)) throw new Error('No hay PIN del certificado configurado para este perfil fiscal.');
    const p12Buffer = dianSecrets.leerCertificadoParaFirma(perfilFiscalId);
    const pin = dianSecrets.leerPinParaFirma(perfilFiscalId);
    const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
    const respuesta = await dianSoapClient.enviarFacturaSync({ p12Buffer, pin, ambiente, fileName, xmlFirmadoBase64: xmlBase64 });
    return { success: true, respuesta };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dian:enviar-set-pruebas', async (_, perfilFiscalId, fileName, xmlFirmado, testSetId) => {
  try {
    if (!dianSecrets.existeCertificado(perfilFiscalId)) throw new Error('No hay certificado digital configurado para este perfil fiscal.');
    if (!dianSecrets.existePin(perfilFiscalId)) throw new Error('No hay PIN del certificado configurado para este perfil fiscal.');
    const p12Buffer = dianSecrets.leerCertificadoParaFirma(perfilFiscalId);
    const pin = dianSecrets.leerPinParaFirma(perfilFiscalId);
    const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
    const respuesta = await dianSoapClient.enviarSetPruebas({ p12Buffer, pin, fileName, xmlFirmadoBase64: xmlBase64, testSetId });
    return { success: true, respuesta };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dian:consultar-estado', async (_, perfilFiscalId, trackId, ambiente) => {
  try {
    const p12Buffer = dianSecrets.leerCertificadoParaFirma(perfilFiscalId);
    const pin = dianSecrets.leerPinParaFirma(perfilFiscalId);
    const respuesta = await dianSoapClient.consultarEstado({ p12Buffer, pin, ambiente, trackId });
    return { success: true, respuesta };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dian:consultar-rango-numeracion', async (_, perfilFiscalId, ambiente, accountCode, accountCodeT, softwareCode) => {
  try {
    const p12Buffer = dianSecrets.leerCertificadoParaFirma(perfilFiscalId);
    const pin = dianSecrets.leerPinParaFirma(perfilFiscalId);
    const respuesta = await dianSoapClient.consultarRangoNumeracion({ p12Buffer, pin, ambiente, accountCode, accountCodeT, softwareCode });
    return { success: true, respuesta };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('app:relaunch', async () => {
  fileLogger.writeLog('INFO', 'Relanzamiento de la aplicación solicitado (reinicio limpio o post-restauración)');
  app.relaunch();
  app.exit(0);
});

// ── BLINDAJE: Caja negra de auditoría física ─────────────────────────────────

ipcMain.handle('logs:read-recent', async (_, limit) => {
  try { return { success: true, lines: fileLogger.readRecentLines(limit || 100) }; }
  catch (e) { return { success: false, error: e.message, lines: [] }; }
});

ipcMain.handle('logs:write', async (_, { level, message, meta }) => {
  fileLogger.writeLog(level || 'INFO', message, meta);
  return { success: true };
});

ipcMain.handle('logs:get-dir', async () => fileLogger.getLogsDir());

// ── BLINDAJE: Telemetría para la Sección de Desarrollador ────────────────────

ipcMain.handle('system:get-telemetry', async () => {
  let windowsUser = 'desconocido';
  try { windowsUser = os.userInfo().username; } catch { /* no-op */ }

  const storagePath = path.join(app.getPath('userData'), 'Partitions', 'codecpos');
  const dbSizeBytes = backupManager.getDirSize(storagePath);
  const lastBackup = backupManager.getLastBackupInfo();

  return {
    windowsUser,
    storagePath,
    userDataPath: app.getPath('userData'),
    dbSizeBytes,
    lastBackup,
    backupsDir: backupManager.getBackupsDir(),
    logsDir: fileLogger.getLogsDir(),
  };
});

// ── Diagnóstico rápido: espacio libre en disco ───────────────────────────────
// Node no tiene una API nativa para esto; en Windows se consulta vía
// PowerShell (Get-PSDrive), que ya usamos en otras partes de este archivo
// para tareas administrativas puntuales.
async function getFreeDiskSpace(drive = 'C') {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "Get-PSDrive ${drive} | Select-Object -Property Used,Free | ConvertTo-Json"`,
      { windowsHide: true, timeout: 5000, encoding: 'utf8' }
    );
    const parsed = JSON.parse(stdout);
    return { freeBytes: Number(parsed.Free) || 0, usedBytes: Number(parsed.Used) || 0, drive };
  } catch (e) {
    console.warn('[Diagnóstico] No se pudo obtener espacio en disco:', e.message);
    return null;
  }
}

ipcMain.handle('system:get-disk-space', async () => {
  const info = await getFreeDiskSpace('C');
  return info || { freeBytes: null, usedBytes: null, drive: 'C' };
});

ipcMain.handle('show-notification', async (_, { title, body, urgency }) => {
  try {
    new Notification({ title, body, urgency: urgency || 'normal' }).show();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-external', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('show-message-box', async (_, opts) => {
  const result = await dialog.showMessageBox(mainWindow, opts);
  refocusMainWindow();
  return result;
});

ipcMain.handle('printer:get-config', async () => ({
  targetName: PRINTER_TARGET_NAME,
  fallbackPort: PRINTER_FALLBACK_PORT,
}));

ipcMain.handle('printer:list-system', async () => {
  return listSystemPrinters();
});

// Compatibilidad con API previa del renderer
try {
  ipcMain.removeHandler('printer:list');
} catch {
  // no-op: no había handler previo
}
ipcMain.handle('printer:list', async () => {
  return listSystemPrinters();
});

ipcMain.handle('printer:resolve-target', async () => {
  return resolvePrinterTarget();
});

ipcMain.handle('printer:check-availability', async (_, printerName) => {
  try {
    const printers = await listSystemPrinters();
    const exists = Boolean(printers.find((p) => p.name === printerName));
    return { success: true, available: exists, printerName };
  } catch (error) {
    return { success: false, available: false, printerName, error: error.message };
  }
});

ipcMain.handle('printer:raw-escpos', async (_, payload) => {
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Raw ESC/POS spool solo está soportado en Windows' };
    }

    const preferredPrinterName = payload?.printerName;
    const resolved = await resolvePrinterTargetByPreference(preferredPrinterName);
    const targetName = resolved.deviceName || PRINTER_TARGET_NAME;

    if (!resolved.found) {
      return {
        success: false,
        error: 'La impresora predeterminada no está conectada. Por favor, verifícala en el área de Dispositivos',
        code: 'PRINTER_NOT_AVAILABLE',
        printer: targetName,
      };
    }

    const rawBuffer = payload?.base64
      ? Buffer.from(payload.base64, 'base64')
      : Buffer.from(payload?.text || '', 'binary');

    if (!rawBuffer.length) {
      return { success: false, error: 'No se recibieron datos ESC/POS para imprimir' };
    }

    await sendRawEscPosToWindowsSpool(targetName, rawBuffer);

    return {
      success: true,
      printer: targetName,
      targetName: PRINTER_TARGET_NAME,
      fallbackPort: PRINTER_FALLBACK_PORT,
      bytes: rawBuffer.length,
      resolution: resolved.reason,
    };
  } catch (error) {
    console.error('❌ Error enviando ESC/POS RAW a Windows spool:', error);
    return { success: false, error: error.message };
  }
});

// Compatibilidad: ticket de prueba rápido
ipcMain.handle('printer:test', async (_, printerName) => {
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Prueba RAW ESC/POS solo soportada en Windows' };
    }

    const escposTest = Buffer.from([
      0x1B, 0x40,
      0x1B, 0x61, 0x01,
      0x50, 0x52, 0x55, 0x45, 0x42, 0x41, 0x20, 0x50, 0x4F, 0x53, 0x2D, 0x38, 0x30, 0x0A,
      0x1B, 0x61, 0x00,
      0x55, 0x53, 0x42, 0x30, 0x30, 0x38, 0x0A,
      0x0A, 0x0A,
      0x1D, 0x56, 0x41, 0x00,
    ]);

    const resolved = await resolvePrinterTargetByPreference(printerName);
    const targetName = resolved.deviceName || PRINTER_TARGET_NAME;
    if (!resolved.found) {
      return {
        success: false,
        error: 'La impresora predeterminada no está conectada. Por favor, verifícala en el área de Dispositivos',
        code: 'PRINTER_NOT_AVAILABLE',
      };
    }
    await sendRawEscPosToWindowsSpool(targetName, escposTest);

    return {
      success: true,
      printer: targetName,
      targetName: PRINTER_TARGET_NAME,
      fallbackPort: PRINTER_FALLBACK_PORT,
      bytes: escposTest.length,
      resolution: resolved.reason,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ── Pantalla Completa ─────────────────────────────────────────────────────────
ipcMain.handle('toggle-fullscreen', async () => {
  if (!mainWindow) return false;
  const isFullScreen = mainWindow.isFullScreen();
  mainWindow.setFullScreen(!isFullScreen);
  return !isFullScreen;
});

ipcMain.handle('is-fullscreen', async () => {
  if (!mainWindow) return false;
  return mainWindow.isFullScreen();
});

ipcMain.handle('set-fullscreen', async (_, value) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(value);
  return value;
});

// ── IMPRESIÓN DE ETIQUETAS (SILENT PRINT) ────────────────────────────────────

ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) return [];
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map(p => ({
      name:        p.name,
      displayName: p.displayName || p.name,
      isDefault:   p.isDefault ?? false,
    }));
  } catch { return []; }
});

ipcMain.handle('print-label', async (_, { printerName, html, widthMm, heightMm }) => {
  // Ver comentario equivalente en 'print:html': resolver el nombre guardado
  // contra las impresoras reales antes de imprimir, en vez de confiar en un
  // nombre potencialmente desactualizado.
  const resolvedPrinter = printerName ? await resolvePrinterTargetByPreference(printerName) : null;
  const resolvedDeviceName = resolvedPrinter?.found ? resolvedPrinter.deviceName : '';

  return new Promise((resolve) => {
    // Escribir HTML a archivo temporal para que Electron pueda cargarlo con loadFile
    const tempPath = path.join(os.tmpdir(), `codecpos_label_${Date.now()}.html`);
    try {
      fs.writeFileSync(tempPath, html, 'utf8');
    } catch {
      return resolve({ ok: false, error: 'Error escribiendo archivo temporal' });
    }

    const win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const cleanup = () => {
      try { win.destroy(); } catch {}
      try { fs.unlinkSync(tempPath); } catch {}
    };

    // Timeout de seguridad: 20 segundos
    const guard = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: 'Timeout de impresión' });
    }, 20000);

    win.webContents.once('did-finish-load', () => {
      const w = Math.round((Number(widthMm)  || 58) * 1000); // mm → micrones
      const h = Math.round((Number(heightMm) || 40) * 1000);

      win.webContents.print(
        {
          silent:          true,
          printBackground: true,
          deviceName:      resolvedDeviceName,
          margins:         { marginType: 'none' },
          pageSize:        { width: w, height: h },
        },
        (success, errorType) => {
          clearTimeout(guard);
          cleanup();
          refocusMainWindow();
          resolve({ ok: success, error: errorType || null });
        }
      );
    });

    win.webContents.once('did-fail-load', (_e, _code, desc) => {
      clearTimeout(guard);
      cleanup();
      refocusMainWindow();
      resolve({ ok: false, error: desc || 'Error cargando etiqueta' });
    });

    win.loadFile(tempPath);
  });
});

// ── ZOOM / ESCALA DE PANTALLA ─────────────────────────────────────────────────
ipcMain.handle('app:get-zoom', async () => {
  if (!mainWindow) return 1;
  return mainWindow.webContents.getZoomFactor();
});

ipcMain.handle('app:set-zoom', async (_, factor) => {
  if (!mainWindow) return false;
  const clamped = Math.max(0.5, Math.min(2.0, Number(factor) || 1));
  mainWindow.webContents.setZoomFactor(clamped);
  return clamped;
});

// ── SISTEMA DE PERSISTENCIA DE USUARIOS ──────────────────────────────────────
// ✅ Guardar usuarios en archivo userData (persiste entre sesiones del .exe)
ipcMain.handle('guardar-usuarios', async (_, usuarios) => {
  try {
    const userDataPath = app.getPath('userData');
    const usuariosFolder = path.join(userDataPath, 'CODEC_POS_Data');
    
    // Crear carpeta si no existe
    await fsPromises.mkdir(usuariosFolder, { recursive: true });
    
    const usuariosFilePath = path.join(usuariosFolder, 'usuarios.json');
    const backupFilePath = path.join(usuariosFolder, 'usuarios_backup.json');
    
    // Crear backup del archivo anterior (si existe)
    try {
      if (fs.existsSync(usuariosFilePath)) {
        await fsPromises.copyFile(usuariosFilePath, backupFilePath);
      }
    } catch (backupError) {
      console.warn('⚠️ No se pudo crear backup de usuarios:', backupError.message);
    }
    
    // Guardar usuarios con formato legible
    const data = JSON.stringify(usuarios, null, 2);
    await fsPromises.writeFile(usuariosFilePath, data, 'utf8');
    
    console.log('✅ [Electron] Usuarios guardados en:', usuariosFilePath);
    console.log('📊 [Electron] Total usuarios guardados:', usuarios.length);
    
    return { 
      success: true, 
      path: usuariosFilePath,
      count: usuarios.length 
    };
  } catch (error) {
    console.error('❌ [Electron] Error guardando usuarios:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// ✅ Cargar usuarios desde archivo userData
ipcMain.handle('cargar-usuarios', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const usuariosFolder = path.join(userDataPath, 'CODEC_POS_Data');
    const usuariosFilePath = path.join(usuariosFolder, 'usuarios.json');
    const backupFilePath = path.join(usuariosFolder, 'usuarios_backup.json');
    
    console.log('📂 [Electron] Intentando cargar usuarios desde:', usuariosFilePath);
    
    // Intentar cargar archivo principal
    if (fs.existsSync(usuariosFilePath)) {
      try {
        const data = await fsPromises.readFile(usuariosFilePath, 'utf8');
        const usuarios = JSON.parse(data);
        
        console.log('✅ [Electron] Usuarios cargados correctamente:', usuarios.length);
        return { 
          success: true, 
          usuarios: usuarios,
          source: 'main'
        };
      } catch (parseError) {
        console.warn('⚠️ [Electron] Error parseando archivo principal, intentando backup...');
      }
    }
    
    // Si falla, intentar cargar backup
    if (fs.existsSync(backupFilePath)) {
      try {
        const data = await fsPromises.readFile(backupFilePath, 'utf8');
        const usuarios = JSON.parse(data);
        
        console.log('✅ [Electron] Usuarios recuperados desde backup:', usuarios.length);
        
        // Restaurar archivo principal desde backup
        await fsPromises.copyFile(backupFilePath, usuariosFilePath);
        
        return { 
          success: true, 
          usuarios: usuarios,
          source: 'backup'
        };
      } catch (backupError) {
        console.warn('⚠️ [Electron] Error cargando backup:', backupError.message);
      }
    }
    
    console.log('ℹ️ [Electron] No hay usuarios guardados aún');
    return { 
      success: true, 
      usuarios: [],
      source: 'none'
    };
    
  } catch (error) {
    console.error('❌ [Electron] Error cargando usuarios:', error);
    return { 
      success: false, 
      error: error.message,
      usuarios: []
    };
  }
});

// ✅ Verificar integridad de archivos de usuarios
ipcMain.handle('verificar-usuarios', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const usuariosFolder = path.join(userDataPath, 'CODEC_POS_Data');
    const usuariosFilePath = path.join(usuariosFolder, 'usuarios.json');
    const backupFilePath = path.join(usuariosFolder, 'usuarios_backup.json');
    
    const result = {
      mainFileExists: fs.existsSync(usuariosFilePath),
      backupFileExists: fs.existsSync(backupFilePath),
      userDataPath: userDataPath,
      usuariosFolder: usuariosFolder,
    };
    
    if (result.mainFileExists) {
      try {
        const stats = await fsPromises.stat(usuariosFilePath);
        result.mainFileSize = stats.size;
        result.mainFileModified = stats.mtime.toISOString();
      } catch (e) {
        result.mainFileError = e.message;
      }
    }
    
    if (result.backupFileExists) {
      try {
        const stats = await fsPromises.stat(backupFilePath);
        result.backupFileSize = stats.size;
        result.backupFileModified = stats.mtime.toISOString();
      } catch (e) {
        result.backupFileError = e.message;
      }
    }
    
    console.log('🔍 [Electron] Verificación de integridad:', result);
    return { success: true, ...result };
    
  } catch (error) {
    console.error('❌ [Electron] Error verificando integridad:', error);
    return { success: false, error: error.message };
  }
});

// ── Wi-Fi SSID ────────────────────────────────────────────────────────────────

async function getWifiSsid() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('netsh wlan show interfaces', {
        windowsHide: true, timeout: 5000, encoding: 'utf8',
      });
      // Buscar línea "SSID" (no "BSSID") con múltiples formatos de espaciado
      for (const line of stdout.split('\n')) {
        if (/BSSID/i.test(line)) continue;
        const m = line.match(/\bSSID\s*:\s*(.+)/);
        if (m && m[1].trim()) return m[1].trim();
      }
    } else if (process.platform === 'linux') {
      const { stdout } = await execAsync('iwgetid -r', { timeout: 3000, encoding: 'utf8' });
      if (stdout.trim()) return stdout.trim();
    }
  } catch { /* sin wifi, sin permiso o sin adaptador */ }
  return null;
}

ipcMain.handle('wifi:get-ssid', async () => {
  return await getWifiSsid();
});

// ── Red: Obtener SSID actual con estado completo ───────────────────────────────

ipcMain.handle('network:getCurrentSSID', async () => {
  try {
    if (process.platform !== 'win32') return { ssid: null, connected: false };
    const { stdout } = await execAsync('netsh wlan show interfaces', {
      windowsHide: true, timeout: 5000, encoding: 'utf8',
    });

    let ssid = null;
    let estado = '';
    let tipo = '';
    let velocidad = '';

    for (const line of stdout.split('\n')) {
      if (/BSSID/i.test(line)) continue;
      const ssidM = line.match(/\bSSID\s*:\s*(.+)/);
      if (ssidM && ssidM[1].trim()) ssid = ssidM[1].trim();

      const estadoM = line.match(/Estado\s*:\s*(.+)/i) || line.match(/State\s*:\s*(.+)/i);
      if (estadoM) estado = estadoM[1].trim();

      const tipoM = line.match(/Tipo de radio\s*:\s*(.+)/i) || line.match(/Radio type\s*:\s*(.+)/i);
      if (tipoM) tipo = tipoM[1].trim();

      const velM = line.match(/Velocidad de recepción\s*:\s*(.+)/i) || line.match(/Receive rate\s*:\s*(.+)/i);
      if (velM) velocidad = velM[1].trim();
    }

    const connected = !!ssid && (estado.toLowerCase().includes('conectado') || estado.toLowerCase().includes('connected'));
    return { ssid, connected, estado, tipo, velocidad };
  } catch (err) {
    return { ssid: null, connected: false, error: err.message };
  }
});

// ── Red: Escaneo rápido de SSIDs disponibles ──────────────────────────────────

ipcMain.handle('network:scanAvailable', async () => {
  try {
    if (process.platform !== 'win32') return { ok: false, networks: [] };
    // Sin mode=Bssid es más rápido — solo necesitamos los nombres
    const { stdout } = await execAsync('netsh wlan show networks', {
      windowsHide: true, timeout: 8000, encoding: 'utf8',
    });
    const networks = [];
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^SSID \d+\s*:\s*(.+)$/);
      if (m && m[1].trim()) networks.push({ ssid: m[1].trim() });
    }
    return { ok: true, networks };
  } catch (err) {
    return { ok: false, networks: [], error: err.message };
  }
});

// ── Wi-Fi: Escaneo de redes visibles (solo Windows) ───────────────────────────

function parseWifiNetworks(output) {
  // Dividir por bloque de SSID (cada SSID N : ...)
  const networks = [];
  const lines = output.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const ssidMatch = line.match(/^SSID \d+\s*:\s*(.+)$/);
    const signalMatch = line.match(/Signal\s*:\s*(\d+)%/);
    const authMatch = line.match(/Authentication\s*:\s*(.+)$/);
    const channelMatch = line.match(/Channel\s*:\s*(\d+)/);
    if (ssidMatch) {
      if (current) networks.push(current);
      current = { ssid: ssidMatch[1].trim(), signal: null, auth: null, channel: null };
    } else if (current) {
      if (signalMatch) current.signal = parseInt(signalMatch[1]);
      else if (authMatch) current.auth = authMatch[1].trim();
      else if (channelMatch) current.channel = parseInt(channelMatch[1]);
    }
  }
  if (current) networks.push(current);
  // Deduplicar por SSID — conservar la señal más fuerte
  const map = new Map();
  for (const n of networks) {
    if (!n.ssid) continue;
    const existing = map.get(n.ssid);
    if (!existing || (n.signal ?? 0) > (existing.signal ?? 0)) map.set(n.ssid, n);
  }
  return [...map.values()].sort((a, b) => (b.signal ?? 0) - (a.signal ?? 0));
}

ipcMain.handle('wifi:scan-networks', async () => {
  try {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Solo disponible en Windows', networks: [] };
    }
    const { stdout } = await execAsync('netsh wlan show networks mode=Bssid', {
      windowsHide: true, timeout: 8000, encoding: 'utf8',
    });
    const networks = parseWifiNetworks(stdout);
    return { ok: true, networks };
  } catch (err) {
    return { ok: false, error: err.message, networks: [] };
  }
});

// ── LAN: helpers de cableado de eventos ──────────────────────────────────────

function attachLanServerListeners() {
  if (lanListenersAttached) return;
  lanListenersAttached = true;

  lanServer.on('connected', (data) => {
    mainWindow?.webContents.send('lan:client-connected', data);
  });
  lanServer.on('disconnected', (data) => {
    mainWindow?.webContents.send('lan:client-disconnected', data);
  });
  lanServer.on('event', (data) => {
    mainWindow?.webContents.send('lan:event-received', data);
  });
}

function attachLanClientListeners() {
  if (lanListenersAttached) return;
  lanListenersAttached = true;

  lanClient.on('status', (data) => {
    mainWindow?.webContents.send('lan:connection-status', data);
  });
  lanClient.on('server-event', (data) => {
    mainWindow?.webContents.send('lan:event-received', data);
  });
  lanClient.on('audit-request', (data) => {
    mainWindow?.webContents.send('lan:audit-request', data);
  });
}

function resetLanListeners() {
  lanListenersAttached = false;
  lanServer.removeAllListeners('connected');
  lanServer.removeAllListeners('disconnected');
  lanServer.removeAllListeners('event');
  lanClient.removeAllListeners('status');
  lanClient.removeAllListeners('server-event');
  lanClient.removeAllListeners('audit-request');
}

// ── LAN: IPC Handlers ────────────────────────────────────────────────────────

ipcMain.handle('lan:start-server', async () => {
  try {
    if (lanMode === 'server') {
      return { ok: true, ip: lanServer.localIp, port: 4000, alreadyRunning: true };
    }
    if (lanMode === 'client') { lanClient.stop(); resetLanListeners(); }
    lanMode = 'server';
    attachLanServerListeners();
    const result = await lanServer.start();
    // Auto-iniciar API HTTP para tablets/dispositivos externos (comandas)
    lanServer.startHttp().catch(err => console.warn('[LAN HTTP] No pudo iniciar:', err.message));
    return { ok: true, ...result };
  } catch (err) {
    lanMode = 'none';
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lan:start-client', async (_, { identity, serverIp }) => {
  try {
    if (lanMode === 'client') { lanClient.stop(); resetLanListeners(); }
    if (lanMode === 'server') { lanServer.stop(); resetLanListeners(); }
    lanMode = 'client';
    attachLanClientListeners();
    lanClient.start(identity, serverIp || null);
    return { ok: true };
  } catch (err) {
    lanMode = 'none';
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lan:stop', async () => {
  if (lanMode === 'server') lanServer.stop();
  if (lanMode === 'client') lanClient.stop();
  resetLanListeners();
  lanMode = 'none';
  return { ok: true };
});

ipcMain.handle('lan:emit-event', async (_, event) => {
  try {
    console.log(`[LAN][emit-event] modo=${lanMode} type=${event?.type} targetUserId=${event?.targetUserId ?? '(broadcast)'}`);
    if (lanMode === 'client') {
      // Cliente (cajero/técnico) → envía al servidor para que lo reenvíe
      lanClient.send(event);
    } else if (lanMode === 'server') {
      if (event.targetUserId) {
        // Evento dirigido: el admin envía a un técnico/cajero específico por userId.
        // Si está offline, queda en cola y se entrega cuando conecte.
        lanServer.routeToUser(event.targetUserId, event);
      } else {
        // Evento de broadcast: llega a todas las terminales conectadas
        const destinatarios = lanServer.getClients().length;
        console.log(`[LAN][broadcast] type=${event.type} → ${destinatarios} terminal(es) conectada(s)`);
        lanServer.broadcast(event);
      }
      // Registrar en el renderer del admin (logs de monitoreo)
      lanServer.emit('event', event);
    } else {
      console.warn(`[LAN][emit-event] Descartado: no hay servidor ni cliente LAN activo (lanMode='none') — type=${event?.type}`);
    }
    return { ok: true };
  } catch (e) {
    console.error('[LAN][emit-event] Error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('lan:get-status', async () => {
  return {
    mode: lanMode,
    localIp: lanServer.localIp,
    clients: lanMode === 'server' ? lanServer.getClients() : [],
    connected: lanMode === 'client' ? lanClient.connected : lanMode === 'server',
    httpRunning: !!lanServer.httpServer,
    httpPort: lanServer.httpPort,
  };
});

ipcMain.handle('lan:start-http', async () => {
  if (lanMode !== 'server') return { ok: false, error: 'Solo disponible en modo servidor' };
  try {
    const result = await lanServer.startHttp();
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lan:stop-http', async () => {
  lanServer.stopHttp();
  return { ok: true };
});

ipcMain.handle('lan:get-http-status', async () => {
  return {
    running: !!lanServer.httpServer,
    port: lanServer.httpPort,
    ip: lanServer.localIp,
    url: `http://${lanServer.localIp}:${lanServer.httpPort}`,
  };
});

ipcMain.handle('lan:get-clients', async () => {
  return lanMode === 'server' ? lanServer.getClients() : [];
});

// ── LAN Auth: sincronización de empleados y terminales activas ────────────────

ipcMain.handle('lan:set-auth-data', async (_, employees) => {
  try {
    lanServer.setAuthData(employees);
    return { ok: true, count: Array.isArray(employees) ? employees.length : 0 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lan:get-active-terminals', async () => {
  return lanServer.getActiveTerminals();
});

// Descubre servidores CODEC POS en la red escuchando UDP broadcast por 2.5 segundos
ipcMain.handle('lan:discover-servers', async () => {
  return new Promise((resolve) => {
    const PORT_UDP = 4001;
    const servers = new Map();
    const localIps = new Set();
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces) {
        if (iface.family === 'IPv4') localIps.add(iface.address);
      }
    }
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', () => { try { sock.close(); } catch {} resolve([...servers.values()]); });
    sock.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if ((data.tipo === 'CODEC_POS_SERVER' || data.type === 'CODECPOS_SERVER')
            && data.ip && data.port && !localIps.has(data.ip)) {
          servers.set(data.ip, { ip: data.ip, port: data.port, httpPort: 4002 });
        }
      } catch {}
    });
    sock.bind(PORT_UDP, () => {
      setTimeout(() => {
        try { sock.close(); } catch {}
        resolve([...servers.values()]);
      }, 2500);
    });
  });
});

ipcMain.handle('lan:get-local-ip', async () => {
  return lanServer.localIp;
});

ipcMain.handle('lan:send-audit-request', async (_, terminalId) => {
  if (lanMode === 'server') {
    lanServer.sendTo(terminalId, { type: 'AUDIT_REQUEST', terminalId, ts: Date.now() });
    return { ok: true };
  }
  return { ok: false, error: 'No en modo servidor' };
});

ipcMain.handle('lan:send-audit-response', async (_, { terminalId, payload }) => {
  if (lanMode === 'client') {
    lanClient.send({ type: 'AUDIT_RESPONSE', terminalId, payload, ts: Date.now() });
    return { ok: true };
  }
  return { ok: false };
});

// Entrega una orden de taller vía TCP + HTTP push directo al técnico
ipcMain.handle('lan:push-taller-orden', async (_, { event, userId }) => {
  if (lanMode !== 'server') return { ok: false, techOnline: false };

  // Canal TCP principal (offline queue si está desconectado)
  lanServer.routeToUser(userId, event);

  const techOnline = lanServer.isUserConnected(userId);

  if (techOnline) {
    const pushUrl = lanServer.getTechPushUrl(userId);
    if (pushUrl) {
      try {
        const body = JSON.stringify(event);
        await new Promise((resolve) => {
          const urlObj = new URL(pushUrl);
          const req = http.request(
            {
              hostname: urlObj.hostname,
              port: parseInt(urlObj.port, 10),
              path: '/',
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
              timeout: 3000,
            },
            (res) => { res.resume(); resolve({ ok: res.statusCode === 200 }); }
          );
          req.on('error', () => resolve({ ok: false }));
          req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
          req.write(body);
          req.end();
        });
        return { ok: true, techOnline: true, method: 'tcp+http' };
      } catch {
        return { ok: true, techOnline: true, method: 'tcp' };
      }
    }
    return { ok: true, techOnline: true, method: 'tcp' };
  }

  return { ok: true, techOnline: false, method: 'queued' };
});

// Retorna si un técnico está conectado por TCP en este momento
ipcMain.handle('lan:get-tech-status', async (_, userId) => {
  if (lanMode !== 'server') return { connected: false };
  return { connected: lanServer.isUserConnected(userId), userId };
});

// ── Impresión nativa vía webContents.print() ─────────────────────────────────
// Recibe HTML desde el renderer y lo imprime en la impresora configurada sin
// abrir ningún popup ni ventana emergente (Electron nativo, silent:true).
//
// 🖨️ FIX TAMAÑO DE TIRILLA: antes esto llamaba a webContents.print() SIN
// `pageSize`, dejando que el driver de la impresora decidiera el tamaño de
// página. Muchos drivers de impresoras térmicas (o el driver genérico de
// Windows) por defecto usan Carta/A4, así que en un rollo continuo la
// impresora seguía alimentando papel en blanco tratando de completar una
// página que no existe. Ahora se mide la altura real del contenido renderizado
// (document.documentElement.scrollHeight) y se arma un pageSize dinámico en
// micrones, exactamente como ya se hacía en 'print-label' — el corte queda
// justo donde termina el texto, sin importar el driver.
ipcMain.handle('print:html', async (_, { html, printerName = '', silent = true, widthMm = 80 }) => {
  const tmpPath = path.join(app.getPath('temp'), `codecpos_print_${Date.now()}.html`);
  try {
    await fsPromises.writeFile(tmpPath, html, 'utf8');

    // 🖨️ FIX: antes se pasaba `printerName` (leído de localStorage, posiblemente
    // desactualizado) directo como `deviceName` a webContents.print() sin
    // validarlo contra las impresoras reales del sistema. Si el nombre no
    // coincidía EXACTO, Chromium simplemente no imprimía nada (fallo
    // silencioso) — la factura "no salía bien" o no salía en absoluto, sin
    // ningún error visible. Ahora se resuelve con la misma cadena robusta que
    // ya usa el ticket térmico RAW (coincidencia parcial → POS-80 → puerto
    // USB008 → predeterminada del sistema) antes de imprimir.
    const resolvedPrinter = printerName ? await resolvePrinterTargetByPreference(printerName) : null;
    const resolvedDeviceName = resolvedPrinter?.found ? resolvedPrinter.deviceName : '';

    return await new Promise((resolve) => {
      const printWin = new BrowserWindow({
        show: false,
        width: 820,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      printWin.loadFile(tmpPath);

      printWin.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          // Medir el alto real del documento ya renderizado (en píxeles CSS).
          let alturaPx = 0;
          try {
            alturaPx = await printWin.webContents.executeJavaScript(
              'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)'
            );
          } catch { /* si falla la medición, se usa un alto de respaldo abajo */ }

          // 1mm ≈ 3.7795 px a 96 DPI (el DPI que usa Chromium para CSS).
          const anchoMicrones = Math.round(Number(widthMm || 80) * 1000);
          const altoMmMedido = alturaPx > 0 ? (alturaPx / 3.7795275591) + 4 : 150; // +4mm de margen de seguridad
          const altoMicrones = Math.max(30000, Math.round(altoMmMedido * 1000)); // mínimo 30mm

          printWin.webContents.print(
            {
              silent,
              printBackground: true,
              deviceName: resolvedDeviceName,
              margins: { marginType: 'none' },
              pageSize: { width: anchoMicrones, height: altoMicrones },
            },
            (success, failureReason) => {
              printWin.destroy();
              fsPromises.unlink(tmpPath).catch(() => {});
              refocusMainWindow();
              resolve({ ok: success, reason: failureReason || '' });
            }
          );
        }, 350);
      });

      printWin.on('closed', () => {
        fsPromises.unlink(tmpPath).catch(() => {});
        refocusMainWindow();
        resolve({ ok: false, reason: 'window-closed' });
      });
    });
  } catch (err) {
    fsPromises.unlink(tmpPath).catch(() => {});
    return { ok: false, reason: err.message };
  }
});

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // 🛡️ Caja negra: primera línea del día — usuario de Windows activo y si
  // arrancó sobre un perfil temporal (síntoma típico de "se me borró todo").
  fileLogger.logAppStart({ appVersion: app.getVersion(), platform: process.platform });

  // 🛡️ DIAGNÓSTICO: estado real de aceleración por GPU en este equipo.
  // Esto es lo que permite CONFIRMAR o DESCARTAR con evidencia (no hipótesis)
  // si una pantalla negra reportada por un cliente coincide con GPU en modo
  // software/deshabilitada. Sin esto, "puede ser la GPU" nunca deja de ser
  // una suposición — con esto, cada arranque deja constancia objetiva.
  try {
    const gpuStatus = app.getGPUFeatureStatus();
    fileLogger.writeLog('INFO', 'Estado de GPU al arrancar', { gpuStatus, safeModeActivo: gpuSafeModeActivo });

    // 🛡️ FIX FLUIDEZ: si Chromium ya decidió por su cuenta que este equipo no
    // tiene compositing por hardware real (típico en iGPUs viejas tipo Intel
    // HD 520 con drivers antiguos que Chromium tiene en lista negra), seguir
    // enviando switches que ASUMEN aceleración disponible ('enable-gpu-rasterization',
    // 'enable-zero-copy', etc. — ver arriba) solo hace que Chromium intente y
    // descarte esas rutas de GPU en cada arranque antes de caer a software,
    // gastando CPU en un equipo que ya tiene solo 2 núcleos. Si detectamos
    // esto UNA vez, activamos el mismo modo seguro que ya usa el blindaje
    // anti-crash-loop (app.disableHardwareAcceleration() en el próximo
    // arranque) para que Chromium arranque directo en software, sin negociar
    // GPU — arranque más liviano y más CPU libre para pintar la UI a tiempo.
    const compositingReal = gpuStatus?.gpu_compositing === 'enabled';
    if (!compositingReal && !gpuSafeModeActivo) {
      fileLogger.writeLog('WARN', 'GPU sin compositing por hardware real detectado — activando modo seguro de GPU para el próximo arranque (arranque más liviano)', { gpuStatus });
      try { fs.writeFileSync(GPU_SAFE_MODE_FLAG, 'software-detected', 'utf8'); } catch { /* no-op */ }
      app.relaunch();
      app.exit(0);
      return;
    }
  } catch (e) {
    fileLogger.writeLog('WARN', 'No se pudo leer el estado de GPU', { error: e.message });
  }

  // Abrir puertos LAN en el Firewall de Windows de forma silenciosa
  setupWindowsFirewall().catch(() => {});

  createSplash();
  // Crear ventana principal en paralelo (splash cubre el inicio)
  createWindow();

  // 🛡️ FIX: la inicialización de hardware (USB/seriales) se difiere hasta
  // DESPUÉS de mostrar la ventana. La detección de hotplug de la librería
  // 'usb' (usb.on('attach'/'detach')) puede tardar varios segundos en
  // enumerar dispositivos en equipos con controladores USB problemáticos —
  // antes esto corría ANTES de crear la ventana y bloqueaba el arranque,
  // dejando el login visible pero sin responder al teclado. Ahora corre en
  // segundo plano sin retrasar la interactividad de la app.
  setTimeout(() => {
    try { deviceManager.initialize(); } catch (error) { console.error('❌ Error inicializando DeviceManager:', error); }
  }, 0);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 🛡️ Backup blindado al cerrar limpiamente: antes de salir, le pedimos al
// renderer que genere un último respaldo (única parte del proceso que puede
// leer el IndexedDB) y esperamos su confirmación con un tope de tiempo, para
// nunca dejar la app colgada si algo falla.
let quitBackupSolicitado = false;
app.on('before-quit', (event) => {
  try {
    if (lanMode === 'server') lanServer.stop();
    if (lanMode === 'client') lanClient.stop();
  } catch {}
  try {
    deviceManager.cleanup();
  } catch (error) {
    console.error('⚠️ Error durante cleanup de deviceManager en before-quit:', error);
  }

  if (!quitBackupSolicitado && mainWindow && !mainWindow.isDestroyed()) {
    quitBackupSolicitado = true;
    event.preventDefault();
    fileLogger.writeLog('INFO', 'Cierre limpio detectado — solicitando backup final al renderer');

    const finalizarSalida = () => {
      clearTimeout(guardaTiempo);
      app.exit(0);
    };
    const guardaTiempo = setTimeout(() => {
      fileLogger.writeLog('WARN', 'El backup de cierre no respondió a tiempo — se continúa el cierre igualmente');
      finalizarSalida();
    }, 6000);

    ipcMain.once('backup:on-quit-complete', finalizarSalida);
    try {
      mainWindow.webContents.send('app:before-quit-backup');
    } catch {
      finalizarSalida();
    }
  }
});

app.on('will-quit', () => {
  try {
    deviceManager.cleanup();
  } catch (error) {
    console.error('⚠️ Error durante cleanup de deviceManager en will-quit:', error);
  }
});

// 🛡️ INSTRUMENTACIÓN DE DIAGNÓSTICO: cierre inesperado del proceso completo.
// A diferencia de mainWindow.webContents.on('render-process-gone') (que ya
// existe arriba y dispara la recuperación automática), estos son a nivel
// `app` — cubren CUALQUIER ventana/proceso hijo, no solo la principal, y
// dejan constancia en la caja negra de auditoría para poder diferenciar con
// evidencia un crash real de un app.quit()/app.exit() intencional.
app.on('render-process-gone', (_event, webContents, details) => {
  fileLogger.writeLog('CRITICAL', 'app: render-process-gone', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents?.getURL?.() || null,
  });
});

app.on('child-process-gone', (_event, details) => {
  fileLogger.writeLog('CRITICAL', 'app: child-process-gone', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    name: details.name,
  });
});

// Deprecado desde Electron 11 (reemplazado por child-process-gone), pero se
// mantiene por si la versión de Electron en producción aún lo emite.
app.on('gpu-process-crashed', (_event, killed) => {
  fileLogger.writeLog('CRITICAL', 'app: gpu-process-crashed', { killed });
});

app.on('window-all-closed', () => {
  fileLogger.writeLog('WARN', 'app: window-all-closed', { platform: process.platform });
});

// Manejo de errores no capturados en el proceso principal
process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado en main:', err);
  fileLogger.writeLog('CRITICAL', 'Error no capturado en el proceso principal — process.on(uncaughtException)', { message: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rechazada en main:', reason);
  fileLogger.writeLog('ERROR', 'Promise rechazada sin manejar en el proceso principal — process.on(unhandledRejection)', { reason: String(reason) });
});

console.log(`🚀 CODEC POS v2.0.1 | OS: ${process.platform} ${os.arch()} | Node: ${process.version}`);