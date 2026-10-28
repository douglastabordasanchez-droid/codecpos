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
  unidadSinMarca: UnidadBascula;
  /** Puerto recordado para reconectar sin preguntar. */
  puerto?: { usbVendorId?: number; usbProductId?: number };
  nombre?: string;
  /** Al poner algo en la báscula sale solo la ventana de peso con el buscador (PesoRapido). */
  popupAlPesar?: boolean;
}

/** Se dispara al guardar la configuración, para que las pantallas abiertas la lean de nuevo. */
export const EVENTO_CONFIG_BASCULA = 'codecpos:bascula-config';

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
    const cfg: ConfigBascula = { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') };
    // Ninguna báscula de tienda manda miligramos enteros: marcada en mg, "485"
    // (gramos) se leía 0,000485 kg (caso Mega Can). Se toma como gramos.
    if (cfg.unidadSinMarca === 'mg') cfg.unidadSinMarca = 'g';
    return cfg;
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarConfigBascula(cambios: Partial<ConfigBascula>): ConfigBascula {
  const nueva = { ...obtenerConfigBascula(), ...cambios };
  try { localStorage.setItem(CLAVE, JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
  try { window.dispatchEvent(new Event(EVENTO_CONFIG_BASCULA)); } catch { /* sin ventana (pruebas) */ }
  return nueva;
}

export function basculaConfigurada(): boolean {
  return !!obtenerConfigBascula().puerto;
}

// ── Lectura de tramas ──────────────────────────────────────────────────────

/** Unidad en que pesa la báscula cuando manda solo el número (sin "kg", "g"...). */
export type UnidadBascula = 'kg' | 'g' | 'mg';

const FACTOR_KG: Record<string, number> = {
  kg: 1, g: 0.001, gr: 0.001, grs: 0.001, mg: 0.000001, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523,
};

/**
 * Unidad de un número que llegó sin "kg"/"g": con decimales ("0.485") es kilos
 * —las básculas en gramos o miligramos mandan enteros—; entero ("485"), la que
 * se configuró. Antes "0.485" con la báscula marcada en miligramos se leía
 * como 0,485 mg y el peso quedaba en 0.
 */
const unidadDeNumero = (texto: string, unidadSinMarca: UnidadBascula): UnidadBascula =>
  /[.,]\d/.test(texto) ? 'kg' : unidadSinMarca;

/** Kilos con precisión de miligramo (6 decimales). */
const aMiligramo = (kg: number) => Math.round(kg * 1e6) / 1e6;

/**
 * Formato continuo de Toledo (y sus copias): STX + 3 bytes de estado + 6
 * dígitos de peso + 6 de tara, sin punto decimal. El punto lo dicen los bits
 * 0-2 del primer byte; el signo y kg/lb, el segundo. null si no es ese formato.
 */
function interpretarToledo(trama: string): number | null {
  const t = trama.replace(/^\x02/, '');
  if (t.length < 15 || !/^.{3}\d{12}/.test(t)) return null;
  const a = t.charCodeAt(0);
  const b = t.charCodeAt(1);
  if ((a & 0x20) === 0 || (b & 0x20) === 0) return null; // el bit 5 de los estados siempre va en 1
  const decimales = [-2, -1, 0, 1, 2, 3, 4, 5][a & 0x07];
  const peso = parseInt(t.slice(3, 9), 10) / 10 ** decimales;
  const signo = b & 0x02 ? -1 : 1;
  const factor = b & 0x10 ? 1 : FACTOR_KG.lb;
  return aMiligramo(signo * peso * factor);
}

/**
 * Convierte una trama de la báscula en kg (con miligramos), o null si no trae
 * un peso. Entiende "ST,GS,+0001.250kg", "W 1.250 kg", "1250 gr", "250 mg",
 * "2.75 lb", el formato continuo de Toledo, el invertido de los indicadores
 * XK3190 ("=05.2100" = 0012.50) y números solos en la unidad configurada.
 */
export function interpretarTrama(trama: string, unidadSinMarca: UnidadBascula = 'kg'): number | null {
  const toledo = interpretarToledo(trama);
  if (toledo !== null) return toledo;
  const limpia = trama.replace(/[\x00-\x1f]/g, ' ').trim();
  if (!limpia) return null;

  // Invertido (XK3190 y similares): "=" + el número escrito al revés, sin unidad.
  const invertido = limpia.match(/^=\s*([-\d.]+)$/);
  if (invertido) {
    const texto = invertido[1].split('').reverse().join('');
    const negativo = texto.endsWith('-') || texto.startsWith('-');
    const numero = parseFloat(texto.replace(/-/g, ''));
    if (!Number.isFinite(numero)) return null;
    return aMiligramo((negativo ? -1 : 1) * numero * FACTOR_KG[unidadDeNumero(texto, unidadSinMarca)]);
  }

  // Primero el número que trae su unidad (así un número de báscula o de
  // estado que vaya antes no se toma por el peso); si no hay, el primer número.
  const conUnidad = limpia.match(/([-+]?)\s*(\d+(?:[.,]\d+)?)\s*(mg|kg|grs|gr|g|lbs|lb|oz)(?![a-z])/i);
  const m = conUnidad || limpia.match(/([-+]?)\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const numero = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(numero)) return null;
  const signo = m[1] === '-' ? -1 : 1;
  const unidad = (conUnidad ? m[3] : unidadDeNumero(m[2], unidadSinMarca)).toLowerCase();
  return aMiligramo(signo * numero * (FACTOR_KG[unidad] ?? 1));
}

/**
 * Parte lo que llegó del puerto en tramas. Una trama termina en salto de
 * línea, retorno o ETX; empieza en STX o en "=" (las básculas que mandan
 * "=05.2100=05.2100" sin salto de línea). Devuelve las tramas completas y lo
 * que quedó a medias para la siguiente lectura.
 */
export function partirTramas(buffer: string): { tramas: string[]; resto: string } {
  const partes = buffer.split(/[\r\n\x03]+|(?=[\x02=])/);
  const resto = partes.pop() ?? '';
  return { tramas: partes.filter((p) => p.replace(/[\x00-\x20]/g, '') !== ''), resto };
}

/** Lo que mandó la báscula, legible (los caracteres de control como ·), para "Última lectura". */
export function tramaVisible(trama: string): string {
  return trama.replace(/[\x00-\x1f\x7f-\xff]/g, '·').trim().slice(0, 40);
}

/** Peso para mostrar: kilos desde 1 kg, gramos desde 1 g y miligramos por debajo. */
export function formatoPeso(kg: number): string {
  const a = Math.abs(kg);
  if (a >= 1) return `${kg.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
  if (a >= 0.001) return `${(kg * 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} g`;
  if (a > 0) return `${Math.round(kg * 1e6).toLocaleString('es-CO')} mg`;
  return '0 g';
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
  unidadSinMarca: UnidadBascula,
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
    // latin1: los bytes de estado de algunas básculas (Toledo) pasan tal cual.
    const decodificador = new TextDecoder('latin1');
    let buffer = '';
    while (validas < 2) {
      const { value, done } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const { tramas, resto } = partirTramas(buffer);
      buffer = resto.slice(-64);
      for (const trama of tramas) {
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
  // Estable: tres lecturas seguidas casi iguales (1 mg o el 0,1 % del peso).
  const margen = Math.max(0.000001, Math.abs(kg) * 0.001);
  const estable = recientes.length === 3 && Math.max(...recientes) - Math.min(...recientes) <= margen;
  publicar({ pesoKg: Math.max(0, aMiligramo(kg - taraKg)), estable });
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
    nombre: info.usbVendorId ? `Báscula USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId || 0).toString(16).padStart(4, '0')}` : (/^Báscula en COM/.test(cfg.nombre || '') ? cfg.nombre : 'Báscula en puerto serie'),
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

async function leer(puerto: any, unidadSinMarca: UnidadBascula) {
  const decodificador = new TextDecoder('latin1');
  let buffer = '';
  try {
    while (puerto.readable && puertoActual === puerto) {
      lector = puerto.readable.getReader();
      try {
        while (true) {
          const { value, done } = await lector.read();
          if (done) break;
          buffer += decodificador.decode(value, { stream: true });
          const { tramas, resto } = partirTramas(buffer);
          buffer = resto;
          for (const trama of tramas) {
            const kg = interpretarTrama(trama, unidadSinMarca);
            publicar({ ultimaTrama: tramaVisible(trama) });
            if (kg !== null) registrarPeso(kg);
          }
          // Básculas que mandan el número sin terminador: se lee lo acumulado.
          if (buffer.length > 64) {
            const kg = interpretarTrama(buffer, unidadSinMarca);
            publicar({ ultimaTrama: tramaVisible(buffer) });
            if (kg !== null) registrarPeso(kg);
            buffer = '';
          } else if (!tramas.length && buffer.trim()) {
            // Aún sin trama completa: se muestra lo que va llegando para poder revisarlo.
            publicar({ ultimaTrama: tramaVisible(buffer) });
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

/** Electron busca la báscula solo una vez por sesión (tarda unos segundos por puerto). */
let autodeteccionHecha = false;

async function reconectarBascula_(): Promise<boolean> {
  if (!soporteBascula() || estado.conectada || estado.conectando) return estado.conectada;
  let cfg = obtenerConfigBascula();
  if (!cfg.puerto) {
    // Sin báscula recordada: Electron la busca sola en los COM (main.js,
    // bascula:autodetectar). En el navegador no se puede: Chrome exige que
    // la persona elija el puerto una vez con el botón Conectar báscula.
    const autodetectar = (window as any).electron?.scale?.autodetectar;
    if (!autodetectar || autodeteccionHecha) return false;
    autodeteccionHecha = true;
    publicar({ conectando: true, error: null });
    const r = await autodetectar().catch(() => null);
    publicar({ conectando: false });
    if (!r) return false;
    cfg = guardarConfigBascula({
      baudRate: r.baudRate, dataBits: r.dataBits, parity: r.parity, stopBits: r.stopBits, comando: r.comando,
      puerto: {}, nombre: `Báscula en ${r.portName}`,
    });
  }
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
