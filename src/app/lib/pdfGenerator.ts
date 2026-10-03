/**
 * CODEC POS v2.0 - Generador de PDFs Profesionales
 *  · Factura de venta tamaño carta con el estilo de los documentos
 *    electrónicos (logo, QR, recuadro con el número, datos del cliente,
 *    tabla con bordes finos, totales, valor en letras y marca de agua).
 *  · Reportes de ventas.
 *  · Envío por WhatsApp y correo.
 * El mismo generador lo usan Electron y la web/celular.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { abrirEnlaceExterno } from './externalLink';
import { valorEnLetras } from './numeroALetras';

export interface ConfigEmpresa {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string;
  telefono: string;
  email: string;
  ciudad: string;
  logoUrl?: string;
  digitoVerificacion?: string;
  departamento?: string;
  eslogan?: string;
  regimenFiscal?: string;
  mensajeTirilla?: string;
  prefijoFactura?: string;
  claveResolucionDIAN?: string;
  fechaResolucionDIAN?: string;
  rangoAutorizadoDesde?: number | string;
  rangoAutorizadoHasta?: number | string;
}

export interface ItemFactura {
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  codigo?: string;
  descuento?: number;
  /** Porcentaje de IVA de la línea (0, 5, 19). */
  iva?: number;
}

export interface Venta {
  numeroFactura: string;
  fecha: string;
  items: ItemFactura[];
  subtotal: number;
  iva: number;
  propina?: number;
  descuento?: number;
  total: number;
  metodoPago: string;
  /** Pago repartido entre varios medios: { efectivo: 20000, nequi: 30000 }. */
  pagoMixto?: Record<string, number | undefined> | null;
  cajero: string;
  cliente?: string;
  clienteDocumento?: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  clienteCiudad?: string;
  clienteEmail?: string;
  /** Venta a crédito: fecha límite de pago. */
  fechaVencimiento?: string;
  observaciones?: string;
  mesa?: string;
  referencia_mesa?: string;
  /** Si la venta tiene factura electrónica, se muestra su CUFE y su QR oficial. */
  cufe?: string | null;
  qrUrl?: string | null;
  /** Número oficial de la factura electrónica (prefijo y consecutivo DIAN). */
  numeroElectronico?: string | null;
}

// ── Utilidades ─────────────────────────────────────────────────────────────

const GRIS_LINEA: [number, number, number] = [205, 209, 214];
const GRIS_TEXTO: [number, number, number] = [90, 96, 105];
const OSCURO: [number, number, number] = [20, 24, 31];
const FONDO_CABECERA: [number, number, number] = [243, 244, 246];

const dinero = (n: number) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const cantidadTexto = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-CO', { maximumFractionDigits: 3 }));

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta débito o crédito', nequi: 'Nequi', daviplata: 'Daviplata',
  bancolombia: 'Bancolombia', transferencia: 'Transferencia', bre_b: 'Bre-B', rappi: 'Rappi',
  cartera: 'Crédito', credito: 'Crédito', mixto: 'Pago mixto',
};
const nombreMetodo = (m: string) => METODOS[String(m || '').toLowerCase()] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'No especificado');

function fechaHora(iso: string) {
  try { return format(new Date(iso), 'dd/MM/yyyy, HH:mm'); } catch { return String(iso || '').slice(0, 16); }
}
function soloFecha(iso: string) {
  // 'YYYY-MM-DD' sin hora es un día calendario: se lee en hora local, no en UTC (si no, sale un día antes).
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''));
  try { return format(soloDia ? new Date(`${iso}T12:00:00`) : new Date(iso), 'dd/MM/yyyy'); } catch { return String(iso || '').slice(0, 10); }
}

/**
 * En Electron los datos completos del negocio (logo, DV, resolución) viven en
 * la configuración local; si quien llama no los mandó, se completan de ahí.
 * En la web esa configuración no existe y no pasa nada.
 */
