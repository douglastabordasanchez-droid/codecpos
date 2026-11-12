/**
 * Entrega de una nota crédito o débito aprobada al comprador, igual que la
 * factura: representación gráfica en PDF (armada desde el XML que validó la
 * DIAN), ZIP con el AttachedDocument firmado (nota + ApplicationResponse) y
 * envío por el correo propio del negocio (Edge Function correo-facturas).
 * Sirve igual en Electron, la web y el celular.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { zipSync } from 'fflate';
import { parseDianXml } from './recepcion/parser';
import { construirAttachedDocument, nombresArchivoEntrega } from './attachedDocument';
import { obtenerTransporteDian } from './transporteDian';
import { construirUrlQR } from './softwareSecurityCode';
import { empresaEnLaNube } from './representacionGrafica';
import { CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO, type FacturaElectronicaDian, type NotaAjusteDian } from './types';
import { identificacionCompradorDelXml, obtenerFacturaPorId } from '../supabase/facturaElectronicaDianService';
import { obtenerNotaPorId } from '../supabase/notaAjusteDianService';
import { cargarImagen, encajar } from '../pdfGenerator';
import { getSupabaseClient } from '../supabase/config';

const deBase64Utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const pesos = (n: number) => `$${(Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => (/^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f);
const leer = (xml: string, nombre: string) =>
  xml.match(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nombre}>`))?.[1]?.trim() ?? '';

export const tituloNota = (nota: Pick<NotaAjusteDian, 'tipo'>) => (nota.tipo === 'credito' ? 'Nota crédito electrónica' : 'Nota débito electrónica');

/**
 * true si la nota salió a nombre de un comprador distinto al de la factura
 * (por ejemplo, cédula sin DV cuando la factura fue a un NIT). La DIAN la
 * acepta, pero el comprador no la ve en su cuenta.
 */
export function notaConCompradorDistinto(xmlNota?: string | null, xmlFactura?: string | null): boolean {
  const deNota = identificacionCompradorDelXml(xmlNota);
  const deFactura = identificacionCompradorDelXml(xmlFactura);
  if (!deNota || !deFactura) return false;
  return deNota.tipoDocumento !== deFactura.tipoDocumento || (deNota.digitoVerificacion || '') !== (deFactura.digitoVerificacion || '');
}

export async function cargarNotaYFactura(nota: Pick<NotaAjusteDian, 'tipo' | 'id'>): Promise<{ nota: NotaAjusteDian; factura: FacturaElectronicaDian }> {
  const completa = nota.id ? await obtenerNotaPorId(nota.tipo, nota.id) : null;
  if (!completa) throw new Error('No se encontró la nota');
  const factura = await obtenerFacturaPorId(completa.facturaId);
  if (!factura) throw new Error('No se encontró la factura de la nota');
  return { nota: completa, factura };
}

function respuestaDianXml(nota: NotaAjusteDian): string | null {
  const b64 = nota.respuestaDian?.XmlBase64Bytes;
  return typeof b64 === 'string' && b64 ? deBase64Utf8(b64) : null;
}

