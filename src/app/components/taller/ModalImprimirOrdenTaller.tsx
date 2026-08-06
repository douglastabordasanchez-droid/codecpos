// CODEC POS v2.0 — Modal de Vista Previa e Impresión de Orden de Servicio
// Muestra preview de la orden antes de imprimir / descargar PDF / TXT

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X, Printer, FileText, Download, Wrench, User, Smartphone,
  DollarSign, CheckCircle, AlertCircle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { printWorkshopReceipt } from '../../lib/thermalPrinter';
import { type OrdenServicio, ESTADOS_ORDEN, TIPOS_DISPOSITIVO } from '../../types/taller';

// ── Config de empresa ────────────────────────────────────────────────────────

function getEmpresaConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
    return {
      razonSocial:     (c.razonSocial as string)       || (c.nombreComercial as string) || 'SERVICIO TÉCNICO',
      nombreComercial: (c.nombreComercial as string)   || (c.razonSocial as string)     || 'SERVICIO TÉCNICO',
      nit:             (c.nit as string)               || '',
      digitoVerificacion: (c.digitoVerificacion as string) || '',
      telefono:        (c.telefono as string)          || '',
      email:           (c.email as string)             || '',
      direccion:       (c.direccion as string)         || '',
      ciudad:          (c.ciudad as string)            || '',
      eslogan:         (c.eslogan as string)           || '',
      mensajeTirilla:  (c.mensajeTirilla as string)    || '¡Gracias por confiar en nosotros!',
      logoUrl:         (c.logoUrl as string)           || '',
    };
  } catch {
    return {
      razonSocial: 'SERVICIO TÉCNICO', nombreComercial: 'SERVICIO TÉCNICO',
      nit: '', digitoVerificacion: '', telefono: '', email: '', direccion: '', ciudad: '',
      eslogan: '', mensajeTirilla: '', logoUrl: '',
    };
  }
}

// ── Helpers de formato ───────────────────────────────────────────────────────

function fmt(n: number) { return `$${Number(n || 0).toLocaleString('es-CO')}`; }
function fmtFecha(s?: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { return s; }
}

// ── Preview del recibo ───────────────────────────────────────────────────────

