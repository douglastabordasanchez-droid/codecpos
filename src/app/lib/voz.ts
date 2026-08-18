/**
 * Anuncios de voz (Codec Verify): "Pago recibido...".
 * El interruptor vive junto al resto de la config de Codec Verify en
 * localStorage['codecverify_config'] como { enabled, vozActiva, vozURI }.
 *
 * Dos motores, en orden de preferencia:
 *
 *   1) Motor embebido (Piper TTS, `es_AR-daniela-high`) — SOLO en Electron.
 *      Corre local, offline, con una voz latinoamericana real y consistente
 *      en todos los equipos, sin depender de qué tenga instalado Windows.
 *      Ver electron/main.js (ipcMain 'voz:sintetizar') y preload.cjs/js.
 *   2) Web Speech API — fallback en Electron si el motor embebido no está
 *      disponible en este build, y motor único en la PWA/navegador (ahí no
 *      hay proceso Node para correr Piper). Las voces disponibles dependen
 *      100% del sistema operativo, así que se prefieren variantes
 *      latinoamericanas (es-MX, es-419, es-CO, es-US) sobre es-ES, y se deja
 *      elegir entre las voces reales instaladas (ver `vozURI` + selector en
 *      CodecVerifyConexionPage.tsx).
 */

interface CodecVerifyConfig {
  enabled?: boolean;
  vozActiva?: boolean;
  vozURI?: string;
}

/** Valor especial guardado en `vozURI` cuando el usuario elige explícitamente
 *  la voz incorporada (Piper/Daniela) en vez de una voz del sistema. */
export const PIPER_VOICE_ID = '__piper_daniela__';

interface ElectronVozAPI {
  vozEmbebidaDisponible?: () => Promise<boolean>;
  sintetizarVoz?: (texto: string) => Promise<string | null>;
}

function electronAPI(): ElectronVozAPI | null {
  return typeof window !== 'undefined' ? ((window as unknown as { electron?: ElectronVozAPI }).electron || null) : null;
}

function leerConfig(): CodecVerifyConfig {
  try {
    return JSON.parse(localStorage.getItem('codecverify_config') || '{}');
  } catch {
    return {};
  }
}

export function isVozActiva(): boolean {
  // Activada por defecto: si el usuario nunca tocó el interruptor, se anuncia.
  return leerConfig().vozActiva !== false;
}

export function setVozActiva(activa: boolean): void {
  const config = leerConfig();
  localStorage.setItem('codecverify_config', JSON.stringify({ ...config, vozActiva: activa }));
  window.dispatchEvent(new CustomEvent('codecverify:config-changed'));
}

export function getVozSeleccionada(): string | null {
  return leerConfig().vozURI || null;
}

export function setVozSeleccionada(voiceURI: string): void {
  const config = leerConfig();
  localStorage.setItem('codecverify_config', JSON.stringify({ ...config, vozURI: voiceURI }));
  window.dispatchEvent(new CustomEvent('codecverify:config-changed'));
}

/** true si este build de Electron trae el motor de voz embebido (Piper). Cacheado tras la 1ª consulta. */
let cacheMotorEmbebido: boolean | null = null;
export async function motorEmbebidoDisponible(): Promise<boolean> {
  if (cacheMotorEmbebido !== null) return cacheMotorEmbebido;
  const api = electronAPI();
  if (!api?.vozEmbebidaDisponible) {
    cacheMotorEmbebido = false;
    return false;
  }
  try {
    cacheMotorEmbebido = await api.vozEmbebidaDisponible();
  } catch {
    cacheMotorEmbebido = false;
  }
  return cacheMotorEmbebido;
}

/** Puntaje de preferencia — más alto = mejor candidata a "voz latina amena" (fallback Web Speech). */
function puntajeVoz(v: SpeechSynthesisVoice): number {
  const lang = (v.lang || '').toLowerCase();
  const nombre = (v.name || '').toLowerCase();
  let p = 0;
  if (lang.startsWith('es-mx') || lang.startsWith('es-419')) p += 40; // Latinoamérica neutro
  else if (lang.startsWith('es-co') || lang.startsWith('es-us')) p += 35;
  else if (lang.startsWith('es-')) p += 10; // incluye es-es, mejor que nada
  if (nombre.includes('google')) p += 15; // voces de Google (Chrome) suelen sonar mejor que SAPI
  if (nombre.includes('natural') || nombre.includes('online')) p += 10;
  if (/paulina|sabina|mónica|monica|female|mujer/i.test(v.name || '')) p += 8; // suelen sonar más cálidas que las masculinas por defecto
  if (lang.startsWith('es-es')) p -= 5; // último recurso entre las de español
  return p;
}

export function listarVocesEspanol(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voces = window.speechSynthesis.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('es'));
  return voces.sort((a, b) => puntajeVoz(b) - puntajeVoz(a));
}

function obtenerVozPreferida(): SpeechSynthesisVoice | null {
  const voces = listarVocesEspanol();
  if (voces.length === 0) return null;
  const uriGuardado = getVozSeleccionada();
  if (uriGuardado) {
    const guardada = voces.find((v) => v.voiceURI === uriGuardado);
    if (guardada) return guardada;
  }
  return voces[0]; // ya viene ordenada por puntaje — la mejor candidata primero
}

function reproducirConWebSpeech(texto: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-CO';
    const voz = obtenerVozPreferida();
    if (voz) {
      utterance.voice = voz;
      utterance.lang = voz.lang;
    }
    // Un poco más lento y con el tono levemente más alto = más cálido/amable
    // que el default plano (rate 1 / pitch 1) de la mayoría de voces SAPI.
    utterance.rate = 0.95;
    utterance.pitch = 1.08;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('Error reproduciendo voz (Web Speech):', error);
  }
}

async function reproducirConMotorEmbebido(texto: string): Promise<boolean> {
  const api = electronAPI();
  if (!api?.sintetizarVoz) return false;
  try {
    const base64 = await api.sintetizarVoz(texto);
    if (!base64) return false;
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    await audio.play();
    return true;
  } catch (error) {
    console.error('Error reproduciendo voz (motor embebido), usando voz del sistema:', error);
    return false;
  }
}

export function anunciarVoz(texto: string): void {
  if (!isVozActiva()) return;

  // 🛡️ Si el usuario eligió explícitamente una voz del sistema (no la voz
  // incorporada), esa elección manda — antes esta función siempre intentaba
  // Piper primero cuando estaba disponible, así que elegir otra voz en el
  // selector no tenía ningún efecto real en las notificaciones.
  const seleccion = getVozSeleccionada();
  if (seleccion && seleccion !== PIPER_VOICE_ID) {
    reproducirConWebSpeech(texto);
    return;
  }

  reproducirConMotorEmbebido(texto).then((reproducida) => {
    if (!reproducida) reproducirConWebSpeech(texto);
  });
}

export function anunciarPagoRecibido(monto: number, entidad?: string): void {
  const montoTexto = Math.round(monto || 0).toLocaleString('es-CO');
  const entidadTexto = entidad ? ` por ${entidad}` : '';
  anunciarVoz(`Pago recibido${entidadTexto}. ${montoTexto} pesos.`);
}