/** PDF carta de la nota, desde el XML firmado y la respuesta de la DIAN. */
export async function generarNotaPDF(nota: NotaAjusteDian, factura: FacturaElectronicaDian): Promise<Blob> {
  if (!nota.xml) throw new Error('Esta nota no tiene XML guardado');
  const docXml = parseDianXml(nota.xml).documento;
  if (!docXml) throw new Error('No se pudo leer el XML de la nota');
  const ambiente = factura.emisor.ambiente ?? 'habilitacion';
  const cude = nota.cude || docXml.cufe;
  const ar = respuestaDianXml(nota);
  const respuestaBloque = ar?.match(/<cac:Response>[\s\S]*?<\/cac:Response>/)?.[0] ?? '';
  const conceptoCodigo = nota.xml.match(/<cac:DiscrepancyResponse>[\s\S]*?<cbc:ResponseCode>([^<]+)/)?.[1] || nota.conceptoCodigo || '';
  const conceptos: ReadonlyArray<{ codigo: string; label: string }> = nota.tipo === 'credito' ? CONCEPTOS_NOTA_CREDITO : CONCEPTOS_NOTA_DEBITO;
  const concepto = conceptos.find((c) => c.codigo === conceptoCodigo)?.label || '';
  const ref = docXml.documentoReferencia;
  const e = docXml.emisor;
  const c = docXml.receptor;

  const [nube, qr] = await Promise.all([
    empresaEnLaNube(factura.clienteId).catch(() => ({} as Awaited<ReturnType<typeof empresaEnLaNube>>)),
    QRCode.toDataURL(docXml.autorizacion.qr || construirUrlQR(cude, ambiente), { margin: 0, width: 300 }),
  ]);
  const logo = await cargarImagen(nube.logoUrl);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();
  const IZQ = 14;
  const DER = W - 14;
  let y = 14;

  // Encabezado: emisor a la izquierda, tipo y número a la derecha.
  let xTexto = IZQ;
  if (logo) {
    const t = encajar(logo, 32, 20);
    pdf.addImage(logo.data, 'PNG', IZQ, y, t.w, t.h);
    xTexto = IZQ + t.w + 4;
  }
  pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20, 24, 31);
  pdf.text(e.razonSocial || factura.emisor.nombreORazonSocial || '', xTexto, y + 4, { maxWidth: 95 });
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(70, 76, 85);
  const lineasEmisor = [
    `NIT ${e.nit}${e.dv ? `-${e.dv}` : ''}`,
    [e.direccion || factura.emisor.direccion, nube.ciudad || e.ciudad].filter(Boolean).join(' · '),
    [nube.telefono ? `Tel. ${nube.telefono}` : '', factura.emisor.email || ''].filter(Boolean).join(' · '),
  ].filter(Boolean);
  lineasEmisor.forEach((l, i) => pdf.text(l, xTexto, y + 9 + i * 4));

  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20, 24, 31);
  pdf.text(tituloNota(nota).toUpperCase(), DER, y + 4, { align: 'right' });
  pdf.setFontSize(18).text(docXml.numeroCompleto || nota.numeroNota, DER, y + 12, { align: 'right' });
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(70, 76, 85);
  pdf.text(`Emitida: ${fechaCorta(docXml.fechaEmision)} ${docXml.horaEmision.slice(0, 8)}`, DER, y + 17, { align: 'right' });
  y += 26;
  pdf.setDrawColor(20, 24, 31).setLineWidth(0.5).line(IZQ, y, DER, y);
  y += 4;

  // Recuadros: comprador y factura que afecta.
  const anchoCaja = (DER - IZQ - 4) / 2;
  const caja = (x: number, titulo: string, lineas: string[], alto: number) => {
    pdf.setDrawColor(205, 209, 214).setLineWidth(0.2).roundedRect(x, y, anchoCaja, alto, 1.5, 1.5);
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(90, 96, 105).text(titulo, x + 3, y + 5);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(20, 24, 31);
    let yy = y + 10;
    for (const l of lineas) {
      const partes = pdf.splitTextToSize(l, anchoCaja - 6) as string[];
      pdf.text(partes, x + 3, yy);
      yy += partes.length * 3.8;
    }
  };
  const altoCajas = 34;
  caja(IZQ, 'ADQUIRENTE', [
    c.razonSocial,
    `Identificación: ${c.nit}${c.dv ? `-${c.dv}` : ''}`,
    c.email ? `Correo: ${c.email}` : '',
    c.telefono ? `Tel. ${c.telefono}` : '',
  ].filter(Boolean), altoCajas);
  caja(IZQ + anchoCaja + 4, 'FACTURA QUE AFECTA', [
    `Factura electrónica de venta ${ref?.numero || factura.numeroFactura}${ref?.fecha ? ` del ${fechaCorta(ref.fecha)}` : ''}`,
    `Concepto: ${conceptoCodigo}${concepto ? ` · ${concepto}` : ''}`,
    `Motivo: ${nota.motivo}`,
    `CUFE: ${ref?.cufe || factura.cufe || ''}`,
  ], altoCajas);
  y += altoCajas + 4;

  autoTable(pdf, {
    startY: y,
    margin: { left: IZQ, right: 14 },
    head: [['Descripción', 'Cant.', 'Valor unit. sin IVA', 'IVA', 'Valor IVA', 'Total']],
    body: docXml.lineas.map((l) => {
      const cargos = l.impuestos.filter((i) => !i.esRetencion);
      const imp = cargos.reduce((s, i) => s + i.valor, 0);
      return [l.descripcion, String(l.cantidad), pesos(l.precioUnitario), `${cargos[0]?.tarifa ?? 0}%`, pesos(imp), pesos(l.valorBruto + imp)];
    }),
    styles: { fontSize: 8, cellPadding: 1.6, textColor: [20, 24, 31], lineColor: [229, 231, 235], lineWidth: 0.1 },
    headStyles: { fillColor: [243, 244, 246], textColor: [20, 24, 31], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  const totales: Array<[string, string, boolean]> = [
    ['Subtotal (base)', pesos(docXml.totales.brutoLineas), false],
    ...docXml.impuestos
      .filter((i) => i.alcance === 'documento' && !i.esRetencion)
      .map((i): [string, string, boolean] => [`IVA ${i.tarifa}%`, pesos(i.valor), false]),
    [`Total ${nota.tipo === 'credito' ? 'nota crédito' : 'nota débito'}`, pesos(docXml.totales.total), true],
  ];
  for (const [etiqueta, valor, fuerte] of totales) {
    pdf.setFont('helvetica', fuerte ? 'bold' : 'normal').setFontSize(fuerte ? 10.5 : 8.5).setTextColor(20, 24, 31);
    pdf.text(etiqueta, DER - 70, y);
    pdf.text(valor, DER, y, { align: 'right' });
    y += fuerte ? 6 : 4.5;
  }
  y += 2;

  // Validación de la DIAN con el QR oficial.
  const altoVal = 36;
  const validada = leer(respuestaBloque, 'ResponseCode') === '02' || nota.estado === 'accepted';
  pdf.setDrawColor(validada ? 21 : 180, validada ? 128 : 83, validada ? 61 : 9).setLineWidth(0.6);
  pdf.setFillColor(validada ? 240 : 255, validada ? 253 : 251, validada ? 244 : 235);
  pdf.roundedRect(IZQ, y, DER - IZQ, altoVal, 2, 2, 'FD');
  pdf.addImage(qr, 'PNG', IZQ + 3, y + 3, 30, 30);
  const xv = IZQ + 37;
  pdf.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(validada ? 21 : 146, validada ? 128 : 64, validada ? 61 : 14);
  pdf.text(validada ? (leer(respuestaBloque, 'Description') || 'Documento validado por la DIAN') : 'Pendiente de validación de la DIAN', xv, y + 8);
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(20, 24, 31);
  if (ar) pdf.text(`Validada por la DIAN el ${fechaCorta(leer(ar, 'IssueDate'))} a las ${leer(ar, 'IssueTime').slice(0, 8)} (código 02).`, xv, y + 13);
  pdf.setFont('courier', 'normal').setFontSize(7);
  pdf.text(pdf.splitTextToSize(`CUDE: ${cude}`, DER - xv - 3) as string[], xv, y + 18);
  pdf.setFont('helvetica', 'normal').setFontSize(8);
  pdf.text('Consúltela escaneando el código o en catalogo-vpfe.dian.gov.co con el CUDE.', xv, y + 30);
  y += altoVal + 6;

  pdf.setFontSize(7.5).setTextColor(90, 96, 105);
  pdf.text(pdf.splitTextToSize(
    `Representación gráfica de la ${tituloNota(nota).toLowerCase()} ${nota.numeroNota}, generada desde el XML validado por la DIAN. Software: Codec Pos.`,
    DER - IZQ,
  ) as string[], IZQ, y);

  return pdf.output('blob');
}

export interface PaqueteNota {
  zip: Blob;
  nombreZip: string;
  pdf: Blob;
  nombrePdf: string;
}

/** ZIP para el comprador (AttachedDocument firmado + PDF) y el PDF suelto. */
export async function prepararPaqueteNota(nota: NotaAjusteDian, factura: FacturaElectronicaDian): Promise<PaqueteNota> {
  if (nota.estado !== 'accepted') throw new Error('Solo se entrega al cliente una nota aprobada por la DIAN');
  if (!nota.xml || !nota.cude) throw new Error('Esta nota no tiene guardados su XML firmado o su CUDE');
  const ar = respuestaDianXml(nota);
  if (!ar) throw new Error('No está guardada la validación de la DIAN de esta nota');

  const ahora = new Date();
  const ambiente = factura.emisor.ambiente ?? 'habilitacion';
  const sinFirmar = construirAttachedDocument({
    xmlFactura: nota.xml,
    xmlApplicationResponse: ar,
    numero: nota.numeroNota,
    cufe: nota.cude,
    ambiente,
    ahora,
    esquemaUuid: 'CUDE-SHA384',
  });
  const transporte = await obtenerTransporteDian(nota.perfilFiscalId);
  const [firmado, pdf] = await Promise.all([
    transporte.firmar({ perfilFiscalId: nota.perfilFiscalId, ambiente, numero: nota.numeroNota, xml: sinFirmar }),
    generarNotaPDF(nota, factura),
  ]);
  const consecutivo = Number(nota.numeroNota.replace(/^\D+/, '')) || 0;
  const nombres = nombresArchivoEntrega(factura.emisor.nit || '', consecutivo, ahora);
  const nombrePdf = `${nota.numeroNota}.pdf`;
  const zip = zipSync({
    [nombres.xml]: new TextEncoder().encode(firmado),
    [nombrePdf]: new Uint8Array(await pdf.arrayBuffer()),
  });
  return { zip: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), nombreZip: nombres.zip, pdf, nombrePdf };
}

const aBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * Manda la nota aprobada al correo que se indique (por defecto el que el
 * negocio guardó para ese cliente) desde el correo conectado del negocio.
 */
export async function enviarNotaPorCorreo(nota: NotaAjusteDian, factura: FacturaElectronicaDian, destino: string): Promise<void> {
  const paquete = await prepararPaqueteNota(nota, factura);
  const negocio = factura.emisor.nombreComercial || factura.emisor.nombreORazonSocial || '';
  const tipo = nota.tipo === 'credito' ? 'Nota Crédito' : 'Nota Débito';
  const texto = [
    `Señores ${factura.adquirente.nombreORazonSocial}:`,
    '',
    `Adjuntamos la ${tituloNota(nota).toLowerCase()} ${nota.numeroNota} por $${Math.round(nota.total).toLocaleString('es-CO')}, que afecta la factura ${factura.numeroFactura}.`,
    `Motivo: ${nota.motivo}`,
    'El archivo ZIP contiene la nota con la validación de la DIAN (XML) y su representación gráfica (PDF).',
    `\nCUDE: ${nota.cude}`,
    '',
    negocio,
  ].join('\n');
  const client = getSupabaseClient();
  if (!client) throw new Error('nuestra base de datos no está configurada');
  const { error } = await client.functions.invoke('correo-facturas', {
    body: {
      accion: 'enviar',
      destino,
      // Formato de asunto de la DIAN: Evento;Número;NIT emisor;Emisor;Número;Código;Línea de negocio.
      asunto: `${tipo};${nota.numeroNota};${factura.emisor.nit};${negocio};${nota.numeroNota};${nota.tipo === 'credito' ? '91' : '92'};`,
      texto,
      adjuntos: [
        { nombre: paquete.nombreZip, base64: await aBase64(paquete.zip), tipo: 'application/zip' },
        { nombre: paquete.nombrePdf, base64: await aBase64(paquete.pdf), tipo: 'application/pdf' },
      ],
    },
  });
  if (error) {
    let detalle = error.message;
    try {
      const cuerpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch { /* mensaje genérico */ }
    throw new Error(detalle);
  }
}
