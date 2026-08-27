// CODEC POS v2.0 — Modal Vista Previa e Impresión de Factura de Venta
// Misma tecnología que ModalImprimirOrdenTaller y ModalExportarReporte

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Printer, FileText, Receipt, User, Calendar, CreditCard, MessageCircle, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { type Venta } from '../../lib/electronStore';
import { descargarFacturaPDF, enviarFacturaPorWhatsApp, enviarFacturaPorEmail } from '../../lib/pdfGenerator';
import { getConfiguredTicketWidthMm } from '../../lib/printerConfig';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';
import { getCached } from '../../lib/cachedLocalStorage';

// ── Config empresa ────────────────────────────────────────────────────────────

function getEmpresaConfig() {
  try {
    const c = getCached('codec_pos_config', {} as any);
    return {
      nombreComercial: (c.nombreComercial as string) || (c.razonSocial as string) || 'MI NEGOCIO',
      razonSocial:     (c.razonSocial as string)     || '',
      nit:             (c.nit as string)             || '',
      digitoVerificacion: (c.digitoVerificacion as string) || '',
      telefono:        (c.telefono as string)        || '',
      email:           (c.email as string)           || '',
      direccion:       (c.direccion as string)       || '',
      ciudad:          (c.ciudad as string)          || '',
      eslogan:         (c.eslogan as string)         || '',
      mensajeTirilla:  (c.mensajeTirilla as string)  || '¡Gracias por su compra!',
      logoUrl:         (c.logoUrl as string)         || '',
    };
  } catch {
    return {
      nombreComercial: 'MI NEGOCIO', razonSocial: '', nit: '', digitoVerificacion: '',
      telefono: '', email: '', direccion: '', ciudad: '', eslogan: '', mensajeTirilla: '', logoUrl: '',
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return `$${Number(n || 0).toLocaleString('es-CO')}`; }

function fmtFecha(s: string) {
  try {
    return new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return s; }
}

function fmtHora(s: string) {
  try {
    return new Date(s).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function metodoPagoLabel(m: string) {
  const map: Record<string, string> = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', nequi: 'Nequi',
    daviplata: 'Daviplata', transferencia: 'Transferencia', mixto: 'Pago Mixto',
    bancolombia: 'Bancolombia', bre_b: 'Bre-B',
  };
  return map[m?.toLowerCase()] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : 'N/D');
}

// ── Preview de la factura (tirilla) ──────────────────────────────────────────

function FacturaPreview({ venta }: { venta: Venta }) {
  const empresa = getEmpresaConfig();
  const subtotal = (venta as any).subtotal || venta.total;
  const iva      = (venta as any).iva      || 0;
  const nFactura = (venta as any).numeroFactura || venta.id;
  const mesaDisplay = (venta as any).referencia_mesa
    || (venta.mesa && venta.mesa !== 'General' && venta.mesa !== 'general' ? venta.mesa : null);
  const nitStr   = empresa.nit
    ? `NIT: ${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}`
    : '';

  const sep = <div style={{ borderTop: '1px dashed #444', margin: '5px 0' }} />;
  const row = (l: string, v: string | number, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11,
      fontWeight: bold ? 'bold' : 'normal', padding: '1.5px 0', color: '#000' }}>
      <span style={{ color: '#111', flexShrink: 0 }}>{l}</span>
      <span style={{ fontWeight: 'bold', color: '#000', textAlign: 'right' }}>{v}</span>
    </div>
  );

  return (
    <div
      style={{
        background: '#fff', color: '#000',
        fontFamily: "'Courier New', monospace",
        fontSize: 12, maxWidth: 290,
        margin: '0 auto', borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Encabezado empresa */}
      <div style={{ padding: '14px 18px 10px', textAlign: 'center',
        borderBottom: '2px solid #000', background: '#fff' }}>
        {empresa.logoUrl && (
          <img src={empresa.logoUrl} alt="Logo"
            style={{ maxHeight: 60, maxWidth: 160, margin: '0 auto 6px', objectFit: 'contain', display: 'block' }} />
        )}
        <div style={{ fontSize: 14, fontWeight: 900, color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {empresa.nombreComercial}
        </div>
        {empresa.razonSocial && empresa.razonSocial !== empresa.nombreComercial && (
          <div style={{ fontSize: 10, color: '#111', marginTop: 1 }}>{empresa.razonSocial}</div>
        )}
        {nitStr && <div style={{ fontSize: 10, color: '#111', marginTop: 1 }}>{nitStr}</div>}
        {(empresa.direccion || empresa.ciudad) && (
          <div style={{ fontSize: 10, color: '#111', marginTop: 1 }}>
            {empresa.direccion}{empresa.ciudad ? ` · ${empresa.ciudad}` : ''}
          </div>
        )}
        {empresa.telefono && <div style={{ fontSize: 10, color: '#111', marginTop: 1 }}>Tel: {empresa.telefono}</div>}
        {empresa.email && <div style={{ fontSize: 10, color: '#111', marginTop: 1 }}>{empresa.email}</div>}
        {empresa.eslogan && (
          <div style={{ fontSize: 10, fontStyle: 'italic', color: '#222', marginTop: 3 }}>"{empresa.eslogan}"</div>
        )}
      </div>

      {/* Título */}
      <div style={{ padding: '7px 18px', textAlign: 'center',
        borderBottom: '1px dashed #555', background: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.5px', color: '#000' }}>
          FACTURA DE VENTA
        </div>
        <div style={{ fontSize: 11, color: '#000', marginTop: 1 }}>N° {nFactura}</div>
      </div>

      {/* Info de la venta */}
      <div style={{ padding: '6px 18px', borderBottom: mesaDisplay ? 'none' : '1px solid #000', fontSize: 10, color: '#000', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000' }}>
          <span>Fecha:</span><span>{fmtFecha(venta.fecha)} {fmtHora(venta.fecha)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000', marginTop: 1 }}>
          <span>Cajero:</span><span>{venta.cajero}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000', marginTop: 1 }}>
          <span>Método:</span><span>{metodoPagoLabel(venta.metodoPago)}</span>
        </div>
      </div>

      {/* Ubicación mesa (si aplica) */}
      {mesaDisplay && (
        <div style={{ padding: '7px 18px', borderBottom: '1px solid #000', textAlign: 'center', background: '#1e293b' }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', letterSpacing: '0.5px', fontFamily: "'Courier New', monospace" }}>
            --------------------------------
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', margin: '2px 0' }}>
            UBICACIÓN: {mesaDisplay}
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', letterSpacing: '0.5px', fontFamily: "'Courier New', monospace" }}>
            --------------------------------
          </div>
        </div>
      )}

      {/* Ítems */}
      <div style={{ padding: '6px 18px', borderBottom: '1px solid #000', background: '#fff' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#000', marginBottom: 4, textTransform: 'uppercase' }}>
          Productos
        </div>
        {venta.items.map((it, i) => (
          <div key={i} style={{ marginBottom: 4, paddingBottom: 3,
            borderBottom: i < venta.items.length - 1 ? '1px dotted #ccc' : 'none' }}>
            <div style={{ fontSize: 10, color: '#000', fontWeight: 'bold' }}>
              {String(it.nombre || '').substring(0, 30)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#111', paddingLeft: 4 }}>
              <span>{it.cantidad} × {fmt(it.precio)}</span>
              <span style={{ fontWeight: 'bold', color: '#000' }}>{fmt(it.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Totales */}
      <div style={{ padding: '6px 18px', borderBottom: '2px solid #000', background: '#fff' }}>
        {row('Subtotal:', fmt(subtotal))}
        {iva > 0 && row('IVA:', fmt(iva))}
        {sep}
        {row('TOTAL:', fmt(venta.total), true)}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 18px 12px', textAlign: 'center',
        fontSize: 9, color: '#000', background: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: 10, color: '#000' }}>{empresa.nombreComercial}</div>
        {nitStr && <div style={{ color: '#000' }}>{nitStr}</div>}
        {(empresa.telefono || empresa.email) && (
          <div style={{ color: '#000' }}>{[empresa.telefono, empresa.email].filter(Boolean).join(' · ')}</div>
        )}
        {empresa.direccion && <div style={{ color: '#111' }}>{empresa.direccion}</div>}
        <div style={{ marginTop: 5, fontWeight: 600, fontSize: 10, color: '#000' }}>
          {empresa.mensajeTirilla || '¡Gracias por su compra!'}
        </div>
        <div style={{ color: '#444', marginTop: 2 }}>CODEC POS v2.0</div>
      </div>
    </div>
  );
}

// ── Función de impresión: usa el DOM YA RENDERIZADO del preview ──────────────
// 🖨️ FIX WYSIWYG: antes esta función construía su PROPIA plantilla HTML
// (tabla ancha estilo A4, con columnas y colores completamente distintos al
// preview angosto estilo tirilla que ve el usuario en pantalla). Esas dos
// plantillas se fueron desalineando con el tiempo — lo impreso NUNCA
// coincidía con "lo que se ve". Ahora se imprime el innerHTML EXACTO del
// componente <FacturaPreview> (capturado vía ref desde el modal), así que
// lo que el usuario ve en la vista previa es literalmente lo que se imprime.
function imprimirDesdeElemento(elemento: HTMLElement, nFactura: string) {
  const widthMm = getConfiguredTicketWidthMm();

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${nFactura}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm; background: #fff; }
</style>
</head>
<body>${elemento.innerHTML}</body></html>`;

  const printerName = getPrinterForSectionOrUndefined('pos_tickets');
  // silent=true cuando hay impresora POS configurada; false abre el diálogo nativo
  // del SO (permite "Imprimir como PDF" / "Microsoft Print to PDF" para pruebas).
  const silentMode = !!printerName;

  const el = (window as any).electron;

  // 1ª opción: API nativa Electron (print.printHtml) — con pageSize dinámico
  if (el?.print?.printHtml) {
    el.print.printHtml({ html, silent: silentMode, printerName, widthMm }).catch(() => {
      toast.error('Error al imprimir. Verifica la impresora configurada.');
    });
    toast.success(silentMode ? 'Imprimiendo factura…' : 'Abriendo diálogo de impresión…');
    return;
  }

  // 2ª opción: canal IPC directo 'print-ticket'
  const ipc = (window as any).ipcRenderer ?? el?.ipcRenderer;
  if (ipc?.send) {
    ipc.send('print-ticket', { html, silent: silentMode, printerName, widthMm });
    toast.success(silentMode ? 'Imprimiendo factura…' : 'Abriendo diálogo de impresión…');
    return;
  }

  // Fallback: diálogo nativo del navegador/OS (válido para pruebas con "PDF")
  const win = window.open('', '_blank', 'width=420,height=900');
  if (!win) {
    toast.error('Habilita las ventanas emergentes o configura una impresora en Dispositivos');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  venta: Venta | null;
  onClose: () => void;
  darkMode: boolean;
}

// ── Modal principal ───────────────────────────────────────────────────────────

export default function ModalImprimirFactura({ open, venta, onClose, darkMode }: Props) {
  const [busy, setBusy] = useState<'imprimir' | 'pdf' | 'whatsapp' | 'email' | null>(null);
  const [panelCompartir, setPanelCompartir] = useState<'whatsapp' | 'email' | null>(null);
  const [telefono, setTelefono] = useState('');
  const [emailDestino, setEmailDestino] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  if (!venta) return null;

  const nFactura = (venta as any).numeroFactura || venta.id;
  const subtotal = (venta as any).subtotal || venta.total;
  const iva      = (venta as any).iva      || 0;

  /** Mismos datos que ejecutarPDF() arma para descargarFacturaPDF — reutilizado por WhatsApp/Correo. */
  function datosParaCompartir() {
    const cfg = getCached('codec_pos_config', {} as any);
    return {
      venta: {
        numeroFactura: nFactura,
        fecha: venta!.fecha,
        items: venta!.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, subtotal: i.subtotal })),
        subtotal, iva, total: venta!.total,
        metodoPago: venta!.metodoPago,
        cajero: venta!.cajero,
        cliente: (venta as any).cliente || 'Consumidor Final',
      },
      config: {
        nombreComercial: cfg.nombreComercial || 'CODEC POS',
        razonSocial: cfg.razonSocial || '',
        nit: cfg.nit || '',
        direccion: cfg.direccion || '',
        telefono: cfg.telefono || '',
        email: cfg.email || '',
        ciudad: cfg.ciudad || '',
      },
    };
  }

  async function ejecutarWhatsApp() {
    if (!telefono.trim()) { toast.error('Ingresa el número de WhatsApp del cliente'); return; }
    setBusy('whatsapp');
    try {
      const { venta: v, config } = datosParaCompartir();
      await enviarFacturaPorWhatsApp(v, config, telefono.trim());
      toast.success('PDF descargado — WhatsApp se abrió con el mensaje listo, solo adjunta el archivo');
      setPanelCompartir(null);
    } catch {
      toast.error('No se pudo preparar el envío por WhatsApp');
    } finally {
      setBusy(null);
    }
  }

  async function ejecutarEmail() {
    if (!emailDestino.trim()) { toast.error('Ingresa el correo del cliente'); return; }
    setBusy('email');
    try {
      const { venta: v, config } = datosParaCompartir();
      await enviarFacturaPorEmail(v, config, emailDestino.trim());
      toast.success('PDF descargado — tu cliente de correo se abrió con el mensaje listo, solo adjunta el archivo');
      setPanelCompartir(null);
    } catch {
      toast.error('No se pudo preparar el envío por correo');
    } finally {
      setBusy(null);
    }
  }

  const dark = darkMode;
  const head    = dark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const panel   = dark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const kpiCard = dark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const textPrimary = dark ? 'text-white' : 'text-slate-900';
  const textMuted   = dark ? 'text-slate-400' : 'text-slate-500';

  function ejecutarImprimir() {
    setBusy('imprimir');
    try {
      if (previewRef.current) {
        imprimirDesdeElemento(previewRef.current, nFactura);
      } else {
        toast.error('No se pudo leer la vista previa de la factura');
      }
    } finally {
      setTimeout(() => { setBusy(null); onClose(); }, 400);
    }
  }

  async function ejecutarPDF() {
    setBusy('pdf');
    try {
      const cfg = getCached('codec_pos_config', {} as any);
      await descargarFacturaPDF(
        {
          numeroFactura: nFactura,
          fecha: venta.fecha,
          items: venta.items.map(i => ({
            nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, subtotal: i.subtotal,
          })),
          subtotal: subtotal,
          iva: iva,
          total: venta.total,
          metodoPago: venta.metodoPago,
          cajero: venta.cajero,
          cliente: (venta as any).cliente || 'Consumidor Final',
          mesa: venta.mesa,
          referencia_mesa: (venta as any).referencia_mesa || undefined,
        },
        {
          nombreComercial: cfg.nombreComercial || 'CODEC POS',
          razonSocial: cfg.razonSocial || '',
          nit: cfg.nit || '',
          direccion: cfg.direccion || '',
          telefono: cfg.telefono || '',
          email: cfg.email || '',
          ciudad: cfg.ciudad || '',
          logoUrl: cfg.logoUrl || '',
        }
      );
      toast.success(`PDF Factura ${nFactura} descargado`);
    } catch {
      toast.error('Error al generar el PDF');
    } finally {
      setTimeout(() => { setBusy(null); onClose(); }, 300);
    }
  }

  const empresa = getEmpresaConfig();

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
            className={`rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col ${dark ? '' : 'border bg-white border-slate-200 shadow-2xl'}`}
            style={dark ? { background: 'rgba(10,17,32,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.75), 0 12px 24px -8px rgba(0,0,0,0.5)' } : {}}
          >
            {/* ── Header ── */}
            <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${head}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow shrink-0">
                  <Receipt className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    {empresa.logoUrl && (
                      <img src={empresa.logoUrl} alt="Logo" className="h-6 max-w-[80px] object-contain shrink-0" />
                    )}
                    <span className={`font-black text-sm leading-none ${textPrimary}`}>
                      {empresa.nombreComercial}
                    </span>
                    {empresa.nit && (
                      <span className={`text-[10px] ${textMuted}`}>
                        NIT {empresa.nit}{empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}
                      </span>
                    )}
                  </div>
                  <h3 className={`font-semibold text-sm leading-tight ${textPrimary}`}>
                    Factura de Venta — Vista Previa
                  </h3>
                  <p className={`text-xs ${textMuted}`}>
                    {nFactura} · {venta.cajero} · {new Date(venta.fecha).toLocaleDateString('es-CO')}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0">
                <X className={`w-5 h-5 ${textMuted}`} />
              </button>
            </div>

            {/* ── Body: dos columnas ── */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

              {/* Panel izquierdo: preview — este mismo DOM es el que se imprime */}
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>
                  Vista previa de la factura
                </p>
                <div ref={previewRef}>
                  <FacturaPreview venta={venta} />
                </div>
              </div>

              {/* Panel derecho: KPIs + acciones */}
              <div
                className={`md:w-64 shrink-0 border-t md:border-t-0 md:border-l p-5 flex flex-col gap-4 max-h-[calc(90vh-80px)] overflow-y-auto scrollbar-none ${panel}`}
                style={{ borderColor: dark ? 'rgba(71,85,105,0.5)' : 'rgba(226,232,240,1)', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
              >
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${textMuted}`}>Resumen</p>
                  <div className="space-y-2">

                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Número de factura</p>
                      <p className={`text-sm font-black mt-0.5 font-mono ${textPrimary}`}>{nFactura}</p>
                    </div>

                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Calendar className={`w-3 h-3 ${textMuted}`} />
                        <p className={`text-[10px] ${textMuted}`}>Fecha</p>
                      </div>
                      <p className={`text-sm font-bold ${textPrimary}`}>
                        {new Date(venta.fecha).toLocaleDateString('es-CO')}
                      </p>
                      <p className={`text-xs ${textMuted}`}>
                        {new Date(venta.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <User className={`w-3 h-3 ${textMuted}`} />
                        <p className={`text-[10px] ${textMuted}`}>Cajero</p>
                      </div>
                      <p className={`text-sm font-bold ${textPrimary}`}>{venta.cajero}</p>
                    </div>

                    <div className={`rounded-xl p-3 border ${kpiCard}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CreditCard className={`w-3 h-3 ${textMuted}`} />
                        <p className={`text-[10px] ${textMuted}`}>Método de pago</p>
                      </div>
                      <p className={`text-sm font-bold ${textPrimary}`}>{metodoPagoLabel(venta.metodoPago)}</p>
                    </div>

                    <div className={`rounded-xl p-3 border border-emerald-500/30 ${kpiCard}`}>
                      <p className={`text-[10px] ${textMuted}`}>Total facturado</p>
                      <p className="text-lg font-black mt-0.5 text-emerald-500">
                        ${Number(venta.total).toLocaleString('es-CO')}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>{venta.items.length} producto(s)</p>
                    </div>

                    {iva > 0 && (
                      <div className={`rounded-xl p-3 border ${kpiCard}`}>
                        <p className={`text-[10px] ${textMuted}`}>IVA incluido</p>
                        <p className={`text-sm font-bold mt-0.5 ${textPrimary}`}>${Number(iva).toLocaleString('es-CO')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="space-y-2 mt-auto">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>Exportar</p>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={ejecutarImprimir}
                    disabled={!!busy}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow"
                    style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
                  >
                    {busy === 'imprimir'
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Printer className="w-4 h-4 shrink-0" />
                    }
                    {busy === 'imprimir' ? 'Abriendo…' : 'Imprimir Factura'}
                  </motion.button>

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

                  <p className={`text-xs font-semibold uppercase tracking-wider pt-2 ${textMuted}`}>Compartir</p>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setPanelCompartir(panelCompartir === 'whatsapp' ? null : 'whatsapp')}
                    disabled={!!busy}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed border ${
                      panelCompartir === 'whatsapp' ? 'border-emerald-500/60' : dark ? 'border-white/10' : 'border-slate-200'
                    } ${textPrimary}`}
                  >
                    <MessageCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                    WhatsApp
                  </motion.button>

                  {panelCompartir === 'whatsapp' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-1.5">
                      <input
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="300 000 0000"
                        className={`flex-1 min-w-0 h-10 rounded-lg px-3 text-sm border ${dark ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500' : 'bg-white border-slate-300'}`}
                      />
                      <button
                        onClick={ejecutarWhatsApp}
                        disabled={busy === 'whatsapp'}
                        className="shrink-0 w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center disabled:opacity-60"
                      >
                        {busy === 'whatsapp' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                      </button>
                    </motion.div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setPanelCompartir(panelCompartir === 'email' ? null : 'email')}
                    disabled={!!busy}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed border ${
                      panelCompartir === 'email' ? 'border-sky-500/60' : dark ? 'border-white/10' : 'border-slate-200'
                    } ${textPrimary}`}
                  >
                    <Mail className="w-4 h-4 shrink-0 text-sky-500" />
                    Correo
                  </motion.button>

                  {panelCompartir === 'email' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-1.5">
                      <input
                        type="email"
                        value={emailDestino}
                        onChange={(e) => setEmailDestino(e.target.value)}
                        placeholder="cliente@correo.com"
                        className={`flex-1 min-w-0 h-10 rounded-lg px-3 text-sm border ${dark ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500' : 'bg-white border-slate-300'}`}
                      />
                      <button
                        onClick={ejecutarEmail}
                        disabled={busy === 'email'}
                        className="shrink-0 w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center disabled:opacity-60"
                      >
                        {busy === 'email' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                      </button>
                    </motion.div>
                  )}

                  {panelCompartir && (
                    <p className={`text-[10px] leading-snug ${textMuted}`}>
                      El PDF se descarga automáticamente y {panelCompartir === 'whatsapp' ? 'WhatsApp' : 'tu correo'} se abre con el mensaje listo — solo falta adjuntar el archivo descargado.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
