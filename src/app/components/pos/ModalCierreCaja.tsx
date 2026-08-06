import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Printer,
  Download,
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Banknote,
  CreditCard,
  Wallet,
  Clock,
  User,
  TrendingUp,
  Save,
  FileText,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import TirillaCierreCaja from './TirillaCierreCaja';
export type { ProductoTop, CierreDataModal } from './TirillaCierreCaja';
import type { CierreDataModal } from './TirillaCierreCaja';
import { getConfiguredTicketWidthMm } from '../../lib/printerConfig';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmar: (tipo: 'imprimir' | 'descargar' | 'guardar') => Promise<void>;
  data: CierreDataModal | null;
  darkMode: boolean;
}

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

export default function ModalCierreCaja({ open, onClose, onConfirmar, data, darkMode }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<'imprimir' | 'descargar' | 'guardar' | null>(null);

  if (!data) return null;

  const horaApertura = (() => {
    try { return format(new Date(data.fechaApertura), 'HH:mm', { locale: es }); }
    catch { return '--:--'; }
  })();

  const horaCierre = (() => {
    try { return format(new Date(data.fechaCierre), 'HH:mm', { locale: es }); }
    catch { return format(new Date(), 'HH:mm', { locale: es }); }
  })();

  const handleAction = async (tipo: 'imprimir' | 'descargar' | 'guardar') => {
    if (tipo === 'descargar') triggerDownload();
    if (tipo === 'imprimir') triggerPrint();
    setLoading(tipo);
    try {
      await onConfirmar(tipo);
    } catch { /* error ya manejado en confirmarCierre */ }
    finally {
      setLoading(null);
      // Garantiza que el modal siempre se cierre después de la acción
      onClose();
    }
  };

  // Imprime la MISMA tirilla que se ve en la vista previa (misma ref/innerHTML).
  // Antes esto abría una ventana emergente con `window.print()` sin fijar el
  // tamaño de página del papel térmico (`@page size`), dejando que el sistema
  // operativo decidiera el tamaño (típicamente Carta/A4) — eso hacía que el
  // driver de la impresora térmica reflowara/perdiera la alineación de las
  // tablas. Ahora usa el mismo canal robusto de Electron que ya se usa en
  // ModalDetalleCierre (impresión silenciosa a la impresora configurada, con
  // el ancho real del papel), con la ventana emergente solo como último
  // respaldo — y esa también fija el tamaño de página correctamente.
  const triggerPrint = () => {
    const el = printRef.current;
    if (!el) return;

    const widthMm = getConfiguredTicketWidthMm();
    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Cierre de Caja</title>
      <style>
        @page{size:${widthMm}mm auto;margin:2mm;}
        body{margin:0;padding:4mm;font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;}
        .print-receipt{max-width:320px;margin:0 auto;}
      </style>
    </head><body><div class="print-receipt">${el.innerHTML}</div></body></html>`;

    const printerName = getPrinterForSectionOrUndefined('cierre_caja');
    const silentMode = !!printerName;
    const electron = (window as any).electron;

    if (electron?.print?.printHtml) {
      electron.print.printHtml({ html, silent: silentMode, printerName, widthMm }).catch(() => {
        toast.error('Error al imprimir. Verifica la impresora configurada.');
      });
      return;
    }

    const ipc = (window as any).ipcRenderer ?? electron?.ipcRenderer;
    if (ipc?.send) {
      ipc.send('print-ticket', { html, silent: silentMode, printerName, widthMm });
      return;
    }

    const w = window.open('', '_blank', 'width=420,height=900');
    if (!w) { toast.error('Habilita las ventanas emergentes para imprimir'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  const triggerDownload = () => {
    const el = printRef.current;
    if (!el) return;
    const text = el.innerText || el.textContent || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cierre-Caja-${format(new Date(), 'yyyy-MM-dd_HH-mm')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const estadoColor = {
    cuadrado: { text: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle className="w-8 h-8 text-emerald-500" />, label: 'CAJA CUADRADA', badge: 'bg-emerald-500' },
    faltante:  { text: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/30',         icon: <XCircle className="w-8 h-8 text-red-500" />,       label: 'FALTANTE EN CAJA', badge: 'bg-red-500' },
    sobrante:  { text: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/30',     icon: <AlertTriangle className="w-8 h-8 text-amber-500" />, label: 'SOBRANTE EN CAJA', badge: 'bg-amber-500' },
  }[data.estado];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[200] flex items-center justify-center p-3 md:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] border ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}
          >
            {/* ─── Botón Cerrar ─── */}
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* ═══════════════════════════════════════
                PANEL IZQUIERDO — Vista previa
            ═══════════════════════════════════════ */}
            <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                Vista previa del documento
              </p>

              {/* ── Recibo simulando papel (tirilla oficial de cierre) ── */}
              <TirillaCierreCaja ref={printRef} data={data} />
            </div>

            {/* ═══════════════════════════════════════
                PANEL DERECHO — Resumen + Acciones
            ═══════════════════════════════════════ */}
            <div className={`w-full lg:w-80 flex-shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              {/* Header panel derecho */}
              <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 mb-1">
                  <FileText className={`w-5 h-5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Cierre de Caja
                  </h2>
                </div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Revisa el resumen antes de confirmar
                </p>
              </div>

              {/* Métricas rápidas */}
              <div className={`p-6 space-y-3 border-b flex-1 overflow-y-auto ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                {/* Cajero y hora */}
                <div className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                  <User className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Cajero</p>
                    <p className={`font-semibold text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{data.cajero}</p>
                  </div>
                </div>

                <div className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                  <Clock className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                  <div>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Turno</p>
                    <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{horaApertura} → {horaCierre}</p>
                  </div>
                </div>

                {/* Total ventas */}
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    <p className={`text-xs font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>TOTAL VENDIDO</p>
                  </div>
                  <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(data.totalSistema)}</p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{data.cantidadTransacciones} transacciones</p>
                </div>

                {/* Desglose pago */}
                <div className="space-y-2">
                  {data.desglose.efectivo > 0 && (
                    <div className={`flex items-center justify-between p-2.5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        <Banknote className="w-3.5 h-3.5 text-green-500" />
                        <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Efectivo</span>
                      </div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(data.desglose.efectivo)}</span>
                    </div>
                  )}
                  {data.desglose.tarjeta > 0 && (
                    <div className={`flex items-center justify-between p-2.5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                        <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Tarjeta</span>
                      </div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(data.desglose.tarjeta)}</span>
                    </div>
                  )}
                  {(data.desglose.nequi + data.desglose.daviplata + data.desglose.transferencia) > 0 && (
                    <div className={`flex items-center justify-between p-2.5 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        <Wallet className="w-3.5 h-3.5 text-purple-500" />
                        <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Digital</span>
                      </div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {fmt(data.desglose.nequi + data.desglose.daviplata + data.desglose.transferencia)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Estado del cierre */}
                <div className={`p-4 rounded-xl border-2 ${estadoColor.bg}`}>
                  <div className="flex items-center gap-3">
                    {estadoColor.icon}
                    <div>
                      <p className={`font-bold text-sm ${estadoColor.text}`}>{estadoColor.label}</p>
                      {data.estado !== 'cuadrado' ? (
                        <p className={`text-xs ${estadoColor.text}`}>
                          Diferencia: {data.diferencia >= 0 ? '+' : ''}{fmt(data.diferencia)}
                        </p>
                      ) : (
                        <p className={`text-xs ${estadoColor.text}`}>El conteo cuadra con el sistema</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Efectivo físico vs esperado */}
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>CAJA FÍSICA</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Contado</p>
                      <p className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(data.totalFisicoContado)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>Esperado</p>
                      <p className={`text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{fmt(data.efectivoEsperado)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className={`p-6 space-y-3 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                  Selecciona cómo imprimir:
                </p>

                {/* IMPRESIÓN NORMAL (resumen financiero) */}
                <div className={`rounded-xl border p-2 space-y-1.5 ${darkMode ? 'border-blue-500/20 bg-blue-500/5' : 'border-blue-100 bg-blue-50/50'}`}>
                  <p className={`text-[10px] font-semibold px-1 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                    IMPRESIÓN NORMAL — Resumen financiero
                  </p>
                  <Button
                    onClick={() => handleAction('imprimir')}
                    disabled={loading !== null}
                    className="w-full h-11 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20"
                  >
                    {loading === 'imprimir' ? (
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    ) : (
                      <Printer className="w-4 h-4 mr-2" />
                    )}
                    Imprimir Resumen y Cerrar
                  </Button>
                  <Button
                    onClick={() => handleAction('descargar')}
                    disabled={loading !== null}
                    variant="outline"
                    className={`w-full h-9 font-semibold rounded-lg text-sm ${
                      darkMode ? 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {loading === 'descargar' ? (
                      <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Descargar Resumen
                  </Button>
                </div>

                {/* SOLO GUARDAR */}
                <Button
                  onClick={() => handleAction('guardar')}
                  disabled={loading !== null}
                  variant="outline"
                  className={`w-full h-11 font-bold rounded-xl border-2 ${
                    darkMode
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {loading === 'guardar' ? (
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Guardar sin Imprimir
                </Button>

                <button
                  onClick={onClose}
                  disabled={loading !== null}
                  className={`w-full text-sm py-2 transition-colors ${
                    darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Cancelar — regresar a la caja
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
