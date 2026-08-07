import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Receipt, Loader2, Wallet } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface GastoRow {
  id: string;
  fecha: string;
  descripcion: string;
  categoria: string;
  monto: number;
  medio_pago: string;
}

const CATEGORIAS = [
  'servicios_publicos', 'arriendo', 'aseo_limpieza', 'implementos', 'comida_alimentacion',
  'inventario', 'nomina', 'transporte', 'internet_telefono', 'seguridad',
  'mantenimiento', 'impuestos', 'marketing', 'papeleria', 'otros',
];

const MEDIOS_PAGO = ['efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta'];

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function GastosPage() {
  const { empleado } = usePwaAuth();
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('otros');
  const [monto, setMonto] = useState('');
  const [medioPago, setMedioPago] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargando(true);
    const { data } = await client
      .from('gastos')
      .select('id, fecha, descripcion, categoria, monto, medio_pago')
      .eq('cliente_id', empleado.cliente_id)
      .gte('fecha', inicioDeHoy().toISOString())
      .order('fecha', { ascending: false });
    setGastos((data as GastoRow[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado) return;
    const montoNum = Number(monto);
    if (!descripcion.trim() || !montoNum || montoNum <= 0) {
      setError('Completa descripción y un monto válido');
      return;
    }
    setEnviando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const { error: insertError } = await client.from('gastos').insert({
      cliente_id: empleado.cliente_id,
      descripcion: descripcion.trim(),
      categoria,
      monto: montoNum,
      medio_pago: medioPago,
      registrado_por: empleado.id,
      registrado_por_nombre: empleado.nombre_completo,
    });
    setEnviando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDescripcion('');
    setMonto('');
    setMostrarForm(false);
    cargar();
  };

  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-black">Gastos</h1>
          <p className="text-slate-400 text-sm">Registrados hoy</p>
        </div>
        <button
          onClick={() => setMostrarForm(true)}
          className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30"
          aria-label="Registrar gasto"
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="px-5 mb-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="bg-gradient-to-br from-red-500/90 to-rose-600/90 rounded-2xl p-5 shadow-xl shadow-red-500/10"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-wide">Total gastado hoy</p>
              <p className="text-white text-3xl font-black mt-1">${total.toLocaleString('es-CO')}</p>
              <p className="text-white/70 text-xs mt-1">{gastos.length} registros</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando...</p>}
        {!cargando && gastos.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin gastos registrados hoy</p>
        )}
        {gastos.map((g, i) => (
          <motion.div
            key={g.id}
            custom={i}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate">{g.descripcion}</p>
              <p className="text-slate-500 text-xs capitalize">{g.categoria.replace(/_/g, ' ')} · {g.medio_pago}</p>
            </div>
            <p className="text-red-400 font-bold text-sm">-${Number(g.monto).toLocaleString('es-CO')}</p>
          </motion.div>
        ))}
      </div>

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-white font-bold text-lg">Registrar gasto</h2>
              <button onClick={() => setMostrarForm(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 pb-8 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Descripción</Label>
                <Input
                  required autoFocus value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Pago de arriendo"
                  className="h-12 bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Monto</Label>
                <Input
                  type="number" inputMode="numeric" required
                  value={monto} onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                  className="h-14 text-2xl font-bold bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Categoría</Label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full h-12 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white capitalize"
                >
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-400 text-xs">Medio de pago</Label>
                <div className="grid grid-cols-3 gap-2">
                  {MEDIOS_PAGO.map((m) => (
                    <button
                      key={m} type="button" onClick={() => setMedioPago(m)}
                      className={`h-11 rounded-lg text-xs font-bold capitalize transition-all ${
                        medioPago === m ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <Button type="submit" disabled={enviando} className="w-full h-14 text-base bg-gradient-to-r from-red-500 to-rose-600">
                {enviando && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                {enviando ? 'Guardando...' : 'Registrar gasto'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
