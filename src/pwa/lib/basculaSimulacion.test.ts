// Básculas simuladas por puerto serie: autodetección, lectura, tara, reconexión y búsqueda de Electron.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};
(globalThis as any).window = globalThis;

type Modelo = { baudRate: number; dataBits: number; parity: string; comando: string | null; trama: string };

function puertoFalso(modelo: Modelo | null, info: any = {}) {
  let abierto: any = null;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let timer: any = null;
  const coincide = () => modelo && abierto && abierto.baudRate === modelo.baudRate && abierto.dataBits === modelo.dataBits && abierto.parity === modelo.parity;
  const mandar = () => {
    if (!ctrl) return;
    if (coincide()) ctrl.enqueue(new TextEncoder().encode(modelo!.trama + '\r\n'));
    else if (modelo) ctrl.enqueue(new Uint8Array([0xb5, 0xfe, 0x8a, 0x0d, 0x0a])); // basura por config equivocada
  };
  const p: any = {
    readable: null, writable: null, abiertoCon: [] as any[],
    getInfo: () => info,
    async open(opts: any) {
      if (abierto) throw Object.assign(new Error('The port is already open.'), { name: 'InvalidStateError' });
      abierto = opts; p.abiertoCon.push(opts);
      p.readable = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; }, cancel() { ctrl = null; } });
      p.writable = new WritableStream<Uint8Array>({
        write(chunk) {
          const txt = new TextDecoder().decode(chunk);
          const cmd = chunk[0] === 0x05 ? 'ENQ' : txt.trim();
          if (modelo?.comando && cmd === modelo.comando) mandar();
        },
      });
      if (modelo && modelo.comando === null) timer = setInterval(mandar, 100);
    },
    async close() {
      if (p.readable?.locked || p.writable?.locked) throw new Error('locked');
      clearInterval(timer); abierto = null; ctrl = null; p.readable = null; p.writable = null;
    },
  };
  return p;
}

async function cargar() {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  return import('./basculaWeb');
}

describe('simulación de básculas', () => {
  beforeEach(() => { (globalThis as any).electron = undefined; });

  it('continua 9600 8N1 (ST,GS,+0001.250kg)', async () => {
    const b = await cargar();
    const r = await b.detectarConfigSerie(puertoFalso({ baudRate: 9600, dataBits: 8, parity: 'none', comando: null, trama: 'ST,GS,+0001.250kg' }));
    expect(r).toMatchObject({ baudRate: 9600, dataBits: 8, parity: 'none', comando: '' });
  }, 30000);

  it('Torrey/Moresco: responde a P a 9600 7E1', async () => {
    const b = await cargar();
    const r = await b.detectarConfigSerie(puertoFalso({ baudRate: 9600, dataBits: 7, parity: 'even', comando: 'P', trama: '  1.250 kg' }));
    expect(r).toMatchObject({ baudRate: 9600, dataBits: 7, parity: 'even', comando: 'P' });
  }, 30000);

  it('CAS/Dibal: responde a ENQ a 4800 8N1', async () => {
    const b = await cargar();
    const r = await b.detectarConfigSerie(puertoFalso({ baudRate: 4800, dataBits: 8, parity: 'none', comando: 'ENQ', trama: 'W 00.500 kg' }));
    expect(r).toMatchObject({ baudRate: 4800, comando: 'ENQ' });
  }, 60000);

  it('báscula apagada: null y el puerto queda cerrado', async () => {
    const b = await cargar();
    const p = puertoFalso(null);
    expect(await b.detectarConfigSerie(p)).toBeNull();
    expect(p.readable).toBeNull();
  }, 120000);

  it('Electron sin báscula recordada: la busca sola y queda conectada sin clic', async () => {
    const b = await cargar();
    const p = puertoFalso({ baudRate: 9600, dataBits: 7, parity: 'even', comando: null, trama: 'ST,GS,+0002.000kg' });
    const autodetectar = vi.fn(async () => ({ portName: 'COM3', baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 1, comando: '' }));
    (globalThis as any).electron = { scale: { autodetectar } };
    Object.defineProperty(globalThis, "navigator", { value: { serial: { getPorts: async () => [p] } }, configurable: true });
    expect(await b.reconectarBascula()).toBe(true);
    await new Promise((r) => setTimeout(r, 600));
    expect(b.estadoBascula()).toMatchObject({ conectada: true, pesoKg: 2 });
    expect(b.obtenerConfigBascula().nombre).toBe('Báscula en COM3');
    await b.desconectarBascula(false);
    // Una sola búsqueda por sesión
    b.guardarConfigBascula({ puerto: undefined });
    await b.reconectarBascula();
    expect(autodetectar).toHaveBeenCalledTimes(1);
  }, 30000);

  it('flujo completo: conectar, leer peso, tara; en Electron olvida el COM si no hay peso', async () => {
    const b = await cargar();
    const p = puertoFalso({ baudRate: 9600, dataBits: 7, parity: 'even', comando: 'P', trama: '  1.250 kg' });
    Object.defineProperty(globalThis, "navigator", { value: { serial: { requestPort: async () => p, getPorts: async () => [p] } }, configurable: true });
    await b.conectarBascula();
    await new Promise((r) => setTimeout(r, 1500));
    expect(b.estadoBascula()).toMatchObject({ conectada: true, pesoKg: 1.25, estable: true, error: null });
    b.tararBascula();
    expect(b.estadoBascula().pesoKg).toBe(0);
    await b.desconectarBascula(false);
    expect(p.readable).toBeNull();

    // Reconexión sin preguntar (al recargar la página)
    expect(await b.reconectarBascula()).toBe(true);
    await new Promise((r) => setTimeout(r, 1000));
    expect(b.estadoBascula().pesoKg).toBeGreaterThan(0);
    await b.desconectarBascula(false);

    const olvidar = vi.fn(async () => true);
    (globalThis as any).electron = { scale: { olvidarPuerto: olvidar } };
    const muerto = puertoFalso(null);
    Object.defineProperty(globalThis, "navigator", { value: { serial: { requestPort: async () => muerto, getPorts: async () => [muerto] } }, configurable: true });
    await b.conectarBascula();
    expect(olvidar).toHaveBeenCalled();
    expect(b.estadoBascula().error).toMatch(/no está mandando el peso/);
    await b.desconectarBascula(false);
  }, 180000);
});
