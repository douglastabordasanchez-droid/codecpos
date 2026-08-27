// CODEC POS v2.0 - Servicio de Exportacion de Reportes
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ReporteGenerado } from './reportesService';
import { getPrinterForSectionOrUndefined } from '../lib/sectionPrinterConfig';
import { getConfiguredTicketWidthMm } from '../lib/printerConfig';

type RGB = [number, number, number];

const C = {
  header:  [30, 41, 59]    as RGB,  // slate-800
  section: [241, 245, 249] as RGB,  // slate-100
  profit:  [220, 252, 231] as RGB,  // green-100
  loss:    [254, 226, 226] as RGB,  // red-100
  border:  [148, 163, 184] as RGB,  // slate-400
  tblHead: [30, 41, 59]    as RGB,  // slate-800
  white:   [255, 255, 255] as RGB,
  dark:    [15, 23, 42]    as RGB,  // slate-900
  muted:   [100, 116, 139] as RGB,  // slate-500
  red:     [220, 38, 38]   as RGB,  // red-600
};

interface EmpresaConfig {
  nombre: string;
  nit?: string;
  digitoVerificacion?: string;
  telefono?: string;
  email?: string;
  ciudad?: string;
  direccion?: string;
  eslogan?: string;
  logoUrl?: string;
}

function cfgEmpresa(): EmpresaConfig {
  try {
    const raw = localStorage.getItem('codec_pos_config');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        return {
          nombre:             p.nombreComercial || p.razonSocial || p.nombre || 'CODEC POS',
          nit:                p.nit             || '',
          digitoVerificacion: p.digitoVerificacion || '',
          telefono:           p.telefono        || '',
          email:              p.email           || '',
          ciudad:             p.ciudad          || '',
          direccion:          p.direccion       || '',
          eslogan:            p.eslogan         || '',
          logoUrl:            p.logoUrl         || '',
        };
      }
    }
  } catch { /* ignore */ }
  for (const k of ['codecpos_empresa', 'codecpos_config', 'empresa_config', 'pos_empresa']) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && (p.nombre || p.name || p.nombreComercial)) {
          return {
            nombre:    p.nombreComercial || p.nombre || p.name || 'CODEC POS',
            nit:       p.nit    || p.rut  || '',
            telefono:  p.telefono || p.phone || '',
            email:     p.email   || '',
            ciudad:    p.ciudad  || p.city  || '',
            direccion: p.direccion || p.address || '',
            logoUrl:   p.logoUrl || '',
          };
        }
      }
    } catch { /* ignore */ }
  }
  return { nombre: 'CODEC POS v2.0' };
}