function completarConfig(config: ConfigEmpresa): ConfigEmpresa {
  let local: Record<string, any> = {};
  try { local = JSON.parse(localStorage.getItem('codec_pos_config') || '{}') || {}; } catch { /* sin config local */ }
  const r: Record<string, any> = { ...config };
  for (const k of ['logoUrl', 'digitoVerificacion', 'departamento', 'eslogan', 'regimenFiscal', 'mensajeTirilla', 'prefijoFactura',
    'claveResolucionDIAN', 'fechaResolucionDIAN', 'rangoAutorizadoDesde', 'rangoAutorizadoHasta', 'direccion', 'ciudad', 'email', 'telefono', 'razonSocial']) {
    if ((r[k] === undefined || r[k] === null || r[k] === '') && local[k] !== undefined && local[k] !== '') r[k] = local[k];
  }
  return r as ConfigEmpresa;
}

/** Carga el logo (data URL o enlace) y lo devuelve como PNG con sus medidas reales, para no deformarlo. */
async function cargarImagen(src?: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!src) return null;
  try {
    const blob = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(blob);
    const escala = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * escala));
    canvas.height = Math.max(1, Math.round(bmp.height * escala));
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  } catch (e) {
    console.warn('[factura] No se pudo cargar el logo:', e);
    return null;
  }
}

/** Ajusta una imagen dentro de una caja sin deformarla. */
function encajar(img: { w: number; h: number }, maxW: number, maxH: number) {
  const k = Math.min(maxW / img.w, maxH / img.h);
  return { w: img.w * k, h: img.h * k };
}

// ── Factura ────────────────────────────────────────────────────────────────

/**
 * Generar PDF de Factura Profesional (tamaño carta).
 */
