/**
 * Báscula desde la web: el mismo puerto serie que usa Electron
 * (useSerialScale en usePeripherals.ts, Web Serial), pero con lo que una
 * tienda de mascotas necesita para vender a granel todo el día:
 *
 *   · Queda conectada al pasar de Vender a Veterinaria y al recargar la
 *     página: recuerda el puerto y lo vuelve a abrir sin preguntar.
 *   · Velocidad, bits, paridad y comando de lectura configurables: unas
 *     básculas mandan el peso solas (continuo) y otras lo mandan cuando se
 *     les pide (P, W, ENQ...).
 *   · Entiende los formatos más comunes: "ST,GS,+0001.250kg", "W 1.250 kg",
 *     "  1250 g", "2.75 lb" y números solos (en la unidad configurada).
 *   · Tara y peso estable (tres lecturas seguidas iguales).
 *
 * Web Serial existe en Chrome y Edge de computador. En el celular y en la
 * app Android no hay puerto serie: el peso se escribe a mano.
 * La configuración es de ESTE equipo (localStorage).
 */

export type ComandoBascula = '' | 'P' | 'W' | 'ENQ' | 'R' | '$';

export interface ConfigBascula {
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
  /** '' = la báscula manda el peso sola. */
  comando: ComandoBascula;
  /** Unidad cuando la báscula manda solo el número. */
  unidadSinMarca: 'kg' | 'g';
  /** Puerto recordado para reconectar sin preguntar. */
  puerto?: { usbVendorId?: number; usbProductId?: number };
  nombre?: string;
}

export interface EstadoBascula {
  conectada: boolean;
  conectando: boolean;
  /** Peso neto (ya restada la tara), en kg. */
  pesoKg: number;
  estable: boolean;
  /** Última trama recibida, para ayudar a configurar. */
  ultimaTrama: string;
  error: string | null;
}

const CLAVE = 'codecpos_bascula_web';
const POR_DEFECTO: ConfigBascula = { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, comando: '', unidadSinMarca: 'kg' };

export const COMANDOS_BASCULA: { valor: ComandoBascula; label: string }[] = [
  { valor: '', label: 'Ninguno (la báscula manda el peso sola)' },
  { valor: 'P', label: 'P (Torrey, Moresco y similares)' },
  { valor: 'W', label: 'W' },
  { valor: 'ENQ', label: 'ENQ (Dibal, CAS)' },
  { valor: 'R', label: 'R' },
  { valor: '$', label: '$' },
];

