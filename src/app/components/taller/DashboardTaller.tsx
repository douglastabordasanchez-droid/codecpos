import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp, Package, DollarSign, Clock, AlertCircle, CheckCircle,
  Wrench, Users, Inbox, Search, CheckCircle2, Archive, XCircle,
  ShieldAlert, RefreshCw, Box, Phone, Smartphone, Tablet, Laptop,
  Monitor, Tv, Gamepad2, Watch, Headphones,
} from 'lucide-react';
import { tallerService } from '../../services/tallerService';
import type { EstadisticasTaller } from '../../types/taller';
import { ESTADOS_ORDEN } from '../../types/taller';
import { usePOS } from '../../contexts/POSContext';

const ESTADO_ICONS: Record<string, React.ElementType> = {
  recibido: Inbox, diagnostico: Search, cotizado: DollarSign,
  aprobado: CheckCircle2, en_reparacion: Wrench, esperando_repuestos: Clock,
  reparado: CheckCircle, listo_entrega: Package, entregado: Archive,
  cancelado: XCircle, garantia: ShieldAlert,
};

const TIPO_ICONS: Record<string, React.ElementType> = {
  celular: Smartphone, tablet: Tablet, laptop: Laptop, computador: Monitor,
  tv: Tv, consola: Gamepad2, smartwatch: Watch, audifonos: Headphones, otro: Box,
};

// KPI card color palettes
const KPI_PALETTES = {
  blue: {
    hex: '#3b82f6',
    darkBg: 'linear-gradient(145deg,#0d2145 0%,#071228 100%)',
    lightBg: 'linear-gradient(145deg,#dbeafe 0%,#bfdbfe 100%)',
    shadow: 'rgba(59,130,246,0.35)',
    textLight: '#1d4ed8',
  },
  emerald: {
    hex: '#10b981',
    darkBg: 'linear-gradient(145deg,#052e1c 0%,#021510 100%)',
    lightBg: 'linear-gradient(145deg,#d1fae5 0%,#a7f3d0 100%)',
    shadow: 'rgba(16,185,129,0.35)',
    textLight: '#065f46',
  },
  violet: {
    hex: '#8b5cf6',
    darkBg: 'linear-gradient(145deg,#1e0f45 0%,#0f0628 100%)',
    lightBg: 'linear-gradient(145deg,#ede9fe 0%,#ddd6fe 100%)',
    shadow: 'rgba(139,92,246,0.35)',
    textLight: '#5b21b6',
  },
  amber: {
    hex: '#f59e0b',
    darkBg: 'linear-gradient(145deg,#2d1a03 0%,#1a0f02 100%)',
    lightBg: 'linear-gradient(145deg,#fef3c7 0%,#fde68a 100%)',
    shadow: 'rgba(245,158,11,0.35)',
    textLight: '#92400e',
  },
  red: {
    hex: '#ef4444',
    darkBg: 'linear-gradient(145deg,#2d0a0a 0%,#1a0606 100%)',
    lightBg: 'linear-gradient(145deg,#fee2e2 0%,#fecaca 100%)',
    shadow: 'rgba(239,68,68,0.35)',
    textLight: '#991b1b',
  },
};

