/**
 * CODEC POS v2.0 — Modal de Cierre de Caja Ultra-Detallado
 * Auditoría minuciosa del turno: ventas cronológicas, productos, devoluciones, gastos
 */
import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Printer, Download, Clock, ShoppingCart, RotateCcw,
  Wallet, FileText, ChevronDown, ChevronRight, TrendingUp,
  Banknote, CreditCard, Receipt,
} from 'lucide-react';
import { Button } from '../ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { electronStore } from '../../lib/electronStore';

interface VentaDetalle {
  id: string;
  fecha: string;
  items: { nombre: string; cantidad: number; precio: number; subtotal: number }[];
  total: number;
  metodoPago: string;
  cajero?: string;
}

interface DevolucionDetalle {
  id: string;
  fecha: string;
  productos: string[];
  totalDevolucion: number;
  metodoPago: string;
  motivo?: string;
}

interface GastoDetalle {
  id: string;
  fecha: string;
  categoriaConcepto: string;
  descripcion: string;
  monto: number;
  metodoPago: string;
  registradoPor: string;
  proveedor?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  cajeroId?: string;
  cajeroNombre?: string;
  esSuperUsuario?: boolean;
  sesionCajaId?: string;
  fechaApertura?: string;
}

const fmt = (v: number) =>
  `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

const fmtHora = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm:ss', { locale: es }); }
  catch { return '--:--'; }
};

const metodoPagoLabel = (m: string) => {
  const map: Record<string, string> = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', nequi: 'Nequi',
    daviplata: 'Daviplata', transferencia: 'Transferencia', tarjeta_banco: 'Tarjeta o Banco',
  };
  return map[m] || m;
};

const normalizarCanalGasto = (medioPago: string) => {
  const key = String(medioPago || '').toLowerCase();
  if (key === 'efectivo') return 'efectivo';
  if (['tarjeta', 'tarjeta_banco', 'banco', 'cheque'].includes(key)) return 'tarjeta_banco';
  return 'transferencia';
};

const metodoPagoIcon = (m: string) => {
  if (m === 'efectivo') return <Banknote className="w-3.5 h-3.5 text-green-500" />;
  if (m === 'tarjeta') return <CreditCard className="w-3.5 h-3.5 text-blue-500" />;
  return <Wallet className="w-3.5 h-3.5 text-purple-500" />;
};

export default function ModalCierreDetallado({
  open, onClose, darkMode, cajeroId, cajeroNombre, esSuperUsuario, sesionCajaId, fechaApertura,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [ventas, setVentas] = useState<VentaDetalle[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionDetalle[]>([]);
  const [gastos, setGastos] = useState<GastoDetalle[]>([]);
  const [cargando, setCargando] = useState(false);
  const [expandedVenta, setExpandedVenta] = useState<string | null>(null);
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    if (!open) return;
    cargarDatos();
    try {
      const raw = localStorage.getItem('codec_pos_config');
      if (raw) setConfig(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [open]);

  const getFechaLocalISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const filtro = {
        incluirTodosLosCajeros: !!esSuperUsuario,
        cajeroId: esSuperUsuario ? undefined : cajeroId,
        sesionCajaId,
      };

      // Ventas del día
      const ventasRaw = await electronStore.obtenerVentasDelDia(filtro as any);
      const ventasMapeadas: VentaDetalle[] = (ventasRaw || []).map((v: any) => ({
        id: v.id || String(v.timestamp || Date.now()),
        fecha: v.fecha || v.timestamp || new Date().toISOString(),
        items: (v.items || []).map((item: any) => ({
          nombre: item.nombre || item.name || 'Producto',
          cantidad: Number(item.cantidad || item.quantity || 1),
          precio: Number(item.precio || item.price || 0),
          subtotal: Number(item.subtotal || item.total || 0),
        })),
        total: Number(v.total || v.totalVenta || 0),
        metodoPago: String(v.metodoPago || v.paymentMethod || 'efectivo'),
        cajero: v.cajero || v.cajeroNombre || cajeroNombre || '',
      }));

      // Ordenar cronológicamente
      ventasMapeadas.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      setVentas(ventasMapeadas);

      // Devoluciones
      const devRaw = await electronStore.obtenerDevolucionesDelDia(filtro as any);
      const devMapeadas: DevolucionDetalle[] = (Array.isArray(devRaw) ? devRaw : []).map((d: any) => ({
        id: d.id || String(Date.now()),
        fecha: d.fecha || d.timestamp || new Date().toISOString(),
        productos: Array.isArray(d.productos)
          ? d.productos.map((p: any) => typeof p === 'string' ? p : (p.nombre || p.name || 'Producto'))
          : [],
        totalDevolucion: Number(d.totalDevolucion || d.monto || 0),
        metodoPago: String(d.metodoPago || 'efectivo'),
        motivo: d.motivo || d.razon || '',
      }));
      setDevoluciones(devMapeadas);

      // Gastos del día (localStorage)
      const gastosRaw = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
      const hoy = getFechaLocalISO();
      const gastosFiltrados = (Array.isArray(gastosRaw) ? gastosRaw : [])
        .filter((g: any) => {
          const fecha = String(g?.fecha || '').split('T')[0];
          const usuario = g?.registradoPorId || g?.usuarioId;
          const sesion = String(g?.sesionCajaId || '');
          const coincide = esSuperUsuario ? true : cajeroId ? usuario === cajeroId : true;
          const coincideSesion = sesionCajaId ? sesion === sesionCajaId : true;
          return fecha === hoy && coincide && coincideSesion;
        })
        .map((g: any) => ({
          id: g.id || String(Date.now()),
          fecha: g.fecha || new Date().toISOString(),
          categoriaConcepto: g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto',
          descripcion: g.descripcion || g.concepto || 'Gasto',
          monto: Number(g.monto || 0),
          metodoPago: normalizarCanalGasto(String(g.medioPagoEgreso || g.metodoPago || 'efectivo')),
          registradoPor: g.registradoPor || g.cajero || g.usuario || cajeroNombre || 'N/A',
          proveedor: g.proveedor || g.proveedorNombre || '',
        }));
      gastosFiltrados.sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      setGastos(gastosFiltrados);
    } catch (err) {
      console.error('Error cargando detalles del cierre:', err);
    } finally {
      setCargando(false);
    }
  };

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalDevoluciones = devoluciones.reduce((s, d) => s + d.totalDevolucion, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);

  const imprimirDetallado = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank', 'width=480,height=900');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Auditoría de Turno — ${cajeroNombre}</title>
      <style>
        body{margin:0;padding:16px;font-family:'Courier New',monospace;font-size:11px;color:#000;background:#fff;}
        @page{margin:8mm;}
        table{width:100%;border-collapse:collapse;}
        .sep{border-top:1px solid #000;margin:4px 0;}
        .dbl{border-top:2px solid #000;margin:4px 0;}
        .bold{font-weight:bold;}
        .right{text-align:right;}
        .center{text-align:center;}
        .indent{padding-left:12px;}
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const descargarTexto = () => {
    const el = printRef.current;
    if (!el) return;
    const text = el.innerText || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Auditoria-Turno-${cajeroNombre?.replace(/\s+/g, '_')}-${format(new Date(), 'yyyy-MM-dd_HH-mm')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const LINE = '─'.repeat(48);
  const DLINE = '═'.repeat(48);
  const fechaDisplay = format(new Date(), "dd 'de' MMMM yyyy", { locale: es });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-3 md:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)] border ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}
          >
            {/* Botón cerrar */}
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* ── Panel Izquierdo: Vista previa imprimible ── */}
            <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                Auditoría detallada del turno
              </p>

              {cargando ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mr-3" />
                  <span className={darkMode ? 'text-slate-300' : 'text-gray-600'}>Cargando historial...</span>
                </div>
              ) : (
                <div
                  ref={printRef}
                  className="bg-white text-black mx-auto rounded-xl shadow-2xl overflow-hidden p-6"
                  style={{ maxWidth: 460, fontFamily: "'Courier New', monospace", fontSize: 11 }}
                >
                  {/* Encabezado empresa */}
                  <div className="text-center border-b-2 border-black pb-3 mb-3">
                    {config.logoUrl && (
                      <img src={config.logoUrl} alt="Logo" style={{ maxHeight: 50, maxWidth: 160, margin: '0 auto 6px', objectFit: 'contain', display: 'block' }} />
                    )}
                    <div className="bold" style={{ fontSize: 14 }}>{config.nombreComercial || 'MI NEGOCIO'}</div>
                    {config.nit && <div>NIT: {config.nit}</div>}
                    {config.direccion && <div style={{ fontSize: 10 }}>{config.direccion}</div>}
                  </div>

                  <div className="center bold" style={{ fontSize: 13, letterSpacing: 1 }}>AUDITORÍA DE TURNO</div>
                  <div className="center" style={{ fontSize: 10, marginBottom: 4 }}>IMPRESIÓN DETALLADA</div>
                  <div style={{ borderTop: '2px solid #000', margin: '4px 0' }} />

                  {/* Info del turno */}
                  <div style={{ marginBottom: 8 }}>
                    <div className="bold">INFORMACIÓN DEL TURNO</div>
                    <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                    <table>
                      <tbody>
                        <tr><td>Fecha:</td><td className="right">{fechaDisplay}</td></tr>
                        <tr><td>Cajero:</td><td className="right">{cajeroNombre}</td></tr>
                        {fechaApertura && <tr><td>Apertura:</td><td className="right">{fmtHora(fechaApertura)}</td></tr>}
                        <tr><td>Cierre:</td><td className="right">{format(new Date(), 'HH:mm:ss')}</td></tr>
                        <tr><td>Total ventas:</td><td className="right">{ventas.length}</td></tr>
                        <tr><td>Devoluciones:</td><td className="right">{devoluciones.length}</td></tr>
                        <tr><td>Gastos:</td><td className="right">{gastos.length}</td></tr>
                      </tbody>
                    </table>
                    <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                  </div>

                  {/* VENTAS CRONOLÓGICAS */}
                  {ventas.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="bold">HISTORIAL DE VENTAS ({ventas.length})</div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                      {ventas.map((v, i) => (
                        <div key={v.id} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: '1px dashed #ccc' }}>
                          <div className="bold" style={{ fontSize: 11 }}>
                            #{i + 1} {fmtHora(v.fecha)} — {metodoPagoLabel(v.metodoPago)}
                          </div>
                          {v.items.map((item, j) => (
                            <div key={j} className="indent" style={{ fontSize: 10 }}>
                              {item.cantidad} × {item.nombre.slice(0, 28)}
                              <span style={{ float: 'right' }}>{fmt(item.subtotal)}</span>
                            </div>
                          ))}
                          <div className="bold" style={{ borderTop: '1px dotted #000', marginTop: 2, paddingTop: 1 }}>
                            TOTAL <span style={{ float: 'right' }}>{fmt(v.total)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="bold">
                        SUBTOTAL VENTAS <span style={{ float: 'right' }}>{fmt(totalVentas)}</span>
                      </div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                    </div>
                  )}

                  {/* DEVOLUCIONES */}
                  {devoluciones.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="bold">DEVOLUCIONES Y CANCELACIONES ({devoluciones.length})</div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                      {devoluciones.map((d, i) => (
                        <div key={d.id} style={{ marginBottom: 4, paddingBottom: 3, borderBottom: '1px dashed #ccc' }}>
                          <div>↩ {fmtHora(d.fecha)} — {metodoPagoLabel(d.metodoPago)}</div>
                          {d.productos.map((p, j) => (
                            <div key={j} className="indent" style={{ fontSize: 10 }}>• {p.slice(0, 35)}</div>
                          ))}
                          {d.motivo && <div className="indent" style={{ fontSize: 10, fontStyle: 'italic' }}>Motivo: {d.motivo}</div>}
                          <div>DEVOLUCIÓN <span style={{ float: 'right' }}>-{fmt(d.totalDevolucion)}</span></div>
                        </div>
                      ))}
                      <div className="bold">
                        TOTAL DEVOLUCIONES <span style={{ float: 'right' }}>-{fmt(totalDevoluciones)}</span>
                      </div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                    </div>
                  )}

                  {/* GASTOS */}
                  {gastos.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div className="bold">GASTOS Y COMPRAS A PROVEEDORES ({gastos.length})</div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                      {gastos.map((g, i) => (
                        <div key={g.id} style={{ marginBottom: 4, paddingBottom: 3, borderBottom: '1px dashed #ccc' }}>
                          <div className="bold">{fmtHora(g.fecha)} → {g.categoriaConcepto.slice(0, 28)}</div>
                          <div className="indent">{g.descripcion.slice(0, 42)}</div>
                          <div className="indent" style={{ fontSize: 10 }}>
                            Medio: {metodoPagoLabel(g.metodoPago)} | Cajero: {g.registradoPor}
                          </div>
                          {g.proveedor && <div className="indent" style={{ fontSize: 10 }}>Proveedor: {g.proveedor}</div>}
                          <div>MONTO <span style={{ float: 'right' }}>-{fmt(g.monto)}</span></div>
                        </div>
                      ))}
                      <div className="bold">
                        TOTAL GASTOS <span style={{ float: 'right' }}>-{fmt(totalGastos)}</span>
                      </div>
                      <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
                    </div>
                  )}

                  {/* RESUMEN FINAL */}
                  <div style={{ marginBottom: 8 }}>
                    <div className="bold" style={{ fontSize: 12 }}>RESUMEN FINAL</div>
                    <div style={{ borderTop: '2px solid #000', margin: '2px 0' }} />
                    <table>
                      <tbody>
                        <tr><td>Total vendido:</td><td className="right">{fmt(totalVentas)}</td></tr>
                        {totalDevoluciones > 0 && <tr><td>(-) Devoluciones:</td><td className="right">-{fmt(totalDevoluciones)}</td></tr>}
                        {totalGastos > 0 && <tr><td>(-) Gastos del turno:</td><td className="right">-{fmt(totalGastos)}</td></tr>}
                        <tr><td colSpan={2}><div style={{ borderTop: '1px solid #000', margin: '2px 0' }} /></td></tr>
                        <tr className="bold" style={{ fontSize: 13 }}>
                          <td>NETO DEL TURNO:</td>
                          <td className="right">{fmt(totalVentas - totalDevoluciones - totalGastos)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ borderTop: '2px solid #000', margin: '4px 0' }} />
                  </div>

                  {/* Footer */}
                  <div className="center" style={{ fontSize: 10, color: '#555', marginTop: 12 }}>
                    <div className="bold">CODEC POS v2.0 — AUDITORÍA DETALLADA</div>
                    <div>Generado: {fechaDisplay} {format(new Date(), 'HH:mm:ss')}</div>
                    <div>Software por Codec Studio · Bogotá, Colombia</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel Derecho: Resumen interactivo + acciones ── */}
            <div className={`w-full lg:w-72 flex-shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l ${
              darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
            }`}>
              {/* Header */}
              <div className={`p-5 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-5 h-5 text-violet-500" />
                  <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Cierre Detallado
                  </h2>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Auditoría completa del turno de {cajeroNombre}
                </p>
              </div>

              {/* Métricas */}
              <div className={`p-5 space-y-3 flex-1 overflow-y-auto border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                {/* Ventas */}
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="w-4 h-4 text-blue-500" />
                    <span className={`text-xs font-bold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                      VENTAS ({ventas.length})
                    </span>
                  </div>
                  <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fmt(totalVentas)}</p>
                </div>

                {/* Devoluciones */}
                {devoluciones.length > 0 && (
                  <div className={`p-3 rounded-xl border ${darkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RotateCcw className="w-4 h-4 text-orange-500" />
                      <span className={`text-xs font-bold ${darkMode ? 'text-orange-300' : 'text-orange-600'}`}>
                        DEVOLUCIONES ({devoluciones.length})
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>-{fmt(totalDevoluciones)}</p>
                  </div>
                )}

                {/* Gastos */}
                {gastos.length > 0 && (
                  <div className={`p-3 rounded-xl border ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-4 h-4 text-red-500" />
                      <span className={`text-xs font-bold ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                        GASTOS/COMPRAS ({gastos.length})
                      </span>
                    </div>
                    <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>-{fmt(totalGastos)}</p>
                  </div>
                )}

                {/* Neto */}
                <div className={`p-3 rounded-xl border-2 ${darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className={`text-xs font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>NETO DEL TURNO</span>
                  </div>
                  <p className={`text-3xl font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {fmt(totalVentas - totalDevoluciones - totalGastos)}
                  </p>
                </div>

                {/* Historial compacto de ventas */}
                {ventas.length > 0 && (
                  <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                    <div className={`px-3 py-2 flex items-center gap-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                      <Receipt className="w-4 h-4 text-slate-400" />
                      <span className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Últimas {Math.min(ventas.length, 5)} ventas
                      </span>
                    </div>
                    <div className="divide-y divide-slate-700/30">
                      {ventas.slice(-5).reverse().map((v) => (
                        <div key={v.id} className={`px-3 py-2 ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {metodoPagoIcon(v.metodoPago)}
                              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                {fmtHora(v.fecha)}
                              </span>
                            </div>
                            <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {fmt(v.total)}
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            {v.items.slice(0, 2).map(i => `${i.cantidad}×${i.nombre.slice(0, 14)}`).join(', ')}
                            {v.items.length > 2 ? ` +${v.items.length - 2} más` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className={`p-5 space-y-3 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                  Opciones de impresión
                </p>

                <Button
                  onClick={imprimirDetallado}
                  disabled={cargando}
                  className="w-full h-11 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white font-bold rounded-xl"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Auditoría Detallada
                </Button>

                <Button
                  onClick={descargarTexto}
                  disabled={cargando}
                  variant="outline"
                  className={`w-full h-11 font-bold rounded-xl ${
                    darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar como texto
                </Button>

                <button
                  onClick={onClose}
                  className={`w-full text-sm py-2 transition-colors ${
                    darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
                  }`}
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
