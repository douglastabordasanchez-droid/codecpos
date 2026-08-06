import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Search, Filter, Calendar, Phone, Eye, Plus, RefreshCw, X, User,
  Smartphone, Tablet, Laptop, Monitor, Tv, Gamepad2, Watch, Headphones, Box,
  Inbox, DollarSign, CheckCircle2, Wrench, Clock, CheckCircle,
  Package, Archive, XCircle, ShieldAlert,
  Zap, ArrowDown, Minus, ArrowUp,
  Printer, MessageCircle, LayoutGrid, List,
} from 'lucide-react';
import { tallerService } from '../../services/tallerService';
import {
  type OrdenServicio, type EstadoOrden, type FiltrosOrden,
  ESTADOS_ORDEN, PRIORIDADES, TIPOS_DISPOSITIVO,
} from '../../types/taller';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePOS } from '../../contexts/POSContext';
import { useLanContext } from '../../contexts/LanContext';
import { getNombreEmpresaCliente } from '../../lib/empresaConfig';
import ModalImprimirOrdenTaller from './ModalImprimirOrdenTaller';
import { toast } from 'sonner';

// ── Icon maps ──────────────────────────────────────────────────────────────────
const ESTADO_ICONS: Record<string, React.ElementType> = {
  recibido: Inbox, diagnostico: Search, cotizado: DollarSign,
  aprobado: CheckCircle2, en_reparacion: Wrench, esperando_repuestos: Clock,
  reparado: CheckCircle, listo_entrega: Package, entregado: Archive,
  cancelado: XCircle, garantia: ShieldAlert,
};
const PRIORIDAD_ICONS: Record<string, React.ElementType> = {
  baja: ArrowDown, normal: Minus, alta: ArrowUp, urgente: Zap,
};
const TIPO_ICONS: Record<string, React.ElementType> = {
  celular: Smartphone, tablet: Tablet, laptop: Laptop, computador: Monitor,
  tv: Tv, consola: Gamepad2, smartwatch: Watch, audifonos: Headphones, otro: Box,
};

