/**
 * Dashboard ejecutivo — versión móvil.
 *
 * Complementa a InicioPage (que ya muestra ventas/ticket/alertas del día a
 * día) con la vista financiera: utilidad real (ventas - costo de lo
 * vendido), gastos y devoluciones del periodo, y una tendencia diaria.
 * Todo sobre las mismas tablas de Supabase que ya usa el resto de la PWA
 * (ventas, venta_items, productos, gastos, devoluciones) — sin sync nueva.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Wallet, RotateCcw, DollarSign, Receipt } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

type RangoFiltro = 'hoy' | '7d' | '30d';

const RANGO_OPCIONES: { id: RangoFiltro; label: string; dias: number }[] = [
  { id: 'hoy', label: 'Hoy', dias: 1 },
  { id: '7d', label: '7 días', dias: 7 },
  { id: '30d', label: '30 días', dias: 30 },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

export default function DashboardPage() {
  const { empleado } = usePwaAuth();
  const [rango, setRango] = useState<RangoFiltro>('7d');
  const [cargando, setCargando] = useState(true);
  const [ventas, setVentas] = useState<{ id: string; total: number; created_at: string }[]>([]);
  const [utilidad, setUtilidad] = useState(0);
  const [gastosTotal, setGastosTotal] = useState(0);
  const [devolucionesTotal, setDevolucionesTotal] = useState(0);

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      const client = getSupabaseClient();
      if (!client) { setCargando(false); return; }

      const dias = RANGO_OPCIONES.find((r) => r.id === rango)!.dias;
      const hoy = inicioDeHoy();
      const inicio = new Date(hoy.getTime() - (dias - 1) * 24 * 60 * 60 * 1000);
      const fin = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);

      const [{ data: ventasData }, { data: gastosData }, { data: devolucionesData }] = await Promise.all([
        client.from('ventas').select('id, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString()),
        client.from('gastos').select('monto, fecha')
          .eq('cliente_id', empleado.cliente_id)
          .gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString()),
        client.from('devoluciones').select('total_devolucion, created_at')
          .eq('cliente_id', empleado.cliente_id)
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString()),
      ]);

      if (cancelado) return;
      const ventasLista = (ventasData as { id: string; total: number; created_at: string }[]) || [];
      setVentas(ventasLista);
      const gastosTotalCalc = ((gastosData as { monto: number }[]) || []).reduce((a, g) => a + Number(g.monto), 0);
      const devolucionesTotalCalc = ((devolucionesData as { total_devolucion: number }[]) || []).reduce((a, d) => a + Number(d.total_devolucion), 0);
      setGastosTotal(gastosTotalCalc);
      setDevolucionesTotal(devolucionesTotalCalc);

      // 🐛 FIX: coincidir con Electron/InicioPage.tsx — la utilidad neta
      // debe restar TAMBIÉN gastos y devoluciones del período, no solo el
      // costo de lo vendido. Antes esta pantalla ya traía gastosTotal y
      // devolucionesTotal (se mostraban en sus propias tarjetas) pero nunca
      // se restaban de la utilidad, así que el número no cuadraba ni con
      // Electron ni con InicioPage.tsx aunque fuera el mismo negocio y
      // período.
      // Utilidad real: ventas - devoluciones - costo de lo vendido - gastos
      if (ventasLista.length > 0) {
        const ventaIds = ventasLista.map((v) => v.id);
        const { data: itemsData } = await client
          .from('venta_items')
          .select('venta_id, producto_id, cantidad, precio_unitario')
          .in('venta_id', ventaIds);
        const items = (itemsData as { producto_id: string | null; cantidad: number; precio_unitario: number }[]) || [];
        const productoIds = Array.from(new Set(items.map((i) => i.producto_id).filter(Boolean))) as string[];
        const costosPorProducto = new Map<string, number>();
        if (productoIds.length > 0) {
          const { data: prodsData } = await client.from('productos').select('id, costo').in('id', productoIds);
          for (const p of (prodsData as { id: string; costo: number }[]) || []) costosPorProducto.set(p.id, Number(p.costo) || 0);
        }
        const costoTotal = items.reduce((a, i) => a + (costosPorProducto.get(i.producto_id || '') || 0) * Number(i.cantidad), 0);
        const totalVentas = ventasLista.reduce((a, v) => a + Number(v.total), 0);
        if (!cancelado) setUtilidad(totalVentas - devolucionesTotalCalc - costoTotal - gastosTotalCalc);
      } else {
        if (!cancelado) setUtilidad(-devolucionesTotalCalc - gastosTotalCalc);
      }

      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, 60000);
    return () => { cancelado = true; window.clearInterval(interval); };
  }, [empleado?.cliente_id, rango]);

  const totalVentas = useMemo(() => ventas.reduce((a, v) => a + Number(v.total), 0), [ventas]);
  const ticketProm = ventas.length ? totalVentas / ventas.length : 0;

  // Serie diaria para la tendencia — agrupa por día dentro del rango elegido.
  const serieDiaria = useMemo(() => {
    const dias = RANGO_OPCIONES.find((r) => r.id === rango)!.dias;
    const hoy = inicioDeHoy();
    const porDia = new Map<string, number>();
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy.getTime() - i * 24 * 60 * 60 * 1000);
      porDia.set(d.toISOString().slice(0, 10), 0);
    }
    for (const v of ventas) {
      const clave = v.created_at.slice(0, 10);
      if (porDia.has(clave)) porDia.set(clave, (porDia.get(clave) || 0) + Number(v.total));
    }
    return Array.from(porDia.entries()).map(([fecha, total]) => ({
      fecha: new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
      total,
    }));
  }, [ventas, rango]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Dashboard</h1>
        <p className="text-slate-400 text-sm">Vista financiera del negocio</p>
      </div>

      <div className="px-5 flex items-center gap-1.5 mb-5 overflow-x-auto">
        {RANGO_OPCIONES.map((op) => (
          <button
            key={op.id}
            onClick={() => setRango(op.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              rango === op.id
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="px-5 py-12 text-center text-slate-500 text-sm">Cargando…</div>
      ) : (
        <>
          <div className="px-5 grid grid-cols-2 gap-3 mb-5">
            <KpiCard icon={DollarSign} label="Ventas" value={money(totalVentas)} color="emerald" />
            <KpiCard icon={TrendingUp} label="Utilidad" value={money(utilidad)} color={utilidad >= 0 ? 'sky' : 'red'} />
            <KpiCard icon={Receipt} label="Ticket promedio" value={money(ticketProm)} color="purple" />
            <KpiCard icon={Wallet} label="Gastos" value={money(gastosTotal)} color="amber" />
            <KpiCard icon={RotateCcw} label="Devoluciones" value={money(devolucionesTotal)} color="red" wide />
          </div>

          <div className="px-5">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2.5">Tendencia de ventas</p>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieDiaria} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ventasFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="fecha" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={rango === '30d' ? 4 : 0} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: number) => [money(value), 'Ventas']}
                  />
                  <Area type="monotone" dataKey="total" stroke="#fbbf24" strokeWidth={2} fill="url(#ventasFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

const KPI_COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  sky: { bg: 'bg-sky-500/15', text: 'text-sky-400' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  red: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

function KpiCard({ icon: Icon, label, value, color, wide }: { icon: any; label: string; value: string; color: string; wide?: boolean }) {
  const c = KPI_COLORS[color] || KPI_COLORS.sky;
  return (
    <div className={`bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 ${wide ? 'col-span-2' : ''}`}>
      <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
      <p className="text-white text-lg font-black leading-tight">{value}</p>
      <p className="text-slate-500 text-xs font-semibold">{label}</p>
    </div>
  );
}
