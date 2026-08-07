import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, Search, Plus, Minus, Trash2, X, Loader2, CheckCircle2, Package, Camera, Share2, Receipt, Printer } from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { crearVentaMovil, ItemCarritoMovil } from '../lib/ventaMovilService';
import { compartirRecibo, verFactura } from '../lib/compartirFactura';

interface ProductoFila {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  stock: number;
  codigo_barras: string | null;
  foto_url: string | null;
}

const METODOS_PAGO = [
  { valor: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { valor: 'nequi', label: 'Nequi', emoji: '💜' },
  { valor: 'daviplata', label: 'Daviplata', emoji: '❤️' },
  { valor: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
  { valor: 'transferencia', label: 'Transferencia', emoji: '🏦' },
];

interface VentaCompletada {
  id: string;
  numero: number;
  total: number;
  metodoPago: string;
}

export default function VenderPage() {
  const { empleado } = usePwaAuth();
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState<Record<string, ItemCarritoMovil>>({});
  const [mostrarCheckout, setMostrarCheckout] = useState(false);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventaCompletada, setVentaCompletada] = useState<VentaCompletada | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [viendoFactura, setViendoFactura] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const cargarProductos = async () => {
    if (!empleado) return;
    setCargando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, categoria, precio_venta, stock, codigo_barras, foto_url')
      .eq('cliente_id', empleado.cliente_id)
      .eq('activo', true)
      .order('nombre');
    setProductos((data as ProductoFila[]) || []);
    setCargando(false);
  };

  useEffect(() => {
    cargarProductos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  const filtrados = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.categoria || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigo_barras || '').includes(busqueda)
  );

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = itemsCarrito.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
  const cantidadCarrito = itemsCarrito.reduce((acc, it) => acc + it.cantidad, 0);

  const agregarAlCarrito = (p: ProductoFila) => {
    setCarrito((prev) => {
      const actual = prev[p.id];
      const cantidad = (actual?.cantidad || 0) + 1;
      if (cantidad > p.stock) return prev;
      return { ...prev, [p.id]: { productoId: p.id, nombre: p.nombre, precio: p.precio_venta, cantidad } };
    });
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      const nuevaCantidad = actual.cantidad + delta;
      if (nuevaCantidad <= 0) {
        const { [productoId]: _omit, ...resto } = prev;
        return resto;
      }
      return { ...prev, [productoId]: { ...actual, cantidad: nuevaCantidad } };
    });
  };

  const vaciarCarrito = () => setCarrito({});

  const handleConfirmarVenta = async () => {
    if (!empleado) return;
    setProcesando(true);
    setError(null);
    const resultado = await crearVentaMovil(empleado.cliente_id, empleado.id, empleado.nombre_completo, itemsCarrito, metodoPago);
    setProcesando(false);

    if (resultado.ok && resultado.ventaId && resultado.numero) {
      setVentaCompletada({ id: resultado.ventaId, numero: resultado.numero, total: totalCarrito, metodoPago });
      setCarrito({});
      cargarProductos();
    } else {
      setError(resultado.error || 'No se pudo registrar la venta');
    }
  };

  const handleCompartirFactura = async () => {
    if (!empleado || !ventaCompletada) return;
    setCompartiendo(true);
    await compartirRecibo(empleado.cliente_id, {
      id: ventaCompletada.id,
      numero: ventaCompletada.numero,
      created_at: new Date().toISOString(),
      total: ventaCompletada.total,
      metodo_pago: ventaCompletada.metodoPago,
      cajero_nombre: empleado.nombre_completo,
    });
    setCompartiendo(false);
  };

  const handleVerFactura = async () => {
    if (!empleado || !ventaCompletada) return;
    setViendoFactura(true);
    await verFactura(empleado.cliente_id, {
      id: ventaCompletada.id,
      numero: ventaCompletada.numero,
      created_at: new Date().toISOString(),
      total: ventaCompletada.total,
      metodo_pago: ventaCompletada.metodoPago,
      cajero_nombre: empleado.nombre_completo,
    });
    setViendoFactura(false);
  };

  const cerrarTodo = () => {
    setVentaCompletada(null);
    setMostrarCheckout(false);
  };

  // ---- Escáner de cámara integrado (busca y agrega directo al carrito) ----
  const abrirScanner = () => {
    setMostrarScanner(true);
    setTimeout(() => {
      if (!videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, _err, controls) => {
          controlsRef.current = controls;
          if (result) {
            const codigo = result.getText();
            const encontrado = productos.find((p) => p.codigo_barras === codigo);
            controls.stop();
            setMostrarScanner(false);
            if (encontrado) {
              agregarAlCarrito(encontrado);
            } else {
              setBusqueda(codigo);
            }
          }
        })
        .catch(() => setMostrarScanner(false));
    }, 100);
  };

  const cerrarScanner = () => {
    controlsRef.current?.stop();
    setMostrarScanner(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-40">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Vender</h1>
        <p className="text-slate-400 text-sm">Busca productos y arma la venta</p>
      </div>

      {/* Total prominente, al estilo de la pantalla de venta de Electron */}
      <div className="px-5 mb-5">
        <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center shadow-xl">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Total a cobrar</p>
          <p className="text-emerald-400 text-4xl font-black tracking-tight">${totalCarrito.toLocaleString('es-CO')}</p>
          <p className="text-slate-500 text-xs mt-1">{cantidadCarrito} producto{cantidadCarrito !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="px-5 mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, código o categoría..."
            className="h-11 pl-9 bg-slate-900 border-slate-700 text-white"
          />
        </div>
        <button
          onClick={abrirScanner}
          className="h-11 w-11 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20"
          aria-label="Escanear código"
        >
          <Camera className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando productos...</p>}
        {!cargando && filtrados.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin productos</p>
        )}
        {filtrados.map((p) => {
          const enCarrito = carrito[p.id]?.cantidad || 0;
          const sinStock = p.stock <= 0;
          return (
            <div key={p.id} className="w-full flex items-center gap-3 bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
              <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                {p.foto_url ? <img src={p.foto_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-amber-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{p.nombre}</p>
                <p className={`text-xs ${sinStock ? 'text-red-400' : 'text-slate-400'}`}>
                  ${p.precio_venta.toLocaleString('es-CO')} · Stock: {p.stock}
                </p>
              </div>
              {enCarrito > 0 ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => cambiarCantidad(p.id, -1)} className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-white">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-white font-bold text-sm w-4 text-center">{enCarrito}</span>
                  <button
                    onClick={() => agregarAlCarrito(p)}
                    disabled={enCarrito >= p.stock}
                    className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  onClick={() => agregarAlCarrito(p)}
                  disabled={sinStock}
                  size="sm"
                  className="h-8 px-3 bg-amber-500 hover:bg-amber-600 shrink-0 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {cantidadCarrito > 0 && !mostrarCheckout && (
        <div className="fixed bottom-16 left-0 right-0 px-5 pb-3">
          <button
            onClick={() => setMostrarCheckout(true)}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-500/40 flex items-center justify-between px-5"
          >
            <span className="flex items-center gap-2 text-white font-bold text-sm">
              <ShoppingCart className="w-5 h-5" />
              {cantidadCarrito} producto{cantidadCarrito !== 1 ? 's' : ''}
            </span>
            <span className="text-white font-black text-lg">${totalCarrito.toLocaleString('es-CO')}</span>
          </button>
        </div>
      )}

      {mostrarScanner && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6">
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-1/3 border-2 border-amber-400/70 rounded-xl" />
            </div>
          </div>
          <Button onClick={cerrarScanner} variant="outline" className="mt-6 border-white/30 text-white bg-white/10">
            Cancelar
          </Button>
        </div>
      )}

      {mostrarCheckout && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[85vh] overflow-y-auto">
            {ventaCompletada ? (
              /* ---- Confirmación + factura ---- */
              <div className="px-5 pt-8 pb-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-white font-black text-xl mb-1">Venta registrada</h2>
                <p className="text-slate-400 text-sm mb-6">Factura #{ventaCompletada.numero}</p>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
                  <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total cobrado</p>
                  <p className="text-emerald-400 text-3xl font-black">${ventaCompletada.total.toLocaleString('es-CO')}</p>
                  <p className="text-slate-500 text-xs mt-1 capitalize">{ventaCompletada.metodoPago}</p>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={handleVerFactura}
                    disabled={viendoFactura}
                    className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-600"
                  >
                    {viendoFactura ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Printer className="w-5 h-5 mr-2" />}
                    {viendoFactura ? 'Generando factura...' : 'Ver / imprimir factura'}
                  </Button>
                  <Button
                    onClick={handleCompartirFactura}
                    disabled={compartiendo}
                    variant="outline"
                    className="w-full h-12 border-slate-700 bg-slate-900/50 text-slate-300"
                  >
                    {compartiendo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
                    {compartiendo ? 'Generando...' : 'Compartir factura'}
                  </Button>
                  <Button onClick={cerrarTodo} variant="outline" className="w-full h-12 border-slate-700 bg-slate-900/50 text-slate-300">
                    <Receipt className="w-4 h-4 mr-2" />
                    Continuar vendiendo
                  </Button>
                </div>
              </div>
            ) : (
              /* ---- Checkout ---- */
              <>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h2 className="text-white font-bold text-lg">Confirmar venta</h2>
                  <button onClick={() => setMostrarCheckout(false)} className="text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 space-y-2 mb-4">
                  {itemsCarrito.map((it) => (
                    <div key={it.productoId} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{it.nombre}</p>
                        <p className="text-slate-500 text-xs">
                          {it.cantidad} × ${it.precio.toLocaleString('es-CO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-white font-bold text-sm">${(it.cantidad * it.precio).toLocaleString('es-CO')}</span>
                        <button onClick={() => setCarrito((prev) => { const { [it.productoId]: _omit, ...resto } = prev; return resto; })} className="text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={vaciarCarrito} className="text-slate-500 text-xs underline">
                    Vaciar carrito
                  </button>
                </div>

                <div className="px-5 mb-4">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Método de pago</p>
                  <div className="grid grid-cols-3 gap-2">
                    {METODOS_PAGO.map((m) => (
                      <button
                        key={m.valor}
                        onClick={() => setMetodoPago(m.valor)}
                        className={`h-12 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                          metodoPago === m.valor ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                        }`}
                      >
                        <span>{m.emoji}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-5 flex items-center justify-between mb-4">
                  <span className="text-slate-400 text-sm">Total</span>
                  <span className="text-emerald-400 font-black text-2xl">${totalCarrito.toLocaleString('es-CO')}</span>
                </div>

                {error && <p className="px-5 text-red-400 text-sm mb-3">{error}</p>}

                <div className="px-5 pb-8">
                  <Button
                    onClick={handleConfirmarVenta}
                    disabled={procesando}
                    className="w-full h-14 bg-gradient-to-r from-emerald-500 to-emerald-600"
                  >
                    {procesando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                    {procesando ? 'Registrando...' : 'Confirmar venta'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