function EstadoIcon({ estado, className = 'w-3.5 h-3.5', style }: { estado: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ESTADO_ICONS[estado] || Box;
  return <Icon className={className} style={style} />;
}
function PrioridadIcon({ prioridad, className = 'w-3 h-3', style }: { prioridad: string; className?: string; style?: React.CSSProperties }) {
  const Icon = PRIORIDAD_ICONS[prioridad] || Minus;
  return <Icon className={className} style={style} />;
}
function TipoIcon({ tipo, className = 'w-3.5 h-3.5', style }: { tipo: string; className?: string; style?: React.CSSProperties }) {
  const Icon = TIPO_ICONS[tipo] || Box;
  return <Icon className={className} style={style} />;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function enviarWhatsApp(orden: OrdenServicio, estadoOverride?: EstadoOrden) {
  const empresa = getNombreEmpresaCliente();
  const tel = orden.cliente.telefono.replace(/\D/g, '');
  const numero = tel.startsWith('57') ? tel : `57${tel}`;
  const estadoLabel =
    ESTADOS_ORDEN.find((e) => e.value === (estadoOverride ?? orden.estado))?.label ?? (estadoOverride ?? orden.estado);
  const msg =
    `*${empresa} - SOPORTE TECNICO*\n\n` +
    `Hola *${orden.cliente.nombre}*, te informamos sobre tu orden *${orden.numeroOrden}*.\n\n` +
    `*Dispositivo:* ${orden.dispositivo.marca} ${orden.dispositivo.modelo}\n` +
    `*Estado actual:* ${estadoLabel}\n\n` +
    `Cualquier consulta estamos a tu disposicion.\n_${empresa}_`;
  window.open(`https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Component ──────────────────────────────────────────────────────────────────
interface ListaOrdenestallerProps {
  onVerDetalle: (orden: OrdenServicio) => void;
  onNuevaOrden: () => void;
}

export default function ListaOrdenesTaller({ onVerDetalle, onNuevaOrden }: ListaOrdenestallerProps) {
  const { darkMode } = usePOS();
  const { emitLanEvent } = useLanContext();
  const [ordenes, setOrdenes] = useState<OrdenServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ordenParaImprimir, setOrdenParaImprimir] = useState<OrdenServicio | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [modoVista, setModoVista] = useState<'lista' | 'kanban'>('kanban');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [estadoDropActivo, setEstadoDropActivo] = useState<EstadoOrden | null>(null);
  const [filtros, setFiltros] = useState<FiltrosOrden>({});
  const [busqueda, setBusqueda] = useState('');
  const boardScrollRef = useRef<HTMLDivElement>(null);

  const cargarOrdenes = async () => {
    setCargando(true);
    try {
      setOrdenes(await tallerService.buscarOrdenes(filtros));
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarOrdenes(); }, [filtros]);

  const ordenesFiltradas = ordenes.filter((o) => {
    if (!busqueda.trim()) return true;
    const t = busqueda.toLowerCase();
    return (
      o.numeroOrden.toLowerCase().includes(t) ||
      o.cliente.nombre.toLowerCase().includes(t) ||
      o.cliente.telefono.includes(t) ||
      o.dispositivo.marca.toLowerCase().includes(t) ||
      o.dispositivo.modelo.toLowerCase().includes(t) ||
      o.dispositivo.serial?.toLowerCase().includes(t) ||
      o.dispositivo.imei?.toLowerCase().includes(t)
    );
  });

  const getEstadoConfig = (e: EstadoOrden) => ESTADOS_ORDEN.find((x) => x.value === e);
  const getPrioridadConfig = (p: string) => PRIORIDADES.find((x) => x.value === p);

  const moverOrdenEstado = async (orden: OrdenServicio, nuevoEstado: EstadoOrden) => {
    if (orden.estado === nuevoEstado) return;
    try {
      await tallerService.cambiarEstado(orden.id, nuevoEstado, 'Tablero Kanban', 'Cambio por arrastre');
      await cargarOrdenes();
      const estadoLabel = ESTADOS_ORDEN.find((e) => e.value === nuevoEstado)?.label ?? nuevoEstado;

      // Notificar al Admin y a las cajeras vía LAN
      emitLanEvent('TALLER_ORDEN', {
        ordenId:         orden.id,
        numeroOrden:     orden.numeroOrden,
        nuevoEstado,
        nuevoEstadoLabel: estadoLabel,
        marca:           orden.dispositivo.marca,
        modelo:          orden.dispositivo.modelo,
        cliente:         orden.cliente.nombre,
        tecnico:         orden.tecnicoAsignado || '',
      });

      toast.success(`${orden.numeroOrden} → ${estadoLabel}`, {
        description: `¿Notificar a ${orden.cliente.nombre} por WhatsApp?`,
        action: { label: 'Enviar WhatsApp', onClick: () => enviarWhatsApp({ ...orden, estado: nuevoEstado }, nuevoEstado) },
        duration: 8000,
      });
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo cambiar el estado');
    }
  };

  const columnasKanban = ESTADOS_ORDEN.filter((e) => e.value !== 'entregado' && e.value !== 'cancelado');

  const inputCls = darkMode
    ? 'bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:ring-blue-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500 shadow-sm';

  const btnSecondary = darkMode
    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm';

  // ── Filtros panel ────────────────────────────────────────────────────────────
  const FiltrosPanel = () => (
    <motion.div
      initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
      className={`rounded-2xl border p-5 mb-4 ${
        darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          <Filter className="w-4 h-4 text-blue-400" /> Filtros Avanzados
        </h3>
        <button onClick={() => setMostrarFiltros(false)}
          className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
          <X className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Estados</p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {ESTADOS_ORDEN.map((estado) => (
              <label key={estado.value} className={`flex items-center gap-2 text-sm cursor-pointer ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <input type="checkbox"
                  checked={filtros.estado?.includes(estado.value) || false}
                  onChange={(e) => {
                    const arr = e.target.checked
                      ? [...(filtros.estado || []), estado.value]
                      : (filtros.estado || []).filter((x) => x !== estado.value);
                    setFiltros({ ...filtros, estado: arr.length ? arr : undefined });
                  }}
                  className="w-4 h-4 accent-blue-600 rounded" />
                <span className="flex items-center gap-1.5">
                  <EstadoIcon estado={estado.value} className="w-3.5 h-3.5" style={{ color: estado.color }} />
                  {estado.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Prioridades</p>
          <div className="space-y-1.5">
            {PRIORIDADES.map((p) => (
              <label key={p.value} className={`flex items-center gap-2 text-sm cursor-pointer ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <input type="checkbox"
                  checked={filtros.prioridad?.includes(p.value) || false}
                  onChange={(e) => {
                    const arr = e.target.checked
                      ? [...(filtros.prioridad || []), p.value]
                      : (filtros.prioridad || []).filter((x) => x !== p.value);
                    setFiltros({ ...filtros, prioridad: arr.length ? arr : undefined });
                  }}
                  className="w-4 h-4 accent-blue-600 rounded" />
                <span className="flex items-center gap-1.5">
                  <PrioridadIcon prioridad={p.value} className="w-3.5 h-3.5" style={{ color: p.color } as React.CSSProperties} />
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Fecha Desde', key: 'fechaDesde' as const },
            { label: 'Fecha Hasta', key: 'fechaHasta' as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
              <input type="date" value={(filtros as any)[key] || ''}
                onChange={(e) => setFiltros({ ...filtros, [key]: e.target.value || undefined })}
                className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 ${inputCls}`} />
            </div>
          ))}
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Técnico</p>
            <input type="text" value={filtros.tecnico || ''}
              onChange={(e) => setFiltros({ ...filtros, tecnico: e.target.value || undefined })}
              placeholder="Nombre del técnico"
              className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 ${inputCls}`} />
          </div>
        </div>
      </div>
      <div className={`flex gap-2 mt-4 pt-3 border-t ${darkMode ? 'border-slate-700/40' : 'border-slate-100'}`}>
        <button onClick={() => { setMostrarFiltros(false); cargarOrdenes(); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Aplicar
        </button>
        <button onClick={() => { setFiltros({}); setBusqueda(''); setMostrarFiltros(false); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${btnSecondary}`}>
          Limpiar
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-4">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div>
          <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>Órdenes de Taller</h2>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {ordenesFiltradas.length} {ordenesFiltradas.length === 1 ? 'orden' : 'órdenes'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModoVista(modoVista === 'kanban' ? 'lista' : 'kanban')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${btnSecondary}`}>
            {modoVista === 'kanban' ? <><List className="w-4 h-4" /> Lista</> : <><LayoutGrid className="w-4 h-4" /> Kanban</>}
          </button>
          <button onClick={cargarOrdenes}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold transition-colors ${btnSecondary}`}>
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button onClick={onNuevaOrden}
            className="px-4 py-2 text-white rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%)',
              boxShadow: '0 4px 16px rgba(37,99,235,0.45)',
            }}>
            <Plus className="w-4 h-4" /> Nueva Orden
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por orden, cliente, teléfono, dispositivo, serial…"
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${inputCls}`} />
        </div>
        <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold transition-colors ${
            mostrarFiltros ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : btnSecondary
          }`}>
          <Filter className="w-4 h-4" /> Filtros
        </button>
      </div>

      {mostrarFiltros && <FiltrosPanel />}

      {/* ── Loading / Empty ─────────────────────────────────────────────────── */}
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500/20 animate-spin border-t-blue-500" />
            <div className="absolute inset-0 rounded-full blur-md bg-blue-500/20 animate-pulse" />
          </div>
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className={`rounded-2xl border py-20 text-center ${
          darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <Package className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
          <p className={`text-sm font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No se encontraron órdenes</p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>Crea una nueva orden o ajusta los filtros</p>
        </div>

      ) : modoVista === 'lista' ? (
        /* ── Vista Lista ────────────────────────────────────────────────────── */
        <div className={`rounded-2xl border overflow-hidden ${
          darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200 shadow-sm'
        }`}
          style={{
            boxShadow: darkMode
              ? '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          }}>
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <div className="min-w-[900px]">
              {ordenesFiltradas.map((orden) => {
                const eCfg = getEstadoConfig(orden.estado);
                const pCfg = getPrioridadConfig(orden.prioridad);
                const dias = differenceInDays(new Date(), new Date(orden.fechaRecepcion));
                return (
                  <motion.div
                    key={orden.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => onVerDetalle(orden)}
                    className={`flex items-center gap-4 px-5 py-3.5 border-b cursor-pointer transition-all ${
                      darkMode
                        ? 'border-slate-700/50 hover:bg-slate-700/30'
                        : 'border-slate-100 hover:bg-blue-50/40'
                    }`}
                    style={{
                      borderLeft: `3px solid ${eCfg?.color}`,
                    }}
                  >
                    <div className="min-w-[160px]">
                      <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{orden.numeroOrden}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{orden.cliente.nombre}</p>
                    </div>

                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg,${eCfg?.color}28,${eCfg?.color}14)`,
                        color: eCfg?.color,
                        border: `1px solid ${eCfg?.color}40`,
                        boxShadow: `0 0 8px ${eCfg?.color}20`,
                      }}>
                      <EstadoIcon estado={orden.estado} className="w-3 h-3" />
                      {eCfg?.label}
                    </span>

                    <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black flex-shrink-0"
                      style={{
                        background: `${pCfg?.color}20`,
                        color: pCfg?.color,
                        border: `1px solid ${pCfg?.color}30`,
                      }}>
                      <PrioridadIcon prioridad={orden.prioridad} className="w-3 h-3" />
                      {pCfg?.label}
                    </span>

                    <div className={`flex items-center gap-1.5 text-xs flex-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      <TipoIcon tipo={orden.dispositivo.tipo} className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                      {orden.dispositivo.marca} {orden.dispositivo.modelo}
                    </div>

                    <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Phone className="w-3.5 h-3.5" /> {orden.cliente.telefono}
                    </div>

                    <div className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(orden.fechaRecepcion), 'dd/MM/yy', { locale: es })}
                      {dias > 3 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-black"
                          style={{
                            background: dias > 7 ? '#ef444425' : '#f59e0b25',
                            color: dias > 7 ? '#ef4444' : '#f59e0b',
                          }}>
                          {dias}d
                        </span>
                      )}
                    </div>

                    <div className="text-right min-w-[100px]">
                      <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        ${orden.costoEstimado.toLocaleString('es-CO')}
                      </p>
                      {orden.saldoPendiente > 0 && (
                        <p className="text-xs font-bold text-amber-500">
                          Saldo ${orden.saldoPendiente.toLocaleString('es-CO')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button title="Ver detalle" onClick={() => onVerDetalle(orden)}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.24)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.12)')}>
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button title="Imprimir ticket" onClick={() => setOrdenParaImprimir(orden)}
                        className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button title="WhatsApp" onClick={() => enviarWhatsApp(orden)}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.24)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.12)')}>
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

      ) : (
        /* ── Vista Kanban ─────────────────────────────────────────────────── */
        <div className="relative rounded-3xl overflow-hidden"
          style={{
            background: darkMode
              ? 'linear-gradient(180deg,#020617 0%,#080f20 100%)'
              : 'linear-gradient(180deg,#f1f5f9 0%,#e2e8f0 100%)',
            boxShadow: darkMode
              ? '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 8px 32px rgba(15,23,42,0.1)',
          }}>

          {/* Tech grid overlay */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: darkMode
                ? 'linear-gradient(rgba(99,102,241,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.04) 1px,transparent 1px)'
                : 'linear-gradient(rgba(99,102,241,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.06) 1px,transparent 1px)',
              backgroundSize: '48px 48px',
            }} />

          <div
            ref={boardScrollRef}
            className="relative overflow-x-auto pb-4 p-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as React.CSSProperties['msOverflowStyle'] }}>
            <div className="flex gap-3" style={{ minWidth: `${columnasKanban.length * 308}px` }}>
              {columnasKanban.map((estado) => {
                const ordenesCol = ordenesFiltradas.filter((o) => o.estado === estado.value);
                const isDragTarget = estadoDropActivo === estado.value;
                return (
                  <div
                    key={estado.value}
                    className="snap-start flex-shrink-0 w-[292px] flex flex-col"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setEstadoDropActivo(estado.value);
                      const container = boardScrollRef.current;
                      if (container) {
                        const { left, right } = container.getBoundingClientRect();
                        const EDGE = 80;
                        if (e.clientX > right - EDGE) container.scrollLeft += 14;
                        else if (e.clientX < left + EDGE) container.scrollLeft -= 14;
                      }
                    }}
                    onDragLeave={() => setEstadoDropActivo(null)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const ordenId = e.dataTransfer.getData('text/plain');
                      const orden = ordenesFiltradas.find((o) => o.id === ordenId);
                      if (orden) await moverOrdenEstado(orden, estado.value);
                      setDraggingId(null);
                      setEstadoDropActivo(null);
                    }}
                  >
                    {/* Column header */}
                    <div
                      className="rounded-2xl p-3 mb-2.5 flex-shrink-0 relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg,${estado.color}22 0%,${estado.color}0a 100%)`,
                        border: `1px solid ${estado.color}35`,
                        borderTop: `2px solid ${estado.color}`,
                        boxShadow: `0 4px 16px ${estado.color}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
                      }}
                    >
                      {/* Header glow */}
                      <div className="absolute inset-0 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at 0% 0%,${estado.color}15 0%,transparent 60%)` }} />

                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg"
                            style={{ background: `${estado.color}22`, border: `1px solid ${estado.color}35` }}>
                            <EstadoIcon estado={estado.value} className="w-3.5 h-3.5" style={{ color: estado.color }} />
                          </div>
                          <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {estado.label}
                          </h3>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full font-black text-white"
                          style={{
                            background: `linear-gradient(135deg,${estado.color} 0%,${estado.color}cc 100%)`,
                            boxShadow: `0 2px 8px ${estado.color}55`,
                          }}>
                          {ordenesCol.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards area */}
                    <div
                      className="flex-1 min-h-[60vh] rounded-2xl p-2 space-y-2.5 transition-all duration-200"
                      style={{
                        background: isDragTarget
                          ? `radial-gradient(ellipse at top,${estado.color}18 0%,transparent 70%)`
                          : darkMode ? 'rgba(2,6,23,0.55)' : 'rgba(248,250,252,0.85)',
                        border: isDragTarget
                          ? `2px dashed ${estado.color}60`
                          : `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.07)'}`,
                        boxShadow: isDragTarget ? `inset 0 0 24px ${estado.color}12` : 'none',
                      }}
                    >
                      {ordenesCol.map((orden) => {
                        const pCfg = getPrioridadConfig(orden.prioridad);
                        const isDragging = draggingId === orden.id;
                        const dias = differenceInDays(new Date(), new Date(orden.fechaRecepcion));
                        const isUrgente = orden.prioridad === 'urgente';
                        const isAlta = orden.prioridad === 'alta';

                        return (
                          <motion.div
                            key={orden.id}
                            draggable
                            onDragStart={(e) => {
                              (e as any).dataTransfer.setData('text/plain', orden.id);
                              setDraggingId(orden.id);
                            }}
                            onDragEnd={() => { setDraggingId(null); setEstadoDropActivo(null); }}
                            whileHover={{ y: -3, scale: 1.015 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onClick={() => onVerDetalle(orden)}
                            className="rounded-xl p-3 cursor-grab active:cursor-grabbing relative overflow-hidden"
                            style={{
                              background: darkMode
                                ? 'linear-gradient(160deg,rgba(30,41,59,0.97) 0%,rgba(15,23,42,0.95) 100%)'
                                : 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)',
                              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'}`,
                              borderLeft: `3px solid ${estado.color}`,
                              boxShadow: isDragging
                                ? 'none'
                                : isUrgente
                                ? darkMode
                                  ? `0 4px 20px rgba(0,0,0,0.5),0 0 0 1px ${pCfg?.color}40,0 0 16px ${pCfg?.color}25`
                                  : `0 4px 20px rgba(0,0,0,0.12),0 0 0 1px ${pCfg?.color}50,0 0 20px ${pCfg?.color}20`
                                : darkMode
                                ? '0 4px 20px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.04)'
                                : '0 2px 12px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,1)',
                              opacity: isDragging ? 0.45 : 1,
                              transform: isDragging ? 'scale(0.97)' : undefined,
                            }}
                          >
                            {/* Top color bleed */}
                            <div className="absolute top-0 left-3 right-0 h-px pointer-events-none"
                              style={{ background: `linear-gradient(90deg,${estado.color}50,transparent)` }} />

                            {/* Urgente pulse ring */}
                            {isUrgente && (
                              <div className="absolute inset-0 rounded-xl pointer-events-none animate-pulse"
                                style={{ boxShadow: `inset 0 0 0 1px ${pCfg?.color}35` }} />
                            )}

                            {/* Header: number + priority */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <p className={`font-black text-sm tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  {orden.numeroOrden}
                                </p>
                                <p className={`text-xs mt-0.5 truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {orden.cliente.nombre}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {dias > 3 && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                                    style={{
                                      background: dias > 7 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                      color: dias > 7 ? '#ef4444' : '#f59e0b',
                                    }}>
                                    {dias}d
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black"
                                  style={{
                                    background: `linear-gradient(135deg,${pCfg?.color}28,${pCfg?.color}14)`,
                                    color: pCfg?.color,
                                    border: `1px solid ${pCfg?.color}30`,
                                  }}>
                                  <PrioridadIcon prioridad={orden.prioridad} className="w-2.5 h-2.5" />
                                  {pCfg?.label}
                                </span>
                              </div>
                            </div>

                            {/* Device */}
                            <div className={`flex items-center gap-1.5 text-xs mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                              <TipoIcon tipo={orden.dispositivo.tipo} className="w-3.5 h-3.5 flex-shrink-0" style={{ opacity: 0.65 } as React.CSSProperties} />
                              <span className="truncate font-medium">{orden.dispositivo.marca} {orden.dispositivo.modelo}</span>
                            </div>

                            {/* Problem */}
                            <p className={`text-xs line-clamp-2 mb-2.5 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {orden.problemaReportado.descripcion}
                            </p>

                            {/* Phone + tech */}
                            <div className={`text-xs space-y-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              <p className="flex items-center gap-1.5">
                                <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                                {orden.cliente.telefono}
                              </p>
                              {orden.tecnicoAsignado && (
                                <p className="flex items-center gap-1.5">
                                  <User className="w-2.5 h-2.5 flex-shrink-0" />
                                  {orden.tecnicoAsignado}
                                </p>
                              )}
                            </div>

                            {/* Footer divider */}
                            <div
                              className="mt-2.5 pt-2 border-t"
                              style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  {format(new Date(orden.fechaRecepcion), 'dd/MM/yy', { locale: es })}
                                </span>
                                <div className="text-right">
                                  <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    ${(orden.valorCobrado ?? orden.costoFinal ?? orden.costoEstimado).toLocaleString('es-CO')}
                                  </span>
                                  {orden.saldoPendiente > 0 && (
                                    <p className="text-[10px] font-bold text-amber-500">
                                      Saldo ${orden.saldoPendiente.toLocaleString('es-CO')}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button title="Ver detalle" onClick={() => onVerDetalle(orden)}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                                  style={{ background: 'rgba(59,130,246,0.14)', color: '#3b82f6' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.28)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.14)')}>
                                  <Eye className="w-3 h-3" /> Detalle
                                </button>
                                <button title="Imprimir" onClick={() => setOrdenParaImprimir(orden)}
                                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'bg-slate-700/70 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button title="WhatsApp" onClick={() => enviarWhatsApp(orden)}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.28)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.14)')}>
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}

                      {ordenesCol.length === 0 && (
                        <div className={`flex flex-col items-center justify-center py-12 gap-2 ${darkMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          <Package className="w-7 h-7" />
                          <p className="text-xs font-medium">Sin órdenes</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ModalImprimirOrdenTaller
        open={!!ordenParaImprimir}
        orden={ordenParaImprimir}
        onClose={() => setOrdenParaImprimir(null)}
        darkMode={darkMode}
      />
    </div>
  );
}
