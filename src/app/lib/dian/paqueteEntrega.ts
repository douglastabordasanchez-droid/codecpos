/**
 * Paquete que se le entrega al comprador de una factura aprobada: un ZIP con
 * el AttachedDocument firmado (factura + validación de la DIAN) y el PDF.
 *
 * Si la factura se emitió antes de que se guardara el ApplicationResponse,
 * se le pide a la DIAN con GetStatus y se deja guardado para la próxima vez.
 */
import { zipSync } from 'fflate';
import { construirAttachedDocument, nombresArchivoEntrega } from './attachedDocument';
import { obtenerTransporteDian } from './transporteDian';
import { construirUrlQR } from './softwareSecurityCode';
import { actualizarEstadoFactura } from '../supabase/facturaElectronicaDianService';
import { generarFacturaPDF, type ConfigEmpresa, type Venta } from '../pdfGenerator';
import type { FacturaElectronicaDian } from './types';

const deBase64Utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

async function obtenerApplicationResponse(factura: FacturaElectronicaDian): Promise<string> {
  const guardado = factura.respuestaDian?.XmlBase64Bytes;
  if (typeof guardado === 'string' && guardado) return deBase64Utf8(guardado);

  const transporte = await obtenerTransporteDian(factura.perfilFiscalId);
  const respuesta = await transporte.consultarEstado(factura.perfilFiscalId, factura.emisor.ambiente ?? 'habilitacion', factura.cufe!);
  const b64 = (respuesta.crudo as Record<string, unknown> | undefined)?.XmlBase64Bytes;
  if (typeof b64 !== 'string' || !b64) {
    throw new Error('La DIAN no devolvió la validación de esta factura. Intenta de nuevo en unos minutos.');
  }
  const respuestaDian = { ...(factura.respuestaDian ?? {}), XmlBase64Bytes: b64 };
  await actualizarEstadoFactura(factura.id!, factura.estado, { respuestaDian }).catch(() => {});
  factura.respuestaDian = respuestaDian;
  return deBase64Utf8(b64);
}

const leer = (xml: string, nombre: string) =>
  xml.match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nombre}>`))?.[1]?.trim();

/** Representación gráfica: el mismo PDF carta de las ventas, con CUFE y QR de la DIAN. */
function pdfDeFactura(factura: FacturaElectronicaDian): Promise<Blob> {
  const xml = factura.xml ?? '';
  const venta: Venta = {
    numeroFactura: factura.numeroFactura,
    numeroElectronico: factura.numeroFactura,
    fecha: factura.fechaEmision,
    items: factura.items.map((i) => ({
      nombre: i.descripcion,
      codigo: i.codigo,
      cantidad: i.cantidad,
      precio: i.precioUnitario,
      subtotal: i.subtotal,
      iva: i.impuestos?.find((t) => t.codigo === '01')?.porcentaje,
    })),
    subtotal: factura.subtotal,
    iva: factura.totalImpuestos,
    total: factura.total,
    metodoPago: factura.pago?.metodo || 'efectivo',
    fechaVencimiento: factura.pago?.fechaVencimiento,
    cajero: '',
    cliente: factura.adquirente.nombreORazonSocial,
    clienteDocumento: factura.adquirente.numeroDocumento,
    clienteTelefono: factura.adquirente.telefono,
    clienteDireccion: factura.adquirente.direccion,
    clienteEmail: factura.adquirente.email,
    cufe: factura.cufe,
    qrUrl: factura.cufe ? construirUrlQR(factura.cufe, factura.emisor.ambiente ?? 'habilitacion') : null,
  };
  const config: ConfigEmpresa = {
    nombreComercial: factura.emisor.nombreComercial || factura.emisor.nombreORazonSocial || '',
    razonSocial: factura.emisor.nombreORazonSocial || '',
    nit: factura.emisor.nit || '',
    digitoVerificacion: factura.emisor.digitoVerificacion,
    direccion: factura.emisor.direccion || '',
    telefono: '',
    email: factura.emisor.email || '',
    ciudad: '',
    prefijoFactura: factura.prefijo,
    claveResolucionDIAN: leer(xml, 'InvoiceAuthorization'),
    fechaResolucionDIAN: leer(xml, 'StartDate'),
    rangoAutorizadoDesde: leer(xml, 'From'),
    rangoAutorizadoHasta: leer(xml, 'To'),
  };
  return generarFacturaPDF(venta, config);
}

export interface PaqueteEntrega {
  archivo: Blob;
  nombre: string;
}

export async function prepararPaqueteEntrega(factura: FacturaElectronicaDian): Promise<PaqueteEntrega> {
  if (factura.estado !== 'accepted') throw new Error('Solo se entrega al cliente una factura aprobada por la DIAN');
  if (factura.tipoDocumento !== 'factura') throw new Error('El contenedor para el cliente aplica a facturas electrónicas; para el documento POS entrega el PDF');
  if (!factura.xml || !factura.cufe) throw new Error('Esta factura no tiene guardados su XML firmado o su CUFE');

  const xmlApplicationResponse = await obtenerApplicationResponse(factura);
  const ahora = new Date();
  const sinFirmar = construirAttachedDocument({
    xmlFactura: factura.xml,
    xmlApplicationResponse,
    numero: factura.numeroFactura,
    cufe: factura.cufe,
    ambiente: factura.emisor.ambiente ?? 'habilitacion',
    ahora,
  });

  const transporte = await obtenerTransporteDian(factura.perfilFiscalId);
  const [firmado, pdf] = await Promise.all([
    transporte.firmar({ perfilFiscalId: factura.perfilFiscalId, ambiente: factura.emisor.ambiente ?? 'habilitacion', numero: factura.numeroFactura, xml: sinFirmar }),
    pdfDeFactura(factura),
  ]);

  const consecutivo = Number(factura.numeroFactura.replace(/^\D+/, '')) || 0;
  const nombres = nombresArchivoEntrega(factura.emisor.nit || '', consecutivo, ahora);
  const zip = zipSync({
    [nombres.xml]: new TextEncoder().encode(firmado),
    [`${factura.numeroFactura}.pdf`]: new Uint8Array(await pdf.arrayBuffer()),
  });
  return { archivo: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), nombre: nombres.zip };
}
