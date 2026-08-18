/**
 * Códigos de Barras — versión móvil.
 *
 * A diferencia de Proveedores/Promociones, este módulo NO necesita sync
 * nueva: los productos ya viven en la tabla `productos` de Supabase (la
 * misma que usan Inventario/Escáner/Vender), así que asignar un código acá
 * escribe directo ahí — cualquier caja o celular lo ve al instante. Solo se
 * omite la parte de IMPRIMIR etiquetas (necesita una impresora física
 * conectada a la caja, ver Electron > Códigos de Barras).
 */
import { useEffect, useMemo, useState } from 'react';
import { Barcode, Search, RefreshCw, Loader2 } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { generarCodigoEAN13 } from '../../app/lib/codigosBarrasService';
import { toast } from 'sonner';

interface ProductoFila {
  id: string;
  nombre: string;
  categoria: string | null;
  codigo_barras: string | null;
}

export default function CodigosBarrasPage() {
  const { empleado } = usePwaAuth();
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [generandoId, setGenerandoId] = useState<string | null>(null);
  const [soloSinCodigo, setSoloSinCodigo] = useState(true);

  const cargar = async () => {
    if (!empleado) return;
    setCargando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, categoria, codigo_barras')
      .eq('cliente_id', empleado.cliente_id)
      .order('nombre');
    setProductos((data as ProductoFila[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return productos.filter((p) => {
      if (soloSinCodigo && p.codigo_barras) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) || (p.codigo_barras || '').includes(q);
    });
  }, [productos, busqueda, soloSinCodigo]);

  const generarYAsignar = async (producto: ProductoFila) => {
    if (!empleado) return;
    setGenerandoId(producto.id);
    try {
      const codigo = await generarCodigoEAN13();
      const client = getSupabaseClient()!;
      const { error } = await client.from('productos').update({ codigo_barras: codigo }).eq('id', producto.id);
      if (error) throw new Error(error.message);
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, codigo_barras: codigo } : p)));
      toast.success(`Código ${codigo} asignado a ${producto.nombre}`);
    } catch (e) {
      toast.error('No se pudo generar el código', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setGenerandoId(null);
    }
  };

  const conCodigo = productos.filter((p) => p.codigo_barras).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Códigos de Barras</h1>
        <p className="text-slate-400 text-sm">{conCodigo} de {productos.length} productos con código</p>
      </div>

      <div className="px-5 mb-3 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto o código"
          className="h-11 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
        />
      </div>

      <div className="px-5 mb-4 flex items-center justify-between">
        <button
          onClick={() => setSoloSinCodigo((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            soloSinCodigo ? 'bg-amber-500 text-slate-950 border-transparent' : 'bg-slate-800/80 text-slate-400 border-slate-700'
          }`}
        >
          Solo sin código
        </button>
        <button onClick={cargar} className="text-slate-400 p-1.5" aria-label="Actualizar">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-5 space-y-2">
        {cargando ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-10">
            <Barcode className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">{soloSinCodigo ? 'Todos los productos ya tienen código' : 'Sin resultados'}</p>
          </div>
        ) : (
          filtrados.map((p) => (
            <div key={p.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{p.nombre}</p>
                {p.codigo_barras ? (
                  <p className="text-emerald-400 text-xs font-mono mt-0.5">{p.codigo_barras}</p>
                ) : (
                  <p className="text-slate-500 text-xs mt-0.5">Sin código</p>
                )}
              </div>
              <Button
                onClick={() => generarYAsignar(p)}
                disabled={generandoId === p.id}
                size="sm"
                className="h-9 shrink-0 bg-gradient-to-r from-amber-500 to-orange-600"
              >
                {generandoId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (p.codigo_barras ? 'Regenerar' : 'Generar')}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
