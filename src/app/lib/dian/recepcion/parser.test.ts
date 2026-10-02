import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { parseDianXml, marcarDireccion } from './parser';
import { leerZipSeguro, ZipError } from './zip';
import { construirXmlFactura, type DianExtensionData } from '../xmlBuilder';
import type { FacturaElectronicaDian } from '../types';

// Fixtures sintéticos traídos de Codec Document — no son documentos reales.
const fixture = (nombre: string) =>
  readFileSync(join(__dirname, 'fixtures', nombre), 'utf8');

describe('parseDianXml — fixtures de Codec Document', () => {
  it('lee un documento equivalente POS con IVA 19 %', () => {
    const r = parseDianXml(fixture('sint-0001-pos-simple.xml'));
    expect(r.ok).toBe(true);
    expect(r.documento?.tipo).toBe('documento_equivalente');
    expect(r.documento?.lineas.length).toBeGreaterThan(0);
    expect(r.documento?.resumen.iva).toBeGreaterThan(0);
    expect(r.documento?.totales.total).toBeGreaterThan(0);
    expect(r.documento?.emisor.nit).not.toBe('');
  });

  it('no marca descuadre cuando hay líneas gravadas y excluidas', () => {
    const r = parseDianXml(fixture('sint-0002-pos-mixto.xml'));
    expect(r.excepciones.map((e) => e.codigo)).not.toContain('DESCUADRE_IMPUESTOS');
  });

  it('separa el INC del IVA', () => {
    const r = parseDianXml(fixture('sint-0003-pos-restaurante-inc.xml'));
    expect(r.documento?.resumen.inc).toBeGreaterThan(0);
    expect(r.documento?.resumen.iva).toBe(0);
  });

  it('desanida una nota débito con retenciones dentro de un AttachedDocument', () => {
    const r = parseDianXml(fixture('sint-0004-nota-debito.xml'));
    expect(r.documento?.tipo).toBe('nota_debito');
    expect(r.documento?.resumen.totalRetenciones).toBeGreaterThan(0);
    expect(r.validacionDian?.validado).toBe(true);
  });

  it('avisa que un POS a consumidor final no da IVA descontable', () => {
    const r = parseDianXml(fixture('sint-0005-pos-consumidor-final.xml'));
    expect(r.excepciones.map((e) => e.codigo)).toContain('POS_SIN_ADQUIRIENTE');
  });

  it('rechaza un XML con DOCTYPE (XXE)', () => {
    const r = parseDianXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><Invoice/>');
    expect(r.ok).toBe(false);
    expect(r.excepciones[0].codigo).toBe('DOCTYPE_PROHIBIDO');
  });
});

describe('parseDianXml — XML emitido por el propio POS', () => {
  const factura: FacturaElectronicaDian = {
    clienteId: 'cliente-1',
    perfilFiscalId: 'perfil-1',
    tipoDocumento: 'factura',
    ventaReferencia: 'FAC000123',
    numeroFactura: 'SETP990000001',
    prefijo: 'SETP',
    estado: 'signing',
    intentosTransmision: 0,
    contingencia: false,
    emisor: { nit: '900123456', digitoVerificacion: '8', nombreORazonSocial: 'Mi Negocio S.A.S', municipioCodigo: '11001', ambiente: 'habilitacion' },
    adquirente: { tipoDocumento: '13', numeroDocumento: '1234567890', nombreORazonSocial: 'Juan Pérez' },
    items: [
      { descripcion: 'Producto de prueba', cantidad: 2, precioUnitario: 50000, subtotal: 100000, impuestos: [{ codigo: '01', porcentaje: 19, valor: 19000 }] },
    ],
    subtotal: 100000,
    totalImpuestos: 19000,
    total: 119000,
    fechaEmision: new Date(2026, 0, 15, 14, 30, 0).toISOString(),
    cufe: 'a'.repeat(96),
  };
  const extension: DianExtensionData = {
    invoiceAuthorization: '18764054015291',
    authorizationStartDate: '2026-01-01',
    authorizationEndDate: '2027-01-01',
    prefix: 'SETP',
    rangoDesde: 1,
    rangoHasta: 5000000,
    softwareSecurityCode: 'b'.repeat(96),
    softwareId: 'fcd8a82c-6c19-4926-a978-65381b97e891',
    qrUrl: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=' + 'a'.repeat(96),
  };

  it('recupera líneas, impuestos, CUFE y resolución — lo que necesita «Ver documento»', () => {
    const r = parseDianXml(construirXmlFactura(factura, extension));
    const d = r.documento!;
    expect(d.tipo).toBe('factura');
    expect(d.numeroCompleto).toBe('SETP990000001');
    expect(d.cufe).toBe('a'.repeat(96));
    expect(d.emisor.nit).toBe('900123456');
    expect(d.receptor.nit).toBe('1234567890');
    expect(d.lineas).toHaveLength(1);
    expect(d.lineas[0].descripcion).toBe('Producto de prueba');
    expect(d.lineas[0].cantidad).toBe(2);
    expect(d.resumen.iva).toBe(19000);
    expect(d.totales.total).toBe(119000);
    expect(d.autorizacion.resolucion).toBe('18764054015291');
    expect(d.autorizacion.qr).toContain('searchqr');
  });

  it('marca la dirección según el NIT propio', () => {
    const d = parseDianXml(construirXmlFactura(factura, extension)).documento!;
    expect(marcarDireccion(d, '900.123.456').direccion).toBe('emitido');
    expect(marcarDireccion(d, '1234567890').direccion).toBe('recibido');
    expect(marcarDireccion(d, '111').direccion).toBe('desconocido');
  });
});

describe('leerZipSeguro', () => {
  it('extrae solo los XML y descarta la ruta interna', () => {
    const zip = zipSync({
      'carpeta/900123456/factura.xml': strToU8('<Invoice/>'),
      'carpeta/representacion.pdf': strToU8('%PDF'),
      '__MACOSX/._factura.xml': strToU8('ruido'),
    });
    const r = leerZipSeguro(zip);
    expect(r.entradas).toHaveLength(1);
    expect(r.entradas[0].nombre).toBe('factura.xml');
    expect(r.entradas[0].contenido).toBe('<Invoice/>');
    expect(r.ignorados).toBe(2);
  });

  it('corta una bomba ZIP por ratio de compresión', () => {
    const zip = zipSync({ 'bomba.xml': new Uint8Array(8 * 1024 * 1024) });
    expect(() => leerZipSeguro(zip)).toThrowError(ZipError);
  });

  it('respeta el tope por archivo', () => {
    const zip = zipSync({ 'grande.xml': strToU8('<a>' + 'x'.repeat(5000) + '</a>') }, { level: 0 });
    expect(() => leerZipSeguro(zip, { maxEntradas: 10, maxBytesTotales: 1e9, maxBytesPorArchivo: 1000, maxRatioCompresion: 1e9 }))
      .toThrowError(/máximo por archivo/);
  });

  it('falla claro si no hay ningún XML', () => {
    const zip = zipSync({ 'leeme.txt': strToU8('hola') });
    expect(() => leerZipSeguro(zip)).toThrowError(/ningún archivo XML/);
  });

  it('falla claro si el archivo no es un ZIP', () => {
    expect(() => leerZipSeguro(strToU8('esto no es un zip'))).toThrowError(ZipError);
  });
});
