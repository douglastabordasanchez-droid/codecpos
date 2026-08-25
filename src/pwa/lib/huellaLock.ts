/**
 * Desbloqueo con huella dactilar (WebAuthn, autenticador de plataforma) +
 * autobloqueo tras inactividad — como las apps de banco.
 *
 * Diseño: esto NO reemplaza el login real (Supabase Auth ya autenticó al
 * empleado antes de llegar aquí). Es una segunda puerta LOCAL: si el
 * dispositivo estuvo en segundo plano más de AUTOLOCK_MS, se pide re-validar
 * "sigues siendo tú" con la huella ya enrolada en ESE dispositivo, antes de
 * mostrar cualquier dato del negocio. Por eso no hace falta verificar la
 * firma contra un servidor (no está probando identidad ante Supabase, solo
 * ante el propio sensor del teléfono) — que `navigator.credentials.get()`
 * resuelva sin error ya implica que el sensor validó la huella correcta
 * contra la credencial creada en este mismo dispositivo.
 *
 * Todo vive en localStorage, por diseño: una huella enrolada en un teléfono
 * nunca debe "viajar" a otro dispositivo ni pasar por el servidor.
 *
 * 🤖 Dentro de la app nativa "Codec Verify" (WebView, ver src/pwa/lib/
 * androidBridge.ts) NO se usa WebAuthn -- el WebView de Android no lo
 * soporta de forma confiable. Ahí se usa BiometricPrompt nativo en su lugar
 * (mismo diálogo de huella del sistema operativo), y el localStorage guarda
 * el marcador MARCADOR_NATIVO en vez de una credencial WebAuthn real. Todo
 * lo demás (autobloqueo a los 10 min, habilitar/deshabilitar) es idéntico
 * en ambos casos -- solo cambia CÓMO se valida la huella.
 */
import { estaEnAppAndroid, huellaDisponibleAndroid, autenticarConHuellaAndroid } from './androidBridge';

const AUTOLOCK_MS = 10 * 60 * 1000; // 10 minutos, igual que apps bancarias
const MARCADOR_NATIVO = '__android_native__';

const keyCredencial = (empleadoId: string) => `pwa_huella_credencial_${empleadoId}`;
const keyUltimaActividad = (empleadoId: string) => `pwa_huella_ultima_actividad_${empleadoId}`;

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binario = atob(padded);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** true si este dispositivo/navegador soporta un autenticador de plataforma (huella/Face ID). */
export async function huellaDisponibleEnDispositivo(): Promise<boolean> {
  if (estaEnAppAndroid()) return huellaDisponibleAndroid();
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function huellaHabilitada(empleadoId: string): boolean {
  try {
    return !!localStorage.getItem(keyCredencial(empleadoId));
  } catch {
    return false;
  }
}

/** Dispara el enrolamiento nativo (huella/Face ID/PIN del dispositivo) y guarda la credencial. */
export async function habilitarHuella(empleadoId: string, nombre: string): Promise<{ ok: boolean; error?: string }> {
  if (estaEnAppAndroid()) {
    // No hay "enrolamiento" propio que crear -- BiometricPrompt reusa
    // directamente lo que el usuario ya tiene configurado en Ajustes de
    // Android. Solo se confirma que el dispositivo pueda y se guarda el
    // marcador para que verificarHuella() sepa qué camino tomar.
    if (!huellaDisponibleAndroid()) {
      return { ok: false, error: 'Este dispositivo no tiene una huella o rostro configurado en Ajustes de Android' };
    }
    try {
      localStorage.setItem(keyCredencial(empleadoId), MARCADOR_NATIVO);
      registrarActividad(empleadoId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo activar la huella' };
    }
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credencial = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Codec POS', id: location.hostname },
        user: { id: userId, name: nombre || 'empleado', displayName: nombre || 'Empleado Codec POS' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!credencial) return { ok: false, error: 'No se completó el enrolamiento' };

    localStorage.setItem(keyCredencial(empleadoId), bufferToBase64Url(credencial.rawId));
    registrarActividad(empleadoId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo activar la huella' };
  }
}

export function deshabilitarHuella(empleadoId: string): void {
  try {
    localStorage.removeItem(keyCredencial(empleadoId));
    localStorage.removeItem(keyUltimaActividad(empleadoId));
  } catch { /* no-op */ }
}

/** Pide la huella para desbloquear. true = validado por el sensor del dispositivo. */
export async function verificarHuella(empleadoId: string): Promise<boolean> {
  const credencialGuardada = localStorage.getItem(keyCredencial(empleadoId));
  if (!credencialGuardada) return false;

  if (credencialGuardada === MARCADOR_NATIVO) {
    const ok = await autenticarConHuellaAndroid();
    if (ok) registrarActividad(empleadoId);
    return ok;
  }

  try {
    const credencialB64 = credencialGuardada;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const resultado = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ id: base64UrlToBuffer(credencialB64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    if (!resultado) return false;
    registrarActividad(empleadoId);
    return true;
  } catch {
    return false;
  }
}

export function registrarActividad(empleadoId: string): void {
  try {
    localStorage.setItem(keyUltimaActividad(empleadoId), String(Date.now()));
  } catch { /* no-op */ }
}

/** true si ya pasaron los 10 minutos desde la última vez que se confirmó la huella / hubo actividad. */
export function debeBloquear(empleadoId: string): boolean {
  try {
    const ultima = Number(localStorage.getItem(keyUltimaActividad(empleadoId)) || 0);
    if (!ultima) return true; // nunca se registró actividad — bloquear por defecto
    return Date.now() - ultima > AUTOLOCK_MS;
  } catch {
    return true;
  }
}
