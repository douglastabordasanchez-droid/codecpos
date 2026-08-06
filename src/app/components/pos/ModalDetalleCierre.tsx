import { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  Printer,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Banknote,
  CreditCard,
  Wallet,
  DollarSign,
  User,
  Clock,
  TrendingUp,
  TrendingDown,
  Calendar,
  Building2,
  PenLine,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getConfiguredTicketWidthMm } from '../../lib/printerConfig';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';
import TirillaCierreCaja, { type ProductoTop, type CierreDataModal } from './TirillaCierreCaja';

export interface CierreDetalle {
  id: string;
  fecha: string;
  cajero: string;
  aperturaId?: string;
  fechaApertura?: string;
  baseInicial: number;
  totalSistema: number;
  totalFisico: number;
  totalFinal?: number;
  diferencia: number;
  desglose: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    rappi?: number;
  };
  billetes?: Record<string, number>;
  observaciones?: string;
  estado: 'cuadrado' | 'faltante' | 'sobrante';
  gastosEfectivo?: number;
  gastosDetalle?: Array<{ descripcion: string; concepto?: string; monto: number; medioPago?: string }>;
  gastosTransferencia?: number;
  gastosTarjetaBanco?: number;
  devoluciones?: number;
  cantidadTransacciones?: number;
  ticketPromedio?: number;
  productosTop?: ProductoTop[];
  transferenciaEsperada?: number;
  tarjetaBancoEsperado?: number;
  totalEsperadoAnalitico?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cierre: CierreDetalle | null;
  darkMode: boolean;
}

type RGB = [number, number, number];

const C: Record<string, RGB> = {
  header:  [30, 41, 59],
  purple:  [109, 40, 217],
  emerald: [16, 185, 129],
  red:     [220, 38, 38],
  amber:   [217, 119, 6],
  white:   [255, 255, 255],
  muted:   [100, 116, 139],
  dark:    [15, 23, 42],
  light:   [248, 250, 252],
  border:  [226, 232, 240],
  green_bg: [220, 252, 231],
  red_bg:   [254, 226, 226],
  amber_bg: [254, 243, 199],
};

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

const BILLETES_VACIOS = {
  b100000: 0, b50000: 0, b20000: 0, b10000: 0, b5000: 0,
  b2000: 0, b1000: 0, m500: 0, m200: 0, m100: 0, m50: 0,
};

function getCfgEmpresa() {
  try {
    const raw = localStorage.getItem('codec_pos_config');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return p;
    }
  } catch { /* ignore */ }
  return {};
}

function getPrinterName(): string {
  // Resolución centralizada (misma cadena de fallback que el resto del sistema:
  // sección → global si está activado → facturas/predeterminada). Antes esta
  // función leía directamente claves legacy y no respetaba el global override.
  return getPrinterForSectionOrUndefined('cierre_caja') || '';
}

