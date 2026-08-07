import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Package, TrendingUp, Bell } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ProductoBajo {
  id: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
}

interface VentaReciente {
  id: string;
  numero: number | null;
  total: number;
  created_at: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function AlertasPage() {
  const { empleado } = usePwaAuth();
  const [stockBajo, setStockBajo] = useState<ProductoBajo[]>([]);
  const [ventasGrandes, setVentasGrandes] = useState<VentaReciente[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;

    const cargar = async () => {
      const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: productos }, { data: ventas }] = await Promise.all([
        client.from('productos').select('id, nombre, stock, stock_minimo')
          .eq('cliente_id', empleado.cliente_id).eq('activo', true).not('stock_minimo', 'is', null),
        client.from('ventas').select('id, numero, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', desde).order('total', { ascending: false }).limit(5),
      ]);
      const bajos = ((productos as ProductoBajo[]) || []).filter((p) => p.stock <= p.stock_minimo);
      setStockBajo(bajos);
      setVentasGrandes((ventas as VentaReciente[]) || []);
      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, 60000);
    return () => window.clearInterval(interval);
  }, [empleado?.cliente_id]);

  const totalAlertas = stockBajo.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-black">Alertas</h1>
          <p className="text-slate-400 text-sm">{totalAlertas} sin resolver</p>
        </div>
        <div className="w-11 h-11 rounded-full bg-amber-500/15 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-400" />
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-amber-400" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Stock bajo</h2>
        </div>
        <div className="space-y-2">
          {cargando && <p className="text-slate-500 text-sm text-center py-6">Cargando...</p>}
          {!cargando && stockBajo.length === 0 && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-emerald-400 font-semibold text-sm">Todo el inventario está por encima del mínimo 🎉</p>
            </div>
          )}
          {stockBajo.map((p, i) => (
            <motion.div
              key={p.id}
              custom={i}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="bg-slate-900/70 backdrop-blur border border-amber-800/40 rounded-xl p-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{p.nombre}</p>
                <p className="text-amber-400 text-xs">Quedan {p.stock} · mínimo {p.stock_minimo}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {ventasGrandes.length > 0 && (
        <div className="px-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Ventas destacadas (7 días)</h2>
          </div>
          <div className="space-y-2">
            {ventasGrandes.map((v, i) => (
              <motion.div
                key={v.id}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold text-sm">Venta de ${Number(v.total).toLocaleString('es-CO')}</p>
                  <p className="text-slate-500 text-xs">
                    #{v.numero} · {new Date(v.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
