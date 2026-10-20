import { describe, it, expect, beforeEach } from 'vitest';
import { normalizarDocumento, recordarClienteFactura, buscarClienteFactura } from './clientesFactura';

const memoria = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v); },
  clear: () => memoria.clear(),
};

describe('clientes de factura recordados', () => {
  beforeEach(() => localStorage.clear());

  it('el NIT con puntos y dígito de verificación es el mismo cliente', () => {
    expect(normalizarDocumento('900.123.456-7')).toBe('900123456');
    expect(normalizarDocumento(' 1 020 304 ')).toBe('1020304');
  });

  it('recuerda al cliente y lo encuentra con el documento escrito distinto', async () => {
    recordarClienteFactura({ documento: '900.123.456-7', nombre: 'Ferretería La 30', email: 'f@x.co', direccion: 'Cra 30 # 1' });
    expect(await buscarClienteFactura(null, '900123456')).toMatchObject({ nombre: 'Ferretería La 30', email: 'f@x.co', direccion: 'Cra 30 # 1' });
  });

  it('un campo vacío en la compra nueva no borra lo que ya se sabía', async () => {
    recordarClienteFactura({ documento: '1020304', nombre: 'Ana', email: 'ana@x.co', direccion: 'Calle 1' });
    recordarClienteFactura({ documento: '1020304', nombre: 'Ana Ruiz', email: '' });
    expect(await buscarClienteFactura(null, '1020304')).toMatchObject({ nombre: 'Ana Ruiz', email: 'ana@x.co', direccion: 'Calle 1' });
  });

  it('no guarda consumidor final ni clientes sin nombre', async () => {
    recordarClienteFactura({ documento: '222222222222', nombre: 'Consumidor final' });
    recordarClienteFactura({ documento: '55555555', nombre: ' ' });
    expect(await buscarClienteFactura(null, '222222222222')).toBeNull();
    expect(await buscarClienteFactura(null, '55555555')).toBeNull();
  });
});