export default function ModalDetalleCierre({ open, onClose, cierre, darkMode }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!cierre) return null;

  const cfg = getCfgEmpresa();
  const nombreEmpresa = cfg.nombreComercial || cfg.razonSocial || 'MI NEGOCIO';

  const fechaDisplay = (() => {
    try { return format(new Date(cierre.fecha), "dd 'de' MMMM yyyy", { locale: es }); }
    catch { return '—'; }
  })();
  const horaDisplay = (() => {
    try { return format(new Date(cierre.fecha), 'HH:mm', { locale: es }); }
    catch { return '—'; }
  })();

  const efectivoEsperado = cierre.totalFinal ?? (cierre.baseInicial + cierre.desglose.efectivo - (cierre.gastosEfectivo || 0) - (cierre.devoluciones || 0));
  const totalElectronico = cierre.desglose.tarjeta + cierre.desglose.nequi + cierre.desglose.daviplata + cierre.desglose.transferencia + (cierre.desglose.rappi || 0);

  const estadoInfo = {
    cuadrado: { color: 'emerald', text: 'CAJA CUADRADA',   icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,   textClass: 'text-emerald-600', bgClass: darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200' },
    faltante:  { color: 'red',     text: 'FALTANTE EN CAJA', icon: <XCircle className="w-5 h-5 text-red-500" />,          textClass: 'text-red-600',     bgClass: darkMode ? 'bg-red-500/10 border-red-500/30'     : 'bg-red-50 border-red-200'     },
    sobrante:  { color: 'amber',   text: 'SOBRANTE EN CAJA', icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,  textClass: 'text-amber-600',   bgClass: darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200' },
  }[cierre.estado];

  // Reconstruye el mismo objeto de datos que arma ModalCierreCaja en el momento
  // del cierre, a partir de lo persistido en el registro histórico, para que
  // TirillaCierreCaja renderice exactamente el mismo documento.
  const tirillaData: CierreDataModal = {
    cajero: cierre.cajero,
    fechaApertura: cierre.fechaApertura || cierre.fecha,
    fechaCierre: cierre.fecha,
    baseInicial: cierre.baseInicial,
    desglose: { ...cierre.desglose, rappi: cierre.desglose.rappi || 0 },
    totalSistema: cierre.totalSistema,
    gastosEfectivo: cierre.gastosEfectivo || 0,
    gastosDetalle: cierre.gastosDetalle || [],
    gastosTransferencia: cierre.gastosTransferencia,
    gastosTarjetaBanco: cierre.gastosTarjetaBanco,
    devoluciones: cierre.devoluciones || 0,
    efectivoEsperado,
    transferenciaEsperada: cierre.transferenciaEsperada,
    tarjetaBancoEsperado: cierre.tarjetaBancoEsperado,
    totalEsperadoAnalitico: cierre.totalEsperadoAnalitico,
    totalFisicoContado: cierre.totalFisico,
    diferencia: cierre.diferencia,
    estado: cierre.estado,
    observaciones: cierre.observaciones || '',
    cantidadTransacciones: cierre.cantidadTransacciones || 0,
    ticketPromedio: cierre.ticketPromedio || 0,
    productosTop: cierre.productosTop || [],
    billetes: { ...BILLETES_VACIOS, ...(cierre.billetes || {}) },
  };

  // ── Generar PDF corporativo A4 ──────────────────────────────────────────────
  const generarPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      let y = 0;

      // ── Cabecera degradada ──
      doc.setFillColor(...C.header);
      doc.rect(0, 0, W, 42, 'F');

      // Banda acento morada
      doc.setFillColor(...C.purple);
      doc.rect(0, 38, W, 4, 'F');

      // Nombre empresa
      doc.setTextColor(...C.white);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(nombreEmpresa.toUpperCase(), 14, 14);

      if (cfg.razonSocial && cfg.razonSocial !== cfg.nombreComercial) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(cfg.razonSocial, 14, 20);
      }
      if (cfg.nit) {
        doc.setFontSize(9);
        doc.text(`NIT: ${cfg.nit}${cfg.digitoVerificacion ? `-${cfg.digitoVerificacion}` : ''}`, 14, 26);
      }
      if (cfg.direccion || cfg.ciudad) {
        doc.setFontSize(8);
        doc.text([cfg.direccion, cfg.ciudad].filter(Boolean).join(' · '), 14, 32);
      }

      // Titulo reporte (derecha)
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('FICHA TÉCNICA DE AUDITORÍA', W - 14, 14, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('CIERRE DE CAJA', W - 14, 20, { align: 'right' });
      doc.text(`No. ${cierre.id?.slice(-8) || '—'}`, W - 14, 26, { align: 'right' });

      y = 50;

      // ── Info del turno ──
      doc.setFillColor(...C.light);
      doc.roundedRect(14, y, W - 28, 26, 2, 2, 'F');
      doc.setDrawColor(...C.border);
      doc.roundedRect(14, y, W - 28, 26, 2, 2, 'S');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.muted);
      doc.text('CAJERO RESPONSABLE', 20, y + 7);
      doc.text('FECHA DE CIERRE', 80, y + 7);
      doc.text('HORA', 140, y + 7);
      doc.text('ESTADO', 170, y + 7);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.dark);
      doc.text(cierre.cajero || '—', 20, y + 17);
      doc.text(fechaDisplay, 80, y + 17);
      doc.text(horaDisplay, 140, y + 17);

      const estadoColor: RGB = cierre.estado === 'cuadrado' ? C.emerald : cierre.estado === 'faltante' ? C.red : C.amber;
      doc.setTextColor(...estadoColor);
      doc.text(estadoInfo.text, 170, y + 17);

      y += 34;

      // ── Sección 1: Balance de apertura ──
      const seccionTitulo = (titulo: string, yPos: number) => {
        doc.setFillColor(...C.header);
        doc.rect(14, yPos, W - 28, 8, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.white);
        doc.text(titulo, 18, yPos + 5.5);
        return yPos + 12;
      };

      y = seccionTitulo('1. BALANCE DE APERTURA', y);

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [],
        body: [
          ['Base inicial de caja (fondo de apertura)', fmt(cierre.baseInicial)],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 'auto', textColor: C.dark }, 1: { halign: 'right', fontStyle: 'bold', textColor: C.dark } },
        theme: 'plain',
        tableLineColor: C.border,
        tableLineWidth: 0.2,
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      // ── Sección 2: Ingresos por método de pago ──
      y = seccionTitulo('2. DESGLOSE DE INGRESOS POR MÉTODO DE PAGO', y);

      const metodos: [string, number][] = [
        ['Efectivo', cierre.desglose.efectivo],
        ['Tarjeta de Crédito/Débito', cierre.desglose.tarjeta],
        ['Nequi', cierre.desglose.nequi],
        ['Daviplata', cierre.desglose.daviplata],
        ['Transferencia Bancaria', cierre.desglose.transferencia],
        ['Rappi', cierre.desglose.rappi || 0],
      ].filter(([, v]) => (v as number) > 0) as [string, number][];

      const metodoBody = metodos.map(([label, val]) => [label, fmt(val)]);
      metodoBody.push([{ content: 'TOTAL INGRESOS DEL DÍA', styles: { fontStyle: 'bold' } } as any, { content: fmt(cierre.totalSistema), styles: { fontStyle: 'bold', textColor: C.emerald } } as any]);

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Método de Pago', 'Monto']],
        body: metodoBody,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', fontStyle: 'bold' } },
        theme: 'grid',
        tableLineColor: C.border,
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      // Nueva página si queda poco espacio
      if (y > H - 80) { doc.addPage(); y = 16; }

      // ── Sección 3: Egresos y gastos ──
      y = seccionTitulo('3. REGISTRO DE EGRESOS Y GASTOS (EFECTIVO)', y);

      const gastosBody: any[] = [];
      if ((cierre.gastosEfectivo || 0) > 0) {
        gastosBody.push(['Gastos / Compras pagadas de contado', fmt(cierre.gastosEfectivo!)]);
      }
      if ((cierre.devoluciones || 0) > 0) {
        gastosBody.push(['Devoluciones en efectivo', fmt(cierre.devoluciones!)]);
      }
      const totalEgresos = (cierre.gastosEfectivo || 0) + (cierre.devoluciones || 0);
      if (gastosBody.length === 0) gastosBody.push(['Sin egresos registrados', '$0']);
      gastosBody.push([{ content: 'TOTAL EGRESOS', styles: { fontStyle: 'bold' } }, { content: fmt(totalEgresos), styles: { fontStyle: 'bold', textColor: C.red } }]);

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Concepto', 'Monto']],
        body: gastosBody,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', fontStyle: 'bold' } },
        theme: 'grid',
        tableLineColor: C.border,
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      if (y > H - 80) { doc.addPage(); y = 16; }

      // ── Sección 4: Arqueo de caja ──
      y = seccionTitulo('4. ARQUEO DE CAJA — TOTAL ESPERADO VS. REAL', y);

      const arqueoBg: RGB = cierre.estado === 'cuadrado' ? C.green_bg : cierre.estado === 'faltante' ? C.red_bg : C.amber_bg;
      const diferenciaColor: RGB = cierre.estado === 'cuadrado' ? C.emerald : cierre.estado === 'faltante' ? C.red : C.amber;

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Concepto', 'Valor']],
        body: [
          ['Base inicial de caja', fmt(cierre.baseInicial)],
          ['(+) Ventas en efectivo', fmt(cierre.desglose.efectivo)],
          ['(-) Egresos en efectivo', fmt(-(totalEgresos))],
          [{ content: 'EFECTIVO ESPERADO EN CAJA', styles: { fontStyle: 'bold' } }, { content: fmt(efectivoEsperado), styles: { fontStyle: 'bold' } }],
          [{ content: 'EFECTIVO REAL CONTADO POR CAJERO', styles: { fontStyle: 'bold' } }, { content: fmt(cierre.totalFisico), styles: { fontStyle: 'bold' } }],
          [
            { content: `${estadoInfo.text} — DIFERENCIA`, styles: { fontStyle: 'bold', textColor: diferenciaColor, fillColor: arqueoBg } },
            { content: `${cierre.diferencia >= 0 ? '+' : ''}${fmt(cierre.diferencia)}`, styles: { fontStyle: 'bold', textColor: diferenciaColor, halign: 'right', fillColor: arqueoBg } }
          ],
        ],
        styles: { fontSize: 9, cellPadding: 3.5 },
        headStyles: { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', fontStyle: 'bold' } },
        theme: 'grid',
        tableLineColor: C.border,
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      if (y > H - 80) { doc.addPage(); y = 16; }

      // ── Sección 5: Transacciones y ticket promedio ──
      if ((cierre.cantidadTransacciones || 0) > 0) {
        y = seccionTitulo('5. RESUMEN OPERACIONAL', y);
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          head: [],
          body: [
            ['Total de transacciones registradas', String(cierre.cantidadTransacciones || 0)],
            ['Ticket promedio', fmt(cierre.ticketPromedio || 0)],
            ['Ingresos digitales (tarjeta + billeteras)', fmt(totalElectronico)],
          ],
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', fontStyle: 'bold' } },
          theme: 'plain',
          tableLineColor: C.border,
          tableLineWidth: 0.2,
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      if (y > H - 70) { doc.addPage(); y = 16; }

      // ── Observaciones ──
      if (cierre.observaciones) {
        y = seccionTitulo('OBSERVACIONES', y);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.dark);
        const lines = doc.splitTextToSize(cierre.observaciones, W - 28);
        doc.text(lines, 14, y);
        y += lines.length * 5 + 6;
      }

      if (y > H - 60) { doc.addPage(); y = 16; }

      // ── Firmas ──
      y = seccionTitulo('FIRMAS DE RESPONSABILIDAD', y);
      y += 8;

      const firmaW = (W - 28 - 12) / 2;
      // Cajero
      doc.setDrawColor(...C.dark);
      doc.line(14, y + 20, 14 + firmaW, y + 20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.dark);
      doc.text('CAJERO RESPONSABLE', 14 + firmaW / 2, y + 25, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text(cierre.cajero || '—', 14 + firmaW / 2, y + 30, { align: 'center' });
      doc.text('Nombre y firma', 14 + firmaW / 2, y + 35, { align: 'center' });

      // Administrador
      const adminX = 14 + firmaW + 12;
      doc.line(adminX, y + 20, adminX + firmaW, y + 20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.dark);
      doc.text('ADMINISTRADOR / AUDITOR', adminX + firmaW / 2, y + 25, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text('Nombre y firma', adminX + firmaW / 2, y + 35, { align: 'center' });

      y += 44;

      // ── Pie de página ──
      const totalPages = doc.internal.pages.length - 1;
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFillColor(...C.header);
        doc.rect(0, H - 10, W, 10, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.white);
        doc.text(`${nombreEmpresa} · CODEC POS v2.0 · Documento generado el ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, 14, H - 3.5);
        doc.text(`Pág. ${p} de ${totalPages}`, W - 14, H - 3.5, { align: 'right' });
      }

      doc.save(`Cierre-Caja-${cierre.cajero?.replace(/\s+/g, '-') || 'cajero'}-${fechaDisplay.replace(/\s/g, '-')}.pdf`);
      toast.success('PDF descargado correctamente', { icon: '📄' });
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('Error al generar el PDF');
    }
  };

  // ── Imprimir ticket térmico ──────────────────────────────────────────────
  const imprimirCierre = () => {
    const el = receiptRef.current;
    if (!el) return;

    const widthMm = getConfiguredTicketWidthMm();
    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Cierre de Caja</title>
      <style>
        @page{size:${widthMm}mm auto;margin:2mm;}
        body{margin:0;padding:4mm;font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;}
        .receipt{max-width:320px;margin:0 auto;}
      </style>
    </head><body><div class="receipt">${el.innerHTML}</div></body></html>`;

    const printerName = getPrinterName();
    const silentMode = !!printerName;
    const electron = (window as any).electron;

    if (electron?.print?.printHtml) {
      electron.print.printHtml({ html, silent: silentMode, printerName, widthMm }).catch(() => {
        toast.error('Error al imprimir. Verifica la impresora configurada.');
      });
      toast.success(silentMode ? 'Imprimiendo cierre…' : 'Abriendo diálogo de impresión…');
      return;
    }

    const ipc = (window as any).ipcRenderer ?? electron?.ipcRenderer;
    if (ipc?.send) {
      ipc.send('print-ticket', { html, silent: silentMode, printerName, widthMm });
      toast.success(silentMode ? 'Imprimiendo cierre…' : 'Abriendo diálogo de impresión…');
      return;
    }

    const w = window.open('', '_blank', 'width=420,height=900');
    if (!w) { toast.error('Habilita las ventanas emergentes para imprimir'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  };

  // ── Descargar tirilla como HTML ──────────────────────────────────────────
  const descargarTirilla = () => {
    const el = receiptRef.current;
    if (!el) return;

    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Cierre de Caja - Tirilla</title>
      <style>
        @page{size:${getConfiguredTicketWidthMm()}mm auto;margin:2mm;}
        body{margin:0;padding:4mm;font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;}
        .receipt{max-width:320px;margin:0 auto;}
      </style>
    </head><body><div class="receipt">${el.innerHTML}</div></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cierre-Caja-Tirilla-${cierre.cajero?.replace(/\s+/g, '_') || 'cajero'}-${format(new Date(cierre.fecha), 'yyyy-MM-dd_HH-mm')}.html`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Tirilla descargada correctamente', { icon: '📄' });
  };

  // Estilos por tema
  const bg     = darkMode ? 'bg-slate-900'    : 'bg-white';
  const bgLeft = darkMode ? 'bg-white/5'      : 'bg-gray-50';
  const border = darkMode ? 'border-slate-700' : 'border-gray-200';
  const txt    = darkMode ? 'text-white'       : 'text-slate-900';
  const sub    = darkMode ? 'text-slate-400'   : 'text-slate-500';
  const card   = darkMode ? 'bg-slate-800'     : 'bg-gray-50';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[190] flex items-center justify-center p-3 md:p-6"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] border ${bg} ${border}`}
          >
            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* ══ PANEL IZQUIERDO — Tirilla oficial de cierre ══════════════════════ */}
            <div className={`flex-1 overflow-y-auto p-6 ${bgLeft}`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${sub}`}>
                Tirilla de cierre de caja
              </p>

              {/* Misma tirilla que se genera al cerrar caja — reconstruida a partir
                  de los datos guardados, para que el administrador vea/descargue/
                  imprima siempre el documento idéntico desde Reportes. */}
              <TirillaCierreCaja ref={receiptRef} data={tirillaData} />
            </div>

            {/* ══ PANEL DERECHO — Resumen + Acciones ═══════════════════════ */}
            <div
              className={`w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l ${border} ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
            >
              {/* Header */}
              <div className={`p-5 border-b ${border} flex-shrink-0`}>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  <h2 className={`font-bold ${txt}`}>Detalle del Cierre</h2>
                </div>
                <p className={`text-xs ${sub}`}>{fechaDisplay} · {horaDisplay}</p>
              </div>

              {/* Métricas y acciones con scroll invisible */}
              <div
                className="flex flex-col gap-3 p-5 flex-1"
                style={{
                  maxHeight: 'calc(90vh - 80px)',
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                } as React.CSSProperties}
              >
                {/* Cajero */}
                <div className={`flex items-center gap-2.5 p-3 rounded-xl ${card}`}>
                  <User className={`w-4 h-4 flex-shrink-0 ${sub}`} />
                  <div className="min-w-0">
                    <p className={`text-xs ${sub}`}>Cajero</p>
                    <p className={`font-semibold text-sm truncate ${txt}`}>{cierre.cajero}</p>
                  </div>
                </div>

                {/* Turno */}
                <div className={`flex items-center gap-2.5 p-3 rounded-xl ${card}`}>
                  <Clock className={`w-4 h-4 flex-shrink-0 ${sub}`} />
                  <div>
                    <p className={`text-xs ${sub}`}>Fecha y hora</p>
                    <p className={`font-semibold text-sm ${txt}`}>{fechaDisplay}</p>
                    <p className={`text-xs ${sub}`}>{horaDisplay}</p>
                  </div>
                </div>

                {/* Total vendido */}
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                    <p className={`text-xs font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>TOTAL INGRESOS</p>
                  </div>
                  <p className={`text-2xl font-black ${txt}`}>{fmt(cierre.totalSistema)}</p>
                  {(cierre.cantidadTransacciones || 0) > 0 && (
                    <p className={`text-xs mt-1 ${sub}`}>{cierre.cantidadTransacciones} transacciones</p>
                  )}
                </div>

                {/* Desglose rápido */}
                <div className="space-y-1.5">
                  {cierre.desglose.efectivo > 0 && (
                    <div className={`flex justify-between items-center p-2.5 rounded-lg ${card}`}>
                      <span className="flex items-center gap-1.5 text-xs"><Banknote className="w-3.5 h-3.5 text-green-500" /><span className={sub}>Efectivo</span></span>
                      <span className={`text-xs font-bold ${txt}`}>{fmt(cierre.desglose.efectivo)}</span>
                    </div>
                  )}
                  {cierre.desglose.tarjeta > 0 && (
                    <div className={`flex justify-between items-center p-2.5 rounded-lg ${card}`}>
                      <span className="flex items-center gap-1.5 text-xs"><CreditCard className="w-3.5 h-3.5 text-blue-500" /><span className={sub}>Tarjeta</span></span>
                      <span className={`text-xs font-bold ${txt}`}>{fmt(cierre.desglose.tarjeta)}</span>
                    </div>
                  )}
                  {totalElectronico > 0 && cierre.desglose.tarjeta === 0 && (
                    <div className={`flex justify-between items-center p-2.5 rounded-lg ${card}`}>
                      <span className="flex items-center gap-1.5 text-xs"><Wallet className="w-3.5 h-3.5 text-purple-500" /><span className={sub}>Digital</span></span>
                      <span className={`text-xs font-bold ${txt}`}>{fmt(totalElectronico)}</span>
                    </div>
                  )}
                  {(cierre.gastosEfectivo || 0) > 0 && (
                    <div className={`flex justify-between items-center p-2.5 rounded-lg ${darkMode ? 'bg-red-500/10' : 'bg-red-50'}`}>
                      <span className="flex items-center gap-1.5 text-xs"><TrendingDown className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500">Gastos</span></span>
                      <span className="text-xs font-bold text-red-500">-{fmt(cierre.gastosEfectivo!)}</span>
                    </div>
                  )}
                </div>

                {/* Estado del arqueo */}
                <div className={`p-3.5 rounded-xl border-2 ${estadoInfo.bgClass}`}>
                  <div className="flex items-center gap-2.5">
                    {estadoInfo.icon}
                    <div>
                      <p className={`font-bold text-sm ${estadoInfo.textClass}`}>{estadoInfo.text}</p>
                      <p className={`text-xs ${estadoInfo.textClass}`}>
                        {cierre.estado === 'cuadrado'
                          ? 'El conteo cuadra perfectamente'
                          : `Diferencia: ${cierre.diferencia >= 0 ? '+' : ''}${fmt(cierre.diferencia)}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Efectivo esperado vs real */}
                <div className={`p-3 rounded-xl border ${border} ${card}`}>
                  <p className={`text-xs font-semibold mb-2 ${sub}`}>ARQUEO DE EFECTIVO</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className={`text-xs ${sub}`}>Real contado</p>
                      <p className={`text-lg font-black ${txt}`}>{fmt(cierre.totalFisico)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${sub}`}>Esperado</p>
                      <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{fmt(efectivoEsperado)}</p>
                    </div>
                  </div>
                </div>

                {/* Separador */}
                <div className={`border-t ${border}`} />

                {/* ── Botones de exportación ── */}
                <p className={`text-xs font-semibold uppercase tracking-wider ${sub}`}>Exportar documento</p>

                <Button
                  onClick={generarPDF}
                  className="w-full h-11 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg shadow-purple-500/20"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar PDF Detallado
                </Button>

                <Button
                  onClick={imprimirCierre}
                  className="w-full h-11 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/20"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Cierre
                </Button>

                <Button
                  onClick={descargarTirilla}
                  className="w-full h-11 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Tirilla
                </Button>

                <button
                  onClick={onClose}
                  className={`w-full text-sm py-2 rounded-xl transition-colors ${sub} hover:text-purple-500`}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
