import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  Filter,
  Eye,
  Archive,
  Calendar,
  User,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  BarChart2,
  Download,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ModalDetalleCierre from './ModalDetalleCierre';

interface CierreRaw {
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
  abonosCarteraEfectivo?: number;
  abonosCarteraTransferencia?: number;
  abonosCarteraTarjetaBanco?: number;
  abonosCarteraDetalle?: Array<{ descripcion: string; concepto?: string; monto: number; medioPago?: string }>;
  cantidadTransacciones?: number;
  ticketPromedio?: number;
  productosTop?: Array<{ nombre: string; cantidad: number; total: number }>;
  transferenciaEsperada?: number;
  tarjetaBancoEsperado?: number;
  totalEsperadoAnalitico?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
}

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

const ROWS_PER_PAGE = 10;

export default function ModalHistorialCierres({ open, onClose, darkMode }: Props) {
  const [cierres, setCierres] = useState<CierreRaw[]>([]);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroCajero, setFiltroCajero] = useState('');
  const [filtrosActivos, setFiltrosActivos] = useState({ desde: '', hasta: '', cajero: '' });
  const [paginaActual, setPaginaActual] = useState(1);
  const [cierreSeleccionado, setCierreSeleccionado] = useState<CierreRaw | null>(null);
  const [filtroRapido, setFiltroRapido] = useState<string>('mes');

  useEffect(() => {
    if (!open) return;
    cargarCierres();
    // Defaults: últimos 30 días
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const h = hoy.toISOString().split('T')[0];
    const d = hace30.toISOString().split('T')[0];
    setFiltroDesde(d);
    setFiltroHasta(h);
    setFiltrosActivos({ desde: d, hasta: h, cajero: '' });
    setFiltroRapido('mes');
    setPaginaActual(1);
  }, [open]);

  const cargarCierres = () => {
    try {
      const raw = localStorage.getItem('pos-cierres-caja');
      const arr: CierreRaw[] = raw ? JSON.parse(raw) : [];
      // Ordenar de más reciente a más antiguo
      arr.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      setCierres(arr);
    } catch {
      setCierres([]);
    }
  };

  const aplicarFiltros = () => {
    setFiltrosActivos({ desde: filtroDesde, hasta: filtroHasta, cajero: filtroCajero });
    setFiltroRapido('');
    setPaginaActual(1);
  };

  const limpiarFiltros = () => {
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltroCajero('');
    setFiltrosActivos({ desde: '', hasta: '', cajero: '' });
    setFiltroRapido('todos');
    setPaginaActual(1);
  };

  const aplicarFiltroRapido = (key: string) => {
    setFiltroRapido(key);
    const hoy = new Date();
    const finStr = hoy.toISOString().split('T')[0];
    let inicioStr = '';

    if (key !== 'todos') {
      const d = new Date(hoy);
      if (key === 'hoy')   { /* inicio = fin = hoy */ inicioStr = finStr; }
      else if (key === '3dias')  { d.setDate(d.getDate() - 3);  inicioStr = d.toISOString().split('T')[0]; }
      else if (key === '7dias')  { d.setDate(d.getDate() - 7);  inicioStr = d.toISOString().split('T')[0]; }
      else if (key === '15dias') { d.setDate(d.getDate() - 15); inicioStr = d.toISOString().split('T')[0]; }
      else if (key === 'mes')    { d.setDate(d.getDate() - 30); inicioStr = d.toISOString().split('T')[0]; }
      else if (key === '3meses') { d.setDate(d.getDate() - 90); inicioStr = d.toISOString().split('T')[0]; }
    }

    setFiltroDesde(inicioStr);
    setFiltroHasta(key === 'todos' ? '' : finStr);
    setFiltrosActivos({ desde: inicioStr, hasta: key === 'todos' ? '' : finStr, cajero: filtroCajero });
    setPaginaActual(1);
  };

  const exportarCSV = () => {
    const rows = cierresFiltrados.map(c => {
      const d = new Date(c.fecha);
      return [
        d.toLocaleDateString('es-CO'),
        d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        c.cajero || '',
        c.baseInicial,
        c.totalSistema,
        c.totalFisico,
        c.diferencia,
        c.estado,
        c.desglose?.efectivo || 0,
        c.desglose?.tarjeta || 0,
        c.desglose?.nequi || 0,
        c.desglose?.daviplata || 0,
        c.desglose?.transferencia || 0,
        c.desglose?.rappi || 0,
        c.observaciones || '',
      ].join(';');
    });
    const header = 'Fecha;Hora;Cajero;Base Inicial;Total Sistema;Total Físico;Diferencia;Estado;Efectivo;Tarjeta;Nequi;Daviplata;Transferencia;Rappi;Observaciones';
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierres_caja_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cierresFiltrados = useMemo(() => {
    return cierres.filter(c => {
      const fechaCierre = c.fecha.split('T')[0];
      if (filtrosActivos.desde && fechaCierre < filtrosActivos.desde) return false;
      if (filtrosActivos.hasta && fechaCierre > filtrosActivos.hasta) return false;
      if (filtrosActivos.cajero && !c.cajero?.toLowerCase().includes(filtrosActivos.cajero.toLowerCase())) return false;
      return true;
    });
  }, [cierres, filtrosActivos]);

  const totalPaginas = Math.max(1, Math.ceil(cierresFiltrados.length / ROWS_PER_PAGE));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const filasPagina = cierresFiltrados.slice(
    (paginaSegura - 1) * ROWS_PER_PAGE,
    paginaSegura * ROWS_PER_PAGE
  );

  const estadoBadge = (estado: CierreRaw['estado']) => {
    if (estado === 'cuadrado') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600">
        <CheckCircle className="w-3 h-3" /> Cuadrada
      </span>
    );
    if (estado === 'faltante') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-600">
        <XCircle className="w-3 h-3" /> Faltante
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600">
        <AlertTriangle className="w-3 h-3" /> Sobrante
      </span>
    );
  };

  const bg     = darkMode ? 'bg-slate-900'       : 'bg-white';
  const bgCard = darkMode ? 'bg-slate-800'        : 'bg-gray-50';
  const border = darkMode ? 'border-slate-700'    : 'border-gray-200';
  const txt    = darkMode ? 'text-white'          : 'text-slate-900';
  const sub    = darkMode ? 'text-slate-400'      : 'text-slate-500';
  const row_bg = darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-gray-50';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[180] flex items-center justify-center p-3 md:p-6"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 18 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className={`relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.55)] border ${bg} ${border}`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-5 border-b ${border} flex-shrink-0`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Archive className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${txt}`}>Historial de Cierres de Caja</h2>
                  <p className={`text-sm ${sub}`}>{cierres.length} cierre{cierres.length !== 1 ? 's' : ''} registrado{cierres.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filtros */}
            <div className={`px-6 py-4 border-b ${border} ${bgCard} flex-shrink-0`}>
              {/* Accesos rápidos */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { key: 'hoy',    label: 'Hoy',     icon: Clock },
                  { key: '3dias',  label: '3 días',   icon: Clock },
                  { key: '7dias',  label: '7 días',   icon: Clock },
                  { key: '15dias', label: '15 días',  icon: Calendar },
                  { key: 'mes',    label: '1 mes',    icon: Calendar },
                  { key: '3meses', label: '3 meses',  icon: Calendar },
                  { key: 'todos',  label: 'Todos',    icon: BarChart2 },
                ].map(({ key, label, icon: Ic }) => (
                  <button
                    key={key}
                    onClick={() => aplicarFiltroRapido(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      filtroRapido === key
                        ? 'bg-gradient-to-r from-purple-500 to-purple-600 border-transparent text-white shadow'
                        : darkMode
                          ? 'border-slate-600 text-slate-400 hover:border-purple-500 hover:text-white'
                          : 'border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-700'
                    }`}
                  >
                    <Ic className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtros manuales */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold ${sub}`}>Desde</label>
                  <Input
                    type="date"
                    value={filtroDesde}
                    onChange={e => setFiltroDesde(e.target.value)}
                    className={`h-9 text-sm rounded-xl w-36 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold ${sub}`}>Hasta</label>
                  <Input
                    type="date"
                    value={filtroHasta}
                    onChange={e => setFiltroHasta(e.target.value)}
                    className={`h-9 text-sm rounded-xl w-36 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                  <label className={`text-xs font-semibold ${sub}`}>Buscar cajero</label>
                  <div className="relative">
                    <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${sub}`} />
                    <Input
                      type="text"
                      placeholder="Nombre del cajero..."
                      value={filtroCajero}
                      onChange={e => setFiltroCajero(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && aplicarFiltros()}
                      className={`h-9 text-sm rounded-xl pl-8 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`}
                    />
                  </div>
                </div>
                <Button
                  onClick={aplicarFiltros}
                  className="h-9 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-sm font-semibold shadow"
                >
                  <Filter className="w-3.5 h-3.5 mr-1.5" />
                  Buscar
                </Button>
                <button
                  onClick={limpiarFiltros}
                  className={`h-9 px-3 rounded-xl text-sm transition-colors ${sub} hover:text-purple-500`}
                >
                  Limpiar
                </button>
                {cierresFiltrados.length > 0 && (
                  <button
                    onClick={exportarCSV}
                    className={`h-9 px-3 rounded-xl text-sm transition-colors flex items-center gap-1.5 ${darkMode ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'}`}
                    title="Exportar a CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                )}
              </div>

              {/* Resumen de cierres filtrados */}
              {cierresFiltrados.length > 0 && (
                <div className={`mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2`}>
                  {[
                    { label: 'Cierres', valor: cierresFiltrados.length, color: 'text-purple-500' },
                    { label: 'Total recaudado', valor: `$${cierresFiltrados.reduce((s, c) => s + c.totalSistema, 0).toLocaleString('es-CO')}`, color: 'text-emerald-500' },
                    { label: 'Cuadrados', valor: cierresFiltrados.filter(c => c.estado === 'cuadrado').length, color: 'text-emerald-500' },
                    { label: 'Con diferencia', valor: cierresFiltrados.filter(c => c.estado !== 'cuadrado').length, color: 'text-red-500' },
                  ].map(({ label, valor, color }) => (
                    <div key={label} className={`px-3 py-2 rounded-xl border text-center ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200'}`}>
                      <p className={`text-xs ${sub}`}>{label}</p>
                      <p className={`text-sm font-bold ${color}`}>{valor}</p>
                    </div>
                  ))}
                </div>
              )}

              {cierresFiltrados.length !== cierres.length && cierresFiltrados.length > 0 && (
                <p className={`mt-2 text-xs ${sub}`}>
                  Mostrando {cierresFiltrados.length} de {cierres.length} cierres
                </p>
              )}
            </div>

            {/* Tabla */}
            <div className="flex-1 overflow-y-auto">
              {cierresFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Archive className={`w-16 h-16 ${sub}`} />
                  <p className={`text-lg font-semibold ${sub}`}>No hay cierres registrados</p>
                  <p className={`text-sm ${sub}`}>Ajusta los filtros o realiza el primer cierre de caja</p>
                </div>
              ) : (
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className={`border-b ${border} ${bgCard}`}>
                      <th className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${sub}`}>
                        <Calendar className="inline w-3.5 h-3.5 mr-1" />Fecha
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${sub}`}>Hora</th>
                      <th className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${sub}`}>
                        <User className="inline w-3.5 h-3.5 mr-1" />Cajero
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${sub}`}>Turno</th>
                      <th className={`px-4 py-3 text-right text-xs font-bold uppercase tracking-wider ${sub}`}>
                        <TrendingUp className="inline w-3.5 h-3.5 mr-1" />Total Ingresos
                      </th>
                      <th className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wider ${sub}`}>Estado</th>
                      <th className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wider ${sub}`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasPagina.map((cierre, i) => {
                      let fechaLabel = '—';
                      let horaLabel = '—';
                      let turnoLabel = '—';
                      try {
                        const d = new Date(cierre.fecha);
                        fechaLabel = format(d, "dd/MM/yyyy", { locale: es });
                        horaLabel  = format(d, "HH:mm", { locale: es });
                        turnoLabel = format(d, "EEEE", { locale: es });
                        turnoLabel = turnoLabel.charAt(0).toUpperCase() + turnoLabel.slice(1);
                      } catch { /* ignore */ }

                      return (
                        <tr
                          key={cierre.id || i}
                          className={`border-b ${border} transition-colors ${row_bg}`}
                        >
                          <td className={`px-4 py-3.5 text-sm font-medium ${txt}`}>{fechaLabel}</td>
                          <td className={`px-4 py-3.5 text-sm ${sub}`}>{horaLabel}</td>
                          <td className={`px-4 py-3.5 text-sm ${txt}`}>
                            <span className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(cierre.cajero || 'C').charAt(0).toUpperCase()}
                              </span>
                              {cierre.cajero || 'Sin nombre'}
                            </span>
                          </td>
                          <td className={`px-4 py-3.5 text-sm ${sub} capitalize`}>{turnoLabel}</td>
                          <td className={`px-4 py-3.5 text-sm font-bold text-right ${txt}`}>{fmt(cierre.totalSistema)}</td>
                          <td className="px-4 py-3.5 text-center">{estadoBadge(cierre.estado)}</td>
                          <td className="px-4 py-3.5 text-center">
                            <Button
                              size="sm"
                              onClick={() => setCierreSeleccionado(cierre)}
                              className="h-8 px-3 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Ver Detalles
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {cierresFiltrados.length > ROWS_PER_PAGE && (
              <div className={`flex items-center justify-between px-6 py-3 border-t ${border} ${bgCard} flex-shrink-0`}>
                <p className={`text-xs ${sub}`}>
                  Página {paginaSegura} de {totalPaginas} · {cierresFiltrados.length} resultados
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={paginaSegura <= 1}
                    onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                    className="h-8 w-8 p-0 rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                    const page = Math.max(1, Math.min(paginaSegura - 2, totalPaginas - 4)) + i;
                    if (page < 1 || page > totalPaginas) return null;
                    return (
                      <Button
                        key={page}
                        size="sm"
                        variant={page === paginaSegura ? 'default' : 'outline'}
                        onClick={() => setPaginaActual(page)}
                        className={`h-8 w-8 p-0 rounded-lg text-xs font-bold ${page === paginaSegura ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700' : ''}`}
                      >
                        {page}
                      </Button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={paginaSegura >= totalPaginas}
                    onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                    className="h-8 w-8 p-0 rounded-lg"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Modal de detalle (segundo nivel) */}
      <ModalDetalleCierre
        open={cierreSeleccionado !== null}
        onClose={() => setCierreSeleccionado(null)}
        cierre={cierreSeleccionado}
        darkMode={darkMode}
      />
    </AnimatePresence>
  );
}