export function soporteBascula(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function obtenerConfigBascula(): ConfigBascula {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') };
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarConfigBascula(cambios: Partial<ConfigBascula>): ConfigBascula {
  const nueva = { ...obtenerConfigBascula(), ...cambios };
  try { localStorage.setItem(CLAVE, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
  return nueva;
}

export function basculaConfigurada(): boolean {
  return !!obtenerConfigBascula().puerto;
}

// ── Lectura de tramas ──────────────────────────────────────────────────────

/** Convierte una trama de la báscula en kg, o null si no trae un peso. */
export function interpretarTrama(trama: string, unidadSinMarca: 'kg' | 'g' = 'kg'): number | null {
  const limpia = trama.replace(/[\x00-\x1f]/g, ' ').trim();
  if (!limpia) return null;
  const m = limpia.match(/([-+]?)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|oz)?/i);
  if (!m) return null;
  const numero = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(numero)) return null;
  const signo = m[1] === '-' ? -1 : 1;
  const unidad = (m[3] || unidadSinMarca).toLowerCase();
  const factor = unidad === 'g' ? 0.001 : unidad === 'lb' ? 0.45359237 : unidad === 'oz' ? 0.028349523 : 1;
  return Math.round(signo * numero * factor * 1000) / 1000;
}

// ── Estado compartido ──────────────────────────────────────────────────────

let estado: EstadoBascula = { conectada: false, conectando: false, pesoKg: 0, estable: false, ultimaTrama: '', error: null };
let pesoBrutoKg = 0;
let taraKg = 0;
let recientes: number[] = [];
let puertoActual: any = null;
let lector: any = null;
let temporizadorComando: ReturnType<typeof setInterval> | null = null;
const oyentes = new Set<(e: EstadoBascula) => void>();

function publicar(cambios: Partial<EstadoBascula>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((f) => f(estado));
}

export function estadoBascula(): EstadoBascula {
  return estado;
}

export function suscribirBascula(f: (e: EstadoBascula) => void): () => void {
  oyentes.add(f);
  f(estado);
  return () => { oyentes.delete(f); };
}

function registrarPeso(kg: number) {
  pesoBrutoKg = kg;
  recientes = [...recientes.slice(-2), kg];
  const estable = recientes.length === 3 && Math.max(...recientes) - Math.min(...recientes) < 0.002;
  publicar({ pesoKg: Math.max(0, Math.round((kg - taraKg) * 1000) / 1000), estable });
}

function bytesComando(comando: ComandoBascula): Uint8Array | null {
  if (!comando) return null;
  if (comando === 'ENQ') return new Uint8Array([0x05]);
  return new TextEncoder().encode(`${comando}\r\n`);
}

async function abrir(puerto: any) {
  const cfg = obtenerConfigBascula();
  if (!puerto.readable) {
    await puerto.open({ baudRate: cfg.baudRate, dataBits: cfg.dataBits, parity: cfg.parity, stopBits: cfg.stopBits });
  }
  puertoActual = puerto;
  taraKg = 0;
  recientes = [];
  const info = puerto.getInfo?.() || {};
  guardarConfigBascula({
    puerto: { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId },
    nombre: info.usbVendorId ? `Báscula USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId || 0).toString(16).padStart(4, '0')}` : 'Báscula en puerto serie',
  });
  publicar({ conectada: true, conectando: false, error: null, pesoKg: 0, estable: false });

  // Básculas que solo responden cuando se les pide el peso.
  const cmd = bytesComando(cfg.comando);
  if (cmd && puerto.writable) {
    temporizadorComando = setInterval(async () => {
      try {
        const w = puerto.writable.getWriter();
        await w.write(cmd);
        w.releaseLock();
      } catch { /* se reintenta en la siguiente vuelta */ }
    }, 350);
  }

  leer(puerto, cfg.unidadSinMarca);
}

async function leer(puerto: any, unidadSinMarca: 'kg' | 'g') {
  const decodificador = new TextDecoder();
  let buffer = '';
  try {
    while (puerto.readable && puertoActual === puerto) {
      lector = puerto.readable.getReader();
      try {
        while (true) {
          const { value, done } = await lector.read();
          if (done) break;
          buffer += decodificador.decode(value, { stream: true });
          // Una trama termina en salto de línea, retorno o ETX.
          const partes = buffer.split(/[\r\n\x03]+/);
          buffer = partes.pop() || '';
          for (const trama of partes) {
            const kg = interpretarTrama(trama, unidadSinMarca);
            if (trama.trim()) publicar({ ultimaTrama: trama.trim().slice(0, 40) });
            if (kg !== null) registrarPeso(kg);
          }
          // Básculas que mandan el número sin terminador.
          if (buffer.length > 64) {
            const kg = interpretarTrama(buffer, unidadSinMarca);
            if (kg !== null) registrarPeso(kg);
            buffer = '';
          }
        }
      } finally {
        try { lector.releaseLock(); } catch { /* ya liberado */ }
        lector = null;
      }
    }
  } catch (e: any) {
    if (puertoActual === puerto) {
      publicar({ conectada: false, error: 'Se perdió la conexión con la báscula. Revisa el cable y vuelve a conectar.' });
      cerrarSilencioso();
    }
  }
}

function cerrarSilencioso() {
  if (temporizadorComando) clearInterval(temporizadorComando);
  temporizadorComando = null;
  puertoActual = null;
}

/** Pide al usuario elegir el puerto (necesita un clic) y conecta. */
export async function conectarBascula(): Promise<void> {
  if (!soporteBascula()) throw new Error('Este navegador no tiene puerto serie. Usa Chrome o Edge en el computador.');
  publicar({ conectando: true, error: null });
  try {
    await desconectarBascula(false);
    const puerto = await (navigator as any).serial.requestPort();
    await abrir(puerto);
  } catch (e: any) {
    const cancelado = e?.name === 'NotFoundError';
    publicar({ conectando: false, error: cancelado ? null : (e?.message || 'No se pudo abrir la báscula') });
    if (!cancelado) throw e;
  }
}

/** Vuelve a abrir la báscula recordada sin preguntar. true si quedó conectada. */
export async function reconectarBascula(): Promise<boolean> {
  if (!soporteBascula() || estado.conectada || estado.conectando) return estado.conectada;
  const cfg = obtenerConfigBascula();
  if (!cfg.puerto) return false;
  try {
    const puertos: any[] = await (navigator as any).serial.getPorts();
    const puerto = puertos.find((p) => {
      const i = p.getInfo?.() || {};
      return i.usbVendorId === cfg.puerto?.usbVendorId && i.usbProductId === cfg.puerto?.usbProductId;
    }) || (puertos.length === 1 ? puertos[0] : null);
    if (!puerto) return false;
    publicar({ conectando: true, error: null });
    await abrir(puerto);
    return true;
  } catch (e: any) {
    publicar({ conectando: false, error: e?.message || 'No se pudo abrir la báscula' });
    return false;
  }
}

export async function desconectarBascula(olvidar = false): Promise<void> {
  const puerto = puertoActual;
  cerrarSilencioso();
  if (puerto) {
    try { await lector?.cancel(); } catch { /* ya cerrado */ }
    try { await puerto.close(); } catch { /* ya cerrado */ }
  }
  if (olvidar) {
    try { await puerto?.forget?.(); } catch { /* navegador sin forget() */ }
    guardarConfigBascula({ puerto: undefined, nombre: undefined });
  }
  pesoBrutoKg = 0;
  taraKg = 0;
  recientes = [];
  publicar({ conectada: false, conectando: false, pesoKg: 0, estable: false });
}

/** Toma el peso actual como tara (el recipiente o la bolsa). */
export function tararBascula(): void {
  taraKg = pesoBrutoKg;
  publicar({ pesoKg: 0 });
}

export function quitarTara(): void {
  taraKg = 0;
  publicar({ pesoKg: Math.max(0, pesoBrutoKg) });
}
