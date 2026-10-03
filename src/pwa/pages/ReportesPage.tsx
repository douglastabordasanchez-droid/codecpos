/**
 * Reportes del Negocio — versión web, réplica de la de Electron
 * (src/app/components/pos/ReportesPage.tsx).
 *
 * Mismas tarjetas (Ventas, Por Cajero, Inventario, Gastos, Cierres de Caja,
 * Financiero), mismos indicadores y el mismo panel de reportes guardados.
 * No se duplica lógica: los cálculos son de reportesService y la exportación
 * de exportadorReportes, exactamente los de Electron; lo único propio de la
 * web es de dónde salen los datos (Supabase, vía FuenteReportesSupabase).
 *
 * Diferencias con Electron, a propósito:
 *  · Los indicadores llevan a la pantalla correspondiente en vez de abrir el
 *    detalle en un modal (ese modal lee la base local de Electron).
 *  · «Cierres de Caja» genera el reporte del periodo; el historial turno por
 *    turno ya está en Caja.
 *  · Sin reporte de Taller ni datos de recetas/mermas: todavía no se
 *    sincronizan a la nube.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  FileText, TrendingUp, Package, DollarSign, BarChart3, Trash2, AlertCircle, Clock, FilePlus,
  Archive, Calendar, TrendingDown, ShoppingCart, AlertTriangle, Search, RefreshCw, Loader2,
} from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { reportesService, type ReporteGenerado } from '../../app/services/reportesService';
import { exportadorReportes } from '../../app/services/exportarReportes';
import ModalGenerarReporte from '../../app/components/pos/ModalGenerarReporte';
import ModalExportarReporte from '../../app/components/pos/ModalExportarReporte';
import { FuenteReportesSupabase, type MetricasReportes } from '../lib/reportesFuenteSupabase';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell } from 'recharts';
import { cargarMovimientos, calcularTotales, flujoPorDia, variacion } from '../lib/contabilidadNube';
import { fechaLocal } from '../lib/nubeConsultas';

const TIPOS_REPORTES = [
  { id: 'ventas', nombre: 'Ventas', descripcion: 'Análisis de ventas, métodos de pago y top productos', icono: TrendingUp, color: 'from-emerald-500 to-emerald-600', requierePeriodo: true },
  { id: 'cajero', nombre: 'Por Cajero', descripcion: 'Desempeño, cierres y confiabilidad de un cajero', icono: Clock, color: 'from-cyan-500 to-cyan-600', requierePeriodo: true, requiereCajero: true },
  { id: 'inventario', nombre: 'Inventario', descripcion: 'Stock actual, alertas, valor y margen de utilidad', icono: Package, color: 'from-blue-500 to-blue-600', requierePeriodo: false },
  { id: 'gastos', nombre: 'Gastos', descripcion: 'Egresos por categoría, evolución diaria y totales', icono: DollarSign, color: 'from-red-500 to-red-600', requierePeriodo: true },
  { id: 'cierres', nombre: 'Cierres de Caja', descripcion: 'Arqueos, diferencias y auditoría de cada turno', icono: Archive, color: 'from-purple-500 to-purple-600', requierePeriodo: true },
  { id: 'financiero', nombre: 'Financiero', descripcion: 'Estado de resultados, margen y rentabilidad neta', icono: BarChart3, color: 'from-amber-500 to-amber-600', requierePeriodo: true },
];

type TipoReporte = typeof TIPOS_REPORTES[number];

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

function diasDesde(fecha: string | null): string {
  if (!fecha) return 'Sin cierres';
  const d = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  return `Hace ${d} días`;
}

function fechaLocalHoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportesPage() {
  const { empleado } = usePwaAuth();
  const { tema } = useTheme();
  const navigate = useNavigate();
  const clienteId = empleado?.cliente_id;

  const fuente = useMemo(() => (clienteId ? new FuenteReportesSupabase(clienteId) : null), [clienteId]);

  const [metricas, setMetricas] = useState<MetricasReportes | null>(null);
  const [cajeros, setCajeros] = useState<Array<{ id: string; nombre: string }>>([]);
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string; color: string }>>([]);
  const [reportesGuardados, setReportesGuardados] = useState<ReporteGenerado[]>([]);
  const [tipoAGenerar, setTipoAGenerar] = useState<TipoReporte | null>(null);
  const [reporteParaExportar, setReporteParaExportar] = useState<ReporteGenerado | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const [tendencia, setTendencia] = useState<{ dias: Array<{ dia: string; ventas: number }>; total: number; cambio: number | null } | null>(null);

  const cargarReportesGuardados = () => setReportesGuardados(reportesService.obtenerReportes());

  const refrescar = useCallback(async () => {
    if (!fuente) return;
    setActualizando(true);
    try {
      if (clienteId) cargarTendencia(clienteId).then(setTendencia).catch(() => setTendencia(null));
      setMetricas(await fuente.metricas());
    } catch (e: any) {
      toast.error('No se pudieron cargar los indicadores', { description: e?.message });
    } finally {
      setActualizando(false);
    }
  }, [fuente, clienteId]);

  useEffect(() => {
    if (!fuente || !clienteId) return;
    reportesService.usarFuente(fuente);
    cargarReportesGuardados();
    refrescar();
    fuente.cajeros().then(setCajeros).catch(() => setCajeros([]));
    fuente.categorias().then(setCategorias).catch(() => setCategorias([]));

    // Encabezado de los PDF/Excel: los exportadores (compartidos con Electron)
    // leen los datos del negocio de localStorage. En la web se dejan ahí desde
    // la configuración de empresa que Electron sincroniza a la nube.
    const client = getSupabaseClient();
    if (client) {
      Promise.all([
        client.from('clientes_pos').select('nombre_negocio').eq('id', clienteId).maybeSingle(),
        client.from('empresa_configuraciones').select('datos').eq('cliente_id', clienteId).maybeSingle(),
      ]).then(([negocio, config]) => {
        const datos = ((config.data as { datos?: Record<string, any> } | null)?.datos || {}) as Record<string, any>;
        const nombre = datos.nombreComercial || datos.razonSocial || (negocio.data as { nombre_negocio?: string } | null)?.nombre_negocio;
        if (!nombre) return;
        try {
          localStorage.setItem('codecpos_empresa', JSON.stringify({
            nombre, nit: datos.nit || '', telefono: datos.telefono || '', email: datos.email || '',
            ciudad: datos.ciudad || '', direccion: datos.direccion || '',
          }));
        } catch { /* sin espacio en localStorage: el reporte sale con el nombre genérico */ }
      });
    }

    return () => reportesService.usarFuente(null);
  }, [fuente, clienteId, refrescar]);

  const generarFn = async (tipo: string, inicio: string, fin: string, cajero: string, categoria: string): Promise<ReporteGenerado> => {
    if (!fuente) throw new Error('Sin sesión');
    const por = empleado?.nombre_completo || 'Sistema POS';
    try {
      // Inventario no tiene periodo: es la foto de hoy.
      const hoy = fechaLocalHoy();
      await fuente.preparar(tipo === 'inventario' ? hoy : inicio, tipo === 'inventario' ? hoy : fin);

      let r: ReporteGenerado;
      switch (tipo) {
        case 'ventas':     r = await reportesService.generarReporteVentas(inicio, fin, categoria || undefined, por); break;
        case 'cajero':     r = await reportesService.generarReporteCajero(inicio, fin, cajero, por);                 break;
        case 'inventario': r = reportesService.generarReporteInventario(por);                                         break;
        case 'gastos':     r = reportesService.generarReporteGastos(inicio, fin, por);                                break;
        case 'cierres':    r = reportesService.generarReporteCierres(inicio, fin, por);                               break;
        case 'financiero': r = await reportesService.generarReporteFinanciero(inicio, fin, por);                      break;
        default: throw new Error('Tipo desconocido');
      }

      try {
        reportesService.guardarReporte(r);
        cargarReportesGuardados();
        toast.success('Reporte generado', { description: `${r.nombre} · ${r.metadata.totalRegistros} registros` });
      } catch {
        // El navegador limita localStorage (~5 MB): un periodo largo puede no
        // caber. El reporte igual queda listo para exportar ahora mismo.
        toast.warning('Reporte generado, pero no se pudo guardar en este navegador', {
          description: 'Es muy grande para el almacenamiento local. Expórtalo ahora a PDF o Excel.',
        });
      }
      return r;
    } catch (e: any) {
      toast.error('Error al generar el reporte', { description: e?.message });
      throw e;
    }
  };

  const ejecutar = (accion: () => void, ok: string, error: string, r: ReporteGenerado) => {
    try { accion(); toast.success(ok, { description: r.nombre }); } catch { toast.error(error); }
  };

  const eliminarReporte = (id: string) => {
    if (reportesService.eliminarReporte(id)) {
      cargarReportesGuardados();
      toast.success('Reporte eliminado');
    }
  };

  const reportesFiltrados = useMemo(() => reportesGuardados
    .filter((r) => (!filtroTipo || r.tipo === filtroTipo) && (!busqueda || r.nombre.toLowerCase().includes(busqueda.toLowerCase())))
    .sort((a, b) => new Date(b.fechaGeneracion).getTime() - new Date(a.fechaGeneracion).getTime()),
  [reportesGuardados, filtroTipo, busqueda]);

  if (!empleado) return null;

  const kpis = [
    {
      Icon: ShoppingCart, etiqueta: 'Ventas hoy', valor: metricas ? money(metricas.ventasHoy) : '—',
      detalle: new Date().toLocaleDateString('es-CO', { weekday: 'long' }), color: 'text-emerald-400', ir: '/ventas',
    },
    {
      Icon: TrendingDown, etiqueta: 'Gastos mes', valor: metricas ? money(metricas.gastosMes) : '—',
      detalle: new Date().toLocaleDateString('es-CO', { month: 'long' }), color: 'text-red-400', ir: '/gastos',
    },
    {
      Icon: AlertTriangle, etiqueta: 'Stock bajo',
      valor: metricas ? `${metricas.alertasStock} ${metricas.alertasStock === 1 ? 'producto' : 'productos'}` : '—',
      detalle: metricas?.alertasStock === 0 ? 'Todo en orden' : 'requieren atención', color: 'text-amber-400', ir: '/alertas',
    },
    {
      Icon: Archive, etiqueta: 'Último cierre', valor: metricas ? diasDesde(metricas.ultimoCierre) : '—',
      detalle: `${metricas?.totalCierresMes ?? 0} cierres este mes`, color: 'text-purple-400', ir: '/caja',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-5 pt-8 pb-24 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" style={{ color: '#ffffff' }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-white text-xl sm:text-2xl font-black truncate">Reportes del Negocio</h1>
            <p className="text-slate-400 text-xs sm:text-sm">Genera y exporta en PDF, Excel o tirilla</p>
          </div>
        </div>
        <button
          onClick={() => { cargarReportesGuardados(); refrescar(); }}
          className="h-10 w-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0"
          title="Actualizar datos"
        >
          <RefreshCw className={`w-4 h-4 ${actualizando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Indicadores en vivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ Icon, etiqueta, valor, detalle, color, ir }) => (
          <button
            key={etiqueta}
            onClick={() => navigate(ir)}
            className="text-left bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-3 sm:p-4 hover:border-slate-700 transition-colors active:scale-[0.98] min-w-0"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <p className={`text-[11px] sm:text-xs font-bold uppercase tracking-wide truncate ${color}`}>{etiqueta}</p>
            </div>
            <p className="text-white text-lg sm:text-xl font-black truncate">
              {metricas ? valor : <Loader2 className="w-5 h-5 animate-spin text-slate-500" />}
            </p>
            <p className="text-slate-500 text-xs truncate">{detalle}</p>
          </button>
        ))}
      </div>

      {/* Tendencia de la semana */}
      {tendencia && (
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Ventas últimos 7 días</p>
              <p className="text-white text-xl font-black">{money(tendencia.total)}</p>
            </div>
            {tendencia.cambio !== null && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${tendencia.cambio >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                {tendencia.cambio >= 0 ? '▲' : '▼'} {Math.abs(tendencia.cambio).toFixed(0)} % vs. semana anterior
              </span>
            )}
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tendencia.dias}>
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#33415533' }} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="ventas" name="Ventas" radius={[6, 6, 0, 0]}>
                  {tendencia.dias.map((d, i) => <Cell key={d.dia + i} fill={i === tendencia.dias.length - 1 ? '#f59e0b' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-amber-500/15 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-400">
          <strong>Los reportes se conservan 6 meses en este navegador.</strong> Descárgalos en PDF o Excel para conservarlos de forma permanente.
        </p>
      </div>

      {/* Selector de tipo */}
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5">
        <h2 className="text-white text-base font-bold">¿Qué reporte necesitas?</h2>
        <p className="text-slate-400 text-xs mb-4">Toca una tarjeta para elegir el período y generarlo</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {TIPOS_REPORTES.map((tipo) => (
            <button
              key={tipo.id}
              onClick={() => setTipoAGenerar(tipo)}
              className="group text-left bg-slate-950/50 border border-slate-800 rounded-2xl p-3 sm:p-4 hover:border-slate-700 transition-colors active:scale-[0.98] min-w-0"
            >
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${tipo.color} flex items-center justify-center mb-2 sm:mb-3`}>
                <tipo.icono className="w-5 h-5" style={{ color: '#ffffff' }} />
              </div>
              <h3 className="text-white font-bold text-sm mb-1">{tipo.nombre}</h3>
              <p className="text-slate-400 text-[11px] sm:text-xs leading-snug line-clamp-3">{tipo.descripcion}</p>
              {/* En el celular no existe "pasar el mouse": el aviso se ve siempre; en computador aparece al pasar. */}
              <p className="mt-2 sm:mt-3 flex items-center gap-1 text-xs font-semibold text-amber-400 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <FilePlus className="w-3 h-3" /> Generar reporte
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Mis reportes */}
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-white text-base font-bold">Mis Reportes Guardados</h2>
            <p className="text-slate-400 text-xs">{reportesGuardados.length} {reportesGuardados.length === 1 ? 'reporte almacenado' : 'reportes almacenados'}</p>
          </div>
          {reportesGuardados.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="relative block flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar..."
                  className="h-9 w-full sm:w-36 pl-8 pr-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm"
                />
              </span>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm">
                <option value="">Todos los tipos</option>
                {TIPOS_REPORTES.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        {reportesFiltrados.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            {reportesGuardados.length === 0 ? (
              <>
                <p className="text-slate-400 text-sm font-semibold">No hay reportes generados</p>
                <p className="text-slate-500 text-xs">Selecciona un tipo arriba para generar tu primer reporte</p>
              </>
            ) : (
              <>
                <p className="text-slate-400 text-sm font-semibold mb-1">Sin coincidencias</p>
                <button onClick={() => { setBusqueda(''); setFiltroTipo(''); }} className="text-sm text-emerald-400 underline">Limpiar filtros</button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {reportesFiltrados.map((reporte) => {
              const tipo = TIPOS_REPORTES.find((t) => t.id === reporte.tipo);
              const Icono = tipo?.icono || FileText;
              const dias = reportesService.diasRestantesExpiracion(reporte);
              return (
                <div key={reporte.id} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tipo?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center shrink-0`}>
                        <Icono className="w-5 h-5" style={{ color: '#ffffff' }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white font-bold text-sm truncate">{reporte.nombre}</h3>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {reporte.metadata.totalRegistros} registros
                          {reporte.periodo.inicio !== reporte.periodo.fin && ` · ${reporte.periodo.inicio} → ${reporte.periodo.fin}`}
                        </p>
                        <p className="text-slate-500 text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(reporte.fechaGeneracion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`flex items-center gap-1 ${dias <= 7 ? 'text-amber-400 font-bold' : ''}`}>
                            <Clock className="w-3 h-3" /> {dias} {dias === 1 ? 'día restante' : 'días restantes'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setReporteParaExportar(reporte)} className="h-9 px-3 flex-1 sm:flex-none justify-center rounded-lg bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Exportar
                      </button>
                      <button onClick={() => eliminarReporte(reporte.id)} title="Eliminar" className="h-9 w-9 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-1 rounded-full overflow-hidden bg-slate-800">
                    <div
                      className={`h-full rounded-full ${dias > 15 ? 'bg-emerald-500' : dias > 7 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, (dias / 180) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ModalGenerarReporte
        open={tipoAGenerar !== null}
        tipo={tipoAGenerar}
        onClose={() => setTipoAGenerar(null)}
        onGenerado={setReporteParaExportar}
        darkMode={tema === 'dark'}
        usuarioActual={{ id: empleado.id }}
        generarFn={generarFn}
        cajeros={cajeros}
        categorias={categorias}
      />

      <ModalExportarReporte
        open={reporteParaExportar !== null}
        reporte={reporteParaExportar}
        onClose={() => setReporteParaExportar(null)}
        onPDF={(r) => ejecutar(() => exportadorReportes.exportarPDF(r), 'PDF descargado', 'Error al exportar PDF', r)}
        onExcel={(r) => ejecutar(() => exportadorReportes.exportarExcel(r), 'Excel descargado', 'Error al exportar Excel', r)}
        onTirilla={(r) => ejecutar(() => exportadorReportes.imprimirTirilla(r), 'Tirilla enviada a imprimir', 'Error al imprimir', r)}
        onDownloadTirilla={(r) => ejecutar(() => exportadorReportes.descargarTirilla(r), 'Tirilla descargada', 'Error al descargar tirilla', r)}
        darkMode={tema === 'dark'}
      />
    </div>
  );
}

/** Ventas de los últimos 7 días (hoy incluido) y su cambio frente a los 7 anteriores. */
async function cargarTendencia(clienteId: string) {
  const hoy = new Date();
  const hace = (n: number) => fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n));
  const [actual, anterior] = await Promise.all([
    cargarMovimientos(clienteId, hace(6), hace(0)),
    cargarMovimientos(clienteId, hace(13), hace(7)),
  ]);
  const porDia = new Map(flujoPorDia({ ...actual, gastos: [], devoluciones: [], ingresosExtra: [] }).map((d) => [d.dia, d.entradas]));
  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = hace(6 - i);
    const etiqueta = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
    return { dia: etiqueta, ventas: porDia.get(fecha) || 0 };
  });
  const total = calcularTotales(actual).ventas;
  return { dias, total, cambio: variacion(total, calcularTotales(anterior).ventas) };
}
