import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, Package } from 'lucide-react';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface ProductoFila {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  stock: number;
  stock_minimo: number | null;
  foto_url: string | null;
  activo: boolean;
}

export default function InventarioPage() {
  const navigate = useNavigate();
  const { empleado } = usePwaAuth();
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    if (!empleado) return;
    setCargando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, categoria, precio_venta, stock, stock_minimo, foto_url, activo')
      .eq('cliente_id', empleado.cliente_id)
      .order('nombre');
    setProductos((data as ProductoFila[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const filtrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-orange-50 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 text-xl font-black">Inventario</h1>
          <p className="text-slate-500 text-sm">{productos.length} productos</p>
        </div>
        <Button
          onClick={() => navigate('/inventario/nuevo')}
          size="icon"
          className="h-11 w-11 rounded-full bg-gradient-to-r from-amber-500 to-orange-600"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto o categoría..."
          className="h-11 pl-9 bg-white border-orange-200 text-slate-900"
        />
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-400 text-sm text-center py-8">Cargando...</p>}

        {!cargando && filtrados.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-8">Sin productos todavía</p>
        )}

        {filtrados.map((p) => {
          const stockBajo = p.stock_minimo != null && p.stock <= p.stock_minimo;
          return (
            <button
              key={p.id}
              onClick={() => navigate(`/inventario/${p.id}`)}
              className="w-full flex items-center gap-3 bg-white border border-orange-100 rounded-xl p-3 text-left shadow-sm"
            >
              <div className="w-11 h-11 rounded-lg bg-orange-100 flex items-center justify-center overflow-hidden shrink-0">
                {p.foto_url ? (
                  <img src={p.foto_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-5 h-5 text-orange-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-semibold text-sm truncate">{p.nombre}</p>
                <p className="text-slate-400 text-xs">{p.categoria || 'Sin categoría'}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-900 font-bold text-sm">${p.precio_venta.toLocaleString('es-CO')}</p>
                <p className={`text-xs ${stockBajo ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                  Stock: {p.stock}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
