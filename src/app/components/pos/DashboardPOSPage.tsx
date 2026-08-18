/**
 * CODEC POS v2.0 - Dashboard Premium
 * ✅ Tarjetas compactas tech con glow
 * ✅ Modo oscuro glassmorphism
 * ✅ Modo claro limpio y profesional
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  DollarSign, TrendingUp, ShoppingCart, Package, Users, CreditCard,
  Clock, RefreshCw, Activity, Zap, Target, Award, BarChart3,
  ArrowUpRight, ArrowDownRight, ShoppingBag, Flame, CheckCircle2,
  Bell, Banknote, Smartphone, Sun, Sunset, Moon, Pencil, X, Coffee, Wrench, TrendingDown,
  Calendar, ChevronDown, Bike,
} from 'lucide-react';
import { toast } from 'sonner';
import { electronStore, EstadisticasDia } from '../../lib/electronStore';
import { format, subDays, startOfDay, startOfMonth, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend, AreaChart, Area,
} from 'recharts';
import { NotificacionesAntiFraude } from '../notifications/NotificacionesAntiFraude';
import { DevolucionesStatsCard } from './DevolucionesStatsCard';
import { CodecLogoHorizontal } from '../shared/CodecLogos';
import { tallerService } from '../../services/tallerService';
import type { EstadisticasTaller } from '../../types/taller';
import { ModuloPOS } from '../../lib/permissions';
import { cajaDiariaService } from '../../lib/cajaDiariaService';
import ModalDetalleKPI, { type TipoModalKPI, type DatosResumenKPI } from './ModalDetalleKPI';

// ─────────────── TIPOS ───────────────
interface ProductoVendido { id: string; nombre: string; cantidad: number; totalVentas: number; utilidad: number; }
interface VentaPorHora { hora: string; ventas: number; ingresos: number; }
interface ProductoBajoStock { id: string; nombre: string; stock: number; stockMinimo: number; }
interface ProductoPorVencer { id: string; nombre: string; fechaVencimiento: string; diasRestantes: number; }
interface ComparativaVentas { hoy: number; ayer: number; semana: number; mes: number; }
interface IngredienteCritico { id: string; nombre: string; stockActual: number; stockMinimo: number; unidad: string; }

const formatCOP = (v: number) =>
  `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function getEstadoNegocio(hora: number) {
  if (hora >= 6 && hora < 12)  return { label: 'Mañana activa',   color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',  icon: Coffee  };
  if (hora >= 12 && hora < 15) return { label: 'Hora pico 🔥',   color: '#ef4444', glow: 'rgba(239,68,68,0.4)',   icon: Flame   };
  if (hora >= 15 && hora < 19) return { label: 'Tarde tranquila', color: '#60a5fa', glow: 'rgba(96,165,250,0.4)',  icon: Sun     };
  if (hora >= 19 && hora < 22) return { label: 'Cierre nocturno', color: '#a78bfa', glow: 'rgba(167,139,250,0.4)',icon: Sunset  };
  return { label: 'Fuera de horario', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', icon: Moon };
}

const META_KEY = 'codecpos-meta-diaria';

// ─────────────── PANEL BASE ───────────────
function Panel({ children, className = '', accent = '', dark = true, style = {} }: {
  children: React.ReactNode; className?: string; accent?: string; dark?: boolean; style?: React.CSSProperties;
}) {
  if (dark) {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden ${className}`}
        style={{
          background: 'rgba(13,22,45,0.82)',
          border: `1px solid ${accent ? accent + '28' : 'rgba(255,255,255,0.07)'}`,
          boxShadow: `0 4px 20px rgba(0,0,0,0.35)${accent ? `, 0 0 0 1px ${accent}12` : ''}`,
          backdropFilter: 'blur(14px)',
          ...style,
        }}
      >
        {accent && <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}80, transparent)` }} />}
        {children}
      </div>
    );
  }
  // Light mode
  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: '#ffffff',
        border: `1px solid ${accent ? accent + '22' : '#e5e7eb'}`,
        boxShadow: `0 2px 12px rgba(0,0,0,0.07)${accent ? `, 0 0 0 1px ${accent}10` : ''}`,
        ...style,
      }}
    >
      {accent && <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}60, transparent)` }} />}
      {children}
    </div>
  );
}

// ─────────────── KPI CARD ───────────────
function KpiCard({
  titulo, valor, subtitulo, icon: Icon, accentColor, badge, trend = 50, delay = 0, dark, destacado = false, className = '', onClick,
}: {
  titulo: string; valor: string; subtitulo: string; icon: any;
  accentColor: string; badge?: { label: string; positive: boolean };
  trend?: number; delay?: number; dark: boolean; destacado?: boolean; className?: string; onClick?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -6;
    const ry = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 6;
    el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.025,1.025,1.025)`;
  };
  const onLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = 'perspective(600px) rotateX(0) rotateY(0) scale3d(1,1,1)';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.38 }} className={`h-full ${className}`}>
      <div
        ref={cardRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
        className={`relative rounded-2xl overflow-hidden h-full group ${onClick ? 'cursor-pointer' : 'cursor-default'} ${destacado ? 'p-5 min-h-[210px]' : 'p-4 min-h-[210px]'}`}
        style={{
          background: dark ? 'rgba(13,22,45,0.85)' : '#ffffff',
          border: dark ? `1px solid ${accentColor}${destacado ? '55' : '28'}` : `1px solid ${accentColor}${destacado ? '50' : '25'}`,
          boxShadow: dark
            ? (destacado
              ? `0 12px 30px rgba(0,0,0,0.45), 0 0 0 1px ${accentColor}30, 0 0 30px ${accentColor}30`
              : `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px ${accentColor}15`)
            : (destacado
              ? `0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px ${accentColor}25`
              : `0 2px 14px rgba(0,0,0,0.08), 0 0 0 1px ${accentColor}15`),
          transformStyle: 'preserve-3d',
          transition: 'transform 0.14s ease, box-shadow 0.18s ease',
        }}
      >
        {/* Glow radial bg */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: dark ? `radial-gradient(circle at 15% 15%, ${accentColor}20, transparent 60%)` : `radial-gradient(circle at 15% 15%, ${accentColor}10, transparent 60%)` }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}70, transparent)` }} />

        <div className="relative z-10 h-full flex flex-col">
          {/* Row: icon + badge */}
          <div className="flex items-center justify-between mb-3">
            <div
              className={`${destacado ? 'w-11 h-11' : 'w-9 h-9'} rounded-xl flex items-center justify-center`}
              style={{
                background: `${accentColor}20`,
                border: `1px solid ${accentColor}38`,
                boxShadow: `0 2px 10px ${accentColor}35`,
              }}
            >
              <Icon className={destacado ? 'w-5 h-5' : 'w-4 h-4'} style={{ color: accentColor }} />
            </div>
            {badge && (
              <div
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                style={{
                  background: badge.positive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  border: `1px solid ${badge.positive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}
              >
                {badge.positive
                  ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-400" />
                  : <ArrowDownRight className="w-2.5 h-2.5 text-red-400" />}
                <span className={`text-[11px] font-black ${badge.positive ? 'text-emerald-400' : 'text-red-400'}`}>{badge.label}</span>
              </div>
            )}
          </div>

          {/* Label */}
          <p className={`${destacado ? 'text-[11px]' : 'text-[10px]'} font-bold uppercase tracking-widest mb-1`} style={{ color: dark ? `${accentColor}99` : `${accentColor}cc` }}>{titulo}</p>

          {/* Valor */}
          <p className="font-black mb-0.5" style={{ fontSize: destacado ? '1.85rem' : '1.35rem', lineHeight: 1.15, color: dark ? '#fff' : '#0f172a', textShadow: dark ? `0 0 18px ${accentColor}50` : 'none' }}>
            {valor}
          </p>

          {/* Subtítulo */}
          <p className={`${destacado ? 'text-xs' : 'text-[11px]'} mb-2.5`} style={{ color: dark ? '#64748b' : '#94a3b8' }}>{subtitulo}</p>

          {/* Mini barra */}
          <div className="h-1 rounded-full overflow-hidden mt-auto" style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(trend, 100)}%` }}
              transition={{ delay: delay + 0.3, duration: 0.85, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${accentColor}cc, ${accentColor})` }}
            />
          </div>
        </div>

        {onClick && (
          <div
            className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: accentColor }}
          >
            Ver detalle →
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────── RELOJ ───────────────
function RelojVivo({ dark }: { dark: boolean }) {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t); }, []);
  const estado = getEstadoNegocio(ahora.getHours());
  const Icon = estado.icon;

  return (
    <Panel accent={estado.glow} dark={dark} className="p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${estado.color}20`, border: `1px solid ${estado.color}38`, boxShadow: `0 0 12px ${estado.color}38` }}>
          <Icon className="w-4 h-4" style={{ color: estado.color }} />
        </div>
        <div>
          <p className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Estado del negocio</p>
          <p className="text-[11px] font-bold" style={{ color: estado.color }}>{estado.label}</p>
        </div>
      </div>
      <p className="font-black font-mono mb-0.5" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: dark ? '#fff' : '#0f172a', textShadow: dark ? `0 0 20px ${estado.glow}` : 'none' }}>
        {format(ahora, 'HH:mm:ss')}
      </p>
      <p className="text-xs capitalize mb-3" style={{ color: dark ? '#475569' : '#94a3b8' }}>{format(ahora, "EEEE dd 'de' MMMM", { locale: es })}</p>
      <div className="flex items-center gap-2 pt-2.5" style={{ borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9' }}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-500 text-[11px] font-bold">Sistema activo · Offline seguro</span>
      </div>
    </Panel>
  );
}

