import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Primitivas compartidas de las páginas del Admin Web. Tailwind a mano (no
 * shadcn/ui) para garantizar que coinciden exactamente con la paleta ya
 * fijada en AdminLayout/AdminLoginPage (bg-slate-950/900, border-slate-800,
 * acento emerald) sin depender de tokens CSS de otro tema.
 */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-5 ${className}`}>
      {title && <h2 className="font-semibold text-sm text-slate-300 mb-4">{title}</h2>}
      {children}
    </div>
  );
}

export function StatCard({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'warn' | 'danger' }) {
  const color = tone === 'warn' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : 'text-emerald-400';
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  ACTIVA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ACTIVO: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PRUEBA: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  TRIAL: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PENDIENTE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PENDIENTE_PAGO: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  SUSPENDIDA: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CANCELADA: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELADO: 'bg-red-500/15 text-red-400 border-red-500/30',
  VENCIDA: 'bg-red-500/15 text-red-400 border-red-500/30',
  EXPIRADA: 'bg-red-500/15 text-red-400 border-red-500/30',
  ERROR: 'bg-red-500/15 text-red-400 border-red-500/30',
  DENEGADO: 'bg-red-500/15 text-red-400 border-red-500/30',
  EXITO: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ATENDIDA: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  INACTIVA: 'bg-slate-700/40 text-slate-400 border-slate-700',
  VITALICIA: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};

export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <span className="text-slate-600 text-xs">—</span>;
  const tone = BADGE_TONES[estado] ?? 'bg-slate-700/40 text-slate-300 border-slate-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tone}`}>{estado}</span>;
}

export function PlanBadge({ plan }: { plan: string | null | undefined }) {
  if (!plan) return <span className="text-slate-600 text-xs">—</span>;
  const esPremium = plan === 'PREMIUM';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
      esPremium ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-700/40 text-slate-300 border-slate-700'
    }`}>
      {plan}
    </span>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
    </div>
  );
}

export function ErrorState({ mensaje }: { mensaje: string }) {
  return <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">{mensaje}</p>;
}

export function EmptyState({ mensaje }: { mensaje: string }) {
  return <p className="text-slate-500 text-sm py-8 text-center">{mensaje}</p>;
}

export function formatoMoneda(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return '—';
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

export function formatoFecha(valor: string | null | undefined) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatoFechaHora(valor: string | null | undefined) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
