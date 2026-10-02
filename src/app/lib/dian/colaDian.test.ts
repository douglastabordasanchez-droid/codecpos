import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FacturaElectronicaDian, DianResponse } from './types';

// ── Dobles de la nube y del puente con el proceso principal ───────────────
const nube = {
  pendientes: [] as FacturaElectronicaDian[],
  porVenta: new Map<string, FacturaElectronicaDian>(),
  estados: [] as Array<{ id: string; estado: string; extra: any }>,
  reclamos: [] as string[],
  reclamoGanado: true,
};
const dian = {
  envios: [] as string[],
  respuestaEnvio: (): DianResponse => ({ ok: true, estado: 'accepted', mensajes: [] }),
  respuestaEstado: (): DianResponse => ({ ok: true, estado: 'accepted', mensajes: [] }),
  consultas: [] as string[],
  firmas: 0,
  certificadoEnNube: false,
};
const emisiones: string[] = [];

vi.mock('../supabase/facturaElectronicaDianService', () => ({
  listarFacturasPendientesDeTransmision: vi.fn(async () => nube.pendientes.filter((f) => !nube.estados.some((e) => e.id === f.id && ['accepted', 'rejected'].includes(e.estado)))),
  reclamarFacturaParaTransmision: vi.fn(async (id: string) => { nube.reclamos.push(id); return nube.reclamoGanado; }),
  actualizarEstadoFactura: vi.fn(async (id: string, estado: string, extra: any = {}) => { nube.estados.push({ id, estado, extra }); }),
  incrementarIntentosTransmision: vi.fn(async () => undefined),
  obtenerFacturaPorVenta: vi.fn(async (_c: string, venta: string) => nube.porVenta.get(venta) ?? null),
}));
// Transporte de mentira: firma si hace falta y «envía». Es el mismo contrato
// para el certificado local y para el custodiado en el servidor.
vi.mock('./transporteDian', () => {
  const xmlYaFirmado = (xml: string) => /<ds:Signature[\s>]/.test(xml);
  class ErrorDeTransmision extends Error {
    constructor(mensaje: string, readonly xmlFirmado?: string) { super(mensaje); }
  }
  return {
    xmlYaFirmado,
    ErrorDeTransmision,
    consultarCertificadoNube: vi.fn(async () => ({ existe: dian.certificadoEnNube })),
    obtenerTransporteDian: vi.fn(async () => ({
      nombre: 'local',
      async firmarYTransmitir(doc: { xml: string }) {
        let xml = doc.xml;
        if (!xmlYaFirmado(xml)) { dian.firmas++; xml = xml.replace('</Invoice>', '<ds:Signature>firma</ds:Signature></Invoice>'); }
        dian.envios.push(xml);
        try { return { xmlFirmado: xml, respuesta: dian.respuestaEnvio() }; }
        catch (e) { throw new ErrorDeTransmision((e as Error).message, xml); }
      },
      async consultarEstado(_p: string, _a: string, cufe: string) { dian.consultas.push(cufe); return dian.respuestaEstado(); },
    })),
  };
});
vi.mock('./emitirFacturaDian', () => ({
  emitirFacturaDianDirecto: vi.fn(async (datos: { ventaReferencia: string }) => { emisiones.push(datos.ventaReferencia); }),
}));

const factura = (id: string, extra: Partial<FacturaElectronicaDian> = {}): FacturaElectronicaDian => ({
  id, clienteId: 'c1', perfilFiscalId: 'perfil-1', tipoDocumento: 'factura', ventaReferencia: `venta-${id}`,
  numeroFactura: `SETP${id}`, estado: 'contingency', intentosTransmision: 0, contingencia: false,
  emisor: { nit: '900123456', ambiente: 'habilitacion' },
  adquirente: { tipoDocumento: '13', numeroDocumento: '1', nombreORazonSocial: 'Cliente' },
  items: [], subtotal: 100, totalImpuestos: 19, total: 119, fechaEmision: '2026-10-02T11:00:00Z',
  cufe: `cufe-${id}`, xml: '<Invoice></Invoice>', actualizadaEn: '2026-10-01T15:00:01Z', ...extra,
});

const ultimoEstado = (id: string) => [...nube.estados].reverse().find((e) => e.id === id);

let procesarColaDian: typeof import('./colaDian').procesarColaDian;
let cola: typeof import('./colaEmisionesLocal');

