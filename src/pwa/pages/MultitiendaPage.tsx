/**
 * Multi-Tienda — versión móvil.
 *
 * Directorio de sucursales + transferencia de inventario entre ellas. El
 * stock real y la ejecución de la transferencia siguen viviendo en Electron
 * (multitiendaService.ts, 100% local) — esta pantalla solo LEE un espejo del
 * stock por tienda (tabla `tiendas_stock`, que Electron sube en cada sync) y
 * CREA una solicitud (`solicitudes_transferencia`) que Electron recoge y
 * ejecuta en su siguiente ciclo de sync (cada 30s), reusando la misma
 * función que ya usa la UI local. Pensado para el caso real: el dueño no
 * está en el local, lo llaman para mover mercancía entre sucursales, y hoy
 * no podía hacerlo sin estar frente al Electron.
 */
import { useEffect, useMemo, useState } from 'react';
import { Store, Phone, MapPin, Loader2, Crown, ArrowLeftRight, X, Plus, Minus, Trash2, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { Button } from '../../app/components/ui/button';

interface TiendaFila {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  emoji: string | null;
  color: string | null;
  activo: boolean;
  es_principal: boolean;
}

interface StockFila {
  tienda_id: string;
  producto_id: string;
  cantidad: number;
}

interface ProductoFila {
  id: string;
  nombre: string;
  codigo_barras: string | null;
}

interface ItemSolicitud {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  disponible: number;
}

export default function MultitiendaPage() {
  const { empleado } = usePwaAuth();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [tiendas, setTiendas] = useState<TiendaFila[]>([]);
  const [stock, setStock] = useState<StockFila[]>([]);
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [cargando, setCargando] = useState(true);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState<ItemSolicitud[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }

    const cargar = async () => {
      const [{ data: tiendasData }, { data: stockData }, { data: productosData }] = await Promise.all([
        client.from('tiendas').select('id, nombre, direccion, telefono, emoji, color, activo, es_principal')
          .eq('cliente_id', empleado.cliente_id).eq('activo', true).order('es_principal', { ascending: false }),
        esAdmin
          ? client.from('tiendas_stock').select('tienda_id, producto_id, cantidad').eq('cliente_id', empleado.cliente_id)
          : Promise.resolve({ data: [] as StockFila[] }),
        esAdmin
          ? client.from('productos').select('id, nombre, codigo_barras').eq('cliente_id', empleado.cliente_id).eq('activo', true)
          : Promise.resolve({ data: [] as ProductoFila[] }),
      ]);
      setTiendas((tiendasData as TiendaFila[]) || []);
      setStock((stockData as StockFila[]) || []);
      setProductos((productosData as ProductoFila[]) || []);
      setCargando(false);
    };

    cargar();

    const canal = client
      .channel(`tiendas-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiendas', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tiendas_stock', filter: `cliente_id=eq.${empleado.cliente_id}` }, cargar)
      .subscribe();

    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id, esAdmin]);

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const stockOrigenDisponible = useMemo(() => {
    if (!origenId) return [];
    return stock
      .filter((s) => s.tienda_id === origenId && s.cantidad > 0)
      .map((s) => ({ ...s, producto: productosPorId.get(s.producto_id) }))
      .filter((s) => s.producto);
  }, [stock, origenId, productosPorId]);

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return stockOrigenDisponible.slice(0, 20);
    const termino = busqueda.toLowerCase();
    return stockOrigenDisponible.filter((s) =>
      s.producto!.nombre.toLowerCase().includes(termino) ||
      (s.producto!.codigo_barras || '').toLowerCase().includes(termino)
    ).slice(0, 20);
  }, [stockOrigenDisponible, busqueda]);

  const abrirModal = () => {
    setOrigenId('');
    setDestinoId('');
    setBusqueda('');
    setItems([]);
    setMostrarModal(true);
  };

  const agregarItem = (productoId: string, nombre: string, disponible: number) => {
    setItems((prev) => {
      if (prev.some((i) => i.productoId === productoId)) return prev;
      return [...prev, { productoId, productoNombre: nombre, cantidad: 1, disponible }];
    });
    setBusqueda('');
  };

  const cambiarCantidad = (productoId: string, delta: number) => {
    setItems((prev) => prev.map((i) => {
      if (i.productoId !== productoId) return i;
      const nueva = Math.max(1, Math.min(i.disponible, i.cantidad + delta));
      return { ...i, cantidad: nueva };
    }));
  };

  const quitarItem = (productoId: string) => {
    setItems((prev) => prev.filter((i) => i.productoId !== productoId));
  };

  const enviarSolicitud = async () => {
    if (!empleado || !origenId || !destinoId || items.length === 0) return;
    const client = getSupabaseClient();
    if (!client) return;

    setEnviando(true);
    const origen = tiendas.find((t) => t.id === origenId);
    const destino = tiendas.find((t) => t.id === destinoId);

    const { error } = await client.from('solicitudes_transferencia').insert({
      cliente_id: empleado.cliente_id,
      tienda_origen_id: origenId,
      tienda_origen_nombre: origen?.nombre || '',
      tienda_destino_id: destinoId,
      tienda_destino_nombre: destino?.nombre || '',
      items: items.map((i) => ({ producto_id: i.productoId, producto_nombre: i.productoNombre, cantidad: i.cantidad })),
      solicitado_por: empleado.id,
      solicitado_por_nombre: empleado.nombre_completo,
    });
    setEnviando(false);

    if (error) {
      toast.error('No se pudo enviar la solicitud — revisa tu conexión');
      return;
    }
    toast.success('Transferencia solicitada — se ejecutará automáticamente cuando la caja de esa tienda sincronice');
    setMostrarModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-black">Multi-Tienda</h1>
          <p className="text-slate-400 text-sm">{tiendas.length} sucursales</p>
        </div>
        {esAdmin && tiendas.length > 1 && (
          <Button onClick={abrirModal} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600 h-9">
            <ArrowLeftRight className="w-4 h-4 mr-1.5" />
            Transferir
          </Button>
        )}
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : tiendas.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Store className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Sin sucursales registradas</p>
        </div>
      ) : (
        <div className="px-5 space-y-2.5">
          {tiendas.map((t) => (
            <div key={t.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${t.color || '#f59e0b'}33` }}
                  >
                    {t.emoji || '🏪'}
                  </div>
                  <p className="text-white font-bold text-sm truncate">{t.nombre}</p>
                </div>
                {t.es_principal && (
                  <span className="shrink-0 bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Principal
                  </span>
                )}
              </div>
              {t.direccion && (
                <p className="text-slate-400 text-xs flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {t.direccion}
                </p>
              )}
              {t.telefono && (
                <a href={`tel:${t.telefono}`} className="text-sky-400 text-xs flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {t.telefono}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-slate-950 z-10">
              <h2 className="text-white font-bold text-lg">Transferir inventario</h2>
              <button onClick={() => setMostrarModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="px-5 pb-8 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 text-xs font-semibold mb-1.5 block">Desde</label>
                  <select
                    value={origenId}
                    onChange={(e) => { setOrigenId(e.target.value); setItems([]); }}
                    className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-white text-sm"
                  >
                    <option value="">Selecciona...</option>
                    {tiendas.map((t) => (
                      <option key={t.id} value={t.id} disabled={t.id === destinoId}>{t.emoji} {t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-semibold mb-1.5 block">Hacia</label>
                  <select
                    value={destinoId}
                    onChange={(e) => setDestinoId(e.target.value)}
                    className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-white text-sm"
                  >
                    <option value="">Selecciona...</option>
                    {tiendas.map((t) => (
                      <option key={t.id} value={t.id} disabled={t.id === origenId}>{t.emoji} {t.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {origenId && destinoId && (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar producto en esta tienda..."
                      className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 text-white text-sm outline-none focus:border-amber-500"
                    />
                  </div>

                  {stockOrigenDisponible.length === 0 ? (
                    <p className="text-slate-500 text-xs text-center py-4">Esta tienda no tiene stock disponible para transferir.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {resultadosBusqueda.map((s) => {
                        const yaAgregado = items.some((i) => i.productoId === s.producto_id);
                        return (
                          <button
                            key={s.producto_id}
                            disabled={yaAgregado}
                            onClick={() => agregarItem(s.producto_id, s.producto!.nombre, s.cantidad)}
                            className="w-full flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2.5 text-left disabled:opacity-40"
                          >
                            <span className="text-white text-sm truncate">{s.producto!.nombre}</span>
                            <span className="text-slate-500 text-xs shrink-0 ml-2 flex items-center gap-1.5">
                              Stock: {s.cantidad}
                              {yaAgregado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Plus className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {items.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <p className="text-slate-500 text-xs font-semibold uppercase">A transferir</p>
                      {items.map((item) => (
                        <div key={item.productoId} className="flex items-center justify-between bg-slate-900/70 border border-emerald-800/40 rounded-xl px-3 py-2.5">
                          <span className="text-white text-sm truncate flex-1">{item.productoNombre}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => cambiarCantidad(item.productoId, -1)} className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                              <Minus className="w-3.5 h-3.5 text-slate-300" />
                            </button>
                            <span className="text-white text-sm font-bold w-6 text-center">{item.cantidad}</span>
                            <button onClick={() => cambiarCantidad(item.productoId, 1)} className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                              <Plus className="w-3.5 h-3.5 text-slate-300" />
                            </button>
                            <button onClick={() => quitarItem(item.productoId)} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center ml-1">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={enviarSolicitud}
                    disabled={items.length === 0 || enviando}
                    className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 mt-2"
                  >
                    {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowLeftRight className="w-4 h-4 mr-2" />}
                    Enviar solicitud de transferencia
                  </Button>
                  <p className="text-slate-600 text-[11px] text-center">
                    Se ejecuta automáticamente cuando la tienda de origen vuelva a sincronizar (hasta 30 seg si está abierta).
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
