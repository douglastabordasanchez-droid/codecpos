import { describe, it, expect } from 'vitest';
import { ThermalPrinter } from './thermalPrinter';

describe('impresora térmica con salida de la web', () => {
  it('envía el ticket por el transporte del navegador (USB, serie o Bluetooth)', async () => {
    const enviados: Uint8Array[] = [];
    const p = new ThermalPrinter({ puerto: 'web', ancho: 80, transporte: async (b) => { enviados.push(b); return true; } });
    const ok = await p.printTicket({
      header: 'Mi Tienda', numeroFactura: 'FE000123', fecha: '2026-10-04T15:00:00Z',
      items: [{ nombre: 'Café', cantidad: 2, precio: 3000, total: 6000 }], subtotal: 6000, total: 6000, metodoPago: 'Efectivo', cambio: 4000,
    });
    expect(ok).toBe(true);
    expect(enviados).toHaveLength(1);
    const bytes = Array.from(enviados[0]);
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]); // ESC @ (inicializar)
    const texto = String.fromCharCode(...bytes);
    expect(texto).toContain('Mi Tienda');
    expect(texto).toContain('FE000123');
  });

  it('abre el cajón con el pulso ESC/POS', async () => {
    let enviado: Uint8Array | null = null;
    const p = new ThermalPrinter({ puerto: 'web', ancho: 58, transporte: async (b) => { enviado = b; return true; } });
    expect(await p.openDrawer()).toBe(true);
    const bytes = Array.from(enviado!);
    // ESC p (0x1B 0x70) es el pulso del cajón.
    expect(bytes.some((b, i) => b === 0x1b && bytes[i + 1] === 0x70)).toBe(true);
  });
});
