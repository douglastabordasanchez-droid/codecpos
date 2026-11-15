/**
 * Voz en la terminal Android: el WebView no trae `speechSynthesis`, así que
 * los avisos de pagos (Codec Verify) y de pedidos no se oían. Aquí se instala
 * un reemplazo de `speechSynthesis` y `SpeechSynthesisUtterance` que habla con
 * el motor de voz del sistema (plugin nativo Voz). El resto de la app sigue
 * usando la API normal del navegador sin cambiar nada.
 */
import { registerPlugin } from '@capacitor/core';
import { esAndroidNativo } from './impresoraAndroid';

interface VozPlugin {
  hablar(o: { texto: string; velocidad?: number; tono?: number }): Promise<void>;
  callar(): Promise<void>;
}

const Voz = registerPlugin<VozPlugin>('Voz');

class EnunciadoNativo {
  text: string;
  lang = 'es-CO';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onend: ((ev: Event) => void) | null = null;
  onstart: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(texto = '') { this.text = texto; }
  addEventListener(tipo: string, fn: (ev: Event) => void) {
    if (tipo === 'end') this.onend = fn;
    if (tipo === 'start') this.onstart = fn;
    if (tipo === 'error') this.onerror = fn;
  }
  removeEventListener() { /* sin efecto */ }
}

export function instalarVozAndroid(): void {
  if (!esAndroidNativo()) return;
  if ('speechSynthesis' in window && (window as any).speechSynthesis?.speak) return; // ya hay voz real
  const vozEspanol = { name: 'Español', lang: 'es-CO', default: true, localService: true, voiceURI: 'nativa-es' };
  const sintesis = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null as null | (() => void),
    getVoices: () => [vozEspanol],
    speak(u: EnunciadoNativo) {
      if (!u?.text?.trim()) return;
      try { u.onstart?.(new Event('start')); } catch { /* ignorar */ }
      void Voz.hablar({ texto: u.text, velocidad: u.rate || 1, tono: u.pitch || 1 })
        .catch(() => { try { u.onerror?.(new Event('error')); } catch { /* ignorar */ } })
        .finally(() => {
          // El motor no avisa cuándo termina: se estima por la longitud del texto.
          const ms = Math.min(15000, 600 + u.text.length * 70 / (u.rate || 1));
          setTimeout(() => { try { u.onend?.(new Event('end')); } catch { /* ignorar */ } }, ms);
        });
    },
    cancel() { void Voz.callar().catch(() => {}); },
    pause() { /* sin efecto */ },
    resume() { /* sin efecto */ },
    addEventListener() { /* sin efecto */ },
    removeEventListener() { /* sin efecto */ },
  };
  try {
    Object.defineProperty(window, 'speechSynthesis', { value: sintesis, configurable: true });
    (window as any).SpeechSynthesisUtterance = EnunciadoNativo;
  } catch { /* ignorar */ }
}
