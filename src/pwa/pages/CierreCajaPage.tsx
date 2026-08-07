import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, Loader2, Clock, History } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface CierreFila {
  id: string;
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  monto_apertura: number;
  monto_cierre: number;
  ventas_total: number;
  diferencia: number;
}

const TERMINAL_ID = 'PWA';

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function CierreCajaPage() {
  const { empleado } = usePwaAuth();
  const [cierreAbierto, setCierreAbierto] = useState<CierreFila | null | undefined>(undefined);
  const [historial, setHistorial] = useState<CierreFila[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  const [montoApertura, setMontoApertura] = useState('');
  const [montoCierre, setMontoCierre] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;

    const { data: abierto } = await client
      .from('cierres_caja')
      .select('id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia')
      .eq('cliente_id', empleado.cliente_id)
      .eq('terminal_id', TERMINAL_ID)
      .is('fecha_cierre', null)
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCierreAbierto((abierto as CierreFila | null) || null);

    setCargandoHistorial(true);
    const { data: hist } = await client
      .from('cierres_caja')
      .select('id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia')
      .eq('cliente_id', empleado.cliente_id)
      .not('fecha_cierre', 'is', null)
      .order('fecha_cierre', { ascending: false })
      .limit(15);
    setHistorial((hist as CierreFila[]) || []);
    setCargandoHistorial(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const handleAbrir = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado) return;
    const monto = Number(montoApertura) || 0;
    setProcesando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const { error: insertError } = await client.from('cierres_caja').insert({
      cliente_id: empleado.cliente_id,
      terminal_id: TERMINAL_ID,
      empleado_id: empleado.id,
      fecha_apertura: new Date().toISOString(),
      monto_apertura: monto,
    });
    setProcesando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setMontoApertura('');
    cargar();
  };

  const handleCerrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado || !cierreAbierto) return;
    setProcesando(true);
    setError(null);
    const client = getSupabaseClient()!;

    const { data: ventas } = await client
      .from('ventas')
      .select('total')
      .eq('cliente_id', empleado.cliente_id)
      .eq('estado', 'completada')
      .gte('created_at', cierreAbierto.fecha_apertura || new Date().toISOString());

    const ventasTotal = (ventas || []).reduce((s: number, v: any) => s + Number(v.total), 0);
    const montoContado = Number(montoCierre) || 0;
    const esperado = cierreAbierto.monto_apertura + ventasTotal;
    const diferencia = montoContado - esperado;

    const { error: updateError } = await client
      .from('cierres_caja')
      .update({
        fecha_cierre: new Date().toISOString(),
        monto_cierre: montoContado,
        ventas_total: ventasTotal,
        diferencia,
      })
      .eq('id', cierreAbierto.id);

    setProcesando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMontoCierre('');
    cargar();
  };

  if (cierreAbierto === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Caja</h1>
        <p className="text-slate-400 text-sm">Apertura y cierre desde el celular</p>
      </div>

      <div className="px-5 mb-6">
        {!cierreAbierto ? (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleAbrir}
            className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja cerrada</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Monto de apertura (base)</Label>
              <Input
                type="number" inputMode="numeric" required autoFocus
                value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)}
                placeholder="0"
                className="h-14 text-2xl font-bold bg-slate-950/60 border-slate-700 text-white"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={procesando} className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600">
              {procesando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {procesando ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </motion.form>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCerrar}
            className="bg-slate-900/70 backdrop-blur border border-amber-800/40 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja abierta</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              Desde {cierreAbierto.fecha_apertura ? new Date(cierreAbierto.fecha_apertura).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            <p className="text-slate-400 text-sm">Base de apertura: <span className="text-white font-bold">${cierreAbierto.monto_apertura.toLocaleString('es-CO')}</span></p>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Monto contado al cerrar</Label>
              <Input
                type="number" inputMode="numeric" required autoFocus
                value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)}
                placeholder="0"
                className="h-14 text-2xl font-bold bg-slate-950/60 border-slate-700 text-white"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={procesando} className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600">
              {procesando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {procesando ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </motion.form>
        )}
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Historial de cierres</h2>
        </div>
        <div className="space-y-2">
          {cargandoHistorial && <p className="text-slate-500 text-sm text-center py-4">Cargando...</p>}
          {!cargandoHistorial && historial.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">Sin cierres registrados</p>
          )}
          {historial.map((c, i) => (
            <motion.div
              key={c.id}
              custom={i}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-white font-semibold text-sm">
                  {c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </p>
                <span className={`text-xs font-bold ${Math.abs(c.diferencia) < 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {c.diferencia >= 0 ? '+' : ''}{c.diferencia.toLocaleString('es-CO')}
                </span>
              </div>
              <p className="text-slate-500 text-xs">
                Ventas: ${c.ventas_total.toLocaleString('es-CO')} · Contado: ${c.monto_cierre.toLocaleString('es-CO')}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