export const generarFacturaPDF = async (venta: Venta, configEntrada: ConfigEmpresa): Promise<Blob> => {
  const config = completarConfig(configEntrada);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();   // 215.9
  const H = doc.internal.pageSize.getHeight();  // 279.4
  const IZQ = 14;
  const DER = W - 14;
  const electronica = !!venta.cufe;

  const [logo, qr] = await Promise.all([
    cargarImagen(config.logoUrl),
    QRCode.toDataURL(
      venta.qrUrl || [
        `${electronica ? 'Factura electrónica' : 'Factura de venta'} ${venta.numeroFactura}`,
        `${config.nombreComercial || config.razonSocial} NIT ${config.nit || ''}`,
        `Fecha ${fechaHora(venta.fecha)}`,
        `Total ${dinero(venta.total)}`,
      ].join('\n'),
      { margin: 0, width: 260, errorCorrectionLevel: 'M' },
    ).catch(() => null),
  ]);

  const nombreEmisor = config.razonSocial || config.nombreComercial || 'Mi negocio';
  const nit = config.nit ? `NIT ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
  const ubicacion = [config.ciudad, config.departamento].filter(Boolean).join(', ');

  // ── Encabezado ──
  let y = 15;
  const anchoLogo = 34;
  if (logo) {
    const t = encajar(logo, anchoLogo, 30);
    doc.addImage(logo.data, 'PNG', IZQ + (anchoLogo - t.w) / 2, y + (30 - t.h) / 2, t.w, t.h, 'logo', 'FAST');
  }
  const centroEmisor = logo ? IZQ + anchoLogo + 34 : IZQ + 34;
  doc.setTextColor(...OSCURO);
  const lineasEmisor: Array<[string, boolean]> = [
    [nombreEmisor, true],
    [nit, false],
    ...(config.nombreComercial && config.nombreComercial !== nombreEmisor ? [[config.nombreComercial, true] as [string, boolean]] : []),
    [config.direccion, false],
    [config.telefono ? `Tel: ${config.telefono}` : '', false],
    [ubicacion ? `${ubicacion}, Colombia` : '', false],
    [config.email, false],
  ].filter(([t]) => !!t) as Array<[string, boolean]>;
  let yEmisor = y + 3;
  for (const [texto, negrita] of lineasEmisor) {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(negrita ? 9 : 8);
    doc.text(doc.splitTextToSize(texto, 62)[0], centroEmisor, yEmisor, { align: 'center' });
    yEmisor += 3.7;
  }

  if (qr) doc.addImage(qr, 'PNG', 112, y, 30, 30, 'qr', 'FAST');

  // Recuadro del número
  const cajaX = 150;
  doc.setDrawColor(...GRIS_LINEA);
  doc.setLineWidth(0.3);
  doc.rect(cajaX, y + 3, DER - cajaX, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(electronica ? 'Factura electrónica de venta' : 'Factura de venta', (cajaX + DER) / 2, y + 11, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const numeroVisible = electronica && venta.numeroElectronico ? venta.numeroElectronico : venta.numeroFactura;
  doc.text(`No. ${numeroVisible}`, (cajaX + DER) / 2, y + (numeroVisible !== venta.numeroFactura ? 15.5 : 17), { align: 'center' });
  if (numeroVisible !== venta.numeroFactura) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Venta ${venta.numeroFactura}`, (cajaX + DER) / 2, y + 20, { align: 'center' });
    doc.setTextColor(...OSCURO);
  }

  y = Math.max(y + 34, yEmisor + 2);

  // ── Cliente (izquierda) y fechas (derecha) ──
  const estiloCaja = {
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 }, lineColor: GRIS_LINEA, lineWidth: 0.2, textColor: OSCURO, fillColor: false as const },
  };
  const filasCliente: any[] = [
    [{ content: 'Señores', styles: { fontStyle: 'bold' } }, { content: venta.cliente || 'Consumidor final', colSpan: 3 }],
    [{ content: 'NIT / CC', styles: { fontStyle: 'bold' } }, venta.clienteDocumento || '222222222222', { content: 'Teléfono', styles: { fontStyle: 'bold' } }, venta.clienteTelefono || ''],
    [{ content: 'Dirección', styles: { fontStyle: 'bold' } }, venta.clienteDireccion || '', { content: 'Ciudad', styles: { fontStyle: 'bold' } }, venta.clienteCiudad || config.ciudad || ''],
  ];
  const mesa = venta.referencia_mesa || (venta.mesa && !/^general$/i.test(venta.mesa) ? venta.mesa : '');
  if (mesa) filasCliente.push([{ content: 'Ubicación', styles: { fontStyle: 'bold' } }, { content: mesa, colSpan: 3 }]);
  if (venta.clienteEmail) filasCliente.push([{ content: 'Correo', styles: { fontStyle: 'bold' } }, { content: venta.clienteEmail, colSpan: 3 }]);

  autoTable(doc, {
    ...estiloCaja,
    startY: y,
    margin: { left: IZQ },
    tableWidth: 128,
    body: filasCliente,
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 52 }, 2: { cellWidth: 18 }, 3: { cellWidth: 38 } },
  });
  const finCliente = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    ...estiloCaja,
    startY: y,
    margin: { left: 148 },
    tableWidth: DER - 148,
    head: [[{ content: 'Fecha y hora', colSpan: 2, styles: { halign: 'center', fillColor: FONDO_CABECERA, fontStyle: 'bold' } }]],
    body: [
      [{ content: 'Expedición', styles: { fontStyle: 'bold' } }, { content: fechaHora(venta.fecha), styles: { halign: 'center' } }],
      [{ content: 'Vencimiento', styles: { fontStyle: 'bold' } }, { content: soloFecha(venta.fechaVencimiento || venta.fecha), styles: { halign: 'center' } }],
    ],
    columnStyles: { 0: { cellWidth: 22 } },
  });
  const finFechas = (doc as any).lastAutoTable.finalY;
  y = Math.max(finCliente, finFechas) + 6;

  // ── Marca de agua (detrás de la tabla) ──
  const yLimiteTabla = 178;
  const centroMarca = (y + yLimiteTabla) / 2;
  try {
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: logo ? 0.06 : 0.05 }));
    if (logo) {
      const t = encajar(logo, 95, 80);
      doc.addImage(logo.data, 'PNG', (W - t.w) / 2, centroMarca - t.h / 2, t.w, t.h, 'logo', 'FAST');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(44);
      doc.setTextColor(...OSCURO);
      doc.text((config.nombreComercial || nombreEmisor).toUpperCase().slice(0, 22), W / 2, centroMarca, { align: 'center', angle: 25 });
    }
    doc.restoreGraphicsState();
  } catch { /* visor sin transparencias: sin marca de agua */ }
  doc.setTextColor(...OSCURO);

  // ── Ítems ──
  const hayDescuentos = venta.items.some((i) => (i.descuento || 0) > 0);
  const hayIva = venta.items.some((i) => (i.iva || 0) > 0) || (venta.iva || 0) > 0;
  const cabecera = ['Ítem', 'Descripción', 'Cantidad', 'Vr. Unitario', ...(hayDescuentos ? ['Desc.'] : []), ...(hayIva ? ['IVA'] : []), 'Vr. Total'];
  const cuerpo = venta.items.map((it, i) => [
    String(i + 1),
    it.codigo ? `${it.nombre}\nCód. ${it.codigo}` : it.nombre,
    cantidadTexto(Number(it.cantidad) || 0),
    dinero(it.precio),
    ...(hayDescuentos ? [it.descuento ? dinero(it.descuento) : ''] : []),
    ...(hayIva ? [`${it.iva ?? 0} %`] : []),
    dinero(it.subtotal),
  ]);
  const ultima = cabecera.length - 1;
  const columnas: Record<number, any> = {
    0: { halign: 'center', cellWidth: 10 },
    2: { halign: 'right', cellWidth: 18 },
    3: { halign: 'right', cellWidth: 26 },
    [ultima]: { halign: 'right', cellWidth: 28 },
  };
  if (hayDescuentos) columnas[4] = { halign: 'right', cellWidth: 20 };
  if (hayIva) columnas[hayDescuentos ? 5 : 4] = { halign: 'center', cellWidth: 14 };

  const inicioTabla = y;
  autoTable(doc, {
    startY: y,
    margin: { left: IZQ, right: W - DER, top: 18, bottom: 22 },
    theme: 'grid',
    head: [cabecera],
    body: cuerpo,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: GRIS_LINEA, lineWidth: 0.2, textColor: OSCURO, fillColor: false, valign: 'middle' },
    headStyles: { fillColor: FONDO_CABECERA, textColor: OSCURO, fontStyle: 'bold', halign: 'center', fontSize: 7.8 },
    columnStyles: columnas,
  });
  let finTabla = (doc as any).lastAutoTable.finalY;
  const paginaTabla = doc.getNumberOfPages();

  // En una sola página, el recuadro de los ítems llega hasta abajo como en los documentos electrónicos.
  if (paginaTabla === 1 && finTabla < yLimiteTabla) {
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.2);
    doc.rect(IZQ, inicioTabla, DER - IZQ, yLimiteTabla - inicioTabla);
    finTabla = yLimiteTabla;
  }

  // ── Totales y datos de pago ──
  y = finTabla + 6;
  if (y > H - 85) { doc.addPage(); y = 22; }
  const inicioResumen = y;

  const descuentoTotal = Number(venta.descuento) || venta.items.reduce((a, i) => a + (Number(i.descuento) || 0), 0);
  // El subtotal se deduce para que el resumen siempre sume exacto al total cobrado,
  // venga como venga el dato de cada pantalla.
  const subtotalMostrado = Number(venta.total) - (Number(venta.iva) || 0) - (Number(venta.propina) || 0) + descuentoTotal;
  const filasTotales: any[] = [
    ['Subtotal', dinero(subtotalMostrado)],
    ...(descuentoTotal > 0 ? [['Descuento', dinero(descuentoTotal)]] : []),
    ...((venta.iva || 0) > 0 ? [['IVA', dinero(venta.iva)]] : []),
    ...((venta.propina || 0) > 0 ? [['Propina voluntaria', dinero(venta.propina || 0)]] : []),
    [{ content: 'Total a pagar', styles: { fontStyle: 'bold', fontSize: 9.5, fillColor: FONDO_CABECERA } }, { content: dinero(venta.total), styles: { fontStyle: 'bold', fontSize: 9.5, fillColor: FONDO_CABECERA } }],
  ];
  autoTable(doc, {
    ...estiloCaja,
    startY: y,
    margin: { left: 140 },
    tableWidth: DER - 140,
    body: filasTotales,
    styles: { ...estiloCaja.styles, fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 } },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 1: { halign: 'right' } },
  });

  // Columna izquierda: ítems, valor en letras, forma y medio de pago, observaciones.
  const anchoIzq = 118;
  const titulo = (texto: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...OSCURO);
    doc.text(texto, IZQ, y);
    y += 4.2;
  };
  const parrafo = (texto: string, sangria = 2) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    doc.setTextColor(...OSCURO);
    const lineas = doc.splitTextToSize(texto, anchoIzq - sangria);
    doc.text(lineas, IZQ + sangria, y);
    y += lineas.length * 3.6 + 2.4;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Total ítems:', IZQ, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.text(String(venta.items.length), IZQ + 22, y + 1);
  y += 7;

  titulo('Valor en letras:');
  parrafo(valorEnLetras(venta.total));

  titulo('Forma de pago:');
  parrafo(venta.fechaVencimiento || ['cartera', 'credito'].includes(String(venta.metodoPago).toLowerCase()) ? 'Crédito' : 'Contado');

  titulo('Medio de pago:');
  const pagos = venta.pagoMixto
    ? Object.entries(venta.pagoMixto).filter(([, v]) => Number(v) > 0) as Array<[string, number]>
    : [[venta.metodoPago, venta.total] as [string, number]];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  for (const [metodo, valor] of pagos) {
    doc.text(nombreMetodo(metodo), IZQ + 2, y);
    doc.text(dinero(valor), IZQ + anchoIzq - 8, y, { align: 'right' });
    y += 4;
  }
  y += 2.4;

  if (venta.observaciones) {
    titulo('Observaciones:');
    parrafo(venta.observaciones);
  }
  if (venta.cajero) {
    titulo('Atendido por:');
    parrafo(venta.cajero);
  }
  y = Math.max(y, (doc as any).lastAutoTable.finalY + 4, inicioResumen);

  // ── Pie legal ──
  const regimen = String(config.regimenFiscal || '').toLowerCase();
  const textoRegimen = regimen === 'simplificado' ? 'No responsable de IVA'
    : regimen === 'gran_contribuyente' ? 'Responsable de IVA · Gran contribuyente'
    : regimen ? 'Responsable de IVA' : '';
  const pie: Array<[string, boolean]> = [];
  if (config.claveResolucionDIAN) {
    pie.push([`Resolución DIAN No. ${config.claveResolucionDIAN}${config.fechaResolucionDIAN ? ` del ${soloFecha(config.fechaResolucionDIAN)}` : ''}`
      + `${config.prefijoFactura ? `, prefijo ${config.prefijoFactura}` : ''}`
      + `${config.rangoAutorizadoDesde && config.rangoAutorizadoHasta ? `, desde el número ${config.rangoAutorizadoDesde} al ${config.rangoAutorizadoHasta}` : ''}.`, true]);
  }
  if (textoRegimen) pie.push([textoRegimen, false]);
  if (electronica) pie.push([`CUFE: ${venta.cufe}`, true]);
  else pie.push(['Este documento es un comprobante de venta y no constituye una factura electrónica de venta.', false]);
  pie.push([config.mensajeTirilla || '¡Gracias por su compra!', false]);

  doc.setFontSize(7);
  let altoPie = 0;
  const lineasPie = pie.map(([t, b]) => {
    const l = doc.splitTextToSize(t, DER - IZQ - 20);
    altoPie += l.length * 3;
    return [l, b] as [string[], boolean];
  });
  let yPie = H - 16 - altoPie;
  if (y > yPie - 4) { doc.addPage(); yPie = H - 16 - altoPie; }
  for (const [lineas, negrita] of lineasPie) {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(lineas, W / 2, yPie, { align: 'center' });
    yPie += lineas.length * 3;
  }

  // ── Marco, texto lateral y número de página en todas las hojas ──
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.roundedRect(9, 9, W - 18, H - 18, 2, 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(150, 155, 162);
    doc.text('Generado con Codec POS · Software de punto de venta · codecpos.vercel.app', W - 5.5, H / 2 + 40, { angle: 90 });
    doc.setFontSize(7);
    doc.text(`Página ${p} de ${paginas}`, DER, H - 11.5, { align: 'right' });
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...OSCURO);
      doc.text(`${nombreEmisor} · Factura No. ${venta.numeroFactura}`, IZQ, 15);
    }
  }

  return doc.output('blob');
};