export default function DashboardTaller() {
  const { darkMode } = usePOS();
  const [estadisticas, setEstadisticas] = useState<EstadisticasTaller | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarEstadisticas = async () => {
    setCargando(true);
    try {
      setEstadisticas(await tallerService.obtenerEstadisticas());
    } catch (e) {
      console.error('Error al cargar estadísticas:', e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarEstadisticas(); }, []);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 animate-spin border-t-blue-500" />
          <div className="absolute inset-0 rounded-full blur-md bg-blue-500/20 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!estadisticas) {
    return (
      <div className="text-center py-12">
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>No se pudieron cargar las estadísticas</p>
        <button onClick={cargarEstadisticas}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm flex items-center gap-2 mx-auto">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  const kpiCards = [
    { titulo: 'Total Órdenes',      valor: estadisticas.totalOrdenes,                        format: 'num',     icon: Package,    palette: 'blue',    desc: 'Órdenes registradas' },
    { titulo: 'Órdenes Activas',    valor: estadisticas.ordenesActivas,                      format: 'num',     icon: Wrench,     palette: 'emerald', desc: 'En proceso' },
    { titulo: 'Ingresos Totales',   valor: estadisticas.ingresosTotales,                     format: 'money',   icon: DollarSign, palette: 'violet',  desc: 'Total facturado' },
    { titulo: 'Tiempo Promedio',    valor: estadisticas.tiempoPromedioReparacion,             format: 'hours',   icon: Clock,      palette: 'amber',   desc: 'Por reparación' },
    { titulo: 'Por Cobrar',         valor: estadisticas.totalPendiente,                      format: 'money',   icon: AlertCircle,palette: 'red',     desc: `${estadisticas.ordenesConSaldoPendiente} órdenes con saldo` },
  ] as const;

  const periodCards = [
    { titulo: 'Hoy',          ordenes: estadisticas.ordenesHoy,    ingresos: estadisticas.ingresosHoy,    hex: '#10b981', icon: CheckCircle },
    { titulo: 'Esta Semana',  ordenes: estadisticas.ordenesSemana, ingresos: estadisticas.ingresosSemana, hex: '#3b82f6', icon: TrendingUp },
    { titulo: 'Este Mes',     ordenes: estadisticas.ordenesMes,    ingresos: estadisticas.ingresosMes,    hex: '#8b5cf6', icon: Package },
  ];

  const formatVal = (val: number, fmt: string) => {
    if (fmt === 'money') return `$${val.toLocaleString('es-CO')}`;
    if (fmt === 'hours') return `${val.toFixed(0)}h`;
    return val.toString();
  };

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        {kpiCards.map((card, i) => {
          const p = KPI_PALETTES[card.palette];
          const Icon = card.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
              className="relative rounded-2xl p-5 overflow-hidden"
              style={{
                background: darkMode ? p.darkBg : p.lightBg,
                boxShadow: darkMode
                  ? `0 8px 32px ${p.shadow}, 0 1px 0 rgba(255,255,255,0.04) inset`
                  : `0 4px 20px ${p.shadow}, 0 1px 0 rgba(255,255,255,0.9) inset`,
                border: `1px solid ${p.hex}25`,
              }}
            >
              {/* Ambient orb */}
              <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full blur-3xl pointer-events-none"
                style={{ background: p.hex, opacity: darkMode ? 0.18 : 0.22 }} />

              {/* Top highlight */}
              <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent 0%, ${p.hex}80 50%, transparent 100%)` }} />

              {/* Icon badge */}
              <div className="absolute top-4 right-4 p-2.5 rounded-xl"
                style={{
                  background: `${p.hex}22`,
                  border: `1px solid ${p.hex}35`,
                  boxShadow: `0 0 16px ${p.hex}25`,
                }}>
                <Icon className="w-5 h-5" style={{ color: p.hex }} />
              </div>

              <p className="text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: darkMode ? `${p.hex}bb` : p.textLight, opacity: 0.85 }}>
                {card.titulo}
              </p>
              <p className="text-3xl font-black leading-none mb-1"
                style={{ color: darkMode ? '#f8fafc' : p.textLight }}>
                {formatVal(card.valor as number, card.format)}
              </p>
              <p className="text-xs mt-2"
                style={{ color: darkMode ? `${p.hex}90` : p.textLight, opacity: 0.75 }}>
                {card.desc}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Period Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {periodCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.38 + i * 0.08 }}
              className={`relative rounded-2xl p-5 overflow-hidden border ${
                darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200'
              }`}
              style={{
                boxShadow: darkMode
                  ? `0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)`
                  : `0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)`,
              }}
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full"
                style={{ background: `linear-gradient(180deg, ${card.hex} 0%, ${card.hex}55 100%)` }} />

              {/* Corner glow */}
              <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                style={{ background: card.hex, opacity: darkMode ? 0.12 : 0.1 }} />

              <div className="flex items-center gap-2.5 mb-4 pl-3">
                <div className="p-2 rounded-lg" style={{ background: `${card.hex}20`, border: `1px solid ${card.hex}30` }}>
                  <Icon className="w-4 h-4" style={{ color: card.hex }} />
                </div>
                <p className={`font-bold text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {card.titulo}
                </p>
              </div>

              <div className="space-y-2.5 pl-3">
                <div className="flex justify-between items-end">
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Órdenes</span>
                  <span className="text-2xl font-black" style={{ color: card.hex }}>{card.ordenes}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ingresos</span>
                  <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    ${card.ingresos.toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Grid 2col ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Cartera */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }}
          className="relative rounded-2xl p-6 overflow-hidden border"
          style={{
            background: darkMode
              ? 'linear-gradient(145deg,#2d1a03 0%,#1a0f02 100%)'
              : 'linear-gradient(145deg,#fffbeb 0%,#fef3c7 100%)',
            border: '1px solid #f59e0b30',
            boxShadow: darkMode
              ? '0 8px 28px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 4px 20px rgba(245,158,11,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full blur-3xl pointer-events-none"
            style={{ background: '#f59e0b', opacity: 0.15 }} />
          <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg,transparent,#f59e0b70,transparent)' }} />

          <h3 className={`text-base font-black mb-5 flex items-center gap-2 ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
            <DollarSign className="w-5 h-5" />
            Cartera del Taller
          </h3>

          <div className="space-y-3">
            {[
              { label: 'Total pendiente',     val: `$${estadisticas.totalPendiente.toLocaleString('es-CO')}`,       bold: true, accent: darkMode ? 'text-amber-300' : 'text-amber-700' },
              { label: 'Órdenes con deuda',   val: estadisticas.ordenesConSaldoPendiente.toString(),                bold: false, accent: darkMode ? 'text-white' : 'text-slate-900' },
              { label: 'Pendiente vencido',   val: `$${estadisticas.saldoPendienteVencido.toLocaleString('es-CO')}`, bold: true, accent: darkMode ? 'text-red-400' : 'text-red-600' },
            ].map((row) => (
              <div key={row.label} className={`flex justify-between items-center py-2.5 px-3 rounded-xl ${
                darkMode ? 'bg-black/20' : 'bg-white/50'
              } border ${darkMode ? 'border-amber-500/10' : 'border-amber-200/50'}`}>
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{row.label}</span>
                <span className={`font-black text-base ${row.accent}`}>{row.val}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Órdenes por estado — colors match kanban exactly */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64 }}
          className={`rounded-2xl p-6 border ${
            darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200'
          }`}
          style={{
            boxShadow: darkMode
              ? '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <h3 className={`text-base font-black mb-5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Órdenes por Estado
          </h3>
          <div className="space-y-3.5">
            {ESTADOS_ORDEN.map((estado) => {
              const cantidad = estadisticas.ordenesPorEstado[estado.value] || 0;
              const pct = estadisticas.totalOrdenes > 0 ? (cantidad / estadisticas.totalOrdenes) * 100 : 0;
              const EstIcon = ESTADO_ICONS[estado.value] || Box;
              return (
                <div key={estado.value}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      <EstIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: estado.color }} />
                      {estado.label}
                    </span>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{ background: `${estado.color}22`, color: estado.color }}>
                      {cantidad}
                    </span>
                  </div>
                  <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700/80' : 'bg-slate-100'}`}
                    style={{ border: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.7, duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full relative"
                      style={{
                        background: `linear-gradient(90deg, ${estado.color} 0%, ${estado.color}cc 100%)`,
                        boxShadow: `0 0 8px ${estado.color}60`,
                      }}
                    >
                      {pct > 5 && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                          style={{ background: '#fff', opacity: 0.7, boxShadow: `0 0 4px ${estado.color}` }} />
                      )}
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Dispositivos más reparados */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 }}
          className={`rounded-2xl p-6 border ${
            darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200'
          }`}
          style={{
            boxShadow: darkMode
              ? '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <h3 className={`text-base font-black mb-5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Dispositivos Más Reparados
          </h3>
          {estadisticas.dispositivosMasReparados.length > 0 ? (
            <div className="space-y-3.5">
              {estadisticas.dispositivosMasReparados.slice(0, 5).map((item, i) => {
                const total = estadisticas.dispositivosMasReparados.reduce((s, d) => s + d.cantidad, 0);
                const pct = total > 0 ? (item.cantidad / total) * 100 : 0;
                const TipoIcon = TIPO_ICONS[item.tipo] || Box;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm capitalize flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <TipoIcon className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        {item.tipo}
                      </span>
                      <span className={`text-xs font-black ${darkMode ? 'text-slate-300' : 'text-slate-800'}`}>{item.cantidad}</span>
                    </div>
                    <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700/80' : 'bg-slate-100'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.82 + i * 0.06, duration: 0.55, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg,#3b82f6 0%,#8b5cf6 100%)',
                          boxShadow: '0 0 8px rgba(139,92,246,0.5)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>No hay datos disponibles</p>
          )}
        </motion.div>

        {/* Marcas más comunes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.80 }}
          className={`rounded-2xl p-6 border ${
            darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200'
          }`}
          style={{
            boxShadow: darkMode
              ? '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <h3 className={`text-base font-black mb-5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Marcas Más Comunes
          </h3>
          {estadisticas.marcasMasComunes.length > 0 ? (
            <div className="space-y-3.5">
              {estadisticas.marcasMasComunes.slice(0, 5).map((item, i) => {
                const total = estadisticas.marcasMasComunes.reduce((s, m) => s + m.cantidad, 0);
                const pct = total > 0 ? (item.cantidad / total) * 100 : 0;
                const cols = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444'];
                const c = cols[i % cols.length];
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{item.marca}</span>
                      <span className={`text-xs font-black ${darkMode ? 'text-slate-300' : 'text-slate-800'}`}>{item.cantidad}</span>
                    </div>
                    <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700/80' : 'bg-slate-100'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.9 + i * 0.06, duration: 0.55, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg,${c} 0%,${c}99 100%)`, boxShadow: `0 0 8px ${c}55` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>No hay datos disponibles</p>
          )}
        </motion.div>

        {/* Técnicos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.88 }}
          className={`lg:col-span-2 rounded-2xl p-6 border ${
            darkMode ? 'bg-slate-800/80 border-slate-700/60' : 'bg-white border-slate-200'
          }`}
          style={{
            boxShadow: darkMode
              ? '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)'
              : '0 2px 16px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <h3 className={`text-base font-black mb-5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Productividad por Técnico
          </h3>
          {estadisticas.ordenesporTecnico.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {estadisticas.ordenesporTecnico.slice(0, 6).map((item, i) => {
                const total = estadisticas.ordenesporTecnico.reduce((s, t) => s + t.cantidad, 0);
                const pct = total > 0 ? (item.cantidad / total) * 100 : 0;
                return (
                  <div key={i} className={`p-3.5 rounded-xl border ${
                    darkMode ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        darkMode ? 'bg-blue-600/20' : 'bg-blue-100'
                      }`}>
                        <Users className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {item.tecnico}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {item.cantidad} {item.cantidad === 1 ? 'orden' : 'órdenes'}
                        </p>
                      </div>
                      <span className="ml-auto text-xl font-black text-blue-500">{item.cantidad}</span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 1.0 + i * 0.06, duration: 0.55, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg,#f59e0b 0%,#ef4444 100%)',
                          boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>No hay técnicos asignados aún</p>
          )}
        </motion.div>
      </div>

      {/* ── Alertas ───────────────────────────────────────────────────────── */}
      {(estadisticas.ordenesAtrasadas > 0 || estadisticas.devolucionesPorGarantia > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
          className="relative rounded-2xl p-6 overflow-hidden border"
          style={{
            background: darkMode
              ? 'linear-gradient(145deg,#2d1a03 0%,#1a1003 100%)'
              : 'linear-gradient(145deg,#fffbeb 0%,#fef3c7 100%)',
            border: '1px solid #f59e0b35',
            boxShadow: darkMode
              ? '0 8px 32px rgba(245,158,11,0.18)'
              : '0 4px 20px rgba(245,158,11,0.15)',
          }}
        >
          <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full blur-3xl pointer-events-none"
            style={{ background: '#f59e0b', opacity: 0.15 }} />

          <h3 className={`text-base font-black mb-4 flex items-center gap-2 ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
            <AlertCircle className="w-5 h-5 animate-pulse" />
            Alertas Activas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {estadisticas.ordenesAtrasadas > 0 && (
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                darkMode ? 'bg-black/20 border-amber-500/15' : 'bg-white/60 border-amber-300/50'
              }`}>
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/25">
                  <Clock className={`w-5 h-5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <div>
                  <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {estadisticas.ordenesAtrasadas}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-amber-300/70' : 'text-amber-700'}`}>
                    Órdenes atrasadas
                  </p>
                </div>
              </div>
            )}
            {estadisticas.devolucionesPorGarantia > 0 && (
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                darkMode ? 'bg-black/20 border-amber-500/15' : 'bg-white/60 border-amber-300/50'
              }`}>
                <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/25">
                  <AlertCircle className={`w-5 h-5 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {estadisticas.devolucionesPorGarantia}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-amber-300/70' : 'text-amber-700'}`}>
                    Devoluciones por garantía
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
