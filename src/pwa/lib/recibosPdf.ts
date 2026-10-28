/**
 * Cierre por áreas (ventasPorArea.ts) en PDF y en documento:
 *   · Tirilla: el mismo recibo que sale en la impresora térmica, al ancho del
 *     papel (58 u 80 mm), una página por recibo.
 *   · Documento: hoja carta con el consolidado y el detalle de cada área en
 *     tablas, para archivar o mandar al contador.
 * Lo usan la web y Electron (VentasPorArea.tsx).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarImagen, encajar } from '../../app/lib/pdfGenerator';
import {
  lineasConsolidado, lineasReciboArea, perrosAtendidos,
  type AreaVenta, type DatosRecibo, type LineaRecibo, type ResumenArea,
} from './ventasPorArea';

/** Qué se muestra: el cierre completo (todas las áreas + consolidado), solo el consolidado o un área. */
export type SeleccionCierre = 'completo' | 'consolidado' | AreaVenta;

const pesos = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
const fecha = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : `${Number(n).toFixed(2)} kg`);

/** Los recibos (tirilla) de una selección. */
export function recibosDe(sel: SeleccionCierre, areas: ResumenArea[], total: number, d: DatosRecibo): LineaRecibo[][] {
  if (sel === 'consolidado') return [lineasConsolidado(areas, total, d)];
  if (sel === 'completo') return [...areas.map((a) => lineasReciboArea(a, d)), lineasConsolidado(areas, total, d)];
  const a = areas.find((x) => x.area === sel);
  return a ? [lineasReciboArea(a, d)] : [];
}

export function nombreArchivo(sel: SeleccionCierre, formato: 'tirilla' | 'documento'): string {
  const hoy = new Date();
  const f = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const que = sel === 'completo' ? 'cierre-por-areas' : sel === 'consolidado' ? 'consolidado' : `ventas-${sel}`;
  return `${que}_${f}${formato === 'tirilla' ? '_tirilla' : ''}.pdf`;
}

// ── Tirilla en PDF ─────────────────────────────────────────────────────────

type LogoCargado = { data: string; w: number; h: number } | null;

/** El logo del negocio listo para jsPDF (medidas reales para no deformarlo); null si no hay o no carga. */
async function logoPdf(src?: string): Promise<LogoCargado> {
  if (!src) return null;
  try { return await cargarImagen(src); } catch { return null; }
}

/**
 * PDF del ancho del papel térmico: cada recibo en su página, con la altura
 * justa y el logo del negocio arriba, ajustado al papel (máx. 70 % del ancho
 * y 20 mm de alto, sin deformarlo).
 */
