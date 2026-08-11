import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, TrendingUp, Package, DollarSign, BarChart3, Trash2,
  AlertCircle, Clock, CheckCircle, FilePlus, Archive, Calendar,
  Wrench, TrendingDown, ShoppingCart, AlertTriangle, Search, Filter,
  RefreshCw,
} from 'lucide-react';
import { esModuloActivoGlobal, ModuloPOS } from '../../lib/permissions';
import { electronStore } from '../../lib/electronStore';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { reportesService, ReporteGenerado } from '../../services/reportesService';
import { exportadorReportes } from '../../services/exportarReportes';
import ModalExportarReporte from './ModalExportarReporte';
import ModalHistorialCierres from './ModalHistorialCierres';
import ModalGenerarReporte from './ModalGenerarReporte';
import ModalDetalleKPI, { type TipoModalKPI, type DatosResumenKPI } from './ModalDetalleKPI';

const TIPOS_REPORTES = [
  {
    id: 'ventas' as const,
    nombre: 'Ventas',
    descripcion: 'Análisis de ventas, métodos de pago y top productos',
    icono: TrendingUp,
    color: 'from-emerald-500 to-emerald-600',
    requierePeriodo: true,
  },
  {
    id: 'cajero' as const,
    nombre: 'Por Cajero',
    descripcion: 'Desempeño, cierres y confiabilidad de un cajero',
    icono: Clock,
    color: 'from-cyan-500 to-cyan-600',
    requierePeriodo: true,
    requiereCajero: true,
  },
  {
    id: 'inventario' as const,
    nombre: 'Inventario',
    descripcion: 'Stock actual, alertas, valor y margen de utilidad',
    icono: Package,
    color: 'from-blue-500 to-blue-600',
    requierePeriodo: false,
  },
  {
    id: 'gastos' as const,
    nombre: 'Gastos',
    descripcion: 'Egresos por categoría, evolución diaria y totales',
    icono: DollarSign,
    color: 'from-red-500 to-red-600',
    requierePeriodo: true,
  },
  {
    id: 'cierres' as const,
    nombre: 'Cierres de Caja',
    descripcion: 'Arqueos, diferencias y auditoría de cada turno',
    icono: Archive,
    color: 'from-purple-500 to-purple-600',
    requierePeriodo: true,
  },
  {
    id: 'financiero' as const,
    nombre: 'Financiero',
    descripcion: 'Estado de resultados, margen y rentabilidad neta',
    icono: BarChart3,
    color: 'from-amber-500 to-amber-600',
    requierePeriodo: true,
  },
  ...(esModuloActivoGlobal(ModuloPOS.TALLER_REPARACIONES) ? [{
    id: 'taller' as const,
    nombre: 'Taller',
    descripcion: 'Órdenes, técnicos, saldos y rentabilidad del taller',
    icono: Wrench,
    color: 'from-orange-500 to-orange-600',
    requierePeriodo: true,
  }] : []),
];

type TipoId = typeof TIPOS_REPORTES[number]['id'];

// ── Métricas en vivo ──────────────────────────────────────────────────────────

/**
 * Fecha local en formato YYYY-MM-DD.
 *
 * 🛡️ FIX: antes se usaba `new Date().toISOString().split('T')[0]`, que da la
 * fecha en **UTC**. En Colombia (UTC-5) el día UTC cambia a las 19:00 hora
 * local: de 7 p.m. en adelante, "Gastos del Mes" y los cierres del mes
 * empezaban a compararse contra el mes equivocado el día 1, y cualquier
 * comparación de "hoy" se corría un día completo. Mismo criterio que
 * `electronStore.getFechaLocalISO()`, para que Reportes y Cierre de Caja
 * cuenten exactamente el mismo día.
 */
function fechaLocalISO(date: Date = new Date()): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
}