function fmtCOP(n: number): string {
  return `$${Number(n || 0).toLocaleString('es-CO')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers compartidos para los encabezados de PDF "hechos a mano" de
// GastosPage/ProveedoresPage/DevolucionesPage — antes cada uno reimplementaba
// por separado exactamente esta misma lectura de config + construcción del
// texto de NIT + renderizado seguro del logo (con su propio try/catch). Se
// extrae solo la LÓGICA repetida, no el diseño visual de cada encabezado
// (colores/posiciones siguen definidos en cada archivo, sin cambios) — así
// se elimina la duplicación real sin alterar cómo se ve ningún PDF existente.
// (Deliberadamente separado de `cfgEmpresa()`/`fmtCOP()` de arriba, que son
// específicos del exportador de Reportes y usan un texto de respaldo
// distinto — 'CODEC POS' en vez de 'MI NEGOCIO' — no había forma de
// reutilizarlos sin cambiar el texto que ya se ve en esos tres PDFs.)
export function leerConfigEmpresaPDF(): { config: any; empresa: string; nit: string } {
  const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
  const empresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';
  const nit = config.nit ? `NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}` : '';
  return { config, empresa, nit };
}

export function dibujarLogoPDF(doc: jsPDF, logoUrl: string | undefined | null, x: number, y: number, w: number, h: number): void {
  if (!logoUrl) return;
  try {
    const ext = logoUrl.includes('png') ? 'PNG' : 'JPEG';
    doc.addImage(logoUrl, ext, x, y, w, h);
  } catch { /* logo no disponible, se omite igual que antes */ }
}

function labelMedioEgreso(metodo: string): string {
  const key = String(metodo || '').toLowerCase();
  if (key === 'efectivo') return 'Efectivo';
  if (key === 'tarjeta_banco' || key === 'tarjeta' || key === 'banco' || key === 'cheque') return 'Tarjeta o Banco';
  if (key === 'transferencia' || key === 'nequi' || key === 'daviplata' || key === 'bancolombia' || key === 'bre_b') return 'Transferencia';
  return metodo || 'N/A';
}

class ExportadorReportes {

  // ─────────── PDF ───────────

  exportarPDF(reporte: ReporteGenerado): void {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    let y = this.pdfHeader(doc, reporte, W);

    switch (reporte.tipo) {
      case 'ventas':     y = this.pdfVentas(doc, reporte, y, W);     break;
      case 'inventario': y = this.pdfInventario(doc, reporte, y, W); break;
      case 'gastos':     y = this.pdfGastos(doc, reporte, y, W);     break;
      case 'cierres':    y = this.pdfCierres(doc, reporte, y, W);    break;
      case 'financiero': y = this.pdfFinanciero(doc, reporte, y, W); break;
      case 'cajero':     y = this.pdfCajero(doc, reporte, y, W);     break;
      case 'taller':     y = this.pdfTaller(doc, reporte, y, W);     break;
    }

    void y;
    this.pdfFooterAll(doc, W);
    const fn = `${reporte.tipo}_${reporte.periodo.inicio}_${reporte.periodo.fin}.pdf`;
    doc.save(fn);
  }

  private pdfHeader(doc: jsPDF, reporte: ReporteGenerado, W: number): number {
    const empresa = cfgEmpresa();
    const H = 30;

    doc.setFillColor(...C.header);
    doc.rect(0, 0, W, H, 'F');

    // Logo (esquina derecha del header si existe)
    let logoRendered = false;
    if (empresa.logoUrl) {
      try {
        const ext = empresa.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(empresa.logoUrl, ext, W - 36, 3, 26, 24);
        logoRendered = true;
      } catch { /* logo no disponible */ }
    }

    const textRightBound = logoRendered ? W - 40 : W - 10;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text(empresa.nombre.toUpperCase(), 10, 11);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(reporte.nombre, 10, 18);

    if (empresa.nit) {
      const nitStr = `NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`;
      doc.setFontSize(8);
      doc.text(nitStr, 10, 25);
    }

    const fechaStr   = new Date(reporte.fechaGeneracion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const periodoStr = `Periodo: ${reporte.periodo.inicio} / ${reporte.periodo.fin}`;
    const autorStr   = `Por: ${reporte.metadata.generadoPor || 'Sistema POS'}`;

    doc.setFontSize(8);
    doc.text(fechaStr,   textRightBound, 10, { align: 'right' });
    doc.text(periodoStr, textRightBound, 16, { align: 'right' });
    doc.text(autorStr,   textRightBound, 22, { align: 'right' });

    doc.setTextColor(...C.dark);
    return H + 8;
  }

  private pdfFooterAll(doc: jsPDF, W: number): void {
    const empresa = cfgEmpresa();
    const total = (doc as any).internal.getNumberOfPages();
    const contactParts: string[] = [];
    if (empresa.nit) contactParts.push(`NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`);
    if (empresa.telefono) contactParts.push(`Tel: ${empresa.telefono}`);
    if (empresa.email) contactParts.push(empresa.email);
    if (empresa.ciudad) contactParts.push(empresa.ciudad);
    const contactStr = contactParts.join(' | ');
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      const footerY = contactStr ? H - 17 : H - 14;
      doc.line(10, footerY, W - 10, footerY);
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.text(`Página ${i} de ${total}`, 10, footerY + 4);
      doc.setFont('helvetica', 'bold');
      doc.text(empresa.nombre, W / 2, footerY + 4, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(new Date().getFullYear().toString(), W - 10, footerY + 4, { align: 'right' });
      if (contactStr) {
        doc.setFontSize(6);
        doc.text(contactStr, W / 2, footerY + 9, { align: 'center' });
      }
    }
    doc.setTextColor(...C.dark);
  }

  private seccion(doc: jsPDF, titulo: string, y: number, W: number): number {
    doc.setFillColor(...C.section);
    doc.rect(10, y, W - 20, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.header);
    doc.text(titulo.toUpperCase(), 14, y + 5);
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    return y + 11;
  }

  private fila(doc: jsPDF, label: string, valor: string, y: number, W: number, bold = false): number {
    doc.setFontSize(9);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 14, y);
    doc.text(valor, W - 14, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    return y + 5.5;
  }

  private bloqueResaltado(
    doc: jsPDF,
    items: Array<{ label: string; valor: string; bold?: boolean }>,
    y: number, W: number,
    fillRGB: RGB, borderRGB: RGB, textRGB: RGB
  ): number {
    const rowH = 6;
    const totalH = items.length * rowH + 8;
    doc.setFillColor(...fillRGB);
    doc.setDrawColor(...borderRGB);
    doc.setLineWidth(0.5);
    doc.roundedRect(10, y, W - 20, totalH, 2, 2, 'FD');
    let cy = y + 7;
    items.forEach(({ label, valor, bold }) => {
      doc.setFontSize(9);
      doc.setTextColor(...textRGB);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(label, 16, cy);
      doc.text(valor, W - 16, cy, { align: 'right' });
      cy += rowH;
    });
    doc.setTextColor(...C.dark);
    doc.setFont('helvetica', 'normal');
    return y + totalH + 6;
  }

  private tablaOpts(extras: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      theme: 'grid',
      headStyles: { fillColor: C.tblHead, textColor: C.white, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { overflow: 'linebreak' },
      margin: { left: 10, right: 10 },
      ...extras,
    };
  }

  private pdfEgresosDetalle(doc: jsPDF, y: number, W: number, egresos: any[], titulo = 'Detalle de Egresos'): number {
    if (!Array.isArray(egresos) || egresos.length === 0) return y;

    const ordenados = [...egresos].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    y = this.seccion(doc, titulo, y, W);
    autoTable(doc, {
      startY: y,
      head: [['Hora', 'Concepto', 'Descripcion', 'Medio de Pago', 'Monto', 'Cajero']],
      body: ordenados.slice(0, 150).map((g: any) => {
        const d = new Date(g.fecha);
        return [
          d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          (g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto').toString().substring(0, 24),
          (g.descripcion || '').toString().substring(0, 34),
          labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || ''),
          fmtCOP(Number(g.monto) || 0),
          g.registradoPor || g.autorizadoPor || g.cajero || 'N/A',
        ];
      }),
      ...this.tablaOpts({
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 24 },
          3: { cellWidth: 26 },
          4: { cellWidth: 20 },
          5: { cellWidth: 24 },
        },
      }),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (egresos.length > 150) {
      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      doc.text(`* Se muestran 150 de ${egresos.length} egresos. Ver Excel para el listado completo.`, 14, y);
      y += 8;
      doc.setTextColor(...C.dark);
    }

    return y;
  }

  // ── PDF por tipo ──

  private pdfVentas(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { resumen, ventas, egresosDetalle } = reporte.datos;
    const totalNeto = resumen.totalVentasNetas ?? resumen.totalVentas ?? 0;

    // ── Bloque resumen ──
    const resItems: Array<{ label: string; valor: string; bold?: boolean }> = [
      { label: 'Total Ventas Brutas',   valor: fmtCOP(resumen.totalVentas || 0) },
    ];
    if (typeof resumen.totalDevoluciones === 'number' && resumen.totalDevoluciones > 0)
      resItems.push({ label: '(-) Devoluciones',      valor: `-${fmtCOP(resumen.totalDevoluciones)}` });
    if (typeof resumen.totalVentasNetas === 'number')
      resItems.push({ label: 'Ventas Netas',           valor: fmtCOP(totalNeto),  bold: true });
    resItems.push(
      { label: 'Transacciones',         valor: String(resumen.cantidadTransacciones || 0) },
      { label: 'Ticket Promedio',        valor: fmtCOP(Math.round(resumen.ticketPromedio || 0)) },
    );
    if ((resumen.devoluciones?.length || 0) > 0)
      resItems.push({ label: 'Cantidad Devoluciones', valor: String(resumen.devoluciones?.length) });

    y = this.bloqueResaltado(doc, resItems, y, W,
      [239, 246, 255] as RGB, [147, 197, 253] as RGB, [30, 64, 175] as RGB);

    // ── Métodos de pago ──
    const metodos = Object.entries(resumen.ventasPorMetodo || {}).filter(([, v]) => Number(v) > 0);
    if (metodos.length > 0) {
      y = this.seccion(doc, '1. Ventas por Metodo de Pago', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Metodo de Pago', 'Total', '% Participacion']],
        body: metodos.map(([m, t]) => [
          m.charAt(0).toUpperCase() + m.slice(1),
          fmtCOP(t as number),
          totalNeto > 0 ? `${(((t as number) / totalNeto) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 32 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Ventas por categoría ──
    const categorias: any[] = resumen.ventasPorCategoria || [];
    if (categorias.length > 0) {
      y = this.seccion(doc, '2. Ventas por Categoria', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Categoria', 'Total', '% Participacion']],
        body: categorias.map((cat: any) => [
          cat.categoria || 'Sin categoria',
          fmtCOP(cat.total),
          totalNeto > 0 ? `${((cat.total / totalNeto) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 32 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Top 10 productos ──
    if (resumen.topProductos && resumen.topProductos.length > 0) {
      y = this.seccion(doc, '3. Top 10 Productos Mas Vendidos', y, W);
      autoTable(doc, {
        startY: y,
        head: [['#', 'Producto', 'Cantidad', 'Total', '%']],
        body: resumen.topProductos.slice(0, 10).map((p: any, i: number) => [
          i + 1,
          p.nombre,
          p.cantidad,
          fmtCOP(p.total),
          totalNeto > 0 ? `${((p.total / totalNeto) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 18 }, 3: { cellWidth: 28 }, 4: { cellWidth: 14 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Detalle transacciones ──
    if (Array.isArray(ventas) && ventas.length > 0) {
      y = this.seccion(doc, `4. Detalle de Transacciones (${ventas.length})`, y, W);
      const rows = ventas.slice(0, 200).map((v: any) => {
        const d = new Date(v.fecha);
        return [
          d.toLocaleDateString('es-CO'),
          d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
          v.cajero || 'N/A',
          v.metodoPago || '',
          fmtCOP(v.total),
          String((v.items || []).length) + ' ítems',
        ];
      });
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Hora', 'Cajero', 'Metodo', 'Total', 'Items']],
        body: rows,
        ...this.tablaOpts({
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16 }, 4: { cellWidth: 26 }, 5: { cellWidth: 16 } },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      if (ventas.length > 200) {
        doc.setFontSize(8);
        doc.setTextColor(...C.muted);
        doc.text(`* Se muestran 200 de ${ventas.length} transacciones. Ver Excel para el listado completo.`, 14, y);
        y += 8;
        doc.setTextColor(...C.dark);
      }
    }

    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || [], '5. Egresos del Periodo');

    return y;
  }

  private pdfInventario(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { resumen, productos, ingredientes, egresosDetalle } = reporte.datos;
    const margen = resumen.valorInventario > 0
      ? ((resumen.utilidadPotencial / resumen.valorInventario) * 100).toFixed(1)
      : '0';

    // ── Bloque resumen ──
    y = this.bloqueResaltado(doc, [
      { label: 'Total Productos',       valor: String(resumen.totalProductos || 0) },
      { label: 'Valor Inventario (PVP)',valor: fmtCOP(resumen.valorInventario || 0), bold: true },
      { label: 'Valor de Costo',        valor: fmtCOP(resumen.valorCosto || 0) },
      { label: 'Utilidad Potencial',    valor: fmtCOP(resumen.utilidadPotencial || 0), bold: true },
      { label: 'Margen Bruto',          valor: `${margen}%` },
      { label: 'Productos Stock Bajo',  valor: String(resumen.productosBajoStock || 0) },
    ], y, W,
      [239, 246, 255] as RGB, [147, 197, 253] as RGB, [30, 64, 175] as RGB);

    // ── Alertas de stock bajo ──
    if (resumen.alertas?.stockBajo?.length > 0) {
      y = this.seccion(doc, `1. ALERTA: Productos con Stock Bajo (${resumen.alertas.stockBajo.length})`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Producto', 'Categoria', 'Stock Actual', 'Stock Minimo', 'Déficit']],
        body: resumen.alertas.stockBajo.slice(0, 30).map((p: any) => [
          p.nombre,
          p.categoria || '—',
          p.stock,
          p.minStock,
          Math.max(0, (p.minStock || 0) - (p.stock || 0)),
        ]),
        ...this.tablaOpts({
          headStyles: { fillColor: C.red, textColor: C.white, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
          columnStyles: { 2: { cellWidth: 22 }, 3: { cellWidth: 22 }, 4: { cellWidth: 18 } },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Próximos a vencer ──
    if (resumen.alertas?.porVencer?.length > 0) {
      y = this.seccion(doc, `2. Proximos a Vencer (${resumen.alertas.porVencer.length} productos)`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Producto', 'Categoria', 'Vence', 'Stock']],
        body: resumen.alertas.porVencer.slice(0, 20).map((p: any) => [
          p.nombre,
          p.categoria || '—',
          p.fechaVencimiento || '—',
          p.stock,
        ]),
        ...this.tablaOpts({
          headStyles: { fillColor: [217, 119, 6] as RGB, textColor: C.white, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
          columnStyles: { 2: { cellWidth: 28 }, 3: { cellWidth: 16 } },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Productos por categoría ──
    const catEntries = Object.entries(resumen.productosPorCategoria || {}).sort(([, a], [, b]) => Number(b) - Number(a));
    if (catEntries.length > 0) {
      y = this.seccion(doc, '3. Distribucion por Categoria', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Categoria', 'Productos', '% del Total']],
        body: catEntries.map(([cat, count]) => [
          cat,
          count,
          resumen.totalProductos > 0 ? `${(((count as number) / resumen.totalProductos) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 20 }, 2: { cellWidth: 28 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Mermas ──
    if (resumen.merma?.totalRegistros > 0) {
      y = this.bloqueResaltado(doc, [
        { label: 'Mermas Registradas', valor: String(resumen.merma.totalRegistros) },
        { label: 'Costo Estimado',     valor: fmtCOP(resumen.merma.costoEstimado || 0), bold: true },
      ], y, W,
        [254, 242, 242] as RGB, [252, 165, 165] as RGB, [185, 28, 28] as RGB);
    }

    // ── Catálogo completo ──
    if (Array.isArray(productos) && productos.length > 0) {
      y = this.seccion(doc, `4. Catalogo Completo (${productos.length} productos)`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Codigo', 'Nombre', 'Categoria', 'Stock', 'PVP', 'Costo', 'Valor Total']],
        body: productos.slice(0, 150).map((p: any) => [
          p.codigo || '—',
          p.nombre,
          p.categoria || '—',
          p.stock,
          fmtCOP(p.precio || 0),
          fmtCOP(p.costo || 0),
          fmtCOP((p.stock || 0) * (p.precio || 0)),
        ]),
        ...this.tablaOpts({
          columnStyles: {
            0: { cellWidth: 18 },
            3: { cellWidth: 12 },
            4: { cellWidth: 22 },
            5: { cellWidth: 22 },
            6: { cellWidth: 24 },
          },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Ingredientes si hay ──
    if (Array.isArray(ingredientes) && ingredientes.length > 0) {
      y = this.seccion(doc, `5. Ingredientes / Insumos (${ingredientes.length})`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Nombre', 'Unidad', 'Stock Actual', 'Stock Minimo', 'Estado']],
        body: ingredientes.map((ing: any) => [
          ing.nombre,
          ing.unidad || '—',
          ing.stockActual,
          ing.stockMinimo || 0,
          (ing.stockActual || 0) < (ing.stockMinimo || 0) ? 'CRITICO' : 'OK',
        ]),
        ...this.tablaOpts({
          columnStyles: { 4: { cellWidth: 18 } },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 4 && data.cell.raw === 'CRITICO') {
              data.cell.styles.textColor = C.red;
              data.cell.styles.fontStyle = 'bold';
            }
          },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || [], '6. Egresos Vinculados al Periodo');

    return y;
  }

  private pdfGastos(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { resumen, gastos, egresosDetalle } = reporte.datos;
    const total = resumen.totalGastos || 0;

    // ── Bloque resumen ──
    y = this.bloqueResaltado(doc, [
      { label: 'Total Gastos',       valor: fmtCOP(total), bold: true },
      { label: 'Cantidad de Gastos', valor: String(resumen.cantidadGastos || 0) },
      { label: 'Promedio por Gasto', valor: fmtCOP(Math.round(resumen.promedioGasto || 0)) },
      { label: 'Mayor Categoria',    valor: resumen.categoriaConMayorGasto || '—' },
    ], y, W,
      [254, 242, 242] as RGB, [252, 165, 165] as RGB, [185, 28, 28] as RGB);

    // ── Por categoría con % ──
    const porCat = Object.entries(resumen.gastosPorCategoria || {})
      .filter(([, v]) => Number(v) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a));

    if (porCat.length > 0) {
      y = this.seccion(doc, '1. Desglose por Categoria', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Categoria', 'Total', '% del Total', 'Rank']],
        body: porCat.map(([cat, val], i) => [
          cat,
          fmtCOP(val as number),
          total > 0 ? `${(((val as number) / total) * 100).toFixed(1)}%` : '0%',
          `#${i + 1}`,
        ]),
        ...this.tablaOpts({
          columnStyles: { 1: { cellWidth: 30 }, 2: { cellWidth: 26 }, 3: { cellWidth: 14 } },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Evolución diaria ──
    const porDia = Object.entries(resumen.gastosPorDia || {})
      .sort(([a], [b]) => a.localeCompare(b));

    if (porDia.length > 0) {
      y = this.seccion(doc, '2. Evolucion Diaria de Gastos', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Total del Dia', '% del Total']],
        body: porDia.map(([dia, val]) => [
          dia,
          fmtCOP(val as number),
          total > 0 ? `${(((val as number) / total) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 34 }, 2: { cellWidth: 26 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || gastos || [], '3. Egresos Cronologicos');

    return y;
  }

  private pdfCierres(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { resumen, egresosDetalle } = reporte.datos;

    y = this.seccion(doc, 'Resumen de Cierres', y, W);
    y = this.fila(doc, 'Total Cierres', String(resumen.totalCierres || 0), y, W);
    y = this.fila(doc, 'Total Recaudado', fmtCOP(resumen.totalRecaudado), y, W, true);
    y = this.fila(doc, 'Diferencias Acumuladas', fmtCOP(resumen.totalDiferencias), y, W);
    y = this.fila(doc, 'Cierres con Faltante', String(resumen.cierresConFaltante || 0), y, W);
    y = this.fila(doc, 'Cierres con Sobrante', String(resumen.cierresConSobrante || 0), y, W);
    y = this.fila(doc, 'Promedio Recaudacion', fmtCOP(Math.round(resumen.promedioRecaudacion || 0)), y, W);
    y = this.fila(doc, 'Metodo Mas Usado', resumen.metodoPagoMasUsado || '-', y, W);

    y += 4;
    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || [], 'Egresos del Periodo Analizado');
    return y;
  }

  private pdfCajero(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { cajero, resumen, ventas, cierres, egresosDetalle } = reporte.datos;
    const totalVentas = resumen.totalVentas || 0;
    const confiabilidad = resumen.totalCierres > 0
      ? Math.round(((resumen.totalCierres - (resumen.cierresConFaltante || 0)) / resumen.totalCierres) * 100)
      : null;

    // ── Info cajero ──
    doc.setFillColor(...C.section);
    doc.rect(10, y, W - 20, 16, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.header);
    doc.text(`Cajero: ${cajero?.nombre || 'Todos los Cajeros'}`, 14, y + 7);
    if (cajero?.id) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`ID: ${cajero.id}`, 14, y + 12);
    }
    if (confiabilidad !== null) {
      const color: RGB = confiabilidad >= 80 ? [21, 128, 61] : confiabilidad >= 60 ? [180, 83, 9] : [185, 28, 28];
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...color);
      doc.text(`Indice de Confiabilidad: ${confiabilidad}%`, W - 14, y + 10, { align: 'right' });
    }
    doc.setTextColor(...C.dark);
    y += 22;

    // ── Bloque KPIs ──
    y = this.bloqueResaltado(doc, [
      { label: 'Total Ventas',           valor: fmtCOP(totalVentas), bold: true },
      { label: 'Transacciones',          valor: String(resumen.cantidadTransacciones || 0) },
      { label: 'Ticket Promedio',        valor: fmtCOP(Math.round(resumen.ticketPromedio || 0)) },
      { label: 'Cierres Realizados',     valor: String(resumen.totalCierres || 0) },
      { label: 'Cierres con Faltante',   valor: String(resumen.cierresConFaltante || 0) },
      { label: 'Cierres con Sobrante',   valor: String(resumen.cierresConSobrante || 0) },
      { label: 'Diferencias Acumuladas', valor: fmtCOP(Math.abs(resumen.diferenciasAcumuladas || 0)) },
      { label: 'Total Gastos',           valor: fmtCOP(resumen.totalGastos || 0) },
      { label: 'Neto de Caja',           valor: fmtCOP(resumen.netoCaja ?? totalVentas), bold: true },
    ], y, W,
      [239, 246, 255] as RGB, [147, 197, 253] as RGB, [30, 64, 175] as RGB);

    // ── Métodos de pago ──
    const metodos = Object.entries(resumen.ventasPorMetodo || {}).filter(([, v]) => Number(v) > 0);
    if (metodos.length > 0) {
      y = this.seccion(doc, '1. Ventas por Metodo de Pago', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Metodo', 'Total', '% Participacion']],
        body: metodos.map(([m, t]) => [
          m.charAt(0).toUpperCase() + m.slice(1),
          fmtCOP(t as number),
          totalVentas > 0 ? `${(((t as number) / totalVentas) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 32 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Top productos ──
    if (resumen.topProductos && resumen.topProductos.length > 0) {
      y = this.seccion(doc, '2. Top 10 Productos Mas Vendidos', y, W);
      autoTable(doc, {
        startY: y,
        head: [['#', 'Producto', 'Cantidad', 'Total', '%']],
        body: resumen.topProductos.slice(0, 10).map((p: any, i: number) => [
          i + 1,
          p.nombre,
          p.cantidad,
          fmtCOP(p.total),
          totalVentas > 0 ? `${((p.total / totalVentas) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 18 }, 3: { cellWidth: 28 }, 4: { cellWidth: 14 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Historial de cierres ──
    if (Array.isArray(cierres) && cierres.length > 0) {
      y = this.seccion(doc, `3. Historial de Cierres (${cierres.length})`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Turno', 'Total Ventas', 'Diferencia', 'Estado']],
        body: cierres.map((c: any) => {
          const d = new Date(c.fecha);
          const dif = c.diferencia;
          const estado = dif === 0 ? 'Cuadrado' : dif < 0 ? 'Faltante' : 'Sobrante';
          return [
            d.toLocaleDateString('es-CO'),
            c.turno || '—',
            fmtCOP(c.totalVentas || 0),
            `${dif >= 0 ? '+' : ''}${fmtCOP(dif)}`,
            estado,
          ];
        }),
        ...this.tablaOpts({
          columnStyles: { 2: { cellWidth: 28 }, 3: { cellWidth: 24 }, 4: { cellWidth: 20 } },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 4) {
              if (data.cell.raw === 'Faltante')  { data.cell.styles.textColor = C.red; data.cell.styles.fontStyle = 'bold'; }
              if (data.cell.raw === 'Sobrante')  { data.cell.styles.textColor = [180, 83, 9] as RGB; }
              if (data.cell.raw === 'Cuadrado')  { data.cell.styles.textColor = [21, 128, 61] as RGB; }
            }
          },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── Detalle transacciones ──
    if (Array.isArray(ventas) && ventas.length > 0) {
      y = this.seccion(doc, `4. Detalle de Transacciones (${ventas.length})`, y, W);
      const rows = ventas.slice(0, 150).map((v: any) => {
        const d = new Date(v.fecha);
        return [
          d.toLocaleDateString('es-CO'),
          d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
          v.metodoPago || '—',
          fmtCOP(v.total),
          String((v.items || []).length) + ' íts',
        ];
      });
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Hora', 'Metodo', 'Total', 'Items']],
        body: rows,
        ...this.tablaOpts({ columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16 }, 3: { cellWidth: 26 }, 4: { cellWidth: 14 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      if (ventas.length > 150) {
        doc.setFontSize(8);
        doc.setTextColor(...C.muted);
        doc.text(`* Se muestran 150 de ${ventas.length} transacciones. Ver Excel para el listado completo.`, 14, y);
        y += 8;
        doc.setTextColor(...C.dark);
      }
    }

    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || [], '5. Gastos del Periodo');
    return y;
  }

  private pdfFinanciero(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { ingresos, gastos, resumen, egresosDetalle } = reporte.datos;
    const esBeneficio = (resumen.utilidadNeta || 0) >= 0;

    // ── 1. Estado de Resultados (P&L) ──
    y = this.seccion(doc, '1. Estado de Resultados del Periodo', y, W);

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Importe']],
      body: [
        ['INGRESOS', ''],
        ['  Ventas Brutas',               fmtCOP(ingresos.totalBruto || ingresos.total || 0)],
        ['  (-) Devoluciones',            `-${fmtCOP(ingresos.totalDevoluciones || 0)}`],
        ['  INGRESOS NETOS',              fmtCOP(ingresos.total || 0)],
        ['', ''],
        ['EGRESOS', ''],
        ['  Total Gastos / Egresos',      `-${fmtCOP(gastos.total || 0)}`],
        ['', ''],
        [esBeneficio ? 'UTILIDAD NETA' : 'PERDIDA NETA', fmtCOP(resumen.utilidadNeta || 0)],
        ['Margen de Utilidad',            `${(resumen.margenUtilidad || 0).toFixed(2)}%`],
      ],
      ...this.tablaOpts({
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 60, halign: 'right' } },
        didParseCell: (data: any) => {
          if (data.section === 'body') {
            const v = data.cell.raw as string;
            if (v === 'INGRESOS' || v === 'EGRESOS') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = C.section;
            }
            if (v === '  INGRESOS NETOS') {
              data.cell.styles.fontStyle = 'bold';
            }
            if (v === 'UTILIDAD NETA' || v === 'PERDIDA NETA') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 10;
              data.cell.styles.fillColor = esBeneficio ? C.profit : C.loss;
              data.cell.styles.textColor = esBeneficio ? [21, 128, 61] as RGB : [185, 28, 28] as RGB;
            }
            if (data.column.index === 1) {
              const raw = String(v || '').trim();
              if (raw.startsWith('-') && raw !== '') {
                data.cell.styles.textColor = C.red;
              }
            }
          }
        },
      }),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── 2. Ingresos por Método de Pago ──
    const metodos = Object.entries(ingresos.porMetodo || {}).filter(([, v]) => Number(v) > 0);
    if (metodos.length > 0) {
      y = this.seccion(doc, '2. Ingresos por Metodo de Pago', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Metodo', 'Total', '% Participacion']],
        body: metodos.map(([m, v]) => [
          m.charAt(0).toUpperCase() + m.slice(1),
          fmtCOP(v as number),
          (ingresos.total || 0) > 0 ? `${(((v as number) / ingresos.total) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 34 }, 2: { cellWidth: 32 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── 3. Gastos por Categoría ──
    const porCat = Object.entries(gastos.porCategoria || {})
      .filter(([, v]) => Number(v) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a));

    if (porCat.length > 0) {
      y = this.seccion(doc, '3. Egresos por Categoria', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Categoria', 'Total', '% de Gastos']],
        body: porCat.map(([cat, val]) => [
          cat,
          fmtCOP(val as number),
          (gastos.total || 0) > 0 ? `${(((val as number) / gastos.total) * 100).toFixed(1)}%` : '0%',
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 34 }, 2: { cellWidth: 28 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── 4. Indicadores ──
    y = this.seccion(doc, '4. Indicadores Financieros Clave', y, W);
    y = this.bloqueResaltado(doc, [
      { label: 'Ingreso Diario Promedio', valor: fmtCOP(Math.round(resumen.ingresoPromedioDiario || 0)) },
      { label: 'Gasto Diario Promedio',   valor: fmtCOP(Math.round(resumen.gastoPromedioDiario || 0)) },
      { label: 'Punto de Equilibrio Est.',valor: fmtCOP(resumen.puntoEquilibrio || gastos.total || 0) },
      { label: 'Transacciones Ingresos',  valor: String(ingresos.transacciones || 0) },
      { label: 'Transacciones Gastos',    valor: String(gastos.transacciones || 0) },
    ], y, W,
      esBeneficio ? C.profit              : C.loss,
      esBeneficio ? [134, 239, 172] as RGB : [252, 165, 165] as RGB,
      esBeneficio ? [21, 128, 61]   as RGB : [185, 28, 28]   as RGB
    );

    y = this.pdfEgresosDetalle(doc, y, W, egresosDetalle || gastos?.detalle || [], '5. Egresos Detallados');
    return y;
  }

  private pdfTaller(doc: jsPDF, reporte: ReporteGenerado, y: number, W: number): number {
    const { resumen } = reporte.datos;

    // KPIs principales
    y = this.seccion(doc, 'Resumen Operativo', y, W);
    y = this.fila(doc, 'Total Ordenes', String(resumen.totalOrdenes || 0), y, W);
    y = this.fila(doc, 'Ordenes Activas', String(resumen.ordenesActivas || 0), y, W);
    y = this.fila(doc, 'Ordenes Entregadas', String(resumen.ordenesEntregadas || 0), y, W);
    y = this.fila(doc, 'Ordenes Canceladas', String(resumen.ordenesCanceladas || 0), y, W);
    if (resumen.ordenesAtrasadas > 0)
      y = this.fila(doc, 'Ordenes Atrasadas', String(resumen.ordenesAtrasadas), y, W);
    y += 4;

    // Bloques financieros
    y = this.bloqueResaltado(doc, [
      { label: 'Ingresos Totales',    valor: fmtCOP(resumen.ingresosTotales), bold: true },
      { label: 'Costo Repuestos',     valor: fmtCOP(resumen.costoTotalInsumos) },
    ], y, W,
      [239, 246, 255] as RGB, [147, 197, 253] as RGB, [30, 64, 175] as RGB
    );

    const esBeneficio = (resumen.utilidadNeta || 0) >= 0;
    y = this.bloqueResaltado(doc, [
      { label: 'Utilidad Neta',       valor: fmtCOP(resumen.utilidadNeta), bold: true },
      { label: 'Margen de Utilidad',  valor: `${(resumen.margenUtilidad || 0).toFixed(1)}%`, bold: true },
    ], y, W,
      esBeneficio ? C.profit              : C.loss,
      esBeneficio ? [134, 239, 172] as RGB : [252, 165, 165] as RGB,
      esBeneficio ? [21, 128, 61]   as RGB : [185, 28, 28]   as RGB
    );

    // Por tecnico
    if (resumen.porTecnico && Object.keys(resumen.porTecnico).length > 0) {
      y = this.seccion(doc, 'Rendimiento por Tecnico', y, W);
      autoTable(doc, {
        startY: y,
        head: [['Tecnico', 'Ordenes', 'Ingresos']],
        body: Object.entries(resumen.porTecnico).map(([tec, d]: [string, any]) => [
          tec, d.ordenes, fmtCOP(d.ingresos)
        ]),
        ...this.tablaOpts({ columnStyles: { 1: { cellWidth: 20 }, 2: { cellWidth: 32 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Saldos pendientes
    if (resumen.saldosPendientes?.length > 0) {
      y = this.seccion(doc, `Saldos Pendientes (${resumen.cantidadConSaldo})`, y, W);
      autoTable(doc, {
        startY: y,
        head: [['Orden', 'Cliente', 'Dispositivo', 'Saldo']],
        body: resumen.saldosPendientes.slice(0, 20).map((s: any) => [
          s.numeroOrden, s.cliente, s.dispositivo.substring(0, 22), fmtCOP(s.saldo)
        ]),
        ...this.tablaOpts({
          headStyles: { fillColor: C.red, textColor: C.white, fontSize: 8, fontStyle: 'bold', cellPadding: 3 },
          columnStyles: { 0: { cellWidth: 20 }, 3: { cellWidth: 28 } },
        }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      y = this.fila(doc, 'TOTAL SALDO PENDIENTE', fmtCOP(resumen.totalPendiente), y, W, true);
      y += 4;
    }

    // Top repuestos
    if (resumen.topRepuestos?.length > 0) {
      y = this.seccion(doc, 'Top Repuestos Usados', y, W);
      autoTable(doc, {
        startY: y,
        head: [['#', 'Repuesto', 'Cantidad', 'Costo Total']],
        body: resumen.topRepuestos.map((r: any, i: number) => [
          i + 1, r.nombre, r.cantidad, fmtCOP(r.costo)
        ]),
        ...this.tablaOpts({ columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 20 }, 3: { cellWidth: 28 } } }),
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    return y;
  }

  // ─────────── EXCEL ───────────

  exportarExcel(reporte: ReporteGenerado): void {
    const wb = XLSX.utils.book_new();

    const wsResumen = XLSX.utils.aoa_to_sheet([
      ['CODEC POS v2.0 — Reporte Exportado'],
      [''],
      ['Tipo',         reporte.tipo.toUpperCase()],
      ['Nombre',       reporte.nombre],
      ['Periodo',      `${reporte.periodo.inicio} a ${reporte.periodo.fin}`],
      ['Generado',     new Date(reporte.fechaGeneracion).toLocaleString('es-CO')],
      ['Generado por', reporte.metadata.generadoPor || 'Sistema POS'],
      ['Registros',    reporte.metadata.totalRegistros],
    ]);
    this.xlsxCols(wsResumen, [30, 40]);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    switch (reporte.tipo) {
      case 'ventas':     this.xlsxVentas(wb, reporte);     break;
      case 'inventario': this.xlsxInventario(wb, reporte); break;
      case 'gastos':     this.xlsxGastos(wb, reporte);     break;
      case 'cierres':    this.xlsxCierres(wb, reporte);    break;
      case 'financiero': this.xlsxFinanciero(wb, reporte); break;
      case 'cajero':     this.xlsxCajero(wb, reporte);     break;
      case 'taller':     this.xlsxTaller(wb, reporte);     break;
    }

    const fn = `${reporte.tipo}_${reporte.periodo.inicio}_${reporte.periodo.fin}.xlsx`;
    XLSX.writeFile(wb, fn);
  }

  private xlsxCols(ws: XLSX.WorkSheet, anchos: number[]): void {
    ws['!cols'] = anchos.map(w => ({ wch: w }));
  }

  private xlsxHoja(
    wb: XLSX.WorkBook,
    nombre: string,
    headers: string[],
    rows: any[][],
    anchos?: number[]
  ): void {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    if (anchos) this.xlsxCols(ws, anchos);
    ws['!autofilter'] = { ref: `A1:${String.fromCharCode(64 + headers.length)}1` };
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }

  private xlsxVentas(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { ventas, resumen, egresosDetalle } = reporte.datos;

    const wsRV = XLSX.utils.aoa_to_sheet([
      ['RESUMEN DE VENTAS'],
      ['Total Ventas Brutas',  resumen.totalVentas || 0],
      ['Total Devoluciones',   resumen.totalDevoluciones || 0],
      ['Ventas Netas',         resumen.totalVentasNetas || resumen.totalVentas || 0],
      ['Transacciones',        resumen.cantidadTransacciones || 0],
      ['Ticket Promedio',      resumen.ticketPromedio || 0],
    ]);
    this.xlsxCols(wsRV, [30, 20]);
    XLSX.utils.book_append_sheet(wb, wsRV, 'Resumen Ventas');

    if (ventas?.length > 0) {
      this.xlsxHoja(wb, 'Ventas',
        ['Fecha', 'Total', 'Metodo Pago', 'Cajero', 'Items'],
        ventas.map((v: any) => [
          new Date(v.fecha).toLocaleString('es-CO'), v.total, v.metodoPago, v.cajero || 'N/A', (v.items || []).length
        ]),
        [22, 16, 18, 20, 10]
      );
    }

    if (resumen.topProductos?.length > 0) {
      this.xlsxHoja(wb, 'Top Productos',
        ['Producto', 'Cantidad', 'Total'],
        resumen.topProductos.map((p: any) => [p.nombre, p.cantidad, p.total]),
        [35, 14, 18]
      );
    }

    if (ventas?.length > 0) {
      const rows: any[][] = [];
      ventas.forEach((v: any) => {
        const d = new Date(v.fecha);
        (v.items || []).forEach((it: any) => {
          rows.push([
            d.toLocaleDateString('es-CO'),
            d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            v.id || '', v.cajero || 'N/A', v.metodoPago || '',
            it.nombre || '', it.categoria || '',
            Number(it.cantidad) || 0,
            Number(it.precio) || 0,
            Number(it.subtotal) || (Number(it.cantidad) * Number(it.precio)) || 0,
          ]);
        });
      });
      if (rows.length > 0) {
        this.xlsxHoja(wb, 'Detalle Transacciones',
          ['Fecha', 'Hora', 'ID', 'Cajero', 'Metodo Pago', 'Producto', 'Categoria', 'Cantidad', 'Precio Unit.', 'Subtotal'],
          rows,
          [14, 10, 20, 18, 16, 30, 18, 10, 14, 14]
        );
      }
    }

    this.xlsxEgresosDetalle(wb, 'Egresos', egresosDetalle || []);
  }

  private xlsxInventario(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { productos, egresosDetalle } = reporte.datos;
    if (productos?.length > 0) {
      this.xlsxHoja(wb, 'Inventario',
        ['Codigo', 'Nombre', 'Categoria', 'Stock', 'Stock Minimo', 'Precio PVP', 'Costo', 'Valor Total PVP'],
        productos.map((p: any) => [
          p.codigo, p.nombre, p.categoria, p.stock, p.minStock, p.precio, p.costo || 0, p.stock * p.precio
        ]),
        [12, 30, 18, 10, 12, 14, 14, 16]
      );
    }

    this.xlsxEgresosDetalle(wb, 'Egresos Inventario', egresosDetalle || []);
  }

  private xlsxGastos(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { gastos, egresosDetalle } = reporte.datos;
    this.xlsxEgresosDetalle(wb, 'Gastos', egresosDetalle || gastos || []);
  }

  private xlsxCierres(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { cierres, egresosDetalle } = reporte.datos;
    if (cierres?.length > 0) {
      this.xlsxHoja(wb, 'Cierres',
        ['Fecha', 'Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Daviplata', 'Mixto', 'Total', 'Diferencia', 'Cajero'],
        cierres.map((c: any) => [
          new Date(c.fecha).toLocaleString('es-CO'),
          c.totalEfectivo, c.totalTarjeta, c.totalTransferencia, c.totalNequi, c.totalDaviplata, c.totalMixto,
          c.totalVentas, c.diferencia, c.cajero || 'N/A'
        ]),
        [22, 14, 14, 16, 12, 14, 12, 14, 14, 20]
      );
    }

    this.xlsxEgresosDetalle(wb, 'Egresos Cierres', egresosDetalle || []);
  }

  private xlsxFinanciero(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { ingresos, gastos, resumen, egresosDetalle } = reporte.datos;
    const ws = XLSX.utils.aoa_to_sheet([
      ['ANALISIS FINANCIERO'],
      [''],
      ['INGRESOS'],
      ['Ingresos Brutos',          ingresos.totalBruto || ingresos.total],
      ['Devoluciones',             ingresos.totalDevoluciones || 0],
      ['Ingresos Netos',           ingresos.total],
      ['Transacciones',            ingresos.transacciones || 0],
      [''],
      ['EGRESOS'],
      ['Total Gastos',             gastos.total],
      ['Transacciones',            gastos.transacciones || 0],
      ['Gasto Diario Promedio',    resumen.gastoPromedioDiario || 0],
      [''],
      ['RESULTADO'],
      ['Utilidad Neta',            resumen.utilidadNeta],
      ['Margen de Utilidad (%)',   resumen.margenUtilidad],
      ['Ingreso Diario Promedio',  resumen.ingresoPromedioDiario],
    ]);
    this.xlsxCols(ws, [30, 20]);
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Financiero');
    this.xlsxEgresosDetalle(wb, 'Egresos Financieros', egresosDetalle || gastos?.detalle || []);
  }

  private xlsxCajero(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { cajero, ventas, cierres, resumen, egresosDetalle } = reporte.datos;

    const wsR = XLSX.utils.aoa_to_sheet([
      ['RESUMEN CAJERO'],
      ['Cajero',                 cajero?.nombre || 'Todos'],
      ['ID',                     cajero?.id || ''],
      ['Total Ventas',           resumen.totalVentas || 0],
      ['Transacciones',          resumen.cantidadTransacciones || 0],
      ['Ticket Promedio',        resumen.ticketPromedio || 0],
      ['Total Cierres',          resumen.totalCierres || 0],
      ['Diferencias Acumuladas', resumen.diferenciasAcumuladas || 0],
      ['Total Gastos',           resumen.totalGastos || 0],
      ['Cantidad de Gastos',     resumen.cantidadGastos || 0],
      ['Neto de Caja',           resumen.netoCaja ?? (resumen.totalVentas || 0)],
    ]);
    this.xlsxCols(wsR, [28, 20]);
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumen Cajero');

    if (Array.isArray(ventas) && ventas.length > 0) {
      const rows: any[][] = [];
      ventas.forEach((v: any) => {
        const d = new Date(v.fecha);
        (v.items || []).forEach((it: any) => {
          rows.push([
            d.toLocaleDateString('es-CO'),
            d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            v.id || '', v.cajero || 'N/A', v.metodoPago || '',
            it.nombre || '', it.categoria || '',
            Number(it.cantidad) || 0,
            Number(it.precio) || 0,
            Number(it.subtotal) || (Number(it.cantidad) * Number(it.precio)) || 0,
          ]);
        });
      });
      if (rows.length > 0) {
        this.xlsxHoja(wb, 'Detalle Transacciones',
          ['Fecha', 'Hora', 'ID', 'Cajero', 'Metodo Pago', 'Producto', 'Categoria', 'Cantidad', 'Precio Unit.', 'Subtotal'],
          rows, [14, 10, 20, 18, 16, 30, 18, 10, 14, 14]
        );
      }
    }

    if (Array.isArray(cierres) && cierres.length > 0) {
      this.xlsxHoja(wb, 'Cierres',
        ['Fecha', 'Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Daviplata', 'Total', 'Diferencia'],
        cierres.map((c: any) => [
          new Date(c.fecha).toLocaleString('es-CO'),
          c.totalEfectivo, c.totalTarjeta, c.totalTransferencia, c.totalNequi, c.totalDaviplata,
          c.totalVentas, c.diferencia,
        ]),
        [22, 14, 14, 16, 12, 14, 14, 14]
      );
    }

    this.xlsxEgresosDetalle(wb, 'Gastos del Periodo', egresosDetalle || []);
  }

  private xlsxEgresosDetalle(wb: XLSX.WorkBook, nombreHoja: string, egresos: any[]): void {
    if (!Array.isArray(egresos) || egresos.length === 0) return;

    const ordenados = [...egresos].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    this.xlsxHoja(
      wb,
      nombreHoja,
      ['Fecha', 'Hora', 'Concepto', 'Descripcion', 'Medio de Pago', 'Monto', 'Cajero'],
      ordenados.map((g: any) => {
        const d = new Date(g.fecha);
        return [
          d.toLocaleDateString('es-CO'),
          d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto',
          g.descripcion || '',
          labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || ''),
          Number(g.monto) || 0,
          g.registradoPor || g.autorizadoPor || g.cajero || 'N/A',
        ];
      }),
      [14, 12, 22, 44, 20, 14, 22]
    );
  }

  private xlsxTaller(wb: XLSX.WorkBook, reporte: ReporteGenerado): void {
    const { resumen, ordenes } = reporte.datos;

    // Hoja resumen
    const wsR = XLSX.utils.aoa_to_sheet([
      ['RESUMEN TALLER DE REPARACIONES'],
      [''],
      ['Total Ordenes',          resumen.totalOrdenes || 0],
      ['Ordenes Activas',        resumen.ordenesActivas || 0],
      ['Ordenes Entregadas',     resumen.ordenesEntregadas || 0],
      ['Ordenes Canceladas',     resumen.ordenesCanceladas || 0],
      ['Ordenes Atrasadas',      resumen.ordenesAtrasadas || 0],
      [''],
      ['Ingresos Totales',       resumen.ingresosTotales || 0],
      ['Costo Total Repuestos',  resumen.costoTotalInsumos || 0],
      ['Utilidad Neta',          resumen.utilidadNeta || 0],
      ['Margen Utilidad (%)',    resumen.margenUtilidad || 0],
      [''],
      ['Saldos Pendientes',      resumen.cantidadConSaldo || 0],
      ['Total Pendiente',        resumen.totalPendiente || 0],
    ]);
    this.xlsxCols(wsR, [30, 20]);
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumen Taller');

    // Hoja ordenes
    if (Array.isArray(ordenes) && ordenes.length > 0) {
      this.xlsxHoja(wb, 'Ordenes',
        ['Numero', 'Cliente', 'Telefono', 'Dispositivo', 'Estado', 'Tecnico', 'Fecha Ingreso', 'Fecha Entrega Est.', 'Ingresos', 'Costo Repuestos', 'Saldo Pendiente'],
        ordenes.map((o: any) => [
          o.numeroOrden,
          o.cliente?.nombre || '',
          o.cliente?.telefono || '',
          `${o.dispositivo?.marca || ''} ${o.dispositivo?.modelo || ''}`.trim(),
          o.estado,
          o.tecnicoAsignado || 'Sin asignar',
          o.fechaIngreso ? new Date(o.fechaIngreso).toLocaleDateString('es-CO') : '',
          o.fechaEstimadaEntrega ? new Date(o.fechaEstimadaEntrega).toLocaleDateString('es-CO') : '',
          (o.pagos || []).reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0),
          Number(o.costoInsumos) || 0,
          Number(o.saldoPendiente) || 0,
        ]),
        [14, 25, 15, 24, 14, 20, 16, 18, 16, 16, 16]
      );
    }

    // Por tecnico
    if (resumen.porTecnico && Object.keys(resumen.porTecnico).length > 0) {
      this.xlsxHoja(wb, 'Por Tecnico',
        ['Tecnico', 'Ordenes', 'Ingresos'],
        Object.entries(resumen.porTecnico).map(([tec, d]: [string, any]) => [tec, d.ordenes, d.ingresos]),
        [28, 12, 18]
      );
    }

    // Top repuestos
    if (resumen.topRepuestos?.length > 0) {
      this.xlsxHoja(wb, 'Top Repuestos',
        ['Repuesto', 'Cantidad', 'Costo Total'],
        resumen.topRepuestos.map((r: any) => [r.nombre, r.cantidad, r.costo]),
        [35, 14, 16]
      );
    }

    // Saldos pendientes
    if (resumen.saldosPendientes?.length > 0) {
      this.xlsxHoja(wb, 'Saldos Pendientes',
        ['Orden', 'Cliente', 'Telefono', 'Dispositivo', 'Estado', 'Saldo'],
        resumen.saldosPendientes.map((s: any) => [
          s.numeroOrden, s.cliente, s.telefono, s.dispositivo, s.estado, s.saldo
        ]),
        [16, 25, 15, 24, 14, 16]
      );
    }
  }

  // ─────────── TIRILLA TERMICA 80mm ───────────

  imprimirTirilla(reporte: ReporteGenerado): boolean {
    const html = this.htmlTirilla(reporte);
    const printerName = getPrinterForSectionOrUndefined('reportes')?.trim();
    const silentMode = !!printerName;
    const widthMm = getConfiguredTicketWidthMm();
    const el = (window as any).electron;

    if (el?.print?.printHtml) {
      el.print.printHtml({ html, silent: silentMode, printerName, widthMm }).catch(() => {
        console.error('Error al imprimir tirilla con printHtml. Verifica la impresora configurada.');
      });
      return true;
    }

    const ipc = (window as any).ipcRenderer || el?.ipcRenderer;
    if (ipc?.send) {
      try {
        ipc.send('print-ticket', { html, silent: silentMode, printerName });
        return true;
      } catch (error) {
        console.error('Error enviando tirilla por IPC:', error);
        return false;
      }
    }

    const ventana = window.open('', '_blank', 'width=520,height=780');
    if (!ventana) {
      console.error('No se pudo abrir ventana para impresión en el navegador.');
      return false;
    }
    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 500);
    return true;
  }

  descargarTirilla(reporte: ReporteGenerado): void {
    const html = this.htmlTirilla(reporte);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reporte.tipo}_tirilla_${reporte.periodo.inicio}_${reporte.periodo.fin}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private htmlTirilla(reporte: ReporteGenerado): string {
    const empresa = cfgEmpresa();
    const fecha = new Date(reporte.fechaGeneracion).toLocaleString('es-CO');
    const por = reporte.metadata.generadoPor || 'Sistema POS';
    const cuerpo = this.cuerpoDeTirilla(reporte);
    const widthMm = getConfiguredTicketWidthMm();
    const bodyWidthMm = widthMm - 2; // margen interno de ~1mm por lado

    const lineasMembrete = [
      empresa.nombre.toUpperCase(),
      empresa.nit      ? `NIT: ${empresa.nit}`       : '',
      empresa.telefono ? `Tel: ${empresa.telefono}`   : '',
      empresa.ciudad   ? empresa.ciudad               : '',
      empresa.direccion ? empresa.direccion           : '',
    ].filter(Boolean);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Tirilla ${reporte.tipo.toUpperCase()}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;color:#000}
  @page{size:${widthMm}mm auto;margin:2mm}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;width:${bodyWidthMm}mm;margin:0 auto;background:#fff;color:#000;padding:6px 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .c{text-align:center;color:#000}
  .b{font-weight:bold;color:#000}
  .hr{border-top:1px dashed #000;margin:5px 0}
  .hr2{border-top:1px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;gap:4px;margin:1.5px 0;font-size:10.5px;color:#000;white-space:normal;word-break:break-word;overflow-wrap:break-word}
  .row span:first-child{flex:1;color:#000;min-width:0;word-break:break-word;overflow-wrap:break-word}
  .row span:last-child{text-align:right;font-weight:bold;white-space:nowrap;color:#000;min-width:0}
  .sec{font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin:5px 0 2px;border-bottom:1px solid #000;padding-bottom:1px;color:#000}
  .ind{padding-left:10px;font-size:10px;color:#000;margin:1px 0}
  .th{font-weight:bold;font-size:10px;margin-top:5px;color:#000;word-break:break-word;overflow-wrap:break-word}
  .tt{text-align:right;font-weight:bold;font-size:11px;margin:1px 0;color:#000}
  .ts{border-top:1px dotted #555;margin:3px 0}
  .footer{font-size:8.5px;text-align:center;margin-top:6px;border-top:1px solid #000;padding-top:4px;line-height:1.6;color:#000}
  @media print{
    *{color:#000!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    body{width:74mm;font-size:10px;background:#fff!important}
    .row{font-size:10px}
  }
</style>
</head>
<body>
<div class="hr2"></div>
<div class="b c" style="font-size:13px;letter-spacing:1px">${lineasMembrete[0]}</div>
${lineasMembrete.slice(1).map(l => `<div class="c" style="font-size:10px">${l}</div>`).join('\n')}
<div class="hr"></div>
<div class="b c" style="font-size:12px">${this.labelTipo(reporte.tipo)}</div>
<div class="c" style="font-size:10px">${reporte.periodo.inicio} a ${reporte.periodo.fin}</div>
<div class="hr"></div>
<div class="row" style="font-size:10px"><span>Generado:</span><span>${fecha}</span></div>
<div class="row" style="font-size:10px"><span>Por:</span><span>${por}</span></div>
<div class="hr"></div>
${cuerpo}
<div class="hr2"></div>
<div class="footer">
  <strong>${empresa.nombre}</strong><br>
  ${empresa.nit ? `NIT: ${empresa.nit}<br>` : ''}${empresa.telefono ? `Tel: ${empresa.telefono}<br>` : ''}${empresa.email ? `${empresa.email}<br>` : ''}${empresa.direccion ? `${empresa.direccion}<br>` : ''}
  Reporte de Auditoria Interna &mdash; Codec POS v2.0
</div>
<br>
</body>
</html>`;
  }

  private labelTipo(tipo: string): string {
    const m: Record<string, string> = {
      ventas:     'REPORTE DE VENTAS',
      inventario: 'REPORTE DE INVENTARIO',
      gastos:     'REPORTE DE GASTOS',
      cierres:    'REPORTE DE CIERRES',
      financiero: 'REPORTE FINANCIERO',
      cajero:     'REPORTE DE CAJERO',
      taller:     'REPORTE TALLER',
    };
    return m[tipo] || tipo.toUpperCase();
  }

  private cuerpoDeTirilla(reporte: ReporteGenerado): string {
    const f = fmtCOP;

    switch (reporte.tipo) {
      case 'ventas': {
        const { resumen, ventas, egresosDetalle } = reporte.datos;
        return `
<div class="sec">RESUMEN</div>
<div class="row"><span>Total Ventas:</span><span>${f(resumen.totalVentas)}</span></div>
${typeof resumen.totalDevoluciones === 'number' ? `<div class="row"><span>Devoluciones:</span><span>-${f(resumen.totalDevoluciones)}</span></div>` : ''}
${typeof resumen.totalVentasNetas === 'number' ? `<div class="row b"><span>Ventas Netas:</span><span>${f(resumen.totalVentasNetas)}</span></div>` : ''}
<div class="row"><span>Transacciones:</span><span>${resumen.cantidadTransacciones || 0}</span></div>
<div class="row"><span>Ticket Promedio:</span><span>${f(Math.round(resumen.ticketPromedio || 0))}</span></div>
<div class="hr"></div>
<div class="sec">METODOS DE PAGO</div>
${Object.entries(resumen.ventasPorMetodo || {}).map(([m, t]) =>
  `<div class="row"><span>${m.charAt(0).toUpperCase() + m.slice(1)}:</span><span>${f(t as number)}</span></div>`
).join('')}
${Array.isArray(resumen.topProductos) && resumen.topProductos.length > 0 ? `
<div class="hr"></div>
<div class="sec">TOP 5 PRODUCTOS</div>
${resumen.topProductos.slice(0, 5).map((p: any, i: number) =>
  `<div class="row"><span>${i+1}. ${p.nombre.substring(0, 20)}</span><span>${p.cantidad}u &middot; ${f(p.total)}</span></div>`
).join('')}` : ''}
${Array.isArray(ventas) && ventas.length > 0 ? `
<div class="hr"></div>
<div class="sec">TRANSACCIONES (${ventas.length})</div>
${ventas.slice(0, 30).map((v: any) => {
  const d = new Date(v.fecha);
  const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const items = (v.items || []).map((it: any) =>
    `<div class="ind">${it.cantidad}x ${(it.nombre || '').substring(0, 22)} ${f(it.subtotal || it.cantidad * it.precio)}</div>`
  ).join('');
  return `<div class="th">${ds} ${hs} | ${v.metodoPago}${v.cajero ? ' | ' + v.cajero : ''}</div>${items}<div class="tt">TOTAL: ${f(v.total)}</div><div class="ts"></div>`;
}).join('')}
${ventas.length > 30 ? `<div class="c" style="font-size:9px">... y ${ventas.length - 30} transacciones mas (ver Excel)</div>` : ''}` : ''}
${Array.isArray(egresosDetalle) && egresosDetalle.length > 0 ? `
<div class="hr"></div>
<div class="sec">EGRESOS (${egresosDetalle.length})</div>
${egresosDetalle.map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'cajero': {
        const { cajero, resumen, ventas, egresosDetalle } = reporte.datos;
        return `
<div class="sec">CAJERO: ${cajero?.nombre || 'TODOS'}</div>
<div class="row"><span>Total Ventas:</span><span>${f(resumen.totalVentas)}</span></div>
<div class="row"><span>Transacciones:</span><span>${resumen.cantidadTransacciones || 0}</span></div>
<div class="row"><span>Ticket Promedio:</span><span>${f(Math.round(resumen.ticketPromedio || 0))}</span></div>
<div class="row"><span>Total Cierres:</span><span>${resumen.totalCierres || 0}</span></div>
<div class="row"><span>Diferencias:</span><span>${f(resumen.diferenciasAcumuladas || 0)}</span></div>
<div class="row b"><span>Total Gastos:</span><span>${f(resumen.totalGastos || 0)}</span></div>
<div class="row b"><span>Neto de Caja:</span><span>${f(resumen.netoCaja ?? resumen.totalVentas)}</span></div>
<div class="hr"></div>
<div class="sec">METODOS DE PAGO</div>
${Object.entries(resumen.ventasPorMetodo || {}).map(([m, t]) =>
  `<div class="row"><span>${m}:</span><span>${f(t as number)}</span></div>`
).join('')}
${Array.isArray(resumen.topProductos) && resumen.topProductos.length > 0 ? `
<div class="hr"></div>
<div class="sec">TOP PRODUCTOS</div>
${resumen.topProductos.slice(0, 5).map((p: any, i: number) =>
  `<div class="row"><span>${i+1}. ${p.nombre.substring(0, 20)}</span><span>${p.cantidad}u</span></div>`
).join('')}` : ''}
${Array.isArray(ventas) && ventas.length > 0 ? `
<div class="hr"></div>
<div class="sec">TRANSACCIONES (${ventas.length})</div>
${ventas.slice(0, 25).map((v: any) => {
  const d = new Date(v.fecha);
  const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const items = (v.items || []).map((it: any) =>
    `<div class="ind">${it.cantidad}x ${(it.nombre || '').substring(0, 22)} ${f(it.subtotal || it.cantidad * it.precio)}</div>`
  ).join('');
  return `<div class="th">${ds} ${hs} | ${v.metodoPago}</div>${items}<div class="tt">TOTAL: ${f(v.total)}</div><div class="ts"></div>`;
}).join('')}` : ''}
${Array.isArray(egresosDetalle) && egresosDetalle.length > 0 ? `
<div class="hr"></div>
<div class="sec">EGRESOS (${egresosDetalle.length})</div>
${egresosDetalle.map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'gastos': {
        const { resumen, gastos, egresosDetalle } = reporte.datos;
        return `
<div class="sec">RESUMEN</div>
<div class="row b"><span>Total Gastos:</span><span>${f(resumen.totalGastos)}</span></div>
<div class="row"><span>Cantidad:</span><span>${resumen.cantidadGastos || 0}</span></div>
<div class="row"><span>Promedio:</span><span>${f(Math.round(resumen.promedioGasto || 0))}</span></div>
<div class="hr"></div>
<div class="sec">POR CATEGORIA</div>
${Object.entries(resumen.gastosPorCategoria || {}).map(([c, t]) =>
  `<div class="row"><span>${c}:</span><span>${f(t as number)}</span></div>`
).join('')}
${Array.isArray(egresosDetalle || gastos) && (egresosDetalle || gastos).length > 0 ? `
<div class="hr"></div>
<div class="sec">DETALLE (${(egresosDetalle || gastos).length})</div>
${(egresosDetalle || gastos).map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'cierres': {
        const { resumen, cierres, egresosDetalle } = reporte.datos;
        return `
<div class="sec">RESUMEN</div>
<div class="row"><span>Total Cierres:</span><span>${resumen.totalCierres}</span></div>
<div class="row b"><span>Total Recaudado:</span><span>${f(resumen.totalRecaudado)}</span></div>
<div class="row"><span>Con Faltante:</span><span>${resumen.cierresConFaltante}</span></div>
<div class="row"><span>Con Sobrante:</span><span>${resumen.cierresConSobrante}</span></div>
<div class="row"><span>Diferencias:</span><span>${f(resumen.totalDiferencias)}</span></div>
<div class="row"><span>Metodo mas usado:</span><span>${resumen.metodoPagoMasUsado}</span></div>
${Array.isArray(cierres) && cierres.length > 0 ? `
<div class="hr"></div>
<div class="sec">CIERRES (${cierres.length})</div>
${cierres.map((c: any) => {
  const d = new Date(c.fecha);
  const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const dif = c.diferencia >= 0 ? `+${f(c.diferencia)}` : f(c.diferencia);
  return `<div class="th">${ds}${c.cajero ? ' | ' + c.cajero : ''}</div><div class="row"><span>Total:</span><span>${f(c.totalVentas)}</span></div><div class="row"><span>Diferencia:</span><span>${dif}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
${Array.isArray(egresosDetalle) && egresosDetalle.length > 0 ? `
<div class="hr"></div>
<div class="sec">EGRESOS (${egresosDetalle.length})</div>
${egresosDetalle.map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'financiero': {
        const { ingresos, gastos, resumen, egresosDetalle } = reporte.datos;
        const util = resumen.utilidadNeta || 0;
        const colorUtil = util >= 0 ? '#166534' : '#991b1b';
        return `
<div class="sec">INGRESOS</div>
<div class="row"><span>Total Bruto:</span><span>${f(ingresos.totalBruto || ingresos.total)}</span></div>
${typeof ingresos.totalDevoluciones === 'number' ? `<div class="row"><span>Devoluciones:</span><span>-${f(ingresos.totalDevoluciones)}</span></div>` : ''}
<div class="row b"><span>Total Neto:</span><span>${f(ingresos.total)}</span></div>
<div class="hr"></div>
<div class="sec">GASTOS</div>
<div class="row b"><span>Total Gastos:</span><span>${f(gastos.total)}</span></div>
<div class="hr"></div>
<div class="sec">RESULTADO</div>
<div class="row b" style="font-size:12px;color:${colorUtil}"><span>Utilidad Neta:</span><span>${f(util)}</span></div>
<div class="row"><span>Margen:</span><span>${(resumen.margenUtilidad || 0).toFixed(1)}%</span></div>
<div class="row"><span>Ingreso/dia prom.:</span><span>${f(Math.round(resumen.ingresoPromedioDiario || 0))}</span></div>
<div class="row"><span>Gasto/dia prom.:</span><span>${f(Math.round(resumen.gastoPromedioDiario || 0))}</span></div>
${Array.isArray(egresosDetalle) && egresosDetalle.length > 0 ? `
<div class="hr"></div>
<div class="sec">EGRESOS DETALLADOS (${egresosDetalle.length})</div>
${egresosDetalle.map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'inventario': {
        const { resumen, egresosDetalle } = reporte.datos;
        return `
<div class="sec">INVENTARIO</div>
<div class="row"><span>Total Productos:</span><span>${resumen.totalProductos}</span></div>
<div class="row b"><span>Valor Inventario:</span><span>${f(resumen.valorInventario)}</span></div>
<div class="row"><span>Valor Costo:</span><span>${f(resumen.valorCosto)}</span></div>
<div class="row"><span>Utilidad Potencial:</span><span>${f(resumen.utilidadPotencial)}</span></div>
<div class="hr"></div>
<div class="row" style="color:#991b1b"><span>Stock Bajo:</span><span>${resumen.productosBajoStock} productos</span></div>
${resumen.alertas?.stockBajo?.length > 0 ? `
<div class="sec">ALERTAS STOCK BAJO</div>
${resumen.alertas.stockBajo.slice(0, 10).map((p: any) =>
  `<div class="row"><span>${p.nombre.substring(0, 20)}</span><span>Stock: ${p.stock}/${p.minStock}</span></div>`
).join('')}` : ''}
${Array.isArray(egresosDetalle) && egresosDetalle.length > 0 ? `
<div class="hr"></div>
<div class="sec">EGRESOS (${egresosDetalle.length})</div>
${egresosDetalle.map((g: any) => {
  const d = new Date(g.fecha);
  const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
  const medio = labelMedioEgreso(g.medioPagoEgreso || g.metodoPago || '');
  const cajeroG = g.registradoPor || g.autorizadoPor || g.cajero || 'N/A';
  return `<div class="th">${hs} | ${concepto} | ${medio}</div><div class="ind">${g.descripcion || ''}</div><div class="row"><span>${cajeroG}</span><span>${f(g.monto || 0)}</span></div><div class="ts"></div>`;
}).join('')}` : ''}
`;
      }

      case 'taller': {
        const { resumen } = reporte.datos;
        const util = resumen.utilidadNeta || 0;
        const colorUtil = util >= 0 ? '#166534' : '#991b1b';
        return `
<div class="sec">OPERACIONES</div>
<div class="row"><span>Total Ordenes:</span><span>${resumen.totalOrdenes || 0}</span></div>
<div class="row"><span>Activas:</span><span>${resumen.ordenesActivas || 0}</span></div>
<div class="row"><span>Entregadas:</span><span>${resumen.ordenesEntregadas || 0}</span></div>
${resumen.ordenesAtrasadas > 0 ? `<div class="row" style="color:#991b1b"><span>Atrasadas:</span><span>${resumen.ordenesAtrasadas}</span></div>` : ''}
<div class="hr"></div>
<div class="sec">FINANZAS</div>
<div class="row b"><span>Ingresos:</span><span>${fmtCOP(resumen.ingresosTotales)}</span></div>
<div class="row"><span>Costo Repuestos:</span><span>${fmtCOP(resumen.costoTotalInsumos)}</span></div>
<div class="row b" style="color:${colorUtil}"><span>Utilidad Neta:</span><span>${fmtCOP(util)}</span></div>
<div class="row"><span>Margen:</span><span>${(resumen.margenUtilidad || 0).toFixed(1)}%</span></div>
${resumen.cantidadConSaldo > 0 ? `
<div class="hr"></div>
<div class="sec">SALDOS PENDIENTES</div>
<div class="row" style="color:#991b1b"><span>Clientes con saldo:</span><span>${resumen.cantidadConSaldo}</span></div>
<div class="row b" style="color:#991b1b"><span>Total pendiente:</span><span>${fmtCOP(resumen.totalPendiente)}</span></div>
${resumen.saldosPendientes.slice(0, 5).map((s: any) =>
  `<div class="row"><span>${s.cliente.substring(0, 18)}</span><span>${fmtCOP(s.saldo)}</span></div>`
).join('')}
${resumen.saldosPendientes.length > 5 ? `<div class="c" style="font-size:9px">... y ${resumen.saldosPendientes.length - 5} mas (ver Excel)</div>` : ''}` : ''}
${resumen.topRepuestos?.length > 0 ? `
<div class="hr"></div>
<div class="sec">TOP REPUESTOS</div>
${resumen.topRepuestos.slice(0, 5).map((r: any, i: number) =>
  `<div class="row"><span>${i+1}. ${r.nombre.substring(0, 20)}</span><span>${r.cantidad}u &middot; ${fmtCOP(r.costo)}</span></div>`
).join('')}` : ''}
${resumen.porTecnico && Object.keys(resumen.porTecnico).length > 0 ? `
<div class="hr"></div>
<div class="sec">POR TECNICO</div>
${Object.entries(resumen.porTecnico).map(([tec, d]: [string, any]) =>
  `<div class="row"><span>${tec.substring(0, 20)}</span><span>${d.ordenes}ord &middot; ${fmtCOP(d.ingresos)}</span></div>`
).join('')}` : ''}
`;
      }

      default:
        return '';
    }
  }
}

export const exportadorReportes = new ExportadorReportes();