export async function pdfTirilla(recibos: LineaRecibo[][], anchoMm: 58 | 80, logoSrc?: string): Promise<Blob> {
  const margen = 3;
  const util = anchoMm - margen * 2;
  const tam = anchoMm === 58 ? 7.5 : 9;
  const alto = tam * 0.45; // mm por renglón
  const logo = await logoPdf(logoSrc);
  const medidaLogo = logo ? encajar(logo, util * 0.7, 20) : null;
  const espacioLogo = medidaLogo ? medidaLogo.h + 3 : 0;
  const medir = new jsPDF({ unit: 'mm', format: [anchoMm, 100] });
  medir.setFont('courier', 'normal');
  medir.setFontSize(tam);

  // Renglones ya partidos al ancho, para saber la altura de cada página.
  type Renglon = { izq: string; der?: string; negrita?: boolean; centro?: boolean; sep?: boolean };
  const paginas: Renglon[][] = recibos.map((lineas) => {
    const out: Renglon[] = [];
    for (const l of lineas) {
      if (l.separador) { out.push({ izq: '', sep: true }); continue; }
      medir.setFont('courier', l.negrita ? 'bold' : 'normal');
      if (l.valor !== undefined) {
        const anchoValor = medir.getTextWidth(l.valor) + 2;
        const partes: string[] = medir.splitTextToSize(l.texto || ' ', Math.max(10, util - anchoValor));
        partes.forEach((p, i) => out.push({ izq: p, der: i === partes.length - 1 ? l.valor : undefined, negrita: l.negrita }));
      } else {
        (medir.splitTextToSize(l.texto || ' ', util) as string[]).forEach((p) => out.push({ izq: p, negrita: l.negrita, centro: l.centro }));
      }
    }
    return out;
  });

  let doc: jsPDF | null = null;
  for (const renglones of paginas) {
    const altoPagina = margen * 2 + 4 + espacioLogo + renglones.length * alto;
    // jsPDF voltea la hoja si es más ancha que alta: un recibo corto saldría girado.
    const orientacion = altoPagina >= anchoMm ? 'portrait' : 'landscape';
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [anchoMm, altoPagina], orientation: orientacion });
    else doc.addPage([anchoMm, altoPagina], orientacion);
    doc.setFontSize(tam);
    let y = margen;
    if (logo && medidaLogo) {
      doc.addImage(logo.data, 'PNG', (anchoMm - medidaLogo.w) / 2, y, medidaLogo.w, medidaLogo.h, 'logo', 'FAST');
      y += espacioLogo;
    }
    y += 3;
    for (const r of renglones) {
      if (r.sep) {
        doc.setLineDashPattern([0.8, 0.6], 0);
        doc.setLineWidth(0.2);
        doc.line(margen, y - alto * 0.35, anchoMm - margen, y - alto * 0.35);
        doc.setLineDashPattern([], 0);
      } else {
        doc.setFont('courier', r.negrita ? 'bold' : 'normal');
        if (r.centro) doc.text(r.izq, anchoMm / 2, y, { align: 'center' });
        else doc.text(r.izq, margen, y);
        if (r.der) doc.text(r.der, anchoMm - margen, y, { align: 'right' });
      }
      y += alto;
    }
  }
  return (doc || new jsPDF()).output('blob');
}

// ── Documento (carta) ──────────────────────────────────────────────────────

function areasDe(sel: SeleccionCierre, areas: ResumenArea[]): ResumenArea[] {
  if (sel === 'consolidado') return [];
  if (sel === 'completo') return areas;
  return areas.filter((a) => a.area === sel);
}

function tituloDe(sel: SeleccionCierre, areas: ResumenArea[]): string {
  if (sel === 'completo') return 'Cierre de ventas por área';
  if (sel === 'consolidado') return 'Consolidado de ventas';
  return `Ventas · ${areas.find((a) => a.area === sel)?.nombre || ''}`;
}

/** Filas del detalle de un área: en peluquería cada perro; en lo demás se juntan los productos iguales. */
function filasDetalle(a: ResumenArea) {
  if (a.area === 'peluqueria') return a.items.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, total: it.total }));
  const m = new Map<string, { nombre: string; cantidad: number; total: number }>();
  for (const it of a.items) {
    const p = m.get(it.nombre) || { nombre: it.nombre, cantidad: 0, total: 0 };
    p.cantidad += Number(it.cantidad) || 0; p.total += Number(it.total) || 0;
    m.set(it.nombre, p);
  }
  return [...m.values()];
}