function OrdenPreview({ orden }: { orden: OrdenServicio }) {
  const empresa = getEmpresaConfig();
  const totalPagado = orden.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const saldo = Math.max(0, (orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado) - totalPagado);
  const tipoLabel = TIPOS_DISPOSITIVO.find(t => t.value === orden.dispositivo.tipo)?.label ?? orden.dispositivo.tipo;
  const estadoLabel = ESTADOS_ORDEN.find(e => e.value === orden.estado)?.label ?? orden.estado;

  const linea = <div className="border-t border-dashed border-slate-200 my-2" />;
  const row = (l: string, v?: string | number | null) => v !== undefined && v !== null && v !== '' && (
    <div className="flex justify-between gap-2 text-[11px] py-0.5">
      <span className="text-slate-700 shrink-0">{l}</span>
      <span className="text-slate-800 font-medium text-right">{v}</span>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-inner p-4 font-mono text-[11px] max-w-[280px] mx-auto select-none"
      style={{ border: '1px solid #e2e8f0' }}>

      {/* Encabezado empresa */}
      <div className="text-center mb-2">
        {empresa.logoUrl && (
          <img src={empresa.logoUrl} alt="Logo"
            style={{ maxHeight: 60, maxWidth: 160, margin: '0 auto 6px', objectFit: 'contain', display: 'block' }} />
        )}
        <p className="font-black text-sm text-slate-900 uppercase tracking-wide leading-tight">{empresa.nombreComercial}</p>
        {empresa.eslogan && <p className="text-[10px] text-slate-700 mt-0.5 italic">{empresa.eslogan}</p>}
        {empresa.direccion && <p className="text-[10px] text-slate-700">{empresa.direccion}{empresa.ciudad ? ` — ${empresa.ciudad}` : ''}</p>}
        {empresa.telefono && <p className="text-[10px] text-slate-700">Tel: {empresa.telefono}</p>}
        {empresa.email && <p className="text-[10px] text-slate-700">{empresa.email}</p>}
        {empresa.nit && <p className="text-[10px] text-slate-700">NIT: {empresa.nit}</p>}
      </div>

      <div className="border-t-2 border-slate-800 mb-2" />
      <p className="text-center font-black text-[13px] text-slate-900 mb-1 tracking-widest">ORDEN DE SERVICIO</p>
      <div className="text-center mb-2">
        <span className="text-base font-black text-slate-900">{orden.numeroOrden}</span>
      </div>
      {linea}

      {/* Fechas y estado */}
      {row('Recepción', fmtFecha(orden.fechaRecepcion))}
      {orden.fechaEstimadaEntrega && row('Entrega est.', fmtFecha(orden.fechaEstimadaEntrega))}
      {row('Estado', estadoLabel)}
      {row('Prioridad', orden.prioridad?.toUpperCase())}
      {linea}

      {/* Cliente */}
      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">CLIENTE</p>
      {row('Nombre', orden.cliente.nombre)}
      {row('Teléfono', orden.cliente.telefono)}
      {orden.cliente.cedula && row('Cédula/NIT', orden.cliente.cedula)}
      {linea}

      {/* Dispositivo */}
      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">DISPOSITIVO</p>
      {row('Tipo', tipoLabel)}
      {row('Marca', orden.dispositivo.marca)}
      {row('Modelo', orden.dispositivo.modelo)}
      {orden.dispositivo.serial && row('Serial', orden.dispositivo.serial)}
      {orden.dispositivo.imei && row('IMEI', orden.dispositivo.imei)}
      {orden.dispositivo.condicionFisica && row('Condición', orden.dispositivo.condicionFisica)}
      {orden.dispositivo.accesorios?.length ? row('Accesorios', orden.dispositivo.accesorios.join(', ')) : null}
      {linea}

      {/* Problema */}
      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">FALLA REPORTADA</p>
      <p className="text-slate-700 text-[10px] leading-relaxed">{orden.problemaReportado.descripcion}</p>
      {orden.problemaReportado.sintomas?.length ? (
        <p className="text-slate-700 text-[10px] mt-0.5">Síntomas: {orden.problemaReportado.sintomas.join(', ')}</p>
      ) : null}
      {linea}

      {/* Costos */}
      <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">COSTOS</p>
      {row('Costo estimado', fmt(orden.costoEstimado))}
      {orden.costoFinal > 0 && row('Costo final', fmt(orden.costoFinal))}
      {row('Anticipo pagado', fmt(totalPagado))}
      <div className="flex justify-between gap-2 text-[11px] py-0.5 font-black">
        <span className={saldo > 0 ? 'text-red-600' : 'text-emerald-600'}>SALDO PENDIENTE</span>
        <span className={saldo > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(saldo)}</span>
      </div>
      {linea}

      {/* Técnico */}
      {orden.tecnicoAsignado && (
        <>
          {row('Técnico asignado', orden.tecnicoAsignado)}
          {linea}
        </>
      )}

      {/* Garantía */}
      {orden.garantia?.activa && (
        <>
          <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">GARANTÍA</p>
          {row('Días de garantía', `${orden.garantia.diasGarantia} días`)}
          {row('Vence', fmtFecha(orden.garantia.fechaVencimiento))}
          {row('Cobertura', orden.garantia.cobertura)}
          {linea}
        </>
      )}

      {/* Firmas */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="border-t border-slate-400 mt-6 pt-1">
            <p className="text-[9px] text-slate-700">Entregado por</p>
          </div>
        </div>
        <div className="text-center">
          <div className="border-t border-slate-400 mt-6 pt-1">
            <p className="text-[9px] text-slate-700">Recibido por</p>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-[9px] text-slate-600">{empresa.mensajeTirilla}</p>
        {empresa.email && <p className="text-[9px] text-slate-600">{empresa.email}</p>}
        <p className="text-[9px] text-slate-600 mt-0.5">
          Generado: {new Date().toLocaleDateString('es-CO')}
        </p>
      </div>
    </div>
  );
}

// ── Generador de PDF ─────────────────────────────────────────────────────────

function generarPDF(orden: OrdenServicio) {
  const empresa = getEmpresaConfig();
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  let y = 15;

  const nl = (extra = 4) => { y += extra; };
  const sep = () => { doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(10, y, W - 10, y); nl(4); };
  const titulo = (t: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
    doc.text(t.toUpperCase(), 10, y); nl(5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  };
  const fila = (label: string, valor: string) => {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60); doc.text(label, 10, y);
    doc.setTextColor(30, 30, 30); doc.text(valor, W / 2, y); nl(5);
  };

  const totalPagado = orden.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const saldo = Math.max(0, (orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado) - totalPagado);
  const tipoLabel = TIPOS_DISPOSITIVO.find(t => t.value === orden.dispositivo.tipo)?.label ?? orden.dispositivo.tipo;
  const estadoLabel = ESTADOS_ORDEN.find(e => e.value === orden.estado)?.label ?? orden.estado;

  // Header empresa — logo si existe
  if (empresa.logoUrl) {
    try {
      const ext = empresa.logoUrl.startsWith('data:image/png') ? 'PNG'
                : empresa.logoUrl.startsWith('data:image/jpg') || empresa.logoUrl.startsWith('data:image/jpeg') ? 'JPEG'
                : 'PNG';
      const logoH = 18;
      const logoW = 40;
      doc.addImage(empresa.logoUrl, ext, (W - logoW) / 2, y, logoW, logoH); nl(logoH + 4);
    } catch { /* logo no cargó */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
  doc.text(empresa.nombreComercial.toUpperCase(), W / 2, y, { align: 'center' }); nl(6);
  if (empresa.eslogan) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(50);
    doc.text(empresa.eslogan, W / 2, y, { align: 'center' }); nl(5);
  }
  if (empresa.direccion) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50);
    doc.text(empresa.direccion + (empresa.ciudad ? ` | ${empresa.ciudad}` : ''), W / 2, y, { align: 'center' }); nl(4);
  }
  if (empresa.telefono || empresa.email) {
    doc.setFontSize(8); doc.setTextColor(50);
    doc.text([empresa.telefono, empresa.email].filter(Boolean).join(' | '), W / 2, y, { align: 'center' }); nl(4);
  }
  if (empresa.nit) {
    doc.setFontSize(8); doc.setTextColor(50);
    const nitStr = `NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`;
    doc.text(nitStr, W / 2, y, { align: 'center' }); nl(4);
  }

  // Título orden
  doc.setDrawColor(20); doc.setLineWidth(0.6); doc.line(10, y, W - 10, y); nl(5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
  doc.text('ORDEN DE SERVICIO', W / 2, y, { align: 'center' }); nl(6);
  doc.setFontSize(16); doc.text(orden.numeroOrden, W / 2, y, { align: 'center' }); nl(7);
  sep();

  // Fechas y estado
  titulo('Información General');
  fila('Recepción:', fmtFecha(orden.fechaRecepcion));
  if (orden.fechaEstimadaEntrega) fila('Entrega estimada:', fmtFecha(orden.fechaEstimadaEntrega));
  fila('Estado actual:', estadoLabel);
  fila('Prioridad:', (orden.prioridad ?? '—').toUpperCase());
  sep();

  // Cliente
  titulo('Datos del Cliente');
  fila('Nombre:', orden.cliente.nombre);
  fila('Teléfono:', orden.cliente.telefono);
  if (orden.cliente.cedula) fila('Cédula/NIT:', orden.cliente.cedula);
  sep();

  // Dispositivo
  titulo('Dispositivo');
  fila('Tipo:', tipoLabel);
  fila('Marca / Modelo:', `${orden.dispositivo.marca} ${orden.dispositivo.modelo}`);
  if (orden.dispositivo.serial) fila('Serial:', orden.dispositivo.serial);
  if (orden.dispositivo.imei) fila('IMEI:', orden.dispositivo.imei);
  if (orden.dispositivo.condicionFisica) fila('Condición física:', orden.dispositivo.condicionFisica);
  if (orden.dispositivo.accesorios?.length) fila('Accesorios:', orden.dispositivo.accesorios.join(', '));
  sep();

  // Problema
  titulo('Falla Reportada');
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  const problemLines = doc.splitTextToSize(orden.problemaReportado.descripcion, W - 20);
  doc.text(problemLines, 10, y); nl(problemLines.length * 5);
  if (orden.problemaReportado.sintomas?.length) {
    doc.setTextColor(40);
    const sintLines = doc.splitTextToSize(`Síntomas: ${orden.problemaReportado.sintomas.join(', ')}`, W - 20);
    doc.text(sintLines, 10, y); nl(sintLines.length * 5);
  }
  sep();

  // Costos
  titulo('Resumen Financiero');
  fila('Costo estimado:', fmt(orden.costoEstimado));
  if (orden.costoFinal > 0) fila('Costo final:', fmt(orden.costoFinal));
  fila('Total pagado:', fmt(totalPagado));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(saldo > 0 ? 180 : 30, saldo > 0 ? 30 : 140, 30);
  doc.text('SALDO PENDIENTE:', 10, y);
  doc.text(fmt(saldo), W / 2, y);
  doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); nl(6);
  sep();

  // Técnico
  if (orden.tecnicoAsignado) {
    titulo('Técnico Responsable');
    fila('Asignado a:', orden.tecnicoAsignado);
    sep();
  }

  // Garantía
  if (orden.garantia?.activa) {
    titulo('Garantía');
    fila('Días de garantía:', `${orden.garantia.diasGarantia} días`);
    fila('Vigente hasta:', fmtFecha(orden.garantia.fechaVencimiento));
    fila('Cobertura:', orden.garantia.cobertura);
    sep();
  }

  // Firmas
  if (y < doc.internal.pageSize.getHeight() - 40) {
    nl(8);
    doc.setDrawColor(150); doc.setLineWidth(0.4);
    doc.line(15, y, W / 2 - 5, y);
    doc.line(W / 2 + 5, y, W - 15, y);
    nl(4);
    doc.setFontSize(7); doc.setTextColor(50);
    doc.text('Entregado por', (15 + W / 2 - 5) / 2, y, { align: 'center' });
    doc.text('Recibido por cliente', (W / 2 + 5 + W - 15) / 2, y, { align: 'center' });
  }

  doc.save(`Orden-Servicio-${orden.numeroOrden}.pdf`);
}

