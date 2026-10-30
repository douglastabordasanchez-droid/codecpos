import { describe, expect, it } from 'vitest';
import { documentoTirilla58, htmlTirilla58 } from './tirilla58';
import { clasificarAnchoPapel } from './papelImpresora';

const venta = {
  numeroFactura: 'FV-000123',
  fecha: '2026-10-30T14:41:12.000Z',
  items: [
    { nombre: 'Arroz Diana 500 g', cantidad: 2, precio: 3500, subtotal: 7000 },
    { nombre: 'Queso <campesino>', cantidad: 0.485, precio: 20000, subtotal: 9700, talla: 'M' },
  ],
  total: 16700,
  metodoPago: 'efectivo',
  efectivoRecibido: 20000,
  cambio: 3300,
  cajero: 'Ana',
  ubicacion: 'Mesa 4',
};

describe('tirilla de 58 mm', () => {
  it('arma la tirilla con los datos de la venta', () => {
    const html = htmlTirilla58(venta, { nombreComercial: 'Tienda La Esquina', nit: '900123456', digitoVerificacion: '7' });
    expect(html).toContain('FACTURA DE VENTA');
    expect(html).toContain('N° FV-000123');
    expect(html).toContain('NIT 900123456-7');
    expect(html).toContain('2 x $3.500');
    expect(html).toContain('$16.700');
    expect(html).toContain('Cambio');
    expect(html).toContain('$3.300');
    expect(html).toContain('Ubicación: Mesa 4');
    expect(html).toContain('0,485 x $20.000');
  });

  it('escapa el texto de productos y configuración', () => {
    const html = htmlTirilla58(venta, { nombreComercial: '<b>X</b>' });
    expect(html).not.toContain('<campesino>');
    expect(html).toContain('&lt;campesino&gt;');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });

  it('el documento para imprimir es de 58 mm y no trae la factura grande', () => {
    const doc = documentoTirilla58(htmlTirilla58(venta, {}), 'Factura FV-000123');
    expect(doc).toContain('size:58mm auto');
    expect(doc).toContain('max-width: 240px');
    expect(doc).not.toContain('class="ticket"');
  });

  it('pago mixto y factura electrónica', () => {
    const html = htmlTirilla58(
      { ...venta, metodoPago: 'mixto', pagoMixto: { metodo1: 'efectivo', monto1: 10000, metodo2: 'nequi', monto2: 6700 }, cambio: 0, cufe: 'abc123' },
      { facturaElectronica: true },
    );
    expect(html).toContain('FACTURA ELECTRÓNICA DE VENTA');
    expect(html).toContain('nequi');
    expect(html).toContain('$6.700');
    expect(html).toContain('abc123');
    expect(html).not.toContain('Cambio');
  });
});

describe('ancho de papel del driver', () => {
  it('solo da por seguro un rollo de 58 u 80 mm', () => {
    expect(clasificarAnchoPapel(58)).toBe('angosto');
    expect(clasificarAnchoPapel(48)).toBe('angosto');
    expect(clasificarAnchoPapel(80)).toBe('normal');
    expect(clasificarAnchoPapel(72)).toBe('normal');
    expect(clasificarAnchoPapel(216)).toBe('incierto'); // Carta: driver genérico
    expect(clasificarAnchoPapel(210)).toBe('incierto'); // A4
    expect(clasificarAnchoPapel(undefined)).toBe('incierto');
  });
});
