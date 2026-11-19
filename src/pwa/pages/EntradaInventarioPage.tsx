/**
 * Entrada de mercancía (celular y web): cuando llega el pedido de Coca-Cola o
 * Alpina se busca o escanea cada producto, se pone cuánto llegó (y el costo,
 * si cambió) y se suma al inventario de la sede. Cada línea va a la nube como
 * diferencia con ajustar_stock_producto (migración 0144), con su constancia
 * «Entrada · proveedor · factura» en el kardex; así no se pisa lo vendido.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Loader2, Minus, PackagePlus, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { getSucursalActiva } from '../lib/sucursalActiva';

interface ProductoFila {
  id: string;
  nombre: string;
  codigo_barras: string | null;
  stock: number | null;
  costo: number | null;
  tipo_producto: string | null;
}

interface Linea {
  producto: ProductoFila;
  cantidad: string;
  costo: string;
}

const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
const soloNumero = (v: string) => v.replace(/[^\d.,]/g, '').replace(',', '.');
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

export default function EntradaInventarioPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const sede = (esAdmin ? getSucursalActiva()?.id : empleado?.tienda_id) || 'tienda_principal';

  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [guardando, setGuardando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !empleado) return;
    client.from('productos').select('id, nombre, codigo_barras, stock, costo, tipo_producto')
      .eq('cliente_id', empleado.cliente_id).eq('activo', true).order('nombre').limit(20000)
      .then(({ data }) => { setProductos((data as ProductoFila[]) || []); setCargando(false); });
  }, [empleado?.cliente_id]);

  // Solo productos con inventario (los servicios y platos no llevan stock).
  const conStock = useMemo(() => productos.filter((p) => p.tipo_producto !== 'servicio'), [productos]);

  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return [];
    return conStock
      .filter((p) => normalizar(p.nombre).includes(q) || String(p.codigo_barras || '').toLowerCase() === q)
      .sort((a, b) => Number(normalizar(b.nombre).startsWith(q)) - Number(normalizar(a.nombre).startsWith(q))
        || a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }))
      .slice(0, 12);
  }, [conStock, busqueda]);

  const agregar = (p: ProductoFila) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.producto.id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i], cantidad: String((Number(copia[i].cantidad) || 0) + 1) };
        return copia;
      }
      return [{ producto: p, cantidad: '1', costo: '' }, ...prev];
    });
    setBusqueda('');
    window.setTimeout(() => buscadorRef.current?.focus(), 30);
  };

  // Lector de código de barras: escribe el código y termina con Enter.
  const alEnter = () => {
    const q = busqueda.trim();
    if (!q) return;
    const exacto = conStock.find((p) => String(p.codigo_barras || '').trim() === q);
    if (exacto) { agregar(exacto); return; }
    if (resultados.length === 1) { agregar(resultados[0]); return; }
    if (/^\d{6,}$/.test(q)) {
      toast.error(`No hay un producto con el código ${q}`, {
        description: 'Créalo primero en Inventario y vuelve a escanearlo.',
        action: esAdmin ? { label: 'Crear producto', onClick: () => navigate('/inventario/nuevo', { state: { codigoBarras: q } }) } : undefined,
      });
    }
  };

  const cambiar = (id: string, campo: 'cantidad' | 'costo', valor: string) =>
    setLineas((prev) => prev.map((l) => (l.producto.id === id ? { ...l, [campo]: soloNumero(valor) } : l)));
  const sumar = (id: string, delta: number) =>
    setLineas((prev) => prev.map((l) => (l.producto.id === id ? { ...l, cantidad: String(Math.max(0, (Number(l.cantidad) || 0) + delta)) } : l)));
  const quitar = (id: string) => setLineas((prev) => prev.filter((l) => l.producto.id !== id));

  const validas = lineas.filter((l) => (Number(l.cantidad) || 0) > 0);
  const unidades = validas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const valorTotal = validas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costo) || Number(l.producto.costo) || 0), 0);

  const registrar = async () => {
    const client = getSupabaseClient();
    if (!client || validas.length === 0) return;
    setGuardando(true);
    const referencia = ['Entrada', proveedor.trim(), factura.trim() ? `Fact. ${factura.trim()}` : ''].filter(Boolean).join(' · ').slice(0, 120);
    const fallidas: string[] = [];
    for (const l of validas) {
      const { error } = await client.rpc('ajustar_stock_producto', {
        p_producto: l.producto.id, p_tienda: sede, p_delta: Number(l.cantidad), p_referencia: referencia,
      });
      if (error) { fallidas.push(l.producto.nombre); continue; }
      const costoNuevo = Number(l.costo) || 0;
      if (costoNuevo > 0 && costoNuevo !== Number(l.producto.costo)) {
        await client.from('productos').update({ costo: costoNuevo, updated_at: new Date().toISOString() }).eq('id', l.producto.id);
      }
    }
    setGuardando(false);
    if (fallidas.length) {
      toast.error('Algunos productos no se sumaron', { description: fallidas.join(', ') });
      setLineas((prev) => prev.filter((l) => fallidas.includes(l.producto.nombre)));
      return;
    }
    toast.success('Entrada registrada', { description: `${unidades.toLocaleString('es-CO')} unidades sumadas al inventario.` });
    navigate('/inventario', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-40">
      <div className="px-5 pt-6 pb-3 flex items-center gap-3">
        <button onClick={() => navigate('/inventario')} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-200" aria-label="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-white text-xl font-black leading-tight">Entrada de mercancía</h1>
          <p className="text-slate-400 text-xs">Lo que llega del proveedor se suma al inventario.</p>
        </div>
      </div>

      <div className="px-5 grid grid-cols-2 gap-2 mb-3">
        <Input value={proveedor} onChange={(e) => setProveedor(e.target.value.slice(0, 60))} placeholder="Proveedor (ej: Coca-Cola)"
          className="h-11 bg-slate-900 border-slate-700 text-white text-sm" />
        <Input value={factura} onChange={(e) => setFactura(e.target.value.slice(0, 30))} placeholder="N.° de factura (opcional)"
          className="h-11 bg-slate-900 border-slate-700 text-white text-sm" />
      </div>

      <div className="px-5 relative mb-3">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          ref={buscadorRef}
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); alEnter(); } }}
          placeholder={cargando ? 'Cargando productos…' : 'Busca o escanea el producto que llegó'}
          className="h-12 pl-10 bg-slate-900 border-slate-700 text-white"
        />
        {resultados.length > 0 && (
          <div className="absolute left-5 right-5 top-full mt-1 z-20 rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden max-h-[50vh] overflow-y-auto">
            {resultados.map((p) => (
              <button key={p.id} onClick={() => agregar(p)} className="w-full text-left px-4 py-3 border-b border-slate-800 flex items-center gap-3 hover:bg-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold truncate">{p.nombre}</p>
                  <p className="text-slate-500 text-xs">Hay {Number(p.stock || 0).toLocaleString('es-CO')}{p.codigo_barras ? ` · ${p.codigo_barras}` : ''}</p>
                </div>
                <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 space-y-2">
        {lineas.length === 0 ? (
          <div className="text-center py-12">
            <PackagePlus className="w-10 h-10 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-400 text-sm font-semibold">Agrega los productos que llegaron</p>
            <p className="text-slate-600 text-xs mt-1">Con el lector, escanea cada uno: si se repite, suma 1.</p>
          </div>
        ) : lineas.map((l) => {
          const actual = Number(l.producto.stock || 0);
          const llega = Number(l.cantidad) || 0;
          return (
            <div key={l.producto.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-bold leading-snug break-words">{l.producto.nombre}</p>
                  <p className="text-slate-500 text-xs">Hay {actual.toLocaleString('es-CO')} → quedan <span className="text-emerald-400 font-bold">{(actual + llega).toLocaleString('es-CO')}</span></p>
                </div>
                <button onClick={() => quitar(l.producto.id)} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-red-400 shrink-0" aria-label="Quitar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => sumar(l.producto.id, -1)} className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0"><Minus className="w-4 h-4 text-slate-300" /></button>
                <Input inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(l.producto.id, 'cantidad', e.target.value)}
                  className="h-10 w-20 text-center bg-slate-950 border-slate-700 text-white font-black" aria-label="Cantidad que llegó" />
                <button onClick={() => sumar(l.producto.id, 1)} className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0"><Plus className="w-4 h-4 text-[#fff]" /></button>
                <Input inputMode="numeric" value={l.costo} onChange={(e) => cambiar(l.producto.id, 'costo', e.target.value)}
                  placeholder={l.producto.costo ? `Costo ${money(Number(l.producto.costo))}` : 'Costo c/u'}
                  className="h-10 flex-1 min-w-0 bg-slate-950 border-slate-700 text-white text-sm" aria-label="Costo por unidad" />
              </div>
            </div>
          );
        })}
      </div>

      {lineas.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-5 py-3 border-t border-slate-800 bg-slate-950">
          <p className="text-slate-400 text-xs mb-2 text-center">
            {validas.length} producto{validas.length === 1 ? '' : 's'} · {unidades.toLocaleString('es-CO')} unidades{valorTotal > 0 ? ` · ${money(valorTotal)}` : ''}
          </p>
          <Button onClick={registrar} disabled={guardando || validas.length === 0}
            className="w-full h-14 text-base font-black bg-gradient-to-r from-emerald-500 to-emerald-700 disabled:opacity-50">
            {guardando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
            Sumar al inventario
          </Button>
        </div>
      )}
    </div>
  );
}