beforeEach(async () => {
  vi.resetModules(); // la cola guarda esperas en memoria: cada prueba arranca limpia
  vi.useFakeTimers({ now: new Date('2026-10-02T12:00:00Z') });

  nube.pendientes = []; nube.porVenta.clear(); nube.estados = []; nube.reclamos = []; nube.reclamoGanado = true;
  dian.envios = []; dian.consultas = []; dian.firmas = 0; dian.certificadoEnNube = false;
  dian.respuestaEnvio = () => ({ ok: true, estado: 'accepted', mensajes: [] });
  dian.respuestaEstado = () => ({ ok: true, estado: 'accepted', mensajes: [] });
  emisiones.length = 0;

  const memoria = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => { memoria.set(k, v); },
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', {
    electron: { dian: { firmarDocumento: () => undefined, enviarFacturaSync: () => undefined, existeCertificado: async () => true } },
  });

  ({ procesarColaDian } = await import('./colaDian'));
  cola = await import('./colaEmisionesLocal');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cola de envíos DIAN', () => {
  it('firma y transmite una factura en contingencia, y la deja aprobada', async () => {
    nube.pendientes = [factura('1')];
    const estado = await procesarColaDian('c1');

    expect(dian.firmas).toBe(1);
    expect(dian.envios[0]).toContain('<ds:Signature>');
    expect(ultimoEstado('1')).toMatchObject({ estado: 'accepted', extra: { motivoRechazo: '' } });
    expect(ultimoEstado('1')!.extra.fechaValidacion).toBeTruthy();
    expect(estado).toMatchObject({ enLinea: true, pendientes: 0 });
  });

  it('no vuelve a firmar un XML que ya estaba firmado', async () => {
    nube.pendientes = [factura('1', { estado: 'sent', xml: '<Invoice><ds:Signature>x</ds:Signature></Invoice>' })];
    await procesarColaDian('c1');
    expect(dian.firmas).toBe(0);
    expect(dian.envios).toHaveLength(1);
  });

  it('si la DIAN está caída, la factura vuelve a contingencia y sigue pendiente', async () => {
    nube.pendientes = [factura('1')];
    dian.respuestaEnvio = () => { throw new Error('ETIMEDOUT vpfe.dian.gov.co'); };

    const estado = await procesarColaDian('c1');
    expect(ultimoEstado('1')).toMatchObject({ estado: 'contingency', extra: { motivoRechazo: 'ETIMEDOUT vpfe.dian.gov.co' } });
    expect(estado).toMatchObject({ pendientes: 1, ultimoError: 'ETIMEDOUT vpfe.dian.gov.co' });
  });

  it('espera cada vez más entre reintentos del mismo documento, y lo logra cuando la DIAN vuelve', async () => {
    nube.pendientes = [factura('1')];
    dian.respuestaEnvio = () => { throw new Error('DIAN caída'); };

    await procesarColaDian('c1');                       // 1.er intento: falla → espera 30 s
    await procesarColaDian('c1');                       // inmediato: no le toca
    expect(dian.envios).toHaveLength(1);

    vi.advanceTimersByTime(31_000);
    await procesarColaDian('c1');                       // 2.º intento: falla → espera 60 s
    expect(dian.envios).toHaveLength(2);

    vi.advanceTimersByTime(31_000);
    await procesarColaDian('c1');                       // aún no pasan los 60 s
    expect(dian.envios).toHaveLength(2);

    dian.respuestaEnvio = () => ({ ok: true, estado: 'accepted', mensajes: [] });
    vi.advanceTimersByTime(30_000);
    const estado = await procesarColaDian('c1');
    expect(dian.envios).toHaveLength(3);
    expect(ultimoEstado('1')!.estado).toBe('accepted');
    expect(estado.pendientes).toBe(0);
  });

  it('«documento procesado anteriormente» no es un rechazo: consulta el estado real', async () => {
    nube.pendientes = [factura('1')];
    dian.respuestaEnvio = () => ({ ok: false, estado: 'rejected', mensajes: ['Regla: 90, Rechazo: Documento procesado anteriormente.'] });

    await procesarColaDian('c1');
    expect(dian.consultas).toEqual(['cufe-1']);
    expect(ultimoEstado('1')!.estado).toBe('accepted');
  });

  it('un rechazo real de la DIAN queda como rechazado, con su motivo, y no se reintenta', async () => {
    nube.pendientes = [factura('1')];
    dian.respuestaEnvio = () => ({ ok: false, estado: 'rejected', mensajes: ['Regla: FAJ43b, Rechazo: NIT del emisor no autorizado'] });

    const estado = await procesarColaDian('c1');
    expect(dian.consultas).toHaveLength(0);
    expect(ultimoEstado('1')).toMatchObject({ estado: 'rejected', extra: { motivoRechazo: 'Regla: FAJ43b, Rechazo: NIT del emisor no autorizado' } });
    expect(estado.pendientes).toBe(0);
  });

  it('una caja sin el certificado no toma la factura (la deja para la que sí puede firmar)', async () => {
    (window as any).electron.dian.existeCertificado = async () => false;
    nube.pendientes = [factura('1')];

    const estado = await procesarColaDian('c1');
    expect(nube.reclamos).toHaveLength(0);
    expect(dian.envios).toHaveLength(0);
    expect(estado.pendientes).toBe(1);
  });

  it('sin certificado local pero con el del servidor, sí la transmite', async () => {
    (window as any).electron.dian.existeCertificado = async () => false;
    dian.certificadoEnNube = true;
    nube.pendientes = [factura('1')];

    await procesarColaDian('c1');
    expect(dian.envios).toHaveLength(1);
    expect(ultimoEstado('1')!.estado).toBe('accepted');
  });

  it('si la DIAN no responde pero el documento alcanzó a firmarse, guarda la firma', async () => {
    nube.pendientes = [factura('1')];
    dian.respuestaEnvio = () => { throw new Error('ETIMEDOUT'); };

    await procesarColaDian('c1');
    const conFirma = nube.estados.find((e) => e.id === '1' && e.extra?.xml?.includes('<ds:Signature>'));
    expect(conFirma).toBeTruthy();
    expect(ultimoEstado('1')!.estado).toBe('contingency');
  });

  it('un documento sin firmar de un día anterior no se firma hoy: queda en error con la explicación', async () => {
    // La DIAN exige que la fecha de emisión sea la del día de la firma.
    nube.pendientes = [factura('1', { fechaEmision: '2026-09-30T15:00:00Z' })];

    const estado = await procesarColaDian('c1');
    expect(dian.firmas).toBe(0);
    expect(dian.envios).toHaveLength(0);
    expect(ultimoEstado('1')).toMatchObject({ estado: 'error' });
    expect(ultimoEstado('1')!.extra.motivoRechazo).toMatch(/Emite de nuevo/);
    expect(estado.pendientes).toBe(1);
  });

  it('un documento YA firmado de un día anterior sí se transmite (contingencia real)', async () => {
    nube.pendientes = [factura('1', { fechaEmision: '2026-09-30T15:00:00Z', xml: '<Invoice><ds:Signature>x</ds:Signature></Invoice>' })];

    await procesarColaDian('c1');
    expect(dian.firmas).toBe(0);
    expect(dian.envios).toHaveLength(1);
    expect(ultimoEstado('1')!.estado).toBe('accepted');
  });

  it('si otra caja ya tomó la factura, esta no la transmite por segunda vez', async () => {
    nube.reclamoGanado = false;
    nube.pendientes = [factura('1')];

    await procesarColaDian('c1');
    expect(nube.reclamos).toEqual(['1']);
    expect(dian.envios).toHaveLength(0);
  });

  it('sin internet no consulta nada y avisa lo que hay en la cola local', async () => {
    cola.encolarEmisionPendiente({ ventaReferencia: 'FAC-7' } as any);
    vi.stubGlobal('navigator', { onLine: false });
    nube.pendientes = [factura('1')];

    const estado = await procesarColaDian('c1');
    expect(estado).toMatchObject({ enLinea: false, pendientes: 1 });
    expect(nube.reclamos).toHaveLength(0);
    expect(emisiones).toHaveLength(0);
  });

  it('al volver internet emite las ventas que se cobraron sin conexión', async () => {
    cola.encolarEmisionPendiente({ clienteId: 'c1', ventaReferencia: 'FAC-7' } as any);
    cola.encolarEmisionPendiente({ clienteId: 'c1', ventaReferencia: 'FAC-7' } as any); // cobro reintentado: no duplica
    expect(cola.listarEmisionesPendientes()).toHaveLength(1);

    const { emitirFacturaDianDirecto } = await import('./emitirFacturaDian');
    vi.mocked(emitirFacturaDianDirecto).mockImplementationOnce(async (datos) => {
      emisiones.push(datos.ventaReferencia);
      nube.porVenta.set(datos.ventaReferencia, factura('7'));
      return { estado: 'accepted' as const };
    });

    const estado = await procesarColaDian('c1');
    expect(emisiones).toEqual(['FAC-7']);
    expect(cola.listarEmisionesPendientes()).toHaveLength(0);
    expect(estado.pendientes).toBe(0);
  });

  it('no emite dos veces una venta cuya factura ya existe en la nube', async () => {
    cola.encolarEmisionPendiente({ clienteId: 'c1', ventaReferencia: 'FAC-8' } as any);
    nube.porVenta.set('FAC-8', factura('8'));

    await procesarColaDian('c1');
    expect(emisiones).toHaveLength(0);
    expect(cola.listarEmisionesPendientes()).toHaveLength(0);
  });

  it('si la emisión pendiente no se puede crear (falta configuración), se queda en cola', async () => {
    cola.encolarEmisionPendiente({ clienteId: 'c1', ventaReferencia: 'FAC-9' } as any);

    const estado = await procesarColaDian('c1');
    expect(emisiones).toEqual(['FAC-9']);
    expect(cola.listarEmisionesPendientes()).toMatchObject([{ intentos: 1 }]);
    expect(estado.pendientes).toBe(1);
  });
});
