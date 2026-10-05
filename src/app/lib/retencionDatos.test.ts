import { beforeEach, describe, expect, it, vi } from 'vitest';

const DIA = 24 * 60 * 60 * 1000;

// ── Entorno mínimo de navegador (sin jsdom) ──
const almacen = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
  setItem: (k: string, v: string) => { almacen.set(k, String(v)); },
  removeItem: (k: string) => { almacen.delete(k); },
};
const guardados: Array<{ nombre: string; contenido: string }> = [];
let guardarFalla = false;
(globalThis as any).window = {
  dispatchEvent: () => true,
  setTimeout, clearTimeout, setInterval, clearInterval,
  electron: {
    archivo: {
      elegirCarpeta: async () => ({ ok: true, carpeta: 'C:\\Respaldo' }),
      guardar: async (d: { nombre: string; contenido: string }) => {
        if (guardarFalla) return { ok: false, error: 'disco lleno' };
        guardados.push(d);
        return { ok: true, bytes: d.contenido.length };
      },
      abrir: async () => ({ ok: true }),
      verificar: async () => ({ ok: true }),
    },
  },
};
(globalThis as any).CustomEvent = class { constructor(public type: string) {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });

// ── Ventas en la base local simulada ──
let ventas: any[] = [];
const borradas: string[] = [];
vi.mock('./indexedDB', () => ({
  dbManager: {
    getVentasByDateRange: async (_a: string, hasta: string) => ventas.filter((v) => v.fecha < hasta),
    deleteVentas: async (ids: string[]) => { borradas.push(...ids); ventas = ventas.filter((v) => !ids.includes(v.id)); return ids.length; },
    getUltimoNumeroVenta: async () => Math.max(0, ...ventas.map((v) => v.numero)),
    getConfig: async () => null,
  },
}));
vi.mock('./historicoService', () => ({ historicoService: { limpiarDatosAntiguos: async () => {} } }));
vi.mock('./supabase/config', () => ({ getSupabaseClient: () => null }));
vi.mock('./supabase/tenantLink', () => ({ getLinkedClienteId: () => null }));

const r = await import('./retencionDatos');

const haceDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

beforeEach(() => {
  almacen.clear();
  guardados.length = 0;
  borradas.length = 0;
  guardarFalla = false;
  ventas = [
    { id: 'v1', numero: 10, fecha: haceDias(60), supabaseId: 's1', items: [], total: 1000, subtotal: 1000, metodoPago: 'efectivo', cajero: 'Ana' },
    { id: 'v2', numero: 11, fecha: haceDias(45), syncStatus: 'pending', items: [], total: 2000, subtotal: 2000, metodoPago: 'nequi', cajero: 'Ana' },
    { id: 'v3', numero: 12, fecha: haceDias(40), supabaseId: 's3', facturaEstado: 'PENDIENTE_ENVIO', items: [], total: 3000, subtotal: 3000, metodoPago: 'efectivo', cajero: 'Ana' },
    { id: 'v4', numero: 13, fecha: haceDias(5), supabaseId: 's4', items: [], total: 4000, subtotal: 4000, metodoPago: 'efectivo', cajero: 'Ana' },
  ];
  almacen.set('pos-gastos', JSON.stringify([
    { id: 'g1', fecha: haceDias(50), monto: 500, _supabaseSynced: true },
    { id: 'g2', fecha: haceDias(50), monto: 600 },
    { id: 'g3', fecha: haceDias(2), monto: 700, _supabaseSynced: true },
  ]));
});

describe('retención de la caja', () => {
  it('la primera vez programa la limpieza con días suficientes para todos los avisos', () => {
    const c = r.leerConfigRetencion();
    expect(r.diasParaLimpieza(c)).toBeGreaterThanOrEqual(r.DIAS_AVISO);
    expect(r.debeAvisar(c)).toBe(false);
  });

  it('avisa en los 5 días previos y una sola vez por franja (mañana, tarde, noche)', async () => {
    almacen.set('codecpos_retencion', JSON.stringify({ proximaLimpieza: new Date(Date.now() + 3 * DIA).toISOString(), avisosMostrados: [] }));
    expect(r.debeAvisar()).toBe(true);
    await r.marcarAvisoMostrado();
    expect(r.debeAvisar()).toBe(false);
    const bitacora = r.leerBitacoraLocal();
    expect(bitacora[0].tipo).toBe('aviso');
    expect(bitacora[0].detalle?.franja).toBe(r.franjaActual());
    // Sin internet la constancia queda en cola para subir a la nube.
    expect(JSON.parse(almacen.get('codecpos_retencion_bitacora_pendiente')!)).toHaveLength(1);
  });

  it('las franjas cubren mañana, tarde y noche', () => {
    const a = (h: number) => r.franjaActual(new Date(2026, 9, 5, h));
    expect([a(8), a(14), a(20)]).toEqual(['mañana', 'tarde', 'noche']);
  });

  it('solo recoge lo viejo que ya está en la nube', async () => {
    const d = await r.recolectarDatosAntiguos(r.fechaCorte());
    expect(d.ventas.map((v) => v.id)).toEqual(['v1']); // v2 sin subir, v3 factura electrónica pendiente, v4 reciente
    expect(d.gastos.map((g) => g.id)).toEqual(['g1']);
    expect(d.sinSubir).toBe(3); // v2, v3 y g2
  });

  it('con carpeta autorizada guarda primero y luego borra; el consecutivo no baja', async () => {
    almacen.set('codecpos_retencion', JSON.stringify({ carpeta: 'C:\\Respaldo', proximaLimpieza: haceDias(0), avisosMostrados: [] }));
    almacen.set('pos-ultima-factura', '5');
    const res = await r.ejecutarLimpieza();
    expect(res).toEqual({ borrados: 2, sinSubir: 3 });
    expect(guardados.map((g) => g.nombre).some((n) => n.startsWith('Ventas hasta'))).toBe(true);
    expect(borradas).toEqual(['v1']);
    expect(JSON.parse(almacen.get('pos-gastos')!).map((g: any) => g.id)).toEqual(['g2', 'g3']);
    expect(Number(almacen.get('pos-ultima-factura'))).toBeGreaterThanOrEqual(13);
    expect(r.diasParaLimpieza()).toBe(r.DIAS_EN_CAJA);
    expect(r.leerBitacoraLocal()[0].tipo).toBe('limpieza');
  });

  it('si no se pudo guardar en la carpeta no borra nada', async () => {
    almacen.set('codecpos_retencion', JSON.stringify({ carpeta: 'C:\\Respaldo', proximaLimpieza: haceDias(0), avisosMostrados: [] }));
    guardarFalla = true;
    expect(await r.ejecutarLimpieza()).toBeNull();
    expect(borradas).toEqual([]);
    expect(r.leerBitacoraLocal()[0].tipo).toBe('error');
  });
});