function calcMetricasLive() {
  const mesInicio = new Date(); mesInicio.setDate(1);
  const mesStr = fechaLocalISO(mesInicio);

  // ventasHoy NO se calcula aquí: la fuente real de las ventas es IndexedDB
  // (electronStore/dbManager), no localStorage. La clave 'pos-ventas' que se
  // leía antes NO la escribe nadie en todo el proyecto, así que este contador
  // devolvía $0 siempre. Lo llena `refrescarMetricas()` de forma asíncrona.
  let ventasHoy = 0;
  let gastosMes = 0;
  let alertasStock = 0;
  let ultimoCierre: string | null = null;
  let totalCierresMes = 0;

  try {
    const gastos = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
    gastosMes = gastos
      .filter((g: any) => String(g.fecha || '') >= mesStr)
      .reduce((s: number, g: any) => s + (Number(g.monto) || 0), 0);
  } catch { /* no-op */ }

  try {
    const prods = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    alertasStock = prods.filter((p: any) =>
      p.activo !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || Number(p.stockMinimo) || 5)
    ).length;
  } catch { /* no-op */ }

  try {
    const cierres = JSON.parse(localStorage.getItem('pos-cierres-caja') || '[]');
    if (cierres.length > 0) {
      const sorted = [...cierres].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      ultimoCierre = sorted[0]?.fecha || null;
      totalCierresMes = cierres.filter((c: any) => String(c.fecha || '') >= mesStr).length;
    }
  } catch { /* no-op */ }

  return { ventasHoy, gastosMes, alertasStock, ultimoCierre, totalCierresMes };
}