// ─────────────── META ───────────────
function MetaDelDia({ ingresosHoy, dark }: { ingresosHoy: number; dark: boolean }) {
  const [meta, setMeta] = useState<number>(() => { try { return JSON.parse(localStorage.getItem(META_KEY) || '500000'); } catch { return 500000; } });
  const [editando, setEditando] = useState(false);
  const [inputMeta, setInputMeta] = useState('');
  const pct = Math.min((ingresosHoy / meta) * 100, 100);
  const superada = ingresosHoy >= meta;
  const color = superada ? '#10b981' : pct > 70 ? '#f59e0b' : '#6366f1';

  const guardar = () => {
    const val = Number(inputMeta.replace(/\D/g, ''));
    if (val > 0) { setMeta(val); localStorage.setItem(META_KEY, JSON.stringify(val)); toast.success('Meta actualizada'); }
    setEditando(false);
  };

  const segs = 18;
  const filled = Math.round((pct / 100) * segs);

  return (
    <Panel accent={color} dark={dark} className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}38`, boxShadow: `0 0 12px ${color}35` }}>
            <Target className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Meta del Día</p>
            <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Objetivo: {formatCOP(meta)}</p>
          </div>
        </div>
        <button onClick={() => { setInputMeta(String(meta)); setEditando(true); }} className="p-1.5 rounded-lg transition-colors" style={{ color: dark ? '#475569' : '#94a3b8' }}>
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {editando && (
        <div className="flex gap-2 mb-3">
          <input type="text" value={inputMeta} onChange={e => setInputMeta(e.target.value.replace(/\D/g, ''))}
            placeholder="Meta..." autoFocus onKeyDown={e => e.key === 'Enter' && guardar()}
            className="flex-1 rounded-xl px-3 py-1.5 text-sm font-mono"
            style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#f8fafc', border: dark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0', color: dark ? '#fff' : '#0f172a' }} />
          <button onClick={guardar} className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold">OK</button>
          <button onClick={() => setEditando(false)} className="px-2 py-1.5 rounded-xl" style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', color: dark ? '#94a3b8' : '#64748b' }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="flex items-end justify-between mb-2.5">
        <div>
          <p className="font-black" style={{ fontSize: '1.6rem', lineHeight: 1.1, color }}>{pct.toFixed(0)}%</p>
          <p className="text-sm font-semibold" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{formatCOP(ingresosHoy)}</p>
        </div>
        <div className="text-right">
          {superada
            ? <div className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">¡Superada!</span></div>
            : <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Faltan<br /><span className="font-bold" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{formatCOP(Math.max(meta - ingresosHoy, 0))}</span></p>
          }
        </div>
      </div>

      {/* Barra segmentada */}
      <div className="flex gap-0.5">
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
            {i < filled && <div className="h-full" style={{ background: color, opacity: i === filled - 1 ? 0.65 : 1 }} />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─────────────── FLUJO DE CAJA ───────────────
function FlujoCaja({ estadisticas, dark }: { estadisticas: EstadisticasDia | null; dark: boolean }) {
  const metodosPagoConfig: Array<{ id: string; label: string; enabled: boolean; color: string }> = (() => {
    try { return JSON.parse(localStorage.getItem('codecpos_metodos_pago_config') || '[]'); } catch { return []; }
  })();
  const bonosConfig = metodosPagoConfig.find(m => m.id === 'bonos');
  const bonosActivo = bonosConfig?.enabled ?? false;
  const bonosLabel  = bonosConfig?.label  ?? 'Bonos';
  const bonosColor  = bonosConfig?.color  ?? '#10b981';

  const rappiConfig = metodosPagoConfig.find(m => m.id === 'rappi');
  const rappiActivo = rappiConfig?.enabled ?? true;
  const rappiLabel  = rappiConfig?.label  ?? 'Rappi';
  const rappiColor  = rappiConfig?.color  ?? '#ff6b35';

  const metodos = [
    { label: 'Efectivo',   key: 'efectivo',      color: '#10b981', icon: Banknote  },
    { label: 'Nequi',     key: 'nequi',         color: '#8b5cf6', icon: Smartphone},
    { label: 'Daviplata', key: 'daviplata',      color: '#ef4444', icon: Smartphone},
    { label: 'Tarjeta',   key: 'tarjeta',        color: '#3b82f6', icon: CreditCard},
    { label: 'Transf.',   key: 'transferencia',  color: '#06b6d4', icon: Activity  },
    { label: 'Mixto',     key: 'mixto',          color: '#f59e0b', icon: DollarSign},
    ...(rappiActivo ? [{ label: rappiLabel, key: 'rappi', color: rappiColor, icon: Bike }] : []),
    ...(bonosActivo ? [{ label: bonosLabel, key: 'bonos', color: bonosColor, icon: Award }] : []),
  ];
  const colsClass = metodos.length > 6 ? 'grid-cols-4 md:grid-cols-7' : 'grid-cols-3 md:grid-cols-6';
  const total = estadisticas?.totalIngresos || 0;

  return (
    <Panel accent="rgba(16,185,129,0.5)" dark={dark} className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.32)', boxShadow: '0 0 12px rgba(16,185,129,0.25)' }}>
            <Banknote className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Flujo de Caja</p>
            <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Distribución por método de pago</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-black text-base text-emerald-500">{formatCOP(total)}</p>
          <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Total del día</p>
        </div>
      </div>
      <div className={`grid ${colsClass} gap-2`}>
        {metodos.map(m => {
          const val = Number(estadisticas?.ventasPorMetodo?.[m.key as keyof typeof estadisticas.ventasPorMetodo]) || 0;
          const pct = total > 0 ? (val / total) * 100 : 0;
          const Icon = m.icon;
          return (
            <div key={m.key} className="p-2.5 rounded-xl transition-all hover:scale-105 cursor-default"
              style={{ background: dark ? `${m.color}12` : `${m.color}0f`, border: `1px solid ${m.color}28` }}>
              <div className="flex items-center gap-1 mb-1.5">
                <Icon className="w-3 h-3 shrink-0" style={{ color: m.color }} />
                <span className="text-[10px] font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>{m.label}</span>
              </div>
              <p className="font-black text-sm mb-1" style={{ color: dark ? '#fff' : '#0f172a' }}>{formatCOP(val)}</p>
              <div className="h-1 rounded-full overflow-hidden mb-1" style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
              </div>
              <p className="text-[10px] font-bold" style={{ color: m.color }}>{pct.toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─────────────── ALERTAS ───────────────
function PanelAlertas({ bajoStock, porVencer, dark }: { bajoStock: ProductoBajoStock[]; porVencer: ProductoPorVencer[]; dark: boolean }) {
  const total = bajoStock.length + porVencer.length;
  const accent = total > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';

  return (
    <Panel accent={accent} dark={dark} className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: total > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)', border: `1px solid ${total > 0 ? 'rgba(239,68,68,0.32)' : 'rgba(16,185,129,0.32)'}` }}>
            {total > 0 ? <Bell className="w-4 h-4 text-red-500 animate-pulse" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Alertas Críticas</p>
            <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>{total > 0 ? `${total} items requieren atención` : 'Todo en orden'}</p>
          </div>
        </div>
        {total > 0 && (
          <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center" style={{ boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
            <span className="text-white text-[10px] font-black">{total}</span>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-emerald-500 font-bold text-sm">¡Sin alertas!</p>
          <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Stock y vencimientos OK</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {bajoStock.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-xl"
              style={{ background: dark ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
                <p className="text-xs font-semibold truncate max-w-[110px]" style={{ color: dark ? '#fff' : '#0f172a' }}>{p.nombre}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-1 w-10 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                  <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.min((p.stock / p.stockMinimo) * 100, 100)}%` }} />
                </div>
                <span className="text-yellow-500 font-black text-xs">{p.stock}</span>
              </div>
            </div>
          ))}
          {porVencer.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-xl"
              style={{ background: dark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${p.diasRestantes <= 7 ? 'bg-red-400' : 'bg-orange-400'}`} />
                <p className="text-xs font-semibold truncate max-w-[110px]" style={{ color: dark ? '#fff' : '#0f172a' }}>{p.nombre}</p>
              </div>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${p.diasRestantes <= 7 ? 'bg-red-500/20 text-red-500' : 'bg-orange-500/20 text-orange-500'}`}>{p.diasRestantes}d</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─────────────── COMPARATIVA ───────────────
function ComparativaCard({ label, val, refVal, accentColor, dark }: {
  label: string; val: number; refVal: number | null; accentColor: string; dark: boolean;
}) {
  const diff = refVal !== null ? ((val - refVal) / (refVal || 1)) * 100 : null;
  return (
    <div className="p-3.5 rounded-2xl relative overflow-hidden transition-all hover:scale-[1.02] cursor-default"
      style={{ background: dark ? 'rgba(13,22,45,0.8)' : '#fff', border: `1px solid ${accentColor}22`, boxShadow: dark ? '0 2px 12px rgba(0,0,0,0.25)' : '0 2px 10px rgba(0,0,0,0.06)' }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}65, transparent)` }} />
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 0% 0%, ${accentColor}${dark ? '12' : '08'}, transparent 60%)` }} />
      <div className="relative z-10">
        <p className="text-[10px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: `${accentColor}cc` }}>{label}</p>
        <p className="font-black text-lg mb-1" style={{ color: dark ? '#fff' : '#0f172a' }}>{formatCOP(val)}</p>
        {diff !== null && (
          <div className="flex items-center gap-1">
            {diff >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
            <span className={`text-[10px] font-bold ${diff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(0)}% vs ayer</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────── CHART PANEL ───────────────
function ChartPanel({ title, subtitle, icon: Icon, accentColor, dark, children }: {
  title: string; subtitle?: string; icon: any; accentColor: string; dark: boolean; children: React.ReactNode;
}) {
  return (
    <Panel accent={accentColor} dark={dark} className="p-4">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}38`, boxShadow: `0 0 10px ${accentColor}30` }}>
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>
        <div>
          <h3 className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>{title}</h3>
          {subtitle && <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

// ─────────────── SELECTOR DE RANGO TEMPORAL ───────────────
type RangoTemporal = 'dia' | 'dias3' | 'dias7' | 'dias15' | 'mes' | 'personalizado';

interface FechaRango {
  inicio: Date;
  fin: Date;
  label: string;
}

function SelectorRangoTemporal({
  rangoActual,
  onCambiarRango,
  onAplicarRangoPersonalizado,
  rangoPersonalizado,
  dark,
}: {
  rangoActual: RangoTemporal;
  onCambiarRango: (rango: RangoTemporal) => void;
  onAplicarRangoPersonalizado: (inicio: string, fin: string) => void;
  rangoPersonalizado: { inicio: string; fin: string };
  dark: boolean;
}) {
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [inicioCustom, setInicioCustom] = useState(rangoPersonalizado?.inicio || '');
  const [finCustom, setFinCustom] = useState(rangoPersonalizado?.fin || '');

  useEffect(() => {
    setInicioCustom(rangoPersonalizado?.inicio || '');
    setFinCustom(rangoPersonalizado?.fin || '');
  }, [rangoPersonalizado?.inicio, rangoPersonalizado?.fin]);

  const opciones: { value: RangoTemporal; label: string; icon: string }[] = [
    { value: 'dia', label: 'Día', icon: '📅' },
    { value: 'dias3', label: '3 días', icon: '📊' },
    { value: 'dias7', label: '7 días', icon: '📈' },
    { value: 'dias15', label: '15 días', icon: '🗓️' },
    { value: 'mes', label: 'Mes', icon: '📆' },
    { value: 'personalizado', label: 'Personalizado', icon: '🎯' },
  ];

  const opcionActual = opciones.find(o => o.value === rangoActual) || opciones[0];

  return (
    <div className="relative">
      <button
        onClick={() => setMostrarMenu(!mostrarMenu)}
        className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl transition-all hover:scale-105 ${
          dark
            ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-2 border-purple-500/30 hover:border-purple-500/50'
            : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 hover:border-purple-300'
        }`}
        style={{
          boxShadow: dark
            ? '0 4px 20px rgba(168, 85, 247, 0.2)'
            : '0 2px 12px rgba(168, 85, 247, 0.15)',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: dark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.15)',
            border: dark ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(168, 85, 247, 0.3)',
          }}
        >
          <Calendar className="w-5 h-5 text-purple-500" />
        </div>
        <div className="text-left">
          <p className={`text-xs font-semibold ${dark ? 'text-purple-300' : 'text-purple-600'}`}>
            Rango de Tiempo
          </p>
          <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>
            {opcionActual.icon} {opcionActual.label}
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 transition-transform ${mostrarMenu ? 'rotate-180' : ''} ${
            dark ? 'text-purple-300' : 'text-purple-600'
          }`}
        />
      </button>

      {mostrarMenu && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`absolute top-full mt-2 left-0 w-full rounded-2xl overflow-hidden z-50 ${
            dark
              ? 'bg-slate-900 border-2 border-slate-700'
              : 'bg-white border-2 border-gray-200'
          }`}
          style={{
            boxShadow: dark
              ? '0 8px 24px rgba(0,0,0,0.4)'
              : '0 4px 16px rgba(0,0,0,0.1)',
          }}
        >
          {opciones.map((opcion) => (
            <button
              key={opcion.value}
              onClick={() => {
                onCambiarRango(opcion.value);
                setMostrarMenu(false);
              }}
              className={`w-full px-5 py-3 text-left transition-colors ${
                rangoActual === opcion.value
                  ? dark
                    ? 'bg-purple-600/30 border-l-4 border-purple-500'
                    : 'bg-purple-50 border-l-4 border-purple-500'
                  : dark
                  ? 'hover:bg-slate-800'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{opcion.icon}</span>
                <span
                  className={`font-semibold ${
                    rangoActual === opcion.value
                      ? dark
                        ? 'text-purple-300'
                        : 'text-purple-600'
                      : dark
                      ? 'text-white'
                      : 'text-gray-900'
                  }`}
                >
                  {opcion.label}
                </span>
              </div>
            </button>
          ))}

          {rangoActual === 'personalizado' && (
            <div className={`p-4 border-t ${dark ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`text-xs font-bold mb-2 ${dark ? 'text-purple-300' : 'text-purple-700'}`}>
                Rango personalizado (máximo 6 meses)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="date"
                  value={inicioCustom}
                  onChange={(e) => setInicioCustom(e.target.value)}
                  className={`px-3 py-2 rounded-xl text-sm ${dark ? 'bg-slate-800 text-white border border-slate-600' : 'bg-gray-50 text-gray-900 border border-gray-300'}`}
                />
                <input
                  type="date"
                  value={finCustom}
                  onChange={(e) => setFinCustom(e.target.value)}
                  className={`px-3 py-2 rounded-xl text-sm ${dark ? 'bg-slate-800 text-white border border-slate-600' : 'bg-gray-50 text-gray-900 border border-gray-300'}`}
                />
                <button
                  onClick={() => {
                    onAplicarRangoPersonalizado(inicioCustom, finCustom);
                    setMostrarMenu(false);
                  }}
                  className="px-3 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600"
                >
                  Aplicar rango
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─────────────── DASHBOARD ───────────────
export default function DashboardPOSPage() {
  const { darkMode: dark } = usePOS();
  const { usuarioActual, usuarios } = useAuth();
  const esAdministradorDashboard = usuarioActual?.rol === 'super_usuario';
  const [toggleModuloPanaderiaOncesActivo, setToggleModuloPanaderiaOncesActivo] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('codecpos_panaderia_onces_activo');
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });
  const [toggleModuloTallerActivo, setToggleModuloTallerActivo] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('codecpos_taller_reparaciones_activo');
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });

  const [estadisticas, setEstadisticas] = useState<EstadisticasDia | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date>(new Date());
  const [topProductos, setTopProductos] = useState<ProductoVendido[]>([]);
  const [ventasPorHora, setVentasPorHora] = useState<VentaPorHora[]>([]);
  const [productosBajoStock, setProductosBajoStock] = useState<ProductoBajoStock[]>([]);
  const [ingredientesCriticos, setIngredientesCriticos] = useState<IngredienteCritico[]>([]);
  const [productosPorVencer, setProductosPorVencer] = useState<ProductoPorVencer[]>([]);
  const [mermaHoy, setMermaHoy] = useState<{ cantidad: number; costo: number; registros: number }>({ cantidad: 0, costo: 0, registros: 0 });
  const [comparativa, setComparativa] = useState<ComparativaVentas>({ hoy: 0, ayer: 0, semana: 0, mes: 0 });
  const [ticketPromedio, setTicketPromedio] = useState(0);
  const [margenUtilidad, setMargenUtilidad] = useState(0);
  const [proyeccionVentas, setProyeccionVentas] = useState(0);
  const [margenConfig, setMargenConfig] = useState({ activo: false, porcentaje: 30 });
  const [ventasUltimaHora, setVentasUltimaHora] = useState(0);
  const [ingresoUltimaHora, setIngresoUltimaHora] = useState(0);
  const [logoEmpresa, setLogoEmpresa] = useState<string>('');
  const [nombreComercial, setNombreComercial] = useState<string>('');
  const [modalKPI, setModalKPI] = useState<{
    tipo: TipoModalKPI; titulo: string; valor: string; accentColor: string; icon: any; datos: DatosResumenKPI;
  } | null>(null);
  const [estadisticasTaller, setEstadisticasTaller] = useState<EstadisticasTaller | null>(null);
  const [alertasTaller, setAlertasTaller] = useState<{ atrasadas: any[]; garantiasProximas: any[]; conSaldo: any[] }>({ atrasadas: [], garantiasProximas: [], conSaldo: [] });
  const [montoDevolucionesDia, setMontoDevolucionesDia] = useState(0);
  const [cantidadDevolucionesDia, setCantidadDevolucionesDia] = useState(0);
  const [totalGastosPeriodo, setTotalGastosPeriodo] = useState(0);
  const [totalRepuestosPeriodo, setTotalRepuestosPeriodo] = useState(0);
  const [totalReparacionesPeriodo, setTotalReparacionesPeriodo] = useState(0);
  const [cantidadGastosPeriodo, setCantidadGastosPeriodo] = useState(0);
  const [cantidadRepuestosPeriodo, setCantidadRepuestosPeriodo] = useState(0);
  const [cantidadReparacionesPeriodo, setCantidadReparacionesPeriodo] = useState(0);
  const [utilidadNetaConsolidada, setUtilidadNetaConsolidada] = useState(0);
  const [ingresosBrutosPeriodo, setIngresosBrutosPeriodo] = useState(0);
  const [alertaSinCostoBase, setAlertaSinCostoBase] = useState(false);
  const [operadorCajaActivo, setOperadorCajaActivo] = useState<string | null>(null);
  const [cajeroSeleccionado, setCajeroSeleccionado] = useState<string>('__GENERAL__');
  const esSuperUsuario = usuarioActual?.rol === 'super_usuario';
  const modulosUsuario = (usuarioActual?.modulosActivos || []) as ModuloPOS[];
  const usaControlModulosCliente = modulosUsuario.length > 0;
  const moduloPanaderiaOncesPermitido = esSuperUsuario
    ? true
    : !usaControlModulosCliente || modulosUsuario.includes(ModuloPOS.PANADERIA_ONCES);
  const moduloTallerPermitido = esSuperUsuario
    ? true
    : !usaControlModulosCliente || modulosUsuario.includes(ModuloPOS.TALLER_REPARACIONES);
  const moduloPanaderiaOncesActivo = moduloPanaderiaOncesPermitido && toggleModuloPanaderiaOncesActivo;
  const moduloTallerActivo = moduloTallerPermitido && toggleModuloTallerActivo;

  const cajerosActivos = (usuarios || [])
    .filter((u) => u.activo && u.rol === 'cajero')
    .map((u) => ({
      id: u.id,
      nombre: (u.nombreCompleto || u.username || '').trim(),
    }))
    .filter((u) => !!u.nombre);

  const cajeroSeleccionadoInfo = cajerosActivos.find((c) => c.nombre === cajeroSeleccionado);

  const filtroDashboardActual = {
    incluirTodosLosCajeros: esAdministradorDashboard ? cajeroSeleccionado === '__GENERAL__' : false,
    cajeroId: esAdministradorDashboard
      ? (cajeroSeleccionado === '__GENERAL__' ? undefined : cajeroSeleccionadoInfo?.id)
      : usuarioActual?.id,
    cajeroNombre: esAdministradorDashboard
      ? (cajeroSeleccionado === '__GENERAL__' ? undefined : cajeroSeleccionado)
      : (usuarioActual?.nombreCompleto || usuarioActual?.username),
  };

  // ✅ NUEVO: Estado para rango temporal
  const [rangoTemporal, setRangoTemporal] = useState<RangoTemporal>('dia');
  const [rangoPersonalizado, setRangoPersonalizado] = useState<{ inicio: string; fin: string }>(() => {
    const hoy = new Date();
    const hace7 = subDays(hoy, 7);
    return {
      inicio: format(hace7, 'yyyy-MM-dd'),
      fin: format(hoy, 'yyyy-MM-dd'),
    };
  });
  const [fechaRango, setFechaRango] = useState<FechaRango>(() => {
    const hoy = new Date();
    return {
      inicio: startOfDay(hoy),
      fin: endOfDay(hoy),
      label: 'Hoy',
    };
  });

  const calcularCostoVentas = async (ventas: any[] = []): Promise<{ totalCostos: number; sinCostoBase: boolean }> => {
    const productos = await electronStore.obtenerProductos();
    const indexCosto = new Map<string, number>();
    (Array.isArray(productos) ? productos : []).forEach((p: any) => {
      const costo = Number(p?.costo);
      if (!Number.isFinite(costo)) return;
      if (p?.id) indexCosto.set(`id:${String(p.id).toLowerCase()}`, costo);
      if (p?.codigo) indexCosto.set(`codigo:${String(p.codigo).toLowerCase()}`, costo);
      if (p?.nombre) indexCosto.set(`nombre:${String(p.nombre).toLowerCase()}`, costo);
    });

    let sinCosto = false;
    const totalCostos = ventas.reduce((sumVenta, venta) => {
      const costoVenta = (venta?.items || []).reduce((sumItem: number, item: any) => {
        const costoInventario =
          indexCosto.get(`id:${String(item?.id || '').toLowerCase()}`) ??
          indexCosto.get(`codigo:${String(item?.codigo || '').toLowerCase()}`) ??
          indexCosto.get(`nombre:${String(item?.nombre || '').toLowerCase()}`);
        const costoUnitario = Number(costoInventario ?? item?.costo ?? item?.precioCompra) || 0;
        if (!(Number(costoInventario) > 0)) sinCosto = true;
        const cantidad = Number(item?.cantidad) || 0;
        return sumItem + (costoUnitario * cantidad);
      }, 0);
      return sumVenta + costoVenta;
    }, 0);
    return { totalCostos, sinCostoBase: sinCosto };
  };

  const calcularMovimientosOperativos = useCallback(async (
    rango: FechaRango,
    filtro?: { incluirTodosLosCajeros?: boolean; cajeroId?: string; cajeroNombre?: string }
  ) => {
    let gastosPeriodo = 0;
    let cantidadGastos = 0;

    try {
      const gastos = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
      const inicioTs = rango.inicio.getTime();
      const finTs = rango.fin.getTime();
      const normalizar = (v: any) => String(v || '').trim().toLowerCase();
      const gastosFiltrados = (Array.isArray(gastos) ? gastos : []).filter((g: any) => {
        const ts = new Date(g?.fecha).getTime();
        const enRango = Number.isFinite(ts) && ts >= inicioTs && ts <= finTs;
        if (!enRango) return false;

        if (filtro?.incluirTodosLosCajeros) return true;

        const gastoUsuarioId = g?.registradoPorId || g?.usuarioId || g?.cajeroId;
        const gastoUsuarioNombre = g?.registradoPor || g?.cajero || g?.usuarioNombre;
        const porId = filtro?.cajeroId ? normalizar(gastoUsuarioId) === normalizar(filtro.cajeroId) : false;
        const porNombre = filtro?.cajeroNombre ? normalizar(gastoUsuarioNombre) === normalizar(filtro.cajeroNombre) : false;

        return porId || porNombre;
      });
      gastosPeriodo = gastosFiltrados.reduce((sum: number, g: any) => sum + (Number(g?.monto) || 0), 0);
      cantidadGastos = gastosFiltrados.length;
    } catch (error) {
      console.error('Error calculando gastos por rango:', error);
    }

    let repuestosPeriodo = 0;
    let reparacionesPeriodo = 0;
    let cantidadRepuestos = 0;
    let cantidadReparaciones = 0;

    try {
      const ordenes = await tallerService.obtenerTodasOrdenes();
      const inicioTs = rango.inicio.getTime();
      const finTs = rango.fin.getTime();
      const normalizar = (v: any) => String(v || '').trim().toLowerCase();
      const ordenesRango = ordenes.filter((o: any) => {
        const ts = new Date(o?.fechaRecepcion || o?.fechaCreacion).getTime();
        const enRango = Number.isFinite(ts) && ts >= inicioTs && ts <= finTs;
        if (!enRango) return false;
        if (filtro?.incluirTodosLosCajeros) return true;

        const responsableNombre = o?.tecnicoAsignado || o?.recibidoPor || o?.creadoPorNombre || o?.cajero;
        const responsableId = o?.creadoPorId || o?.usuarioId || o?.cajeroId;
        const porId = filtro?.cajeroId ? normalizar(responsableId) === normalizar(filtro.cajeroId) : false;
        const porNombre = filtro?.cajeroNombre ? normalizar(responsableNombre) === normalizar(filtro.cajeroNombre) : false;
        return porId || porNombre;
      });

      repuestosPeriodo = ordenesRango.reduce((sum: number, o: any) => sum + (Number(o?.costoInsumos) || 0), 0);
      cantidadRepuestos = ordenesRango.reduce((sum: number, o: any) => sum + (Array.isArray(o?.insumos) ? o.insumos.length : 0), 0);
      reparacionesPeriodo = ordenes.reduce((sum: number, o: any) => {
        const pagos = Array.isArray(o?.pagos) ? o.pagos : [];
        const totalPagosEnRango = pagos.reduce((sumPago: number, p: any) => {
          const tsPago = new Date(p?.fecha).getTime();
          if (!Number.isFinite(tsPago) || tsPago < inicioTs || tsPago > finTs) return sumPago;
          return sumPago + (Number(p?.monto) || 0);
        }, 0);
        return sum + totalPagosEnRango;
      }, 0);

      cantidadReparaciones = ordenes.filter((o: any) => {
        const pagos = Array.isArray(o?.pagos) ? o.pagos : [];
        return pagos.some((p: any) => {
          const tsPago = new Date(p?.fecha).getTime();
          return Number.isFinite(tsPago) && tsPago >= inicioTs && tsPago <= finTs && (Number(p?.monto) || 0) > 0;
        });
      }).length;
    } catch (error) {
      console.error('Error calculando movimientos de taller por rango:', error);
    }

    return {
      gastosPeriodo,
      cantidadGastos,
      repuestosPeriodo,
      cantidadRepuestos,
      reparacionesPeriodo,
      cantidadReparaciones,
    };
  }, []);

  // ✅ NUEVO: Manejar cambio de rango temporal
  const handleCambiarRango = (nuevoRango: RangoTemporal) => {
    setRangoTemporal(nuevoRango);

    const hoy = new Date();
    let nuevaFechaRango: FechaRango;

    switch (nuevoRango) {
      case 'dia':
        nuevaFechaRango = {
          inicio: startOfDay(hoy),
          fin: endOfDay(hoy),
          label: 'Día',
        };
        break;

      case 'dias3':
        nuevaFechaRango = {
          inicio: startOfDay(subDays(hoy, 3)),
          fin: endOfDay(hoy),
          label: '3 días',
        };
        break;

      case 'dias7':
        nuevaFechaRango = {
          inicio: startOfDay(subDays(hoy, 7)),
          fin: endOfDay(hoy),
          label: '7 días',
        };
        break;

      case 'dias15':
        nuevaFechaRango = {
          inicio: startOfDay(subDays(hoy, 15)),
          fin: endOfDay(hoy),
          label: '15 días',
        };
        break;

      case 'mes':
        nuevaFechaRango = {
          inicio: startOfMonth(hoy),
          fin: endOfDay(hoy),
          label: 'Mes',
        };
        break;

      case 'personalizado': {
        const inicio = new Date(`${rangoPersonalizado.inicio}T00:00:00`);
        const fin = new Date(`${rangoPersonalizado.fin}T23:59:59`);
        nuevaFechaRango = {
          inicio,
          fin,
          label: `Personalizado (${rangoPersonalizado.inicio} a ${rangoPersonalizado.fin})`,
        };
        break;
      }

      default:
        nuevaFechaRango = fechaRango;
    }

    setFechaRango(nuevaFechaRango);
    toast.success(`Rango cambiado a: ${nuevaFechaRango.label}`);

    // Recargar datos con el nuevo rango
    cargarDatosConRango(nuevaFechaRango);
  };

  const handleAplicarRangoPersonalizado = (inicio: string, fin: string) => {
    if (!inicio || !fin) {
      toast.error('Debes seleccionar fecha inicial y final');
      return;
    }

    const fechaInicio = new Date(`${inicio}T00:00:00`);
    const fechaFin = new Date(`${fin}T23:59:59`);

    if (fechaInicio > fechaFin) {
      toast.error('La fecha inicial no puede ser mayor a la final');
      return;
    }

    const msMax6Meses = 1000 * 60 * 60 * 24 * 31 * 6;
    if ((fechaFin.getTime() - fechaInicio.getTime()) > msMax6Meses) {
      toast.error('El rango personalizado no puede superar 6 meses');
      return;
    }

    setRangoPersonalizado({ inicio, fin });
    setRangoTemporal('personalizado');

    const nuevoRango: FechaRango = {
      inicio: fechaInicio,
      fin: fechaFin,
      label: `Personalizado (${inicio} a ${fin})`,
    };

    setFechaRango(nuevoRango);
    toast.success('Rango personalizado aplicado');
    cargarDatosConRango(nuevoRango);
  };

  // ✅ NUEVO: Cargar datos según el rango seleccionado
  const cargarDatosConRango = useCallback(async (rango: FechaRango) => {
    try {
      setIsLoading(true);

      // Integración contable con módulo de taller
      try {
        const statsTaller = await tallerService.obtenerEstadisticas();
        setEstadisticasTaller(statsTaller);

        // Alertas de taller
        const todasOrdenes = await tallerService.buscarOrdenes({});
        const ahora = new Date();
        const en7Dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
        const atrasadas = todasOrdenes.filter((o: any) => {
          if (!o.fechaEstimadaEntrega) return false;
          if (['entregado', 'cancelado'].includes(o.estado)) return false;
          return new Date(o.fechaEstimadaEntrega) < ahora;
        });
        const garantiasProximas = todasOrdenes.filter((o: any) => {
          const g = o.garantia;
          if (!g?.activa || !g?.fechaVencimiento) return false;
          const fv = new Date(g.fechaVencimiento);
          return fv >= ahora && fv <= en7Dias;
        });
        const conSaldo = todasOrdenes.filter((o: any) =>
          (Number(o.saldoPendiente) || 0) > 0 && o.estado !== 'cancelado'
        );
        setAlertasTaller({ atrasadas, garantiasProximas, conSaldo });
      } catch (error) {
        console.error('Error cargando estadísticas de taller para dashboard general:', error);
      }

      const movimientosOperativos = await calcularMovimientosOperativos(rango, filtroDashboardActual);

      const esRangoDia = rango.label === 'Día';
      const filtroDashboard = filtroDashboardActual;

      // Si el rango es "hoy", usar datos en tiempo real de electronStore
      if (esRangoDia) {
        const [stats] = await Promise.all([
          electronStore.calcularEstadisticasDelDia(filtroDashboard),
          electronStore.obtenerTodosLosTurnosActivos(),
        ]);
        const ventasDia = await electronStore.obtenerVentasDelDia(filtroDashboard);
        const ventasDiaValidas = ventasDia.filter((v: any) => {
          const estado = String((v as any)?.estado || '').toLowerCase();
          return estado !== 'devuelto' && estado !== 'anulado';
        });

        const { totalCostos: costoVentasDia, sinCostoBase } = await calcularCostoVentas(ventasDiaValidas);
        const ingresosBrutosDia = ventasDiaValidas.reduce((sum, v: any) => sum + (Number(v?.total) || 0), 0);
        setIngresosBrutosPeriodo(ingresosBrutosDia);

        // ⚠️ Importante:
        // `electronStore.calcularEstadisticasDelDia` ya devuelve `totalIngresos`
        // neteando SOLO devoluciones que realmente aplican (evita doble descuento).
        // Aquí NO debemos volver a descontar `totalDevolucionesMonto` completo
        // porque ese campo incluye devoluciones registradas informativas.
        const totalIngresosNetosDia = Number(stats.totalIngresos) || 0;

        const statsNorm: EstadisticasDia = {
          ...stats,
          totalIngresos: totalIngresosNetosDia,
          totalCostos: costoVentasDia,
          utilidadNeta: Number(stats.utilidadNeta) || 0,
          ventasPorMetodo: Object.entries(stats.ventasPorMetodo).reduce(
            (acc, [k, v]) => {
              acc[k as keyof typeof stats.ventasPorMetodo] = Number(v) || 0;
              return acc;
            },
            {} as typeof stats.ventasPorMetodo
          ),
        };
        setAlertaSinCostoBase((Number(statsNorm.ventasSinCostoBaseCantidad) || 0) > 0 || sinCostoBase);
        setEstadisticas(statsNorm);
        setMontoDevolucionesDia(Number(statsNorm.totalDevolucionesMonto) || 0);
        setCantidadDevolucionesDia(Number(statsNorm.totalDevolucionesCantidad) || 0);
        setTotalGastosPeriodo(movimientosOperativos.gastosPeriodo);
        setCantidadGastosPeriodo(movimientosOperativos.cantidadGastos);
        setTotalRepuestosPeriodo(movimientosOperativos.repuestosPeriodo);
        setCantidadRepuestosPeriodo(movimientosOperativos.cantidadRepuestos);
        setTotalReparacionesPeriodo(movimientosOperativos.reparacionesPeriodo);
        setCantidadReparacionesPeriodo(movimientosOperativos.cantidadReparaciones);

        const utilidadVentas =
          (Number(statsNorm.utilidadProductos) || 0) - (Number(statsNorm.utilidadVentasDevueltas) || 0);

        const utilidadConsolidada =
          utilidadVentas
          - movimientosOperativos.gastosPeriodo
          - movimientosOperativos.repuestosPeriodo
          + movimientosOperativos.reparacionesPeriodo;
        setUtilidadNetaConsolidada(utilidadConsolidada);
        const baseMargen = (Number(statsNorm.totalIngresos) || 0) + movimientosOperativos.reparacionesPeriodo;
        setMargenUtilidad(baseMargen > 0 ? (utilidadConsolidada / baseMargen) * 100 : 0);
        setUltimaActualizacion(new Date());
        await cargarExtendidos(statsNorm, filtroDashboard, undefined, rango);
      } else {
        // Para rangos mayores, calcular desde ventas aplicando alcance por rol
        const todasVentas = await electronStore.obtenerTodasLasVentas();
        const ventasRango = todasVentas.filter((v) => {
          const fecha = new Date(v.fecha).getTime();
          const enRango = fecha >= rango.inicio.getTime() && fecha <= rango.fin.getTime();
          const mismaCaja = filtroDashboard.incluirTodosLosCajeros
            ? true
            : (filtroDashboard.cajeroId
              ? v.cajeroId === filtroDashboard.cajeroId
              : String((v as any)?.cajero || '').trim().toLowerCase() === String(filtroDashboard.cajeroNombre || '').trim().toLowerCase());
          const estado = String((v as any)?.estado || '').toLowerCase();
          const valida = estado !== 'devuelto' && estado !== 'anulado';
          return enRango && mismaCaja && valida;
        });

        const totalIngresosBrutos = ventasRango.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
        const { totalCostos: totalCostosRango, sinCostoBase } = await calcularCostoVentas(ventasRango as any[]);
        const totalVentas = ventasRango.length;
        setIngresosBrutosPeriodo(totalIngresosBrutos);
        const ticketPromedio = totalVentas > 0 ? totalIngresosBrutos / totalVentas : 0;
        const devolucionesRango = await electronStore.obtenerDevolucionesPorRango(rango.inicio, rango.fin, filtroDashboard);
        const totalDevolucionesRango = devolucionesRango.reduce((sum, d) => sum + (Number(d.totalDevolucion) || 0), 0);

        const metodosPago = ventasRango.reduce((acc, venta) => {
          const total = Number(venta.total) || 0;
          if (venta.metodoPago === 'mixto' && venta.pagoMixto) {
            acc.efectivo += Number(venta.pagoMixto.efectivo || 0);
            acc.tarjeta += Number(venta.pagoMixto.tarjeta || 0);
            acc.nequi += Number(venta.pagoMixto.nequi || 0);
            acc.daviplata += Number(venta.pagoMixto.daviplata || 0);
            acc.transferencia += Number(venta.pagoMixto.transferencia || 0);
            acc.rappi += Number(venta.pagoMixto.rappi || 0);
          } else if (venta.metodoPago && (acc as any)[venta.metodoPago] !== undefined) {
            (acc as any)[venta.metodoPago] += total;
          }
          return acc;
        }, { efectivo: 0, tarjeta: 0, nequi: 0, daviplata: 0, transferencia: 0, rappi: 0, mixto: 0, bonos: 0, cartera: 0 });

        // Crear objeto de estadísticas compatible
        const statsNorm: EstadisticasDia = {
          fecha: new Date().toISOString().split('T')[0],
          totalIngresosBrutos: totalIngresosBrutos,
          totalIngresos: Math.max(0, totalIngresosBrutos - totalDevolucionesRango),
          totalCostos: totalCostosRango,
          utilidadNeta: 0,
          totalTransacciones: totalVentas,
          totalVentas: totalVentas,
          ticketPromedio,
          ventasPorMetodo: metodosPago,
          ventasPorCajero: {},
          productosPopulares: [],
          totalDevolucionesMonto: totalDevolucionesRango,
          totalDevolucionesCantidad: devolucionesRango.length,
        };
        setAlertaSinCostoBase((Number(statsNorm.ventasSinCostoBaseCantidad) || 0) > 0 || sinCostoBase);

        setEstadisticas(statsNorm);
        setTicketPromedio(ticketPromedio);
        setMontoDevolucionesDia(totalDevolucionesRango);
        setCantidadDevolucionesDia(devolucionesRango.length);
        setTotalGastosPeriodo(movimientosOperativos.gastosPeriodo);
        setCantidadGastosPeriodo(movimientosOperativos.cantidadGastos);
        setTotalRepuestosPeriodo(movimientosOperativos.repuestosPeriodo);
        setCantidadRepuestosPeriodo(movimientosOperativos.cantidadRepuestos);
        setTotalReparacionesPeriodo(movimientosOperativos.reparacionesPeriodo);
        setCantidadReparacionesPeriodo(movimientosOperativos.cantidadReparaciones);

        const utilidadVentas =
          (totalIngresosBrutos - totalCostosRango)
          - (Number(statsNorm.utilidadVentasDevueltas) || 0);

        const utilidadConsolidada =
          utilidadVentas
          - movimientosOperativos.gastosPeriodo
          - movimientosOperativos.repuestosPeriodo
          + movimientosOperativos.reparacionesPeriodo;
        setUtilidadNetaConsolidada(utilidadConsolidada);
        const baseMargen = (Number(statsNorm.totalIngresos) || 0) + movimientosOperativos.reparacionesPeriodo;
        setMargenUtilidad(baseMargen > 0 ? (utilidadConsolidada / baseMargen) * 100 : 0);
        setUltimaActualizacion(new Date());

        await cargarExtendidos(statsNorm, filtroDashboard, ventasRango, rango);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('❌ Error cargando datos del rango:', error);
      toast.error('Error al cargar estadísticas del rango');
      setIsLoading(false);
    }
  }, [calcularMovimientosOperativos, filtroDashboardActual.cajeroId, filtroDashboardActual.cajeroNombre, filtroDashboardActual.incluirTodosLosCajeros]);

  const cargarDatos = async () => {
    try {
      // Cargar configuración
      try { const s = localStorage.getItem('pos-margen-automatico-config'); if (s) setMargenConfig(JSON.parse(s)); } catch {}

      // Cargar logo y nombre comercial
      try {
        const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
        setLogoEmpresa(config.logoUrl || '');
        setNombreComercial(config.nombreComercial || '');
      } catch (error) {
        console.error('Error cargando configuración de empresa:', error);
      }

      try {
        const sesionActiva = cajaDiariaService.getSesionesAbiertas()[0] || null;
        setOperadorCajaActivo(sesionActiva?.usuarioNombre || null);
      } catch {
        setOperadorCajaActivo(null);
      }

      await cargarDatosConRango(fechaRango);
    } catch (e) {
      console.error('❌ Error dashboard:', e);
      toast.error('Error al cargar estadísticas');
      setIsLoading(false);
    }
  };

  const cargarExtendidos = async (
    stats: EstadisticasDia,
    filtroDashboard?: { incluirTodosLosCajeros?: boolean; cajeroId?: string; cajeroNombre?: string },
    ventasFuente?: any[],
    rangoActual?: FechaRango,
  ) => {
    try {
      const ventas = ventasFuente || await electronStore.obtenerVentasDelDia(filtroDashboard);
      const pm = new Map<string, ProductoVendido>();
      ventas.forEach(v => v.items.forEach(item => {
        const pv = Number(item.precioVenta || item.precio) || 0;
        const pc = Number(item.precioCompra || item.costo) || 0;
        const cant = Number(item.cantidad) || 0;
        const util = (pv - pc);
        const ex = pm.get(item.id);
        if (ex) { ex.cantidad += cant; ex.totalVentas += pv * cant; ex.utilidad += util * cant; }
        else pm.set(item.id, { id: item.id, nombre: item.nombre, cantidad: cant, totalVentas: pv * cant, utilidad: util * cant });
      }));
      setTopProductos(Array.from(pm.values()).sort((a, b) => b.totalVentas - a.totalVentas).slice(0, 5));

      const hm = new Map<number, { ventas: number; ingresos: number }>();
      for (let i = 0; i < 24; i++) hm.set(i, { ventas: 0, ingresos: 0 });
      ventas.forEach(v => { const h = new Date(v.fecha).getHours(); const ex = hm.get(h)!; ex.ventas++; ex.ingresos += v.total; });
      setVentasPorHora(Array.from(hm.entries()).map(([h, d]) => ({ hora: `${h.toString().padStart(2, '0')}h`, ventas: d.ventas, ingresos: d.ingresos })).filter(i => i.ventas > 0));

      const now = Date.now();
      const ult = ventas.filter(v => new Date(v.fecha).getTime() >= now - 3600000);
      setVentasUltimaHora(ult.length);
      setIngresoUltimaHora(ult.reduce((s, v) => s + v.total, 0));

      const prods = await electronStore.obtenerProductos();
      setProductosBajoStock(prods.filter(p => p.stock <= (p.stockMinimo || 10)).map(p => ({ id: p.id, nombre: p.nombre, stock: p.stock, stockMinimo: p.stockMinimo || 10 })).sort((a, b) => a.stock - b.stock).slice(0, 8));
      const resumenHibrido = await electronStore.obtenerResumenHibridoDashboard();
      setIngredientesCriticos((resumenHibrido.ingredientesCriticos || []).map(i => ({
        id: i.id,
        nombre: i.nombre,
        stockActual: Number(i.stockActual) || 0,
        stockMinimo: Number(i.stockMinimo) || 0,
        unidad: i.unidad || 'und',
      })));
      setMermaHoy(resumenHibrido.mermaHoy || { cantidad: 0, costo: 0, registros: 0 });
      const hd = new Date();
      setProductosPorVencer(prods.filter(p => p.fechaVencimiento).map(p => { const d = Math.ceil((new Date(p.fechaVencimiento!).getTime() - hd.getTime()) / 86400000); return { id: p.id, nombre: p.nombre, fechaVencimiento: p.fechaVencimiento!, diasRestantes: d }; }).filter(p => p.diasRestantes <= 30 && p.diasRestantes >= 0).sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 8));

      const todas = (await electronStore.obtenerTodasLasVentas()).filter((v) => {
        if (filtroDashboard?.incluirTodosLosCajeros) return true;
        if (filtroDashboard?.cajeroId) return v.cajeroId === filtroDashboard.cajeroId;
        if (filtroDashboard?.cajeroNombre) {
          return String((v as any)?.cajero || '').trim().toLowerCase() === String(filtroDashboard.cajeroNombre).trim().toLowerCase();
        }
        return false;
      });
      const hS = startOfDay(new Date()), aS = startOfDay(subDays(new Date(), 1)), semS = startOfDay(subDays(new Date(), 7)), mesS = startOfDay(subDays(new Date(), 30));
      setComparativa({
        hoy:    todas.filter(v => new Date(v.fecha) >= hS).reduce((s, v) => s + v.total, 0),
        ayer:   todas.filter(v => { const f = new Date(v.fecha); return f >= aS && f < hS; }).reduce((s, v) => s + v.total, 0),
        semana: todas.filter(v => new Date(v.fecha) >= semS).reduce((s, v) => s + v.total, 0),
        mes:    todas.filter(v => new Date(v.fecha) >= mesS).reduce((s, v) => s + v.total, 0),
      });
      setTicketPromedio(stats.totalVentas > 0 ? stats.totalIngresos / stats.totalVentas : 0);
      // El margen se recalcula en cargarDatosConRango con la utilidad consolidada
      const ahora = new Date();
      const inicioRango = rangoActual?.inicio || startOfDay(ahora);
      const finRango = rangoActual?.fin || endOfDay(ahora);
      const msTranscurridos = Math.max(ahora.getTime() - inicioRango.getTime(), 0);
      const msTotales = Math.max(finRango.getTime() - inicioRango.getTime(), 1);
      const factorProyeccion = msTranscurridos > 0 && ahora.getTime() < finRango.getTime()
        ? (msTotales / msTranscurridos)
        : 1;
      setProyeccionVentas(stats.totalIngresos * factorProyeccion);
    } catch (e) { console.error('Error extendidos:', e); }
  };

  useEffect(() => {
    const actualizarToggleModulos = () => {
      try {
        const rawPanaderia = localStorage.getItem('codecpos_panaderia_onces_activo');
        setToggleModuloPanaderiaOncesActivo(rawPanaderia === null ? true : rawPanaderia === 'true');
      } catch {
        setToggleModuloPanaderiaOncesActivo(true);
      }

      try {
        const rawTaller = localStorage.getItem('codecpos_taller_reparaciones_activo');
        setToggleModuloTallerActivo(rawTaller === null ? true : rawTaller === 'true');
      } catch {
        setToggleModuloTallerActivo(true);
      }
    };

    actualizarToggleModulos();
    window.addEventListener('codecpos-panaderia-onces-toggle', actualizarToggleModulos);
    window.addEventListener('codecpos-taller-reparaciones-toggle', actualizarToggleModulos);
    window.addEventListener('storage', actualizarToggleModulos);

    return () => {
      window.removeEventListener('codecpos-panaderia-onces-toggle', actualizarToggleModulos);
      window.removeEventListener('codecpos-taller-reparaciones-toggle', actualizarToggleModulos);
      window.removeEventListener('storage', actualizarToggleModulos);
    };
  }, []);

  useEffect(() => {
    if (!esAdministradorDashboard) {
      setCajeroSeleccionado('__GENERAL__');
    }
  }, [esAdministradorDashboard]);

  useEffect(() => {
    cargarDatos();
    const handle = () => cargarDatos();
    electronStore.onVentaNueva(handle);
    electronStore.onTurnoActualizado(handle);
    const iv = setInterval(cargarDatos, 30000);
    return () => { clearInterval(iv); electronStore.offVentaNueva(handle); electronStore.offTurnoActualizado(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoTemporal, filtroDashboardActual.cajeroId, filtroDashboardActual.cajeroNombre, filtroDashboardActual.incluirTodosLosCajeros]);

  const cambioAyer = comparativa.ayer > 0 ? ((comparativa.hoy - comparativa.ayer) / comparativa.ayer) * 100 : 0;
  const progresoPeriodo = (() => {
    const ahora = new Date();
    const msTranscurridos = Math.max(ahora.getTime() - fechaRango.inicio.getTime(), 0);
    const msTotales = Math.max(fechaRango.fin.getTime() - fechaRango.inicio.getTime(), 1);
    return Math.min(100, (msTranscurridos / msTotales) * 100);
  })();
  // Leer config de métodos de pago para mostrar Bonos si está activo
  const metodosPagoConfig: Array<{ id: string; label: string; enabled: boolean; color: string; tipo: string }> = (() => {
    try { return JSON.parse(localStorage.getItem('codecpos_metodos_pago_config') || '[]'); } catch { return []; }
  })();
  const bonosActivo  = metodosPagoConfig.find(m => m.id === 'bonos')?.enabled  ?? false;
  const bonosLabel   = metodosPagoConfig.find(m => m.id === 'bonos')?.label    ?? 'Bonos';
  const bonosColor   = metodosPagoConfig.find(m => m.id === 'bonos')?.color    ?? '#10b981';

  const datosPorMetodo = estadisticas ? [
    { name: 'Efectivo',      value: Number(estadisticas.ventasPorMetodo.efectivo)      || 0, color: '#10b981' },
    { name: 'Tarjeta',       value: Number(estadisticas.ventasPorMetodo.tarjeta)       || 0, color: '#3b82f6' },
    { name: 'Nequi',         value: Number(estadisticas.ventasPorMetodo.nequi)         || 0, color: '#8b5cf6' },
    { name: 'Daviplata',     value: Number(estadisticas.ventasPorMetodo.daviplata)     || 0, color: '#ef4444' },
    { name: 'Transferencia', value: Number(estadisticas.ventasPorMetodo.transferencia) || 0, color: '#06b6d4' },
    { name: 'Rappi',         value: Number(estadisticas.ventasPorMetodo.rappi)         || 0, color: '#ff6b35' },
    { name: 'Mixto',         value: Number(estadisticas.ventasPorMetodo.mixto)         || 0, color: '#f59e0b' },
    ...(bonosActivo ? [{ name: bonosLabel, value: Number(estadisticas.ventasPorMetodo.bonos) || 0, color: bonosColor }] : []),
  ].filter(i => i.value > 0) : [];
  const datosPorCajero = estadisticas ? Object.entries(estadisticas.ventasPorCajero).map(([name, value]) => ({ name, ventas: Number(value) || 0 })) : [];
  const totalAlertas = productosBajoStock.length + productosPorVencer.length + ingredientesCriticos.length;

  // Colores adaptativos para tooltips
  const tooltipStyle = (accent: string) => ({
    contentStyle: { backgroundColor: dark ? 'rgba(6,13,28,0.97)' : '#fff', border: `1px solid ${accent}40`, borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' },
    labelStyle: { color: dark ? '#fff' : '#0f172a' },
    itemStyle: { color: dark ? '#94a3b8' : '#64748b' },
  });
  const axisColor = dark ? '#1e293b' : '#e2e8f0';
  const tickColor = dark ? '#475569' : '#94a3b8';

  const bgPage = dark
    ? 'linear-gradient(160deg, #060d1c 0%, #0a1428 50%, #070e1e 100%)'
    : 'linear-gradient(160deg, #f0f4ff 0%, #f8fafc 60%, #eef2ff 100%)';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: dark ? 'linear-gradient(135deg,#060d1c,#0c1830)' : '#f8fafc' }}>
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: 'rgba(16,185,129,0.2)' }} />
            <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <BarChart3 className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <p className="font-bold text-lg" style={{ color: dark ? '#fff' : '#0f172a' }}>Cargando Dashboard...</p>
          <p className="text-sm mt-1" style={{ color: dark ? '#475569' : '#94a3b8' }}>CODEC POS v2.0</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto" style={{ background: bgPage }}>
      <div className="max-w-[1600px] mx-auto p-4 pb-10 space-y-4">

        {/* ══ HEADER ══ */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Logo de la Empresa */}
            <div 
              className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center ring-2" 
              style={{ 
                background: dark ? 'rgba(255,255,255,0.98)' : '#ffffff',
                boxShadow: dark 
                  ? '0 4px 24px rgba(16,185,129,0.5), 0 0 0 1px rgba(16,185,129,0.1)' 
                  : '0 4px 20px rgba(16,185,129,0.3), 0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <img 
                src={logoEmpresa || '/logo.png'} 
                alt={nombreComercial || 'Logo empresa'}
                className="w-full h-full object-contain p-1.5"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight" style={{ color: dark ? '#fff' : '#0f172a' }}>
                {nombreComercial || 'Dashboard en Tiempo Real'}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: dark ? '#475569' : '#94a3b8' }}>
                {format(new Date(), "EEEE dd 'de' MMMM 'de' yyyy", { locale: es })}
                {' · '}<span style={{ color: dark ? '#334155' : '#cbd5e1' }}>Act. {format(ultimaActualizacion, 'HH:mm:ss')}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {esAdministradorDashboard && (
              <div className="relative">
                <label
                  className="block mb-1 font-bold"
                  style={{
                    color: dark ? '#93c5fd' : '#3730a3',
                    fontSize: '0.85rem',
                    letterSpacing: '0.03em',
                  }}
                >
                  Supervisión por cajero
                </label>
                <div className="relative">
                  <select
                    value={cajeroSeleccionado}
                    onChange={(e) => setCajeroSeleccionado(e.target.value)}
                    className="appearance-none pr-10 pl-4 py-3 rounded-2xl font-bold transition-all"
                    style={{
                      minWidth: '280px',
                      fontSize: '1.02rem',
                      color: dark ? '#e2e8f0' : '#0f172a',
                      background: dark
                        ? 'linear-gradient(135deg, rgba(15,23,42,0.88), rgba(30,41,59,0.88))'
                        : 'linear-gradient(135deg, #ffffff, #f8fafc)',
                      border: dark ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(99,102,241,0.35)',
                      boxShadow: dark
                        ? 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 8px rgba(15,23,42,0.45), 0 6px 18px rgba(0,0,0,0.28)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 6px rgba(15,23,42,0.07), 0 4px 14px rgba(99,102,241,0.18)',
                    }}
                  >
                    <option value="__GENERAL__">Consolidado General</option>
                    {cajerosActivos.map((cajero) => (
                      <option key={cajero.id} value={cajero.nombre}>
                        {cajero.nombre}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="w-5 h-5 pointer-events-none"
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: dark ? '#a5b4fc' : '#4f46e5',
                    }}
                  />
                </div>
              </div>
            )}

            {/* ✅ SELECTOR DE RANGO TEMPORAL */}
            <SelectorRangoTemporal
              rangoActual={rangoTemporal}
              onCambiarRango={handleCambiarRango}
              onAplicarRangoPersonalizado={handleAplicarRangoPersonalizado}
              rangoPersonalizado={rangoPersonalizado}
              dark={dark}
            />

            {(totalAlertas > 0 || alertaSinCostoBase) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)' }}>
                <Bell className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                <span className="text-red-500 font-bold text-xs">{totalAlertas + (alertaSinCostoBase ? 1 : 0)} alertas</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-bold text-xs">{ventasUltimaHora} vtas · {formatCOP(ingresoUltimaHora)} última hora</span>
            </div>
            <button
              onClick={cargarDatos}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-white text-xs transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg,#10b981,#0d9488)', boxShadow: '0 3px 12px rgba(16,185,129,0.4)' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </button>
            <CodecLogoHorizontal height={34} />
          </div>
        </div>

        {/* ══ KPIs contables ══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 auto-rows-fr">
          <KpiCard titulo="Utilidad Neta" valor={formatCOP(utilidadNetaConsolidada)} subtitulo={`Margen: ${margenUtilidad.toFixed(1)}% · Indicador principal del día`} icon={TrendingUp} accentColor="#10b981" badge={{ label: `${margenUtilidad.toFixed(0)}%`, positive: margenUtilidad > 20 }} trend={Math.min(Math.abs(margenUtilidad) * 3, 100)} delay={0} dark={dark} destacado className="lg:col-span-2"
            onClick={() => setModalKPI({
              tipo: 'utilidad', titulo: 'Utilidad Neta', valor: formatCOP(utilidadNetaConsolidada), accentColor: '#10b981', icon: TrendingUp,
              datos: {
                ingresosNetos: estadisticas?.totalIngresos || 0,
                costos: estadisticas?.totalCostos || 0,
                gastos: totalGastosPeriodo,
                repuestos: moduloTallerActivo ? totalRepuestosPeriodo : 0,
                reparaciones: moduloTallerActivo ? totalReparacionesPeriodo : 0,
                utilidadNeta: utilidadNetaConsolidada,
                margenUtilidad,
              },
            })}
          />
          <KpiCard titulo="Ingresos Brutos" valor={formatCOP(ingresosBrutosPeriodo)} subtitulo="Dinero total ingresado por ventas" icon={DollarSign} accentColor="#0ea5e9" badge={{ label: 'Bruto', positive: true }} trend={65} delay={0.06} dark={dark}
            onClick={() => setModalKPI({
              tipo: 'ingresos', titulo: 'Ingresos Brutos', valor: formatCOP(ingresosBrutosPeriodo), accentColor: '#0ea5e9', icon: DollarSign,
              datos: { ingresosBrutos: ingresosBrutosPeriodo, devoluciones: montoDevolucionesDia, ingresosNetos: estadisticas?.totalIngresos || 0 },
            })}
          />
          <KpiCard titulo="Ingresos Netos" valor={formatCOP(estadisticas?.totalIngresos || 0)} subtitulo="Ventas Totales - Devoluciones" icon={DollarSign} accentColor="#3b82f6" badge={{ label: `${cambioAyer >= 0 ? '+' : ''}${cambioAyer.toFixed(0)}%`, positive: cambioAyer >= 0 }} trend={65} delay={0.07} dark={dark}
            onClick={() => setModalKPI({
              tipo: 'ingresos', titulo: 'Ingresos Netos', valor: formatCOP(estadisticas?.totalIngresos || 0), accentColor: '#3b82f6', icon: DollarSign,
              datos: { ingresosBrutos: ingresosBrutosPeriodo, devoluciones: montoDevolucionesDia, ingresosNetos: estadisticas?.totalIngresos || 0 },
            })}
          />
          <KpiCard titulo="Total Ventas Netas" valor={String(estadisticas?.totalVentas || 0)} subtitulo="Ventas exitosas - devoluciones" icon={ShoppingCart} accentColor="#8b5cf6" badge={{ label: `${cambioAyer >= 0 ? '+' : ''}${cambioAyer.toFixed(0)}%`, positive: cambioAyer >= 0 }} trend={60} delay={0.12} dark={dark}
            onClick={() => setModalKPI({ tipo: 'ventas', titulo: 'Total Ventas Netas', valor: String(estadisticas?.totalVentas || 0), accentColor: '#8b5cf6', icon: ShoppingCart, datos: {} })}
          />
          {moduloPanaderiaOncesActivo && (
            <KpiCard titulo="Merma Hoy" valor={formatCOP(mermaHoy.costo)} subtitulo={`${mermaHoy.registros} registros · ${mermaHoy.cantidad.toFixed(2)} und`} icon={Coffee} accentColor="#ef4444" badge={{ label: mermaHoy.registros > 0 ? 'Atención' : 'OK', positive: mermaHoy.registros === 0 }} trend={Math.min(mermaHoy.registros * 15, 100)} delay={0.13} dark={dark}
              onClick={() => setModalKPI({
                tipo: 'simple', titulo: 'Merma Hoy', valor: formatCOP(mermaHoy.costo), accentColor: '#ef4444', icon: Coffee,
                datos: { explicacion: `Se registraron ${mermaHoy.registros} producto(s) dado(s) de baja por merma (vencimiento, daño, etc.), equivalentes a ${mermaHoy.cantidad.toFixed(2)} unidades. Este valor se descuenta como pérdida — no forma parte de tus ventas.` },
              })}
            />
          )}
          <KpiCard titulo="Proyección Cierre" valor={formatCOP(proyeccionVentas)} subtitulo="Estimado del día según ritmo actual" icon={Target} accentColor="#22c55e" badge={{ label: 'Estimado', positive: true }} trend={Math.min((proyeccionVentas / Math.max((estadisticas?.totalIngresos || 1), 1)) * 35, 100)} delay={0.135} dark={dark}
            onClick={() => setModalKPI({
              tipo: 'proyeccion', titulo: 'Proyección Cierre', valor: formatCOP(proyeccionVentas), accentColor: '#22c55e', icon: Target,
              datos: { ingresosNetos: estadisticas?.totalIngresos || 0, proyeccion: proyeccionVentas, progresoPeriodo },
            })}
          />
          <KpiCard titulo="Devoluciones (Monto)" valor={formatCOP(montoDevolucionesDia)} subtitulo="Salida de caja por devoluciones" icon={TrendingDown} accentColor="#ef4444" trend={Math.min((montoDevolucionesDia / Math.max((estadisticas?.totalIngresos || 1), 1)) * 100, 100)} delay={0.15} dark={dark}
            onClick={() => setModalKPI({ tipo: 'devoluciones', titulo: 'Devoluciones', valor: formatCOP(montoDevolucionesDia), accentColor: '#ef4444', icon: TrendingDown, datos: {} })}
          />
          <KpiCard titulo="Devoluciones (N°)" valor={String(cantidadDevolucionesDia)} subtitulo="Cantidad de devoluciones" icon={TrendingDown} accentColor="#fb7185" badge={cantidadDevolucionesDia > 0 ? { label: 'Activa', positive: false } : { label: '0', positive: true }} trend={Math.min(cantidadDevolucionesDia * 12, 100)} delay={0.16} dark={dark}
            onClick={() => setModalKPI({ tipo: 'devoluciones', titulo: 'Devoluciones', valor: String(cantidadDevolucionesDia), accentColor: '#fb7185', icon: TrendingDown, datos: {} })}
          />
          <KpiCard titulo="Gastos" valor={formatCOP(totalGastosPeriodo)} subtitulo={`${cantidadGastosPeriodo} movimientos`} icon={TrendingDown} accentColor="#f43f5e" badge={cantidadGastosPeriodo > 0 ? { label: `${cantidadGastosPeriodo}`, positive: false } : { label: '0', positive: true }} trend={Math.min(cantidadGastosPeriodo * 10, 100)} delay={0.17} dark={dark}
            onClick={() => setModalKPI({ tipo: 'gastos', titulo: 'Gastos', valor: formatCOP(totalGastosPeriodo), accentColor: '#f43f5e', icon: TrendingDown, datos: {} })}
          />
          {operadorCajaActivo && (
            <KpiCard
              titulo="Operador en Caja Activo"
              valor={operadorCajaActivo}
              subtitulo="Turno abierto actualmente"
              icon={Users}
              accentColor="#14b8a6"
              badge={{ label: 'En turno', positive: true }}
              trend={92}
              delay={0.175}
              dark={dark}
              onClick={() => setModalKPI({
                tipo: 'simple', titulo: 'Operador en Caja Activo', valor: operadorCajaActivo || '', accentColor: '#14b8a6', icon: Users,
                datos: { explicacion: `${operadorCajaActivo} tiene un turno de caja abierto en este momento: ya registró su base inicial y está recibiendo ventas. Cuando termine, debe hacer el cierre de caja para cuadrar el efectivo contra lo vendido.` },
              })}
            />
          )}
          {moduloTallerActivo && (
            <KpiCard titulo="Repuestos Taller" valor={formatCOP(totalRepuestosPeriodo)} subtitulo={`${cantidadRepuestosPeriodo} repuestos registrados`} icon={Wrench} accentColor="#e11d48" badge={cantidadRepuestosPeriodo > 0 ? { label: `${cantidadRepuestosPeriodo}`, positive: false } : { label: '0', positive: true }} trend={Math.min(cantidadRepuestosPeriodo * 10, 100)} delay={0.18} dark={dark}
              onClick={() => setModalKPI({
                tipo: 'simple', titulo: 'Repuestos Taller', valor: formatCOP(totalRepuestosPeriodo), accentColor: '#e11d48', icon: Wrench,
                datos: { explicacion: `Se usaron ${cantidadRepuestosPeriodo} repuesto(s) en las órdenes de reparación de este período, por un costo total de ${formatCOP(totalRepuestosPeriodo)}. Este valor se resta de la utilidad porque es dinero que ya invertiste en insumos para reparar equipos.` },
              })}
            />
          )}
          {moduloTallerActivo && (
            <KpiCard titulo="Reparaciones" valor={formatCOP(totalReparacionesPeriodo)} subtitulo={`${cantidadReparacionesPeriodo} con pago registrado`} icon={Wrench} accentColor="#0ea5e9" badge={cantidadReparacionesPeriodo > 0 ? { label: `+${cantidadReparacionesPeriodo}`, positive: true } : { label: '0', positive: false }} trend={Math.min(cantidadReparacionesPeriodo * 10, 100)} delay={0.19} dark={dark}
              onClick={() => setModalKPI({
                tipo: 'simple', titulo: 'Reparaciones', valor: formatCOP(totalReparacionesPeriodo), accentColor: '#0ea5e9', icon: Wrench,
                datos: { explicacion: `Se recibieron pagos en ${cantidadReparacionesPeriodo} orden(es) de reparación durante este período, sumando ${formatCOP(totalReparacionesPeriodo)}. Este dinero sí cuenta como ingreso dentro de la utilidad del taller.` },
              })}
            />
          )}
          <KpiCard titulo="Ticket Promedio" valor={formatCOP(ticketPromedio)} subtitulo="Por transacción" icon={ShoppingBag} accentColor="#f97316" trend={55} delay={0.18} dark={dark}
            onClick={() => setModalKPI({
              tipo: 'ticket_promedio', titulo: 'Ticket Promedio', valor: formatCOP(ticketPromedio), accentColor: '#f97316', icon: ShoppingBag,
              datos: { ticketPromedio, cantidadTransacciones: estadisticas?.totalVentas || 0 },
            })}
          />
          {moduloTallerActivo && (
            <KpiCard titulo="Ingresos Taller" valor={formatCOP(estadisticasTaller?.ingresosTotales || 0)} subtitulo="Pagos ya recibidos en taller" icon={Wrench} accentColor="#14b8a6" trend={68} delay={0.24} dark={dark}
              onClick={() => setModalKPI({
                tipo: 'simple', titulo: 'Ingresos Taller', valor: formatCOP(estadisticasTaller?.ingresosTotales || 0), accentColor: '#14b8a6', icon: Wrench,
                datos: { explicacion: 'Es el total de pagos que ya recibiste por reparaciones del taller, sin contar saldos que los clientes aún deben.' },
              })}
            />
          )}
        </div>

        <ModalDetalleKPI
          open={modalKPI !== null}
          onClose={() => setModalKPI(null)}
          darkMode={dark}
          tipo={modalKPI?.tipo || 'simple'}
          titulo={modalKPI?.titulo || ''}
          valor={modalKPI?.valor || ''}
          accentColor={modalKPI?.accentColor || '#10b981'}
          icon={modalKPI?.icon || DollarSign}
          rango={fechaRango}
          filtro={filtroDashboardActual}
          datos={modalKPI?.datos || {}}
        />

        {moduloTallerActivo && (
          <Panel accent="rgba(20,184,166,0.5)" dark={dark} className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Consolidado contable POS + Taller</h3>
                <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Visión integrada para control de ingresos y cartera</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: '#3b82f6' }}>POS</p>
                  <p className="font-black" style={{ color: dark ? '#fff' : '#0f172a' }}>{formatCOP(estadisticas?.totalIngresos || 0)}</p>
                </div>
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(20,184,166,0.12)' : 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: '#14b8a6' }}>Taller</p>
                  <p className="font-black" style={{ color: dark ? '#fff' : '#0f172a' }}>{formatCOP(estadisticasTaller?.ingresosTotales || 0)}</p>
                </div>
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: '#10b981' }}>Total Integrado</p>
                  <p className="font-black" style={{ color: dark ? '#fff' : '#0f172a' }}>{formatCOP((estadisticas?.totalIngresos || 0) + (estadisticasTaller?.ingresosTotales || 0))}</p>
                </div>
              </div>
            </div>
          </Panel>
        )}

        {alertaSinCostoBase && (
          <Panel accent="rgba(239,68,68,0.5)" dark={dark} className="p-4">
            <p className="font-black text-lg text-red-500">⚠ Existen ventas sin costo base definido</p>
          </Panel>
        )}

        {/* ══ Reloj + Meta + Alertas ══ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RelojVivo dark={dark} />
          <MetaDelDia ingresosHoy={estadisticas?.totalIngresos || 0} dark={dark} />
          <PanelAlertas bajoStock={productosBajoStock} porVencer={productosPorVencer} dark={dark} />
        </div>

        {ingredientesCriticos.length > 0 && (
          <Panel accent="rgba(245,158,11,0.5)" dark={dark} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Coffee className="w-4 h-4 text-yellow-500" />
              <h3 className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Ingredientes en Stock Crítico</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {ingredientesCriticos.slice(0, 6).map(i => (
                <div key={i.id} className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <p className="text-xs font-bold" style={{ color: dark ? '#fff' : '#0f172a' }}>{i.nombre}</p>
                  <p className="text-[11px]" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                    {i.stockActual} / mín {i.stockMinimo} {i.unidad}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {moduloTallerActivo && (alertasTaller.atrasadas.length > 0 || alertasTaller.garantiasProximas.length > 0 || alertasTaller.conSaldo.length > 0) && (
          <Panel accent="rgba(239,68,68,0.5)" dark={dark} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-orange-500" />
              <h3 className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Alertas del Taller</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {alertasTaller.atrasadas.length > 0 && (
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase text-red-500 mb-1">Ordenes Atrasadas</p>
                  <p className="font-black text-lg" style={{ color: dark ? '#fff' : '#0f172a' }}>{alertasTaller.atrasadas.length}</p>
                  <p className="text-[11px]" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Superaron la fecha estimada</p>
                </div>
              )}
              {alertasTaller.garantiasProximas.length > 0 && (
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(234,179,8,0.10)' : 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase text-yellow-500 mb-1">Garantias por Vencer</p>
                  <p className="font-black text-lg" style={{ color: dark ? '#fff' : '#0f172a' }}>{alertasTaller.garantiasProximas.length}</p>
                  <p className="text-[11px]" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Vencen en los proximos 7 dias</p>
                </div>
              )}
              {alertasTaller.conSaldo.length > 0 && (
                <div className="px-3 py-2 rounded-xl" style={{ background: dark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <p className="text-[10px] font-bold uppercase text-blue-500 mb-1">Saldos Pendientes</p>
                  <p className="font-black text-lg" style={{ color: dark ? '#fff' : '#0f172a' }}>{alertasTaller.conSaldo.length}</p>
                  <p className="text-[11px]" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Clientes con saldo por cobrar</p>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* ══ Flujo de Caja ══ */}
        <FlujoCaja estadisticas={estadisticas} dark={dark} />

        {/* ══ Comparativa ══ */}
        <Panel accent="rgba(99,102,241,0.5)" dark={dark} className="p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)' }}>
              <Activity className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: dark ? '#fff' : '#0f172a' }}>Comparativa de Ventas</h3>
              <p className="text-[11px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>Hoy · Ayer · Semana · Mes</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ComparativaCard label="Hoy" val={comparativa.hoy} refVal={null} accentColor="#10b981" dark={dark} />
            <ComparativaCard label="Ayer" val={comparativa.ayer} refVal={comparativa.hoy} accentColor="#3b82f6" dark={dark} />
            <ComparativaCard label="Últimos 7 días" val={comparativa.semana} refVal={null} accentColor="#8b5cf6" dark={dark} />
            <ComparativaCard label="Últimos 30 días" val={comparativa.mes} refVal={null} accentColor="#f59e0b" dark={dark} />
          </div>
        </Panel>

        {/* ══ Gráficas ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPanel title="Ventas por Hora del Día" subtitle="Ingresos acumulados por hora" icon={Clock} accentColor="#3b82f6" dark={dark}>
            {ventasPorHora.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={ventasPorHora} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gH" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hora" stroke={axisColor} tick={{ fill: tickColor, fontSize: 10 }} />
                  <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 10 }} tickFormatter={v => formatCOP(v)} width={68} />
                  <Tooltip {...tooltipStyle('#3b82f6')} formatter={(v: any) => [formatCOP(Number(v)), 'Ingresos']} />
                  <Area type="monotone" dataKey="ingresos" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#gH)" dot={{ fill: '#3b82f6', r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, fill: '#60a5fa' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                <Clock className="w-10 h-10" style={{ color: dark ? '#1e293b' : '#e2e8f0' }} />
                <p className="text-sm" style={{ color: dark ? '#334155' : '#94a3b8' }}>Sin ventas registradas hoy</p>
              </div>
            )}
          </ChartPanel>

          <ChartPanel title="Top 5 Productos" subtitle="Más vendidos del día" icon={Award} accentColor="#f59e0b" dark={dark}>
            {topProductos.length > 0 ? (
              <div className="space-y-2">
                {topProductos.map((p, i) => {
                  const pct = (p.totalVentas / topProductos[0].totalVentas) * 100;
                  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                  const colors = ['#f59e0b', '#94a3b8', '#b45309', '#6366f1', '#6366f1'];
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="p-2.5 rounded-xl"
                      style={{ background: dark ? 'rgba(255,255,255,0.025)' : '#f8fafc', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0' }}>
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-base shrink-0">{medals[i]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs truncate" style={{ color: dark ? '#fff' : '#0f172a' }}>{p.nombre}</p>
                          <p className="text-[10px]" style={{ color: dark ? '#475569' : '#94a3b8' }}>{p.cantidad} und · Util: {formatCOP(p.utilidad)}</p>
                        </div>
                        <p className="font-black text-xs shrink-0 text-emerald-500">{formatCOP(p.totalVentas)}</p>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3 + i * 0.06, duration: 0.7 }}
                          className="h-full rounded-full" style={{ background: colors[i] }} />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                <Package className="w-10 h-10" style={{ color: dark ? '#1e293b' : '#e2e8f0' }} />
                <p className="text-sm" style={{ color: dark ? '#334155' : '#94a3b8' }}>Sin ventas del día todavía</p>
              </div>
            )}
          </ChartPanel>
        </div>

        {/* ══ Pie + Cajeros ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPanel title="Métodos de Pago" subtitle="Distribución del día" icon={CreditCard} accentColor="#8b5cf6" dark={dark}>
            {datosPorMetodo.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={datosPorMetodo} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} dataKey="value">
                    {datosPorMetodo.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle('#8b5cf6')} formatter={(v: any) => [formatCOP(Number(v)), 'Monto']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                <CreditCard className="w-10 h-10" style={{ color: dark ? '#1e293b' : '#e2e8f0' }} />
                <p className="text-sm" style={{ color: dark ? '#334155' : '#94a3b8' }}>Sin datos de pago hoy</p>
              </div>
            )}
          </ChartPanel>

          <ChartPanel title="Rendimiento por Cajero" subtitle="Ventas totales por operador" icon={Users} accentColor="#6366f1" dark={dark}>
            {datosPorCajero.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={datosPorCajero} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#4338ca" />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke={axisColor} tick={{ fill: tickColor, fontSize: 10 }} />
                  <YAxis stroke={axisColor} tick={{ fill: tickColor, fontSize: 10 }} tickFormatter={v => formatCOP(v)} width={68} />
                  <Tooltip {...tooltipStyle('#6366f1')} formatter={(v: any) => [formatCOP(Number(v)), 'Ventas']} />
                  <Bar dataKey="ventas" fill="url(#gB)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                <Users className="w-10 h-10" style={{ color: dark ? '#1e293b' : '#e2e8f0' }} />
                <p className="text-sm" style={{ color: dark ? '#334155' : '#94a3b8' }}>Sin datos de cajeros hoy</p>
              </div>
            )}
          </ChartPanel>
        </div>

        {/* ══ Widgets ══ */}
        <NotificacionesAntiFraude />
        <DevolucionesStatsCard />

        {/* Footer */}
        <div className="text-center pt-1 pb-3">
          <p className="text-xs" style={{ color: dark ? '#1e293b' : '#cbd5e1' }}>
            Software diseñado por{' '}
            <a href="https://codecstudio.online/" target="_blank" rel="noopener noreferrer"
              className="font-semibold hover:text-emerald-500 transition-colors" style={{ color: dark ? '#334155' : '#94a3b8' }}>
              CODEC ESTUDIO
            </a>
            {' '}· Actualización automática cada 30s
          </p>
        </div>
      </div>
    </div>
  );
}