// ── Generador de TXT ─────────────────────────────────────────────────────────

function descargarTXT(orden: OrdenServicio) {
  const empresa = getEmpresaConfig();
  const totalPagado = orden.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const saldo = Math.max(0, (orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado) - totalPagado);
  const tipoLabel = TIPOS_DISPOSITIVO.find(t => t.value === orden.dispositivo.tipo)?.label ?? orden.dispositivo.tipo;
  const estadoLabel = ESTADOS_ORDEN.find(e => e.value === orden.estado)?.label ?? orden.estado;
  const sep = '─'.repeat(40);
  const row = (l: string, v: string) => `${l.padEnd(20)}: ${v}`;
  const lines = [
    sep,
    empresa.nombreComercial.toUpperCase().padStart(30),
    empresa.eslogan ? empresa.eslogan.padStart(30) : '',
    empresa.direccion ? empresa.direccion.padStart(30) : '',
    empresa.telefono ? `Tel: ${empresa.telefono}`.padStart(25) : '',
    empresa.nit ? `NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`.padStart(28) : '',
    sep,
    '         ORDEN DE SERVICIO',
    `          ${orden.numeroOrden}`,
    sep,
    row('Recepción', fmtFecha(orden.fechaRecepcion)),
    orden.fechaEstimadaEntrega ? row('Entrega est.', fmtFecha(orden.fechaEstimadaEntrega)) : '',
    row('Estado', estadoLabel),
    row('Prioridad', (orden.prioridad ?? '—').toUpperCase()),
    sep,
    '  CLIENTE',
    row('Nombre', orden.cliente.nombre),
    row('Teléfono', orden.cliente.telefono),
    orden.cliente.cedula ? row('Cédula/NIT', orden.cliente.cedula) : '',
    sep,
    '  DISPOSITIVO',
    row('Tipo', tipoLabel),
    row('Marca', orden.dispositivo.marca),
    row('Modelo', orden.dispositivo.modelo),
    orden.dispositivo.serial ? row('Serial', orden.dispositivo.serial) : '',
    orden.dispositivo.imei ? row('IMEI', orden.dispositivo.imei) : '',
    orden.dispositivo.condicionFisica ? row('Condición', orden.dispositivo.condicionFisica) : '',
    orden.dispositivo.accesorios?.length ? row('Accesorios', orden.dispositivo.accesorios.join(', ')) : '',
    sep,
    '  FALLA REPORTADA',
    orden.problemaReportado.descripcion,
    orden.problemaReportado.sintomas?.length ? `Síntomas: ${orden.problemaReportado.sintomas.join(', ')}` : '',
    sep,
    '  COSTOS',
    row('Costo estimado', fmt(orden.costoEstimado)),
    orden.costoFinal > 0 ? row('Costo final', fmt(orden.costoFinal)) : '',
    row('Total pagado', fmt(totalPagado)),
    row('SALDO PENDIENTE', fmt(saldo)),
    sep,
    orden.tecnicoAsignado ? row('Técnico', orden.tecnicoAsignado) : '',
    sep,
    '',
    empresa.mensajeTirilla,
    '',
    `Generado: ${new Date().toLocaleDateString('es-CO')}`,
    sep,
  ].filter(l => l !== undefined).join('\n');

  const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Orden-${orden.numeroOrden}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal principal ──────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  orden: OrdenServicio | null;
  onClose: () => void;
  darkMode: boolean;
}

