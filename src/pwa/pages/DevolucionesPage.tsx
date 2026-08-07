import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Search, RotateCcw, Loader2, ChevronLeft, Undo2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface VentaFila {
  id: string;
  numero: number | null;
  total: number;
  metodo_pago: string | null;
  created_at: string;
}

interface VentaItemFila {
  id: string;
  producto_id: string | null;
  nombre: string | null;
  cantidad: number;
  precio_unitario: number;
}

interface DevolucionHistFila {
  id: string;
  numero_factura: string | null;
  total_devolucion: number;
  created_at: string;
  estado: string;
}

const MOTIVOS = ['Defectuoso', 'Talla/color incorrecto', 'No era lo esperado', 'Arrepentimiento', 'Otro'];

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }),
};

export default function DevolucionesPage() {
  const { empleado } = usePwaAuth();
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [venta, setVenta] = useState<VentaFila | null>(null);
  const [items, setItems] = useState<VentaItemFila[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [historial, setHistorial] = useState<DevolucionHistFila[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);

  const cargarHistorial = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargandoHistorial(true);
    const { data } = await client
      .from('devoluciones')
      .select('id, numero_factura, total_devolucion, created_at, estado')
      .eq('cliente_id', empleado.cliente_id)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistorial((data as DevolucionHistFila[]) || []);
    setCargandoHistorial(false);
  };

  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const handleBuscar = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado || !busqueda.trim()) return;
    setBuscando(true);
    setError(null);
    setVenta(null);
    setItems([]);
    const client = getSupabaseClient()!;
    const { data: ventaData } = await client
      .from('ventas')
      .select('id, numero, total, metodo_pago, created_at')
      .eq('cliente_id', empleado.cliente_id)
      .eq('numero', Number(busqueda.trim()))
      .maybeSingle();

    if (!ventaData) {
      setBuscando(false);
      setError('No se encontró una venta con ese número');
      return;
    }

    const { data: itemsData } = await client
      .from('venta_items')
      .select('id, producto_id, nombre, cantidad, precio_unitario')
      .eq('venta_id', (ventaData as VentaFila).id);

    setVenta(ventaData as VentaFila);
    setItems((itemsData as VentaItemFila[]) || []);
    setCantidades({});
    setMotivos({});
    setBuscando(false);
  };

  const handleProcesar = async () => {
    if (!empleado || !venta) return;
    const seleccionados = items.filter((it) => (cantidades[it.id] || 0) > 0);
    if (seleccionados.length === 0) {
      setError('Selecciona al menos un artículo a devolver');
      return;
    }
    setProcesando(true);
    setError(null);
    const client = getSupabaseClient()!;
    const payload = seleccionados.map((it) => ({
      producto_id: it.producto_id,
      nombre: it.nombre || 'Producto',
      cantidad: cantidades[it.id],
      precio_unitario: it.precio_unitario,
      motivo: motivos[it.id] || 'Otro',
    }));

    const { error: rpcError } = await client.rpc('procesar_devolucion_movil', {
      p_cliente_id: empleado.cliente_id,
      p_venta_id: venta.id,
      p_numero_factura: `FAC${String(venta.numero ?? 0).padStart(6, '0')}`,
      p_metodo_pago: venta.metodo_pago,
      p_observaciones: null,
      p_procesado_por: empleado.id,
      p_procesado_por_nombre: empleado.nombre_completo,
      p_items: payload,
    });

    setProcesando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOk(true);
    setTimeout(() => {
      setOk(false);
      setVenta(null);
      setItems([]);
      setBusqueda('');
      cargarHistorial();
    }, 1400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Devoluciones</h1>
        <p className="text-slate-400 text-sm">Busca una factura por número para procesar una devolución</p>
      </div>

      {!venta && (
        <>
          <form onSubmit={handleBuscar} className="px-5 mb-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                inputMode="numeric"
                placeholder="Número de factura, ej: 42"
                className="h-12 pl-9 bg-slate-900/70 border-slate-800 text-white"
              />
            </div>
            <Button type="submit" disabled={buscando} className="h-12 px-5 bg-gradient-to-r from-amber-500 to-orange-600">
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </Button>
          </form>

          {error && <p className="px-5 text-red-400 text-sm mb-4">{error}</p>}

          <div className="px-5">
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">Devoluciones recientes</h2>
            <div className="space-y-2">
              {cargandoHistorial && <p className="text-slate-500 text-sm text-center py-4">Cargando...</p>}
              {!cargandoHistorial && historial.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">Sin devoluciones registradas</p>
              )}
              {historial.map((d, i) => (
                <motion.div
                  key={d.id}
                  custom={i}
                  initial="hidden"
                  animate="show"
                  variants={fadeUp}
                  className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Undo2 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate">{d.numero_factura || 'Sin factura'}</p>
                    <p className="text-slate-500 text-xs">
                      {new Date(d.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <p className="text-amber-400 font-bold text-sm">-${Number(d.total_devolucion).toLocaleString('es-CO')}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}

      {venta && !ok && (
        <div className="px-5">
          <button
            onClick={() => { setVenta(null); setItems([]); }}
            className="flex items-center gap-1 text-slate-400 text-sm mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Volver a buscar
          </button>

          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 mb-4">
            <p className="text-white font-bold">FAC{String(venta.numero ?? 0).padStart(6, '0')}</p>
            <p className="text-slate-400 text-xs">
              ${Number(venta.total).toLocaleString('es-CO')} · {new Date(venta.created_at).toLocaleDateString('es-CO')}
            </p>
          </div>

          <div className="space-y-3 mb-6">
            {items.map((it) => (
              <div key={it.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">{it.nombre || 'Producto'}</p>
                  <p className="text-slate-400 text-xs">de {it.cantidad} · ${it.precio_unitario.toLocaleString('es-CO')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" inputMode="numeric" min={0} max={it.cantidad}
                    value={cantidades[it.id] || ''}
                    onChange={(e) => setCantidades({ ...cantidades, [it.id]: Math.min(Number(e.target.value) || 0, it.cantidad) })}
                    placeholder="Cantidad a devolver"
                    className="h-10 w-28 bg-slate-950/60 border-slate-700 text-white"
                  />
                  <select
                    value={motivos[it.id] || ''}
                    onChange={(e) => setMotivos({ ...motivos, [it.id]: e.target.value })}
                    className="flex-1 h-10 rounded-lg px-2 text-xs bg-slate-950/60 border border-slate-700 text-white"
                  >
                    <option value="">Motivo...</option>
                    {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}

          <Button onClick={handleProcesar} disabled={procesando} className="w-full h-14 text-base bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
            {procesando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <RotateCcw className="w-5 h-5 mr-2" />}
            {procesando ? 'Procesando...' : 'Procesar devolución'}
          </Button>
        </div>
      )}

      {ok && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-5 flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
            <RotateCcw className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-white font-bold text-lg">Devolución procesada</p>
          <p className="text-slate-400 text-sm">El stock se actualizó automáticamente</p>
        </motion.div>
      )}
    </div>
  );
}