/** "#a855f7" → [168, 85, 247] para jsPDF. */
const rgb = (hex: string): [number, number, number] => {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
/** El color del área mezclado con blanco (fondos suaves). */
const suave = (hex: string, k = 0.88): [number, number, number] => rgb(hex).map((c) => Math.round(c + (255 - c) * k)) as [number, number, number];

/**
 * PDF tamaño carta: encabezado con el logo y los datos del negocio, tarjetas
 * con el total del día, cuántas ventas y cuántos perros, el consolidado por
 * área y el detalle de cada área con su color.
 */
export async function pdfDocumento(sel: SeleccionCierre, areas: ResumenArea[], total: number, d: DatosRecibo): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const altoHoja = doc.internal.pageSize.getHeight();
  const x = 16;
  const util = ancho - x * 2;
  const verde: [number, number, number] = [5, 150, 105];
  const tinta: [number, number, number] = [15, 23, 42];
  const gris: [number, number, number] = [100, 116, 139];

  // Encabezado: logo a la izquierda, negocio y título a su lado, franja verde abajo.
  const logo = await logoPdf(d.logo);
  let y = 14;
  let xTexto = x;
  if (logo) {
    const t = encajar(logo, 34, 22);
    doc.addImage(logo.data, 'PNG', x, y, t.w, t.h, 'logo', 'FAST');
    xTexto = x + t.w + 6;
  }
  doc.setTextColor(...tinta); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(d.negocio || 'Cierre de caja', xTexto, y + 7);
  doc.setFontSize(12.5); doc.setTextColor(...verde);
  doc.text(tituloDe(sel, areas), xTexto, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text(`${d.desde ? `Desde ${fecha(d.desde)}  ·  ` : ''}Hasta ${fecha(d.hasta || new Date().toISOString())}${d.cajero ? `  ·  Cajero: ${d.cajero}` : ''}`, xTexto, y + 20);
  y += 26;
  doc.setFillColor(...verde); doc.rect(x, y, util, 1.2, 'F');
  y += 7;

  // Tarjetas de resumen.
  const mostradas = areasDe(sel, areas);
  const base = sel === 'completo' || sel === 'consolidado' ? areas : mostradas;
  const totalMostrado = sel === 'completo' || sel === 'consolidado' ? total : mostradas.reduce((s, a) => s + a.total, 0);
  const pelu = base.find((a) => a.area === 'peluqueria');
  const tarjetas: Array<[string, string]> = [
    [sel === 'completo' || sel === 'consolidado' ? 'Total ventas del día' : 'Total del área', pesos(totalMostrado)],
    ['Ventas', String(base.reduce((s, a) => s + a.lineas, 0))],
    ...(pelu ? [['Perros atendidos', String(perrosAtendidos(pelu))] as [string, string]] : []),
    ...(sel === 'completo' || sel === 'consolidado' ? [['Áreas con ventas', String(areas.length)] as [string, string]] : []),
  ];
  const gap = 4;
  const anchoTarjeta = (util - gap * (tarjetas.length - 1)) / tarjetas.length;
  tarjetas.forEach(([etiqueta, valor], i) => {
    const tx = x + i * (anchoTarjeta + gap);
    const destacada = i === 0;
    doc.setFillColor(...(destacada ? ([236, 253, 245] as [number, number, number]) : ([248, 250, 252] as [number, number, number])));
    doc.setDrawColor(...(destacada ? ([167, 243, 208] as [number, number, number]) : ([226, 232, 240] as [number, number, number])));
    doc.roundedRect(tx, y, anchoTarjeta, 18, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gris);
    doc.text(etiqueta.toUpperCase(), tx + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(destacada ? 15 : 13); doc.setTextColor(...(destacada ? verde : tinta));
    doc.text(valor, tx + 4, y + 14);
  });
  y += 26;

  // Consolidado por área, con la franja del color de cada una.
  if (sel === 'completo' || sel === 'consolidado') {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...tinta);
    doc.text('Consolidado por área', x, y);
    autoTable(doc, {
      startY: y + 2.5, margin: { left: x, right: x },
      head: [['Área', 'Ventas', '% del día', 'Total']],
      body: areas.map((a) => [
        a.nombre + (a.area === 'peluqueria' ? ` · ${perrosAtendidos(a)} perros` : ''),
        String(a.lineas),
        total > 0 ? `${Math.round((a.total / total) * 100)} %` : '—',
        pesos(a.total),
      ]),
      foot: [['TOTAL VENTAS DEL DÍA', String(areas.reduce((s, a) => s + a.lineas, 0)), '100 %', pesos(total)]],
      theme: 'plain',
      headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      footStyles: { fillColor: [236, 253, 245], textColor: [6, 78, 59], fontStyle: 'bold' },
      bodyStyles: { textColor: tinta },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 10, cellPadding: { top: 2.6, bottom: 2.6, left: 4, right: 3 } },
      columnStyles: { 1: { cellWidth: 22 }, 2: { cellWidth: 26 }, 3: { cellWidth: 38 } },
      didParseCell: (data: any) => {
        if (data.column.index === 3) data.cell.styles.halign = 'right';
        if (data.column.index === 1 || data.column.index === 2) data.cell.styles.halign = 'center';
      },
      didDrawCell: (data: any) => {
        // Franja del color del área en la primera columna.
        if (data.section === 'body' && data.column.index === 0) {
          const a = areas[data.row.index];
          if (a) { doc.setFillColor(...rgb(a.color)); doc.rect(data.cell.x, data.cell.y + 1, 1.4, data.cell.height - 2, 'F'); }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Detalle de cada área.
  for (const a of mostradas) {
    if (y > altoHoja - 45) { doc.addPage(); y = 18; }
    doc.setFillColor(...suave(a.color));
    doc.roundedRect(x, y - 5, util, 8, 1.5, 1.5, 'F');
    doc.setFillColor(...rgb(a.color)); doc.rect(x, y - 5, 1.8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...tinta);
    doc.text(a.nombre, x + 5, y + 0.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text(a.area === 'peluqueria' ? `${perrosAtendidos(a)} perros atendidos · ${pesos(a.total)}` : `${a.lineas} ${a.lineas === 1 ? 'venta' : 'ventas'} · ${pesos(a.total)}`, ancho - x - 3, y + 0.6, { align: 'right' });
    autoTable(doc, {
      startY: y + 4.5, margin: { left: x, right: x },
      head: [['Cant.', a.area === 'peluqueria' ? 'Servicio y mascota' : 'Descripción', 'Valor']],
      body: filasDetalle(a).map((f) => [cantidad(f.cantidad), f.nombre, pesos(f.total)]),
      foot: [['', `Total ${a.nombre.toLowerCase()}`, pesos(a.total)]],
      theme: 'plain',
      headStyles: { textColor: gris, fontStyle: 'bold', fontSize: 8.5, lineWidth: { bottom: 0.3 }, lineColor: [203, 213, 225] },
      footStyles: { textColor: tinta, fontStyle: 'bold', lineWidth: { top: 0.3 }, lineColor: [203, 213, 225] },
      bodyStyles: { textColor: tinta },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 9.5, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 38 } },
      didParseCell: (data: any) => { if (data.column.index === 2) data.cell.styles.halign = 'right'; },
    });
    y = (doc as any).lastAutoTable.finalY + 11;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.line(x, altoHoja - 13, ancho - x, altoHoja - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text(`${d.negocio || ''}${d.negocio ? ' · ' : ''}Generado por CODEC POS el ${fecha(new Date().toISOString())}`, x, altoHoja - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - x, altoHoja - 8, { align: 'right' });
  }
  return doc.output('blob');
}

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** El mismo documento en HTML (vista previa en pantalla e impresión en hoja carta), con el diseño del PDF. */
export function htmlDocumento(sel: SeleccionCierre, areas: ResumenArea[], total: number, d: DatosRecibo): string {
  const general = sel === 'completo' || sel === 'consolidado';
  const mostradas = areasDe(sel, areas);
  const base = general ? areas : mostradas;
  const totalMostrado = general ? total : mostradas.reduce((s, a) => s + a.total, 0);
  const pelu = base.find((a) => a.area === 'peluqueria');
  const tarjetas: Array<[string, string]> = [
    [general ? 'Total ventas del día' : 'Total del área', pesos(totalMostrado)],
    ['Ventas', String(base.reduce((s, a) => s + a.lineas, 0))],
    ...(pelu ? [['Perros atendidos', String(perrosAtendidos(pelu))] as [string, string]] : []),
    ...(general ? [['Áreas con ventas', String(areas.length)] as [string, string]] : []),
  ];
  const consolidado = general
    ? `<h3 class="sec">Consolidado por área</h3>
      <table class="con"><thead><tr><th>Área</th><th class="c">Ventas</th><th class="c">% del día</th><th class="r">Total</th></tr></thead><tbody>${
        areas.map((a) => `<tr><td><span class="barra" style="background:${a.color}"></span>${esc(a.nombre)}${a.area === 'peluqueria' ? ` <span class="s">· ${perrosAtendidos(a)} perros</span>` : ''}</td><td class="c">${a.lineas}</td><td class="c">${total > 0 ? Math.round((a.total / total) * 100) : 0} %</td><td class="r">${pesos(a.total)}</td></tr>`).join('')
      }</tbody><tfoot><tr><td>TOTAL VENTAS DEL DÍA</td><td class="c">${areas.reduce((s, a) => s + a.lineas, 0)}</td><td class="c">100 %</td><td class="r">${pesos(total)}</td></tr></tfoot></table>`
    : '';
  const detalle = mostradas.map((a) => `
    <div class="area" style="background:${a.color}1f;border-left-color:${a.color}"><b>${esc(a.nombre)}</b><span class="s">${a.area === 'peluqueria' ? `${perrosAtendidos(a)} perros atendidos` : `${a.lineas} ${a.lineas === 1 ? 'venta' : 'ventas'}`} · ${pesos(a.total)}</span></div>
    <table class="det"><thead><tr><th>Cant.</th><th>${a.area === 'peluqueria' ? 'Servicio y mascota' : 'Descripción'}</th><th class="r">Valor</th></tr></thead><tbody>${
      filasDetalle(a).map((f) => `<tr><td>${cantidad(f.cantidad)}</td><td>${esc(f.nombre)}</td><td class="r">${pesos(f.total)}</td></tr>`).join('')
    }</tbody><tfoot><tr><td></td><td>Total ${esc(a.nombre.toLowerCase())}</td><td class="r">${pesos(a.total)}</td></tr></tfoot></table>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tituloDe(sel, areas))}</title><style>
    @page { size: letter; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font: 13px/1.45 Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; }
    .cab { display: flex; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 4px solid #059669; }
    .cab img { max-width: 130px; max-height: 84px; object-fit: contain; }
    h1 { font-size: 24px; margin: 0; } h2 { font-size: 16px; margin: 2px 0; color: #059669; font-weight: 700; }
    .meta { color: #64748b; font-size: 12px; }
    .tarjetas { display: flex; gap: 12px; margin: 18px 0 22px; }
    .tarjeta { flex: 1; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 10px; padding: 10px 14px; }
    .tarjeta:first-child { background: #ecfdf5; border-color: #a7f3d0; }
    .tarjeta small { display: block; font-size: 10px; letter-spacing: .04em; color: #64748b; text-transform: uppercase; }
    .tarjeta b { font-size: 20px; } .tarjeta:first-child b { color: #059669; }
    h3.sec { font-size: 14px; margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th { text-align: left; padding: 7px 10px; font-size: 11px; }
    table.con th { background: #059669; color: #fff; }
    table.det th { color: #64748b; border-bottom: 1px solid #cbd5e1; }
    td { padding: 7px 10px; } tbody tr:nth-child(even) td { background: #f8fafc; }
    table.con tfoot td { font-weight: 700; background: #ecfdf5; color: #064e3b; }
    table.det tfoot td { font-weight: 700; border-top: 1px solid #cbd5e1; }
    .barra { display: inline-block; width: 5px; height: 14px; border-radius: 2px; margin-right: 8px; vertical-align: -2px; }
    .area { display: flex; justify-content: space-between; align-items: center; border-left: 5px solid; border-radius: 6px; padding: 7px 12px; margin: 6px 0 4px; font-size: 14px; }
    .s { color: #64748b; font-weight: 400; font-size: 12px; }
    .r { text-align: right; white-space: nowrap; } .c { text-align: center; }
    .pie { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="cab">
      ${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ''}
      <div>
        <h1>${esc(d.negocio || 'Cierre de caja')}</h1>
        <h2>${esc(tituloDe(sel, areas))}</h2>
        <div class="meta">${d.desde ? `Desde ${fecha(d.desde)} · ` : ''}Hasta ${fecha(d.hasta || new Date().toISOString())}${d.cajero ? ` · Cajero: ${esc(d.cajero)}` : ''}</div>
      </div>
    </div>
    <div class="tarjetas">${tarjetas.map(([e, v]) => `<div class="tarjeta"><small>${esc(e)}</small><b>${esc(v)}</b></div>`).join('')}</div>
    ${consolidado}${detalle}
    <div class="pie"><span>${esc(d.negocio || '')}${d.negocio ? ' · ' : ''}Generado por CODEC POS</span><span>${fecha(new Date().toISOString())}</span></div>
  </body></html>`;
}