export default function ModalImprimirOrdenTaller({ open, orden, onClose, darkMode }: Props) {
  const [busy, setBusy] = useState<'tirilla' | 'pdf' | 'txt' | null>(null);

  if (!orden) return null;

  const totalPagado = orden.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const saldo = Math.max(0, (orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado) - totalPagado);
  const estadoLabel = ESTADOS_ORDEN.find(e => e.value === orden.estado)?.label ?? orden.estado;
  const tipoLabel = TIPOS_DISPOSITIVO.find(t => t.value === orden.dispositivo.tipo)?.label ?? orden.dispositivo.tipo;

  const dark = darkMode;
  const bg = dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const head = dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';
  const panel = dark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200';
  const textPrimary = dark ? 'text-white' : 'text-slate-900';
  const textMuted = dark ? 'text-slate-600' : 'text-slate-700';
  const kpiCard = dark ? 'bg-slate-700/60 border-slate-600' : 'bg-white border-slate-200';

  async function ejecutarTirilla() {
    setBusy('tirilla');
    try {
      const ok = await printWorkshopReceipt({
        numeroOrden: orden.numeroOrden,
        fechaRecepcion: orden.fechaRecepcion,
        cliente: { nombre: orden.cliente.nombre, telefono: orden.cliente.telefono, cedula: orden.cliente.cedula },
        dispositivo: {
          tipo: tipoLabel,
          marca: orden.dispositivo.marca,
          modelo: orden.dispositivo.modelo,
          serial: orden.dispositivo.serial,
          imei: orden.dispositivo.imei,
        },
        problemaReportado: [
          orden.problemaReportado.descripcion,
          orden.problemaReportado.sintomas?.length ? `Síntomas: ${orden.problemaReportado.sintomas.join(', ')}` : '',
        ].filter(Boolean).join(' | '),
        costoEstimado: orden.costoEstimado,
        anticipo: totalPagado,
        saldoPendiente: saldo,
        tecnicoAsignado: orden.tecnicoAsignado,
        condicionFisica: orden.dispositivo.condicionFisica,
        accesorios: orden.dispositivo.accesorios?.length ? orden.dispositivo.accesorios.join(', ') : undefined,
      });
      ok ? toast.success('Ticket enviado a la impresora') : toast.error('Impresora no conectada. Verifícala en Dispositivos.');
    } finally {
      setBusy(null);
      setTimeout(onClose, 300);
    }
  }

  function ejecutarPDF() {
    setBusy('pdf');
    try { generarPDF(orden); toast.success(`PDF guardado: Orden-${orden.numeroOrden}.pdf`); }
    catch { toast.error('Error al generar el PDF'); }
    finally { setBusy(null); setTimeout(onClose, 300); }
  }

  function ejecutarTXT() {
    setBusy('txt');
    try { descargarTXT(orden); toast.success(`Archivo TXT descargado`); }
    catch { toast.error('Error al generar el archivo'); }
    finally { setBusy(null); setTimeout(onClose, 300); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className={`rounded-2xl shadow-2xl border w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col ${bg}`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${head}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow shrink-0">
                  <Wrench className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  {(() => {
                    const emp = getEmpresaConfig();
                    return (
                      <div className="flex items-center gap-2 mb-0.5">
                        {emp.logoUrl && (
                          <img src={emp.logoUrl} alt="Logo" className="h-6 max-w-[80px] object-contain shrink-0" />
                        )}
                        <span className={`font-black text-sm leading-none ${textPrimary}`}>
                          {emp.nombreComercial}
                        </span>
                        {emp.nit && (
                          <span className={`text-[10px] ${textMuted}`}>
                            NIT {emp.nit}{emp.digitoVerificacion ? `-${emp.digitoVerificacion}` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <h3 className={`font-semibold text-sm leading-tight ${textPrimary}`}>Orden de Servicio — Vista Previa</h3>
                  <p className={`text-xs ${textMuted}`}>
                    {orden.numeroOrden} · {orden.cliente.nombre} · {tipoLabel} {orden.dispositivo.marca} {orden.dispositivo.modelo}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0">
                <X className={`w-5 h-5 ${textMuted}`} />
              </button>
            </div>

            {/* Body: dos columnas */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

              {/* Panel izquierdo: preview recibo */}
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>Vista previa del ticket</p>
                <OrdenPreview orden={orden} />
              </div>

              {/* Panel derecho: KPIs + acciones */}
              <div className={`md:w-64 shrink-0 border-t md:border-t-0 md:border-l p-5 flex flex-col gap-4 ${panel}`}
                style={{ borderColor: dark ? 'rgba(71,85,105,0.5)' : 'rgba(226,232,240,1)' }}>

                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${textMuted}`}>Resumen</p>
                  <div className="space-y-2">
                    {/* Orden # */}
                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Número de orden</p>
                      <p className={`text-sm font-black mt-0.5 ${textPrimary}`}>{orden.numeroOrden}</p>
                    </div>

                    {/* Estado */}
                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Estado actual</p>
                      <p className={`text-sm font-bold mt-0.5 ${textPrimary}`}>{estadoLabel}</p>
                    </div>

                    {/* Costo */}
                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Costo estimado</p>
                      <p className={`text-sm font-black mt-0.5 ${textPrimary}`}>{fmt(orden.costoEstimado)}</p>
                    </div>

                    {/* Anticipo */}
                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Total pagado</p>
                      <p className="text-sm font-black mt-0.5 text-emerald-500">{fmt(totalPagado)}</p>
                    </div>

                    {/* Saldo */}
                    <div className={`rounded-xl p-3 border ${kpiCard} ${saldo > 0 ? 'border-red-500/30' : 'border-emerald-500/30'}`}>
                      <p className={`text-[10px] ${textMuted}`}>Saldo pendiente</p>
                      <p className={`text-sm font-black mt-0.5 ${saldo > 0 ? 'text-red-400' : 'text-emerald-500'}`}>{fmt(saldo)}</p>
                    </div>

                    {/* Técnico */}
                    {orden.tecnicoAsignado && (
                      <div className={`rounded-xl p-3 border ${kpiCard}`}>
                        <p className={`text-[10px] ${textMuted}`}>Técnico</p>
                        <p className={`text-sm font-bold mt-0.5 ${textPrimary}`}>{orden.tecnicoAsignado}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="space-y-2 mt-auto">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>Exportar</p>

                  {/* Imprimir Tirilla */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={ejecutarTirilla}
                    disabled={!!busy}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow"
                    style={{ background: 'linear-gradient(135deg,#2563eb,#0ea5e9)' }}
                  >
                    {busy === 'tirilla'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Printer className="w-4 h-4 shrink-0" />
                    }
                    {busy === 'tirilla' ? 'Imprimiendo…' : 'Imprimir Tirilla'}
                  </motion.button>

                  {/* Descargar PDF */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={ejecutarPDF}
                    disabled={!!busy}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
                  >
                    {busy === 'pdf'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <FileText className="w-4 h-4 shrink-0" />
                    }
                    {busy === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
                  </motion.button>

                  {/* Descargar TXT */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={ejecutarTXT}
                    disabled={!!busy}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed border ${
                      dark
                        ? 'border-slate-600 text-slate-200 hover:bg-slate-700'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {busy === 'txt'
                      ? <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${dark ? 'border-slate-300' : 'border-slate-500'}`} />
                      : <Download className="w-4 h-4 shrink-0" />
                    }
                    {busy === 'txt' ? 'Descargando…' : 'Descargar TXT'}
                  </motion.button>

                  <button
                    onClick={onClose}
                    disabled={!!busy}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                      dark ? 'text-slate-700 hover:text-slate-300' : 'text-slate-600 hover:text-slate-600'
                    }`}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