function fmtCOP(n: number) {
  return `$${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

function diasDesde(fecha: string | null): string {
  if (!fecha) return 'Sin cierres';
  const d = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  return `Hace ${d} días`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();

  const [reportesGuardados, setReportesGuardados] = useState<ReporteGenerado[]>([]);
  const [reporteParaExportar, setReporteParaExportar] = useState<ReporteGenerado | null>(null);
  const [mostrarHistorialCierres, setMostrarHistorialCierres] = useState(false);
  const [tipoAGenerar, setTipoAGenerar] = useState<typeof TIPOS_REPORTES[number] | null>(null);
  const [metricas, setMetricas] = useState(calcMetricasLive());
  const [modalKPI, setModalKPI] = useState<{
    tipo: TipoModalKPI; titulo: string; valor: string; accentColor: string; icon: any; datos: DatosResumenKPI;
  } | null>(null);
  const [rangoModalKPI, setRangoModalKPI] = useState<{ inicio: Date; fin: Date } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoId | ''>('');
  const [loading, setLoading] = useState(false);

  /**
   * 🛡️ FIX: "Ventas Hoy" volvía a $0 cada vez que se pulsaba «Actualizar
   * datos» o se generaba un reporte, porque esos dos caminos llamaban
   * `setMetricas(calcMetricasLive())` a secas — que lee localStorage y NO la
   * fuente real (IndexedDB). El valor correcto solo se cargaba una vez, al
   * montar la página. Ahora los tres caminos usan esta misma función, que
   * combina la parte síncrona con el total real de ventas del día.
   */
  const refrescarMetricas = useCallback(async () => {
    setMetricas(calcMetricasLive());
    try {
      const ventas = await electronStore.obtenerVentas();
      // Comparación por timestamp contra el inicio del día LOCAL: `venta.fecha`
      // se guarda en UTC (new Date().toISOString()), así que un `startsWith`
      // sobre la fecha dejaba fuera las ventas hechas después de las 7 p.m.
      const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
      const inicioTs = inicioDia.getTime();
      const ventasHoy = ventas
        .filter(v => {
          const ts = new Date(v.fecha).getTime();
          return Number.isFinite(ts) && ts >= inicioTs;
        })
        // Las ventas devueltas/anuladas no suman al total del día.
        .filter(v => !['devuelto', 'anulado'].includes(String((v as any).estado || '').toLowerCase()))
        .reduce((s, v) => s + (Number(v.total) || 0), 0);
      setMetricas(prev => ({ ...prev, ventasHoy }));
    } catch {
      /* IndexedDB no disponible — se mantienen las métricas síncronas */
    }
  }, []);

  useEffect(() => {
    cargarReportesGuardados();
    limpiarExpirados();
    refrescarMetricas();
  }, [refrescarMetricas]);

  const cargarReportesGuardados = () => {
    setReportesGuardados(reportesService.obtenerReportes());
  };

  const limpiarExpirados = () => {
    const n = reportesService.limpiarReportesExpirados();
    if (n > 0) {
      toast.info(`${n} reportes expirados eliminados automáticamente`);
      cargarReportesGuardados();
    }
  };

  const generarFn = async (tipo: string, inicio: string, fin: string, cajero: string, categoria: string): Promise<ReporteGenerado> => {
    setLoading(true);
    const por = (usuarioActual as any)?.nombreCompleto || (usuarioActual as any)?.nombre || (usuarioActual as any)?.username || 'Sistema POS';
    try {
      let r: ReporteGenerado;
      switch (tipo) {
        case 'ventas':     r = await reportesService.generarReporteVentas(inicio, fin, categoria || undefined, por);     break;
        case 'cajero':     r = await reportesService.generarReporteCajero(inicio, fin, cajero, por);                     break;
        case 'inventario': r = reportesService.generarReporteInventario(por);                                             break;
        case 'gastos':     r = reportesService.generarReporteGastos(inicio, fin, por);                                    break;
        case 'cierres':    r = reportesService.generarReporteCierres(inicio, fin, por);                                   break;
        case 'financiero': r = await reportesService.generarReporteFinanciero(inicio, fin, por);                          break;
        case 'taller':     r = await reportesService.generarReporteTaller(inicio, fin, por);                              break;
        default: throw new Error('Tipo desconocido');
      }
      reportesService.guardarReporte(r);
      cargarReportesGuardados();
      refrescarMetricas();
      toast.success('Reporte generado', { description: `${r.nombre} · ${r.metadata.totalRegistros} registros` });
      return r;
    } catch (e) {
      toast.error('Error al generar el reporte');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const onGenerado = (reporte: ReporteGenerado) => {
    setReporteParaExportar(reporte);
  };

  const ejecutarPDF     = (r: ReporteGenerado) => { try { exportadorReportes.exportarPDF(r);     toast.success('PDF descargado',           { description: r.nombre }); } catch { toast.error('Error al exportar PDF');   } };
  const ejecutarExcel   = (r: ReporteGenerado) => { try { exportadorReportes.exportarExcel(r);   toast.success('Excel descargado',         { description: r.nombre }); } catch { toast.error('Error al exportar Excel'); } };
  const ejecutarTirilla = (r: ReporteGenerado) => { try { exportadorReportes.imprimirTirilla(r); toast.success('Tirilla enviada a imprimir',{ description: r.nombre }); } catch { toast.error('Error al imprimir');       } };
  const ejecutarDownloadTirilla = (r: ReporteGenerado) => { try { exportadorReportes.descargarTirilla(r); toast.success('Tirilla descargada', { description: r.nombre }); } catch { toast.error('Error al descargar tirilla'); } };

  const eliminarReporte = (id: string) => {
    if (reportesService.eliminarReporte(id)) {
      cargarReportesGuardados();
      toast.success('Reporte eliminado');
    }
  };

  const reportesFiltrados = useMemo(() => {
    return reportesGuardados
      .filter(r => {
        const matchTipo = !filtroTipo || r.tipo === filtroTipo;
        const matchBusqueda = !busqueda || r.nombre.toLowerCase().includes(busqueda.toLowerCase());
        return matchTipo && matchBusqueda;
      })
      .sort((a, b) => new Date(b.fechaGeneracion).getTime() - new Date(a.fechaGeneracion).getTime());
  }, [reportesGuardados, filtroTipo, busqueda]);

  const bg     = darkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-white to-emerald-50';
  const card   = darkMode ? 'bg-slate-900/60 border-slate-700'                            : 'bg-white border-gray-200';
  const txt    = darkMode ? 'text-white'                                                  : 'text-slate-900';
  const sub    = darkMode ? 'text-slate-400'                                              : 'text-slate-500';

  return (
    <div className={`min-h-screen h-screen overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500 ${bg} ${darkMode ? 'scrollbar-track-slate-800' : 'scrollbar-track-gray-200'}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${txt}`}>Reportes del Negocio</h1>
            <p className={`text-sm ${sub}`}>Selecciona un tipo para generar y exportar al instante</p>
          </div>
        </div>
        <button
          onClick={() => { cargarReportesGuardados(); refrescarMetricas(); toast.success('Datos actualizados'); }}
          className={`p-2.5 rounded-xl border transition-colors ${darkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
          title="Actualizar datos"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* ── Métricas en vivo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Ventas hoy */}
        <div
          onClick={() => {
            const hoy = new Date();
            const inicio = new Date(hoy); inicio.setHours(0, 0, 0, 0);
            const fin = new Date(hoy); fin.setHours(23, 59, 59, 999);
            setModalKPI({
              tipo: 'ventas', titulo: 'Ventas Hoy', valor: fmtCOP(metricas.ventasHoy), accentColor: '#10b981', icon: ShoppingCart,
              datos: {},
            });
            setRangoModalKPI({ inicio, fin });
          }}
          className={`group relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-emerald-500" />
            <p className={`text-xs font-semibold text-emerald-500`}>VENTAS HOY</p>
          </div>
          <p className={`text-xl font-black ${txt}`}>{fmtCOP(metricas.ventasHoy)}</p>
          <p className={`text-xs ${sub}`}>{new Date().toLocaleDateString('es-CO', { weekday: 'long' })}</p>
          <span className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500">Ver detalle →</span>
        </div>

        {/* Gastos mes */}
        <div
          onClick={() => {
            const hoy = new Date();
            const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const fin = new Date(hoy); fin.setHours(23, 59, 59, 999);
            setModalKPI({
              tipo: 'gastos', titulo: 'Gastos del Mes', valor: fmtCOP(metricas.gastosMes), accentColor: '#ef4444', icon: TrendingDown,
              datos: {},
            });
            setRangoModalKPI({ inicio: inicioMes, fin });
          }}
          className={`group relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <p className={`text-xs font-semibold text-red-500`}>GASTOS MES</p>
          </div>
          <p className={`text-xl font-black ${txt}`}>{fmtCOP(metricas.gastosMes)}</p>
          <p className={`text-xs ${sub}`}>{new Date().toLocaleDateString('es-CO', { month: 'long' })}</p>
          <span className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-red-500">Ver detalle →</span>
        </div>

        {/* Alertas stock */}
        <div
          onClick={() => {
            setModalKPI({
              tipo: 'stock', titulo: 'Stock Bajo', valor: `${metricas.alertasStock} ${metricas.alertasStock === 1 ? 'producto' : 'productos'}`, accentColor: '#f59e0b', icon: AlertTriangle,
              datos: {},
            });
            setRangoModalKPI(null);
          }}
          className={`group relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${
            metricas.alertasStock > 0
              ? darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
              : darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${metricas.alertasStock > 0 ? 'text-amber-500' : sub}`} />
            <p className={`text-xs font-semibold ${metricas.alertasStock > 0 ? 'text-amber-500' : sub}`}>STOCK BAJO</p>
          </div>
          <p className={`text-xl font-black ${metricas.alertasStock > 0 ? (darkMode ? 'text-amber-300' : 'text-amber-700') : txt}`}>
            {metricas.alertasStock} {metricas.alertasStock === 1 ? 'producto' : 'productos'}
          </p>
          <p className={`text-xs ${sub}`}>{metricas.alertasStock === 0 ? 'Todo en orden' : 'requieren atención'}</p>
          <span className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-amber-500">Ver detalle →</span>
        </div>

        {/* Último cierre */}
        <div
          onClick={() => setMostrarHistorialCierres(true)}
          className={`group relative p-4 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${darkMode ? 'bg-purple-500/10 border-purple-500/30' : 'bg-purple-50 border-purple-200'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Archive className="w-4 h-4 text-purple-500" />
            <p className={`text-xs font-semibold text-purple-500`}>ÚLTIMO CIERRE</p>
          </div>
          <p className={`text-lg font-black ${txt}`}>{diasDesde(metricas.ultimoCierre)}</p>
          <p className={`text-xs ${sub}`}>{metricas.totalCierresMes} cierres este mes</p>
          <span className="absolute bottom-2 right-3 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-purple-500">Ver historial →</span>
        </div>
      </div>

      <ModalDetalleKPI
        open={modalKPI !== null}
        onClose={() => setModalKPI(null)}
        darkMode={darkMode}
        tipo={modalKPI?.tipo || 'simple'}
        titulo={modalKPI?.titulo || ''}
        valor={modalKPI?.valor || ''}
        accentColor={modalKPI?.accentColor || '#10b981'}
        icon={modalKPI?.icon || ShoppingCart}
        rango={rangoModalKPI || undefined}
        filtro={{ incluirTodosLosCajeros: true }}
        datos={modalKPI?.datos || {}}
      />

      {/* ── Aviso retención ── */}
      <div className={`mb-6 p-3.5 rounded-2xl border-2 flex items-start gap-3 ${darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className={`text-sm ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>
          <strong>Los reportes se conservan 6 meses.</strong> Descarga periódicamente en PDF o Excel para conservarlos permanentemente.
        </p>
      </div>

      {/* ── Selector de tipo de reporte ── */}
      <div className={`p-5 rounded-3xl border-2 mb-6 ${card}`}>
        <h2 className={`text-base font-bold mb-1 ${txt}`}>¿Qué reporte necesitas?</h2>
        <p className={`text-xs mb-4 ${sub}`}>Haz clic en cualquier tarjeta para configurarlo y generarlo</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TIPOS_REPORTES.map((tipo) => {
            const Icono = tipo.icono;
            return (
              <motion.button
                key={tipo.id}
                onClick={() => tipo.id === 'cierres' ? setMostrarHistorialCierres(true) : null || setTipoAGenerar(tipo)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                disabled={loading}
                className={`relative p-4 rounded-2xl border-2 text-left transition-all group ${
                  darkMode
                    ? 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tipo.color} flex items-center justify-center mb-3`}>
                  <Icono className="w-5 h-5 text-white" />
                </div>
                <h3 className={`font-bold text-sm mb-1 ${txt}`}>{tipo.nombre}</h3>
                <p className={`text-xs leading-relaxed ${sub}`}>{tipo.descripcion}</p>

                {/* Badge "Historial" para cierres */}
                {tipo.id === 'cierres' && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                    Historial
                  </span>
                )}

                <div className={`mt-3 flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r ${tipo.color} bg-clip-text text-transparent`}>
                  <FilePlus className="w-3 h-3" style={{ color: 'currentColor' }} />
                  {tipo.id === 'cierres' ? 'Ver historial' : 'Generar reporte'}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Mis reportes ── */}
      <div className={`p-5 rounded-3xl border-2 ${card}`}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className={`text-base font-bold ${txt}`}>Mis Reportes Guardados</h2>
            <p className={`text-xs ${sub}`}>{reportesGuardados.length} {reportesGuardados.length === 1 ? 'reporte' : 'reportes'} almacenados</p>
          </div>

          {/* Filtros de búsqueda */}
          {reportesGuardados.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Búsqueda */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                <Search className={`w-3.5 h-3.5 ${sub}`} />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className={`bg-transparent outline-none text-sm w-28 ${txt} placeholder:${sub}`}
                />
              </div>

              {/* Filtro por tipo */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
                <Filter className={`w-3.5 h-3.5 ${sub}`} />
                <select
                  value={filtroTipo}
                  onChange={e => setFiltroTipo(e.target.value as TipoId | '')}
                  className={`bg-transparent outline-none text-sm ${txt}`}
                >
                  <option value="">Todos los tipos</option>
                  {TIPOS_REPORTES.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Lista de reportes */}
        {reportesFiltrados.length === 0 ? (
          <div className="text-center py-12">
            <FileText className={`w-14 h-14 mx-auto mb-3 ${darkMode ? 'text-slate-700' : 'text-gray-200'}`} />
            {reportesGuardados.length === 0 ? (
              <>
                <p className={`text-base font-semibold mb-1 ${sub}`}>No hay reportes generados</p>
                <p className={`text-sm ${sub}`}>Selecciona un tipo arriba para generar tu primer reporte</p>
              </>
            ) : (
              <>
                <p className={`text-base font-semibold mb-1 ${sub}`}>Sin coincidencias</p>
                <button onClick={() => { setBusqueda(''); setFiltroTipo(''); }} className="text-sm text-emerald-500 hover:underline">
                  Limpiar filtros
                </button>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-3">
              {reportesFiltrados.map((reporte) => {
                const tipoConf = TIPOS_REPORTES.find(t => t.id === reporte.tipo);
                const Icono = tipoConf?.icono || FileText;
                const diasRestantes = reportesService.diasRestantesExpiracion(reporte);
                const expira = diasRestantes <= 7;
                const expiraMuy = diasRestantes <= 2;

                return (
                  <motion.div
                    key={reporte.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`p-4 rounded-2xl border-2 transition-colors ${
                      expiraMuy
                        ? darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
                        : expira
                          ? darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                          : darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tipoConf?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center shrink-0`}>
                          <Icono className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-sm truncate ${txt}`}>{reporte.nombre}</h3>
                          <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              {reporte.tipo.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              {reporte.metadata.totalRegistros} registros
                            </Badge>
                            {reporte.periodo.inicio !== reporte.periodo.fin && (
                              <Badge variant="outline" className="text-[10px] py-0 h-5">
                                {reporte.periodo.inicio} → {reporte.periodo.fin}
                              </Badge>
                            )}
                          </div>
                          <div className={`flex items-center gap-3 text-xs ${sub}`}>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(reporte.fechaGeneracion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`flex items-center gap-1 ${expiraMuy ? 'text-red-500 font-bold' : expira ? 'text-amber-500 font-bold' : ''}`}>
                              <Clock className="w-3 h-3" />
                              {expiraMuy ? '¡Expira pronto! ' : expira ? '⚠ ' : ''}
                              {diasRestantes} {diasRestantes === 1 ? 'día' : 'días'} restantes
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="rounded-xl font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow h-8"
                          onClick={() => setReporteParaExportar(reporte)}
                        >
                          <FileText className="w-3.5 h-3.5 mr-1" />
                          Exportar
                        </Button>
                        <button
                          className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                          onClick={() => eliminarReporte(reporte.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Barra de expiración */}
                    <div className={`mt-3 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full transition-all rounded-full ${
                          diasRestantes > 15 ? 'bg-emerald-500' : diasRestantes > 7 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, (diasRestantes / 180) * 100)}%` }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* ── Footer informativo ── */}
      <div className={`mt-6 p-4 rounded-2xl border-2 flex items-center gap-3 ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-white border-gray-100'}`}>
        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
        <p className={`text-sm ${sub}`}>
          Los reportes se generan con datos reales del negocio y se pueden exportar a PDF, Excel o imprimir en tirilla térmica de 80mm.
        </p>
      </div>

      {/* ── Modales ── */}
      <ModalGenerarReporte
        open={tipoAGenerar !== null}
        tipo={tipoAGenerar}
        onClose={() => setTipoAGenerar(null)}
        onGenerado={onGenerado}
        darkMode={darkMode}
        usuarioActual={usuarioActual}
        generarFn={generarFn}
      />

      <ModalExportarReporte
        open={reporteParaExportar !== null}
        reporte={reporteParaExportar}
        onClose={() => setReporteParaExportar(null)}
        onPDF={ejecutarPDF}
        onExcel={ejecutarExcel}
        onTirilla={ejecutarTirilla}
        onDownloadTirilla={ejecutarDownloadTirilla}
        darkMode={darkMode}
      />

      <ModalHistorialCierres
        open={mostrarHistorialCierres}
        onClose={() => setMostrarHistorialCierres(false)}
        darkMode={darkMode}
      />
    </div>
  );
}
