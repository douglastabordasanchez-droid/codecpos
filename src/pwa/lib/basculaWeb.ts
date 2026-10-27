/**
 * Báscula desde la web: el mismo puerto serie que usa Electron
 * (useSerialScale en usePeripherals.ts, Web Serial), pero con lo que una
 * tienda de mascotas necesita para vender a granel todo el día:
 *
 *   · Queda conectada al pasar de Vender a Veterinaria y al recargar la
 *     página: recuerda el puerto y lo vuelve a abrir sin preguntar.
 *   · Velocidad, bits, paridad y comando de lectura configurables: unas
 *     básculas mandan el peso solas (continuo) y otras lo mandan cuando se
 *     les pide (P, W, ENQ...). Al conectar se autodetectan (ver
 *     detectarConfigSerie), así no hay que saber el modelo de la báscula.
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

// ── Autodetección ──────────────────────────────────────────────────────────

type SerieBascula = Pick<ConfigBascula, 'baudRate' | 'dataBits' | 'parity' | 'stopBits'>;

/** De la más común a la menos común en básculas de mostrador. */
const SERIES_BASCULA: SerieBascula[] = [
  { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 4800, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 2400, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 19200, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 4800, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 2400, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 1200, dataBits: 8, parity: 'none', stopBits: 1 },
];
const COMANDOS_SONDEO: ComandoBascula[] = ['P', 'ENQ', 'W', 'R', '$'];
const MS_ESPERA_CONTINUA = 1200;
const MS_POR_COMANDO = 400;

/** A velocidad o paridad equivocada llegan bytes basura: una trama válida es texto legible. */
export function tramaLegible(trama: string): boolean {
  const limpia = trama.replace(/[\x00-\x1f]/g, ' ').trim();
  return limpia.length > 0 && /^[\x20-\x7e]+$/.test(limpia);
}

/**
 * Abre el puerto con `serie`, primero escucha (báscula que manda sola) y
 * luego prueba los comandos de lectura uno por uno. Devuelve el comando con
 * el que respondió ('' = continua) tras dos tramas válidas, o null. Siempre
 * deja el puerto cerrado.
 */
async function sondearSerie(
  puerto: any,
  serie: SerieBascula,
  unidadSinMarca: 'kg' | 'g',
  comandos: ComandoBascula[] = COMANDOS_SONDEO,
): Promise<ComandoBascula | null> {
  await puerto.open(serie);
  const lector = puerto.readable.getReader();
  let validas = 0;
  let enviado: ComandoBascula = '';
  let respondio: ComandoBascula | null = null;
  let indice = 0;
  const inicio = Date.now();

  const enviar = async (comando: ComandoBascula) => {
    const bytes = bytesComando(comando);
    if (!bytes || !puerto.writable) return;
    try {
      const w = puerto.writable.getWriter();
      await w.write(bytes);
      w.releaseLock();
    } catch { /* se reintenta en la siguiente vuelta */ }
  };

  const sondeo = setInterval(() => {
    const t = Date.now() - inicio;
    if (respondio !== null) {
      // Ya respondió a un comando: se le sigue pidiendo para la 2.ª trama.
      if (respondio) enviar(respondio);
    } else if (t >= MS_ESPERA_CONTINUA && indice < comandos.length) {
      enviado = comandos[indice++];
      enviar(enviado);
    }
  }, MS_POR_COMANDO);
  const limite = MS_ESPERA_CONTINUA + MS_POR_COMANDO * (comandos.length + 1) + 1200;
  const corte = setTimeout(() => { lector.cancel().catch(() => {}); }, limite);

  try {
    const decodificador = new TextDecoder();
    let buffer = '';
    while (validas < 2) {
      const { value, done } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const partes = buffer.split(/[\r\n\x03]+/);
      buffer = (partes.pop() || '').slice(-64);
      for (const trama of partes) {
        if (!tramaLegible(trama) || interpretarTrama(trama, unidadSinMarca) === null) continue;
        if (respondio === null) respondio = enviado;
        validas++;
      }
    }
  } catch { /* corte por tiempo o puerto desconectado */ }

  clearInterval(sondeo);
  clearTimeout(corte);
  try { await lector.cancel(); } catch { /* ya cancelado */ }
  try { lector.releaseLock(); } catch { /* ya liberado */ }
  try { await puerto.close(); } catch { /* ya cerrado */ }
  return validas >= 2 ? respondio : null;
}

