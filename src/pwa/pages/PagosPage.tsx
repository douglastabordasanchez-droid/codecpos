import { useEffect, useMemo, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Plus, X, DollarSign, Loader2, CheckCircle2, Clock, XCircle, TrendingUp } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { confirmarPagoManual, NotificacionPagoRow } from '../../app/lib/supabase/codecVerifyService';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface VentaFila {
  metodo_pago: string | null;
  total: number;
}

const ENTIDADES = ['nequi', 'daviplata', 'bancolombia', 'dale', 'otro'];

const METODO_INFO: Record<string, { emoji: string; label: string }> = {
  efectivo: { emoji: '💵', label: 'Efectivo' },
  nequi: { emoji: '💜', label: 'Nequi' },
  daviplata: { emoji: '❤️', label: 'Daviplata' },
  tarjeta: { emoji: '💳', label: 'Tarjeta' },
  transferencia: { emoji: '🏦', label: 'Transferencia' },
};

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function PagosPage() {
  const { empleado } = usePwaAuth();
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);

  const [monto, setMonto] = useState('');
  const [entidad, setEntidad] = useState('nequi');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [recientes, setRecientes] = useState<NotificacionPagoRow[]>([]);

  const cargar = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargando(true);
    const [{ data: ventasData }, { data: notifData }] = await Promise.all([
      client.from('ventas').select('metodo_pago, total')
        .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
        .gte('created_at', inicioDeHoy().toISOString()),
      client.from('notificaciones_pago').select('*')
        .eq('cliente_id', empleado.cliente_id)
        .order('created_at', { ascending: false }).limit(10),
    ]);
    setVentas((ventasData as VentaFila[]) || []);
    setRecientes((notifData as NotificacionPagoRow[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const desglose = useMemo(() => {
    const porMetodo: Record<string, number> = {};
    let total = 0;
    for (const v of ventas) {
      const m = v.metodo_pago || 'otro';
      porMetodo[m] = (porMetodo[m] || 0) + Number(v.total);
      total += Number(v.total);
    }
    return { porMetodo, total, cantidad: ventas.length };
  }, [ventas]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado) return;
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa un monto válido' });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const resultado = await confirmarPagoManual({ monto: montoNum, entidad, referencia: referencia.trim() || undefined, clienteId: empleado.cliente_id });
    setEnviando(false);
    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: 'Pago confirmado — la caja se desbloqueará automáticamente' });
      setMonto('');
      setReferencia('');
      cargar();
      setTimeout(() => setMostrarConfirmar(false), 1200);
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error || 'No se pudo confirmar el pago' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-black">Pagos</h1>
          <p className="text-slate-400 text-sm">Recibidos hoy por método</p>
        </div>
        <button
          onClick={() => setMostrarConfirmar(true)}
          className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30"
          aria-label="Confirmar pago manual"
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="px-5 mb-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 shadow-xl shadow-orange-500/20"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-wide">Total recibido hoy</p>
              <p className="text-white text-3xl font-black mt-1">${desglose.total.toLocaleString('es-CO')}</p>
              <p className="text-white/70 text-xs mt-1">{desglose.cantidad} pagos</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="px-5 mb-6 grid grid-cols-2 gap-3">
        {cargando && <p className="col-span-2 text-slate-500 text-sm text-center py-4">Cargando...</p>}
        {!cargando && Object.keys(desglose.porMetodo).length === 0 && (
          <p className="col-span-2 text-slate-500 text-sm text-center py-4">Sin pagos hoy todavía</p>
        )}
        {Object.entries(desglose.porMetodo)
          .sort(([, a], [, b]) => b - a)
          .map(([metodo, monto2], i) => {
            const info = METODO_INFO[metodo] || { emoji: '💰', label: metodo };
            const pct = desglose.total > 0 ? (monto2 / desglose.total) * 100 : 0;
            return (
              <motion.div
                key={metodo}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{info.emoji}</span>
                  <span className="text-white text-sm font-semibold capitalize">{info.label}</span>
                </div>
                <p className="text-white text-xl font-black">${monto2.toLocaleString('es-CO')}</p>
                <div className="h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-slate-500 text-[10px] mt-1">{pct.toFixed(0)}% del total</p>
              </motion.div>
            );
          })}
      </div>

      <div className="px-5">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">Codec Verify — Recientes</h2>
        <div className="space-y-2">
          {recientes.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Sin confirmaciones manuales todavía</p>
          )}
          {recientes.map((n) => (
            <div key={n.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">
                  ${n.monto.toLocaleString('es-CO')} <span className="text-slate-500 font-normal capitalize">· {n.entidad}</span>
                </p>
                {n.referencia && <p className="text-slate-500 text-xs">{n.referencia}</p>}
              </div>
              <EstadoBadge estado={n.estado} />
            </div>
          ))}
        </div>
      </div>

      {mostrarConfirmar && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg">Confirmar pago manual</h2>
              <button onClick={() => setMostrarConfirmar(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 pb-8 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Monto</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number" inputMode="numeric" required autoFocus
                    value={monto} onChange={(e) => setMonto(e.target.value)}
                    placeholder="0"
                    className="h-14 pl-9 text-2xl font-bold bg-slate-900 border-slate-700 text-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Entidad</Label>
                <div className="grid grid-cols-3 gap-2">
                  {ENTIDADES.map((e) => (
                    <button
                      key={e} type="button" onClick={() => setEntidad(e)}
                      className={`h-11 rounded-lg text-xs font-bold capitalize transition-all ${
                        entidad === e ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Referencia (opcional)</Label>
                <Input
                  value={referencia} onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Nombre del remitente, # de referencia..."
                  className="h-12 bg-slate-900 border-slate-700 text-white"
                />
              </div>
              {mensaje && (
                <p className={`text-sm text-center ${mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{mensaje.texto}</p>
              )}
              <Button type="submit" disabled={enviando} className="w-full h-14 text-base bg-gradient-to-r from-emerald-500 to-emerald-600">
                {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                {enviando ? 'Confirmando...' : 'Confirmar Pago'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: NotificacionPagoRow['estado'] }) {
  if (estado === 'confirmado') {
    return <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmado</span>;
  }
  if (estado === 'descartado') {
    return <span className="flex items-center gap-1 text-slate-500 text-xs font-bold"><XCircle className="w-3.5 h-3.5" /> Descartado</span>;
  }
  return <span className="flex items-center gap-1 text-amber-400 text-xs font-bold"><Clock className="w-3.5 h-3.5" /> Pendiente</span>;
}
