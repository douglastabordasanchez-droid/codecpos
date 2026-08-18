/**
 * Contabilidad — versión móvil.
 *
 * Ingresos extra (aportes, préstamos) + gastos, en un solo libro. Los
 * gastos ya sincronizaban desde antes (tabla `gastos`, la misma que usa
 * Reportes/Dashboard); lo nuevo es `ingresos_extra` — ver migración 0029.
 */
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Loader2, Calendar } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface Movimiento {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string | null;
  monto: number;
  tipo: 'ingreso' | 'gasto';
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}
function formatoFechaInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ContabilidadPage() {
  const { empleado } = usePwaAuth();
  const [desde, setDesde] = useState(() => formatoFechaInput(new Date(inicioDeHoy().getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [hasta, setHasta] = useState(() => formatoFechaInput(inicioDeHoy()));
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;
    setCargando(true);
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }

    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(new Date(`${hasta}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);

    const cargar = () => {
      Promise.all([
        client.from('ingresos_extra').select('id, fecha, concepto, categoria, monto')
          .eq('cliente_id', empleado.cliente_id).gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString()),
        client.from('gastos').select('id, fecha, descripcion, categoria, monto')
          .eq('cliente_id', empleado.cliente_id).gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString()),
      ]).then(([{ data: ingresosData }, { data: gastosData }]) => {
        if (cancelado) return;
        const ingresos: Movimiento[] = ((ingresosData as any[]) || []).map((i) => ({
          id: i.id, fecha: i.fecha, concepto: i.concepto, categoria: i.categoria, monto: Number(i.monto), tipo: 'ingreso',
        }));
        const gastos: Movimiento[] = ((gastosData as any[]) || []).map((g) => ({
          id: g.id, fecha: g.fecha, concepto: g.descripcion, categoria: g.categoria, monto: Number(g.monto), tipo: 'gasto',
        }));
        setMovimientos([...ingresos, ...gastos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
        setCargando(false);
      });
    };

    cargar();

    const canal = client
      .channel(`contabilidad-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos_extra', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .subscribe();

    return () => { cancelado = true; client.removeChannel(canal); };
  }, [empleado?.cliente_id, desde, hasta]);

  const totalIngresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const totalGastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
  const balance = totalIngresos - totalGastos;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Contabilidad</h1>
        <p className="text-slate-400 text-sm">Ingresos extra y gastos del periodo</p>
      </div>

      <div className="px-5 flex items-center gap-2 mb-5">
        <div className="flex-1 flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-xl px-2.5 h-11">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="bg-transparent text-white text-xs w-full outline-none" />
        </div>
        <span className="text-slate-600 text-xs">a</span>
        <div className="flex-1 flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-xl px-2.5 h-11">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input type="date" value={hasta} min={desde} max={formatoFechaInput(inicioDeHoy())} onChange={(e) => setHasta(e.target.value)} className="bg-transparent text-white text-xs w-full outline-none" />
        </div>
      </div>

      <div className="px-5 grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-emerald-400 mb-1"><TrendingUp className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Ingresos</span></div>
          <p className="text-white font-black text-lg">{money(totalIngresos)}</p>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-red-400 mb-1"><TrendingDown className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Gastos</span></div>
          <p className="text-white font-black text-lg">{money(totalGastos)}</p>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className={`rounded-2xl p-4 border ${balance >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <p className="text-slate-400 text-xs font-semibold uppercase">Balance del periodo</p>
          <p className={`font-black text-2xl ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(balance)}</p>
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : (
        <div className="px-5 space-y-2">
          {movimientos.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Sin movimientos en el rango</p>
          ) : (
            movimientos.map((m) => (
              <div key={`${m.tipo}-${m.id}`} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{m.concepto}</p>
                  <p className="text-slate-500 text-xs">{new Date(m.fecha).toLocaleDateString('es-CO')}{m.categoria ? ` · ${m.categoria}` : ''}</p>
                </div>
                <p className={`font-bold text-sm shrink-0 ${m.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {m.tipo === 'ingreso' ? '+' : '-'}{money(m.monto)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
