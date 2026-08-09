/**
 * CODEC POS v2.0 - Almacenamiento cifrado de secretos DIAN (certificado .p12
 * y PIN de firma) usando `safeStorage` de Electron (cifrado a nivel de SO —
 * DPAPI en Windows, atado a la cuenta del usuario que instaló CODEC POS).
 *
 * El certificado y el PIN pertenecen a un PERFIL FISCAL (perfilFiscalId), no
 * directamente al negocio — un mismo negocio puede tener varios perfiles a
 * lo largo del tiempo (persona natural → SAS) y cada uno tiene su propio
 * certificado. Por eso las rutas se indexan por perfilFiscalId.
 *
 * Nada de esto es accesible desde el renderer. El certificado y el PIN en
 * claro NUNCA cruzan el puente de contextBridge — solo su metadata (nombre
 * de archivo, huella SHA-256, fecha de vencimiento) viaja al renderer para
 * mostrarse en Configuración. La firma real del XML ocurre aquí, en el
 * proceso principal (ver dianSigner.js).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { safeStorage } from 'electron';

const ROOT_DIR = 'C:\\CodecStudio\\CODECPOS';
const ROOT_DIR_FALLBACK = path.join(os.homedir(), 'CodecStudio', 'CODECPOS');
let SECRETS_DIR = path.join(ROOT_DIR, 'dian');
let fallbackResuelto = false;

// Mismo patrón de fallback que backupManager.js: la raíz fija de C:\ puede
// no ser escribible en cuentas de Windows restringidas.
function ensureSecretsDir() {
  if (!fallbackResuelto) {
    try {
      fs.mkdirSync(SECRETS_DIR, { recursive: true });
    } catch (e) {
      console.error(`[dianSecrets] No se pudo usar "${SECRETS_DIR}" (${e.message}), usando ruta alterna en el perfil del usuario`);
      SECRETS_DIR = path.join(ROOT_DIR_FALLBACK, 'dian');
      fs.mkdirSync(SECRETS_DIR, { recursive: true });
    }
    fallbackResuelto = true;
    return;
  }
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

function perfilDir(perfilFiscalId) {
  ensureSecretsDir();
  const dir = path.join(SECRETS_DIR, String(perfilFiscalId).replace(/[^a-zA-Z0-9-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function certificadoPath(perfilFiscalId) {
  return path.join(perfilDir(perfilFiscalId), 'certificado.p12.enc');
}
function certificadoMetaPath(perfilFiscalId) {
  return path.join(perfilDir(perfilFiscalId), 'certificado.meta.json');
}
function pinPath(perfilFiscalId) {
  return path.join(perfilDir(perfilFiscalId), 'pin.enc');
}

function requireEncryptionDisponible() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'El cifrado seguro del sistema operativo no está disponible en este equipo. ' +
      'No es posible guardar el certificado/PIN de forma segura.'
    );
  }
}

/**
 * Guarda el certificado .p12 cifrado en disco. `base64` es el contenido
 * crudo del archivo codificado en base64 (lo que llega desde el input de
 * archivo del renderer vía IPC — el renderer nunca escribe a disco directo).
 * Devuelve solo METADATA, nunca el contenido.
 */
export function guardarCertificado(perfilFiscalId, base64, nombreArchivo) {
  requireEncryptionDisponible();
  const buffer = Buffer.from(base64, 'base64');
  const huella = crypto.createHash('sha256').update(buffer).digest('hex');
  const cifrado = safeStorage.encryptString(buffer.toString('base64'));
  fs.writeFileSync(certificadoPath(perfilFiscalId), cifrado);

  const meta = {
    nombreArchivo,
    huellaSha256: huella,
    guardadoEn: new Date().toISOString(),
  };
  fs.writeFileSync(certificadoMetaPath(perfilFiscalId), JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

export function obtenerMetadataCertificado(perfilFiscalId) {
  try {
    const raw = fs.readFileSync(certificadoMetaPath(perfilFiscalId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function existeCertificado(perfilFiscalId) {
  return fs.existsSync(certificadoPath(perfilFiscalId));
}

export function eliminarCertificado(perfilFiscalId) {
  for (const p of [certificadoPath(perfilFiscalId), certificadoMetaPath(perfilFiscalId)]) {
    try { fs.unlinkSync(p); } catch { /* no existía */ }
  }
}

/**
 * Descifra y devuelve el Buffer crudo del certificado. SOLO debe llamarse
 * desde código del proceso principal (el firmador XAdES) — nunca se expone
 * por IPC hacia el renderer.
 */
export function leerCertificadoParaFirma(perfilFiscalId) {
  requireEncryptionDisponible();
  const cifrado = fs.readFileSync(certificadoPath(perfilFiscalId));
  const base64 = safeStorage.decryptString(cifrado);
  return Buffer.from(base64, 'base64');
}

export function guardarPin(perfilFiscalId, pin) {
  requireEncryptionDisponible();
  const cifrado = safeStorage.encryptString(String(pin));
  fs.writeFileSync(pinPath(perfilFiscalId), cifrado);
  return true;
}

export function existePin(perfilFiscalId) {
  return fs.existsSync(pinPath(perfilFiscalId));
}

export function eliminarPin(perfilFiscalId) {
  try { fs.unlinkSync(pinPath(perfilFiscalId)); } catch { /* no existía */ }
}

/**
 * SOLO para uso interno del proceso principal (firma/transmisión DIAN).
 * Nunca se expone por IPC.
 */
export function leerPinParaFirma(perfilFiscalId) {
  requireEncryptionDisponible();
  const cifrado = fs.readFileSync(pinPath(perfilFiscalId));
  return safeStorage.decryptString(cifrado);
}