/** Nombre de archivo de la factura: Factura_FV-233_20261001.pdf */
export function nombreArchivoFactura(venta: Pick<Venta, 'numeroFactura' | 'fecha'>) {
  let fecha = '';
  try { fecha = `_${format(new Date(venta.fecha), 'yyyyMMdd')}`; } catch { /* sin fecha */ }
  return `Factura_${String(venta.numeroFactura).replace(/[^\w.-]+/g, '_')}${fecha}.pdf`;
}

/**
 * Descargar PDF de factura
 */
export const descargarFacturaPDF = async (venta: Venta, config: ConfigEmpresa) => {
  try {
    const blob = await generarFacturaPDF(venta, config);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivoFactura(venta);
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generando PDF:', error);
    throw error;
  }
};

/**
 * Generar PDF de Reporte de Ventas
 */
export const generarReporteVentasPDF = async (
  ventas: Venta[],
  config: ConfigEmpresa,
  fechaInicio: string,
  fechaFin: string
): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE VENTAS', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(config.nombreComercial || 'CODEC POS', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 7;
  
  doc.setFontSize(10);
  doc.text(
    `Período: ${format(new Date(fechaInicio), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(fechaFin), 'dd/MM/yyyy', { locale: es })}`,
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );

  yPos += 15;

  // Estadísticas generales
  const totalVentas = ventas.length;
  const totalIngresos = ventas.reduce((sum, v) => sum + v.total, 0);
  const totalIVA = ventas.reduce((sum, v) => sum + v.iva, 0);
  
  doc.setFillColor(241, 245, 249);
  doc.rect(15, yPos, pageWidth - 30, 20, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total de Ventas: ${totalVentas}`, 20, yPos + 7);
  doc.text(`Total Ingresos: $${totalIngresos.toLocaleString('es-CO')}`, pageWidth / 2, yPos + 7, { align: 'center' });
  doc.text(`Total IVA: $${totalIVA.toLocaleString('es-CO')}`, pageWidth - 20, yPos + 7, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`, 20, yPos + 14);

  yPos += 30;

  // Tabla de ventas
  const tableData = ventas.map(v => [
    v.numeroFactura,
    format(new Date(v.fecha), 'dd/MM/yyyy', { locale: es }),
    format(new Date(v.fecha), 'HH:mm', { locale: es }),
    v.cajero,
    v.metodoPago.toUpperCase(),
    `$${v.subtotal.toLocaleString('es-CO')}`,
    `$${v.iva.toLocaleString('es-CO')}`,
    `$${v.total.toLocaleString('es-CO')}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Factura', 'Fecha', 'Hora', 'Cajero', 'Método Pago', 'Subtotal', 'IVA', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [34, 197, 94],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 30 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'left', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 30 },
      6: { halign: 'right', cellWidth: 25 },
      7: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 15, right: 15 },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  doc.text('CODEC POS v2.0 - Sistema Profesional de Punto de Venta', pageWidth / 2, finalY, { align: 'center' });

  const pdfBlob = doc.output('blob');
  return pdfBlob;
};

/**
 * Descargar PDF de reporte de ventas
 */
export const descargarReporteVentasPDF = async (
  ventas: Venta[],
  config: ConfigEmpresa,
  fechaInicio: string,
  fechaFin: string
) => {
  const blob = await generarReporteVentasPDF(ventas, config, fechaInicio, fechaFin);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Reporte_Ventas_${format(new Date(fechaInicio), 'yyyyMMdd')}_${format(new Date(fechaFin), 'yyyyMMdd')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * En celulares (y navegadores que lo permiten) el PDF se comparte como
 * archivo adjunto: el sistema abre WhatsApp, Gmail, etc. con la factura ya
 * pegada. Devuelve false si no se puede, para usar el camino de siempre.
 */
async function compartirComoArchivo(blob: Blob, nombre: string, titulo: string, texto: string): Promise<boolean> {
  try {
    const archivo = new File([blob], nombre, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [archivo] })) return false;
    await navigator.share({ files: [archivo], title: titulo, text: texto });
    return true;
  } catch (e: any) {
    // Si la persona cerró el menú de compartir, no se abre nada más.
    return e?.name === 'AbortError';
  }
}

/**
 * 📱 Enviar factura por WhatsApp
 */
export const enviarFacturaPorWhatsApp = async (
  venta: Venta,
  config: ConfigEmpresa,
  numeroTelefono: string
) => {
  try {
    const blob = await generarFacturaPDF(venta, config);
    const textoCorto = `Factura ${venta.numeroFactura} de ${config.nombreComercial || 'nuestro negocio'} por $${venta.total.toLocaleString('es-CO')}. ¡Gracias por tu compra!`;
    if (await compartirComoArchivo(blob, nombreArchivoFactura(venta), `Factura ${venta.numeroFactura}`, textoCorto)) return true;

    // Sin compartir archivos (computador): se descarga y se abre WhatsApp con el mensaje.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivoFactura(venta);
    link.click();
    URL.revokeObjectURL(url);
    
    // Preparar mensaje para WhatsApp
    // 🛡️ FIX: los emoji (👋🧾📅💰💳🙏) llegaban como "�" al abrirse desde
    // Electron -- shell.openExternal() entrega el enlace wa.me a la app de
    // WhatsApp Desktop de Windows, que no decodifica bien los caracteres
    // fuera del plano básico (BMP) aunque las tildes sí llegan bien. Sin una
    // forma confiable de garantizar el emoji en ese destino, se usa texto
    // plano con el formato nativo de WhatsApp (*negrita*, _cursiva_).
    const mensaje = `¡Hola!\n\n` +
      `Te envío la factura de tu compra:\n\n` +
      `*Factura:* ${venta.numeroFactura}\n` +
      `*Fecha:* ${format(new Date(venta.fecha), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}\n` +
      `*Total:* $${venta.total.toLocaleString('es-CO')}\n` +
      `*Método de pago:* ${venta.metodoPago.toUpperCase()}\n\n` +
      `¡Gracias por tu compra!\n\n` +
      `_${config.nombreComercial || 'CODEC POS'}_`;
    
    // Limpiar número de teléfono (solo dígitos)
    const numeroLimpio = numeroTelefono.replace(/\D/g, '');
    
    // Abrir WhatsApp Web
    const urlWhatsApp = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
    abrirEnlaceExterno(urlWhatsApp);

    return true;
  } catch (error) {
    console.error('Error enviando por WhatsApp:', error);
    throw error;
  }
};

/**
 * 📧 Enviar factura por Email
 */
export const enviarFacturaPorEmail = async (
  venta: Venta,
  config: ConfigEmpresa,
  emailDestinatario: string
) => {
  try {
    const blob = await generarFacturaPDF(venta, config);
    const asuntoCorto = `Factura ${venta.numeroFactura} de ${config.nombreComercial || 'nuestro negocio'}`;
    if (await compartirComoArchivo(blob, nombreArchivoFactura(venta), asuntoCorto, `Adjunto la factura ${venta.numeroFactura} por $${venta.total.toLocaleString('es-CO')}.`)) return true;

    // Sin compartir archivos (computador): se descarga y se abre el correo con el mensaje.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivoFactura(venta);
    link.click();
    URL.revokeObjectURL(url);
    
    // Preparar email
    const asunto = asuntoCorto;
    const cuerpo = `Estimado cliente,\n\n` +
      `Adjunto encontrarás tu factura de compra:\n\n` +
      `Factura: ${venta.numeroFactura}\n` +
      `Fecha: ${format(new Date(venta.fecha), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}\n` +
      `Total: $${venta.total.toLocaleString('es-CO')}\n` +
      `Método de pago: ${venta.metodoPago.toUpperCase()}\n\n` +
      `Gracias por tu compra!\n\n` +
      `${config.nombreComercial || 'CODEC POS'}\n` +
      `${config.telefono || ''}\n` +
      `${config.email || ''}`;
    
    // Abrir cliente de email
    const mailtoLink = `mailto:${emailDestinatario}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo + '\n\n(Por favor adjunta el archivo PDF que se descargó automáticamente)')}`;
    abrirEnlaceExterno(mailtoLink);

    return true;
  } catch (error) {
    console.error('Error enviando por email:', error);
    throw error;
  }
};