/**
 * Busca velocidad, paridad y comando con los que la báscula manda peso,
 * empezando por la configuración guardada. null si ninguna respondió
 * (báscula apagada, cable suelto o formato desconocido).
 */
export async function detectarConfigSerie(puerto: any): Promise<Partial<ConfigBascula> | null> {
  const cfg = obtenerConfigBascula();
  const actual: SerieBascula = { baudRate: cfg.baudRate, dataBits: cfg.dataBits, parity: cfg.parity, stopBits: cfg.stopBits };
  const igual = (a: SerieBascula, b: SerieBascula) =>
    a.baudRate === b.baudRate && a.dataBits === b.dataBits && a.parity === b.parity && a.stopBits === b.stopBits;
  const series = [actual, ...SERIES_BASCULA.filter((s) => !igual(s, actual))];
  for (const serie of series) {
    const comando = await sondearSerie(puerto, serie, cfg.unidadSinMarca);
    if (comando !== null) return { ...serie, comando };
  }
  return null;
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
    // Sin filtros a propósito: las básculas suelen ir a un puerto COM nativo
    // del computador (DB9), que no tiene usbVendorId.
    const puerto = await (navigator as any).serial.requestPort();
    const detectada = await detectarConfigSerie(puerto);
    if (detectada) guardarConfigBascula(detectada);
    await abrir(puerto);
    if (!detectada) {
      // Electron recuerda el COM elegido; si ahí no hay báscula, que vuelva a preguntar.
      (window as any).electron?.scale?.olvidarPuerto?.().catch?.(() => {});
      publicar({ error: 'El puerto quedó abierto, pero la báscula no está mandando el peso. Revisa que esté encendida y el cable bien conectado, o ajusta velocidad y comando en Dispositivos.' });
    }
  } catch (e: any) {
    const cancelado = e?.name === 'NotFoundError';
    const ocupado = e?.name === 'InvalidStateError' || e?.name === 'NetworkError';
    const mensaje = ocupado
      ? 'El puerto de la báscula está ocupado por otro programa (por ejemplo CodecPOS de escritorio). Ciérralo y vuelve a conectar.'
      : (e?.message || 'No se pudo abrir la báscula');
    publicar({ conectando: false, error: cancelado ? null : mensaje });
    if (!cancelado) throw new Error(mensaje);
  }
}

let reconexionEnCurso: Promise<boolean> | null = null;

/** Vuelve a abrir la báscula recordada sin preguntar. true si quedó conectada. */
export function reconectarBascula(): Promise<boolean> {
  // Varias pantallas montan useBasculaWeb a la vez: una sola reconexión.
  if (!reconexionEnCurso) {
    reconexionEnCurso = reconectarBascula_().finally(() => { reconexionEnCurso = null; });
  }
  return reconexionEnCurso;
}

async function reconectarBascula_(): Promise<boolean> {
  if (!soporteBascula() || estado.conectada || estado.conectando) return estado.conectada;
  const cfg = obtenerConfigBascula();
  if (!cfg.puerto) return false;
  try {
    const puertos: any[] = await (navigator as any).serial.getPorts();
    const candidatos = puertos.filter((p) => {
      const i = p.getInfo?.() || {};
      return i.usbVendorId === cfg.puerto?.usbVendorId && i.usbProductId === cfg.puerto?.usbProductId;
    });
    const lista = candidatos.length > 0 ? candidatos : (puertos.length === 1 ? puertos : []);
    if (lista.length === 0) return false;
    publicar({ conectando: true, error: null });
    // Varios COM sin datos USB (puerto de la tarjeta madre + tarjeta PCI):
    // se toma el que de verdad manda peso con la configuración guardada.
    let puerto = lista[0];
    if (lista.length > 1) {
      const serie: SerieBascula = { baudRate: cfg.baudRate, dataBits: cfg.dataBits, parity: cfg.parity, stopBits: cfg.stopBits };
      for (const p of lista) {
        if (p.readable) continue;
        if (await sondearSerie(p, serie, cfg.unidadSinMarca, cfg.comando ? [cfg.comando] : []).catch(() => null) !== null) { puerto = p; break; }
      }
    }
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
