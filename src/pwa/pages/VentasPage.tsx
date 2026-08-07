import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Share2, Loader2, Receipt, Printer } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { compartirRecibo, verFactura } from '../lib/compartirFactura';

interface VentaFila {
  id: string;
  numero: number | null;
  total: number;
  metodo_pago: string | null;
  cajero_nombre: string | null;
  created_at: string;
}

const BADGE_METODO: Record<string, string> = {
  efectivo: 'bg-emerald-500/15 text-emerald-400',
  nequi: 'bg-purple-500/15 text-purple-400',
  daviplata: 'bg-red-500/15 text-red-400',
  tarjeta: 'bg-sky-500/15 text-sky-400',
  transferencia: 'bg-amber-500/15 text-amber-400',
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03, duration: 0.3 } }),
};

export default function VentasPage() {
  const { empleado } = usePwaAuth();
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [compartiendoId, setCompartiendoId] = useState<string | null>(null);
  const [viendoId, setViendoId] = useState<string | null>(null);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargando(true);
    client
      .from('ventas')
      .select('id, numero, total, metodo_pago, cajero_nombre, created_at')
      .eq('cliente_id', empleado.cliente_id)
      .eq('estado', 'completada')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setVentas((data as VentaFila[]) || []);
        setCargando(false);
      });
  }, [empleado?.cliente_id]);

  const filtradas = ventas.filter((v) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return String(v.numero ?? '').includes(q) || (v.cajero_nombre || '').toLowerCase().includes(q);
  });

  const stats = useMemo(() => {
    const total = filtradas.reduce((a, v) => a + Number(v.total), 0);
    return { total, iva: total - total / 1.19, cantidad: filtradas.length };
  }, [filtradas]);

  const handleCompartir = async (v: VentaFila) => {
    if (!empleado || compartiendoId) return;
    setCompartiendoId(v.id);
    await compartirRecibo(empleado.cliente_id, v);
    setCompartiendoId(null);
  };

  const handleVer = async (v: VentaFila) => {
    if (!empleado || viendoId) return;
    setViendoId(v.id);
    await verFactura(empleado.cliente_id, v);
    setViendoId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Ventas</h1>
        <p className="text-slate-400 text-sm">{stats.cantidad} transacciones registradas</p>
      </div>

      <div className="px-5 mb-4 grid grid-cols-3 gap-2">
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">Total</p>
          <p className="text-white text-base font-black">${stats.total.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">IVA</p>
          <p className="text-white text-base font-black">${Math.round(stats.iva).toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">Ventas</p>
          <p className="text-white text-base font-black">{stats.cantidad}</p>
        </div>
      </div>

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número o cajero..."
          className="h-11 pl-9 bg-slate-900 border-slate-700 text-white"
        />
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando...</p>}
        {!cargando && filtradas.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin ventas registradas</p>
        )}
        {filtradas.map((v, i) => (
          <motion.div
            key={v.id}
            custom={i}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-white font-bold text-sm">FAC{String(v.numero ?? 0).padStart(6, '0')}</p>
              <span className="text-white font-black text-sm">${Number(v.total).toLocaleString('es-CO')}</span>
            </div>
            <p className="text-slate-500 text-xs mb-2">
              {new Date(v.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${BADGE_METODO[v.metodo_pago || ''] || 'bg-slate-700/50 text-slate-300'}`}>
                  {v.metodo_pago || 'N/A'}
                </span>
                {v.cajero_nombre && <span className="text-slate-500 text-xs">{v.cajero_nombre}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleVer(v)}
                  disabled={viendoId === v.id}
                  className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-50"
                  aria-label="Ver / imprimir factura"
                  title="Ver / imprimir factura"
                >
                  {viendoId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleCompartir(v)}
                  disabled={compartiendoId === v.id}
                  className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-50"
                  aria-label="Compartir factura"
                  title="Compartir factura"
                >
                  {compartiendoId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {!cargando && filtradas.length === 0 && ventas.length === 0 && (
        <div className="px-5 mt-4 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Receipt className="w-4 h-4" /> Las ventas hechas desde Vender aparecen aquí al instante
        </div>
      )}
    </div>
  );
}
