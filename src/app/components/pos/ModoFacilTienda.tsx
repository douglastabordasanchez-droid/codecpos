import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, LogOut, Maximize2, Minimize2, Minus, Plus, ScanBarcode, Search, ShoppingBag, Star, Trash2, X, ZoomIn } from 'lucide-react';
import { emojiParaProducto, urlFluent3D, urlTwemoji } from '../../lib/imagenProducto';
import { buscarPredictivo, crearPuntaje, masVendidos, normalizar, type Conteo } from '../../lib/busquedaPredictiva';

/**
 * Modo fácil de la tienda (papelería, piñatería, misceláneas), 2026-11-26.
 *
 * Pantalla completa con botones grandes y la imagen de cada producto: su foto
 * si la tiene, o un ícono 3D según el nombre (cuaderno, lápiz, esfero, globo,
 * piñata...). Trabaja sobre el MISMO carrito de la caja: lo que se toca aquí
 * es lo que se cobra con la ventana de pago de siempre.
 *
 * Hecho para vender rápido: el buscador es predictivo (sin tildes, palabras
 * en cualquier orden, primero lo que más se vende y más aún a esta hora) y
 * siempre está listo para el lector de código de barras: Enter agrega el
 * código exacto o el primer resultado y deja el buscador limpio.
 */

export interface ProductoTienda {
  id: string;
  codigo?: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria?: string;
  imagenUrl?: string;
}
export interface ItemTienda { producto: ProductoTienda; cantidad: number; subtotal: number }

interface Props {
  productos: ProductoTienda[];
  carrito: ItemTienda[];
  total: number;
  /** Ventas de los últimos días en esta caja (ordena lo más vendido). */
  historial: Conteo;
  puedeVender: (p: ProductoTienda) => boolean;
  onAgregar: (p: ProductoTienda) => void;
  onMas: (id: string) => void;
  onMenos: (id: string) => void;
  onQuitar: (id: string) => void;
  onCobrar: () => void;
  onSalir: () => void;
  oscuro?: boolean;
  /** Mientras está abierta una ventana de la caja (cobro, ticket...) el modo fácil se esconde sin cerrarse. */
  oculto?: boolean;
  nombreTienda?: string;
}

const CLAVE_TAMANO = 'codecpos_modo_facil_tienda_tamano';
const TAMANOS = [0.75, 0.85, 1, 1.15, 1.3, 1.45];
const leerTamano = () => {
  try { const t = Number(localStorage.getItem(CLAVE_TAMANO)); return TAMANOS.includes(t) ? t : 1; } catch { return 1; }
};
const TOP = '__mas_vendidos';
const COLORES = ['#7c3aed', '#db2777', '#2563eb', '#059669', '#ea580c', '#0891b2', '#ca8a04', '#9333ea', '#e11d48', '#4f46e5', '#16a34a', '#c2410c'];
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const SIN_CATEGORIA = 'Otros';

/** Foto del producto si la tiene; si no, el ícono 3D que corresponde a su nombre. */
function ImagenTienda({ producto, tam }: { producto: ProductoTienda; tam: number }) {
  const emoji = emojiParaProducto(producto.nombre, producto.categoria, '🛍️');
  const fuentes = useMemo(() => {
    const iconos = [urlFluent3D(emoji), urlFluent3D(emoji, true), urlTwemoji(emoji)];
    const foto = String(producto.imagenUrl || '').trim();
    return foto ? [foto, ...iconos] : iconos;
  }, [emoji, producto.imagenUrl]);
  const [intento, setIntento] = useState(0);
  useEffect(() => { setIntento(0); }, [fuentes]);
  if (intento >= fuentes.length) return <span className="leading-none select-none" style={{ fontSize: Math.round(tam * 0.8) }} aria-hidden>{emoji}</span>;
  const esFoto = !!producto.imagenUrl && intento === 0;
  return (
    <img
      src={fuentes[intento]}
      alt=""
      width={tam}
      height={tam}
      loading="lazy"
      draggable={false}
      onError={() => setIntento((i) => i + 1)}
      style={{
        width: tam, height: tam, objectFit: esFoto ? 'cover' : 'contain',
        borderRadius: esFoto ? 14 : 0,
        filter: esFoto ? undefined : 'drop-shadow(0 6px 8px rgba(15,23,42,0.18))',
      }}
      className="select-none pointer-events-none"
    />
  );
}

export function ModoFacilTienda(p: Props) {
  const [categoria, setCategoria] = useState<string>(TOP);
  const [busqueda, setBusqueda] = useState('');
  const [tamano, setTamano] = useState<number>(leerTamano);
  const buscador = useRef<HTMLInputElement>(null);
  const d = !!p.oscuro;
  const m = (claro: string, oscuro: string) => (d ? oscuro : claro);
  // En computador el buscador queda siempre listo para el lector de barras; en
  // pantallas táctiles no, para que no salte el teclado a cada toque.
  const conMouse = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches, []);
  const enfocar = () => { if (conMouse) requestAnimationFrame(() => buscador.current?.focus()); };

  const cambiarTamano = (paso: 1 | -1) => {
    const i = Math.min(TAMANOS.length - 1, Math.max(0, TAMANOS.indexOf(tamano) + paso));
    setTamano(TAMANOS[i]);
    try { localStorage.setItem(CLAVE_TAMANO, String(TAMANOS[i])); } catch { /* sin almacenamiento */ }
  };

  // Pantalla completa al entrar; al salir se quita (igual que el de Alimentos).
  const [completa, setCompleta] = useState(() => !!document.fullscreenElement);
  const pedirCompleta = () => {
    try { void document.documentElement.requestFullscreen?.()?.catch(() => { /* sin permiso */ }); } catch { /* sin soporte */ }
  };
  const alternarCompleta = () => {
    if (document.fullscreenElement) { try { void document.exitFullscreen?.()?.catch(() => {}); } catch { /* ignorar */ } }
    else pedirCompleta();
  };
  useEffect(() => {
    const alCambiar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    if (!document.fullscreenElement) pedirCompleta();
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar);
      document.body.style.overflow = anterior;
      if (document.fullscreenElement) { try { void document.exitFullscreen?.()?.catch(() => {}); } catch { /* ignorar */ } }
    };
  }, []);

  // Al volver de cobrar, el buscador queda listo otra vez.
  useEffect(() => { if (!p.oculto) enfocar(); }, [p.oculto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo lo que se puede tocar: activos con nombre (los agotados se ven, pero en gris).
  const productos = p.productos;
  const indice = useMemo(
    () => productos.map((x) => normalizar([x.codigo, x.nombre, x.categoria].filter(Boolean).join(' '))),
    [productos],
  );
  const puntaje = useMemo(() => crearPuntaje(p.historial), [p.historial, p.carrito.length]); // lo recién elegido cuenta enseguida

  const categorias = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const x of productos) {
      const c = (x.categoria || '').trim() || SIN_CATEGORIA;
      cuenta.set(c, (cuenta.get(c) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([nombre], i) => ({ nombre, color: COLORES[i % COLORES.length], emoji: emojiParaProducto(nombre, undefined, '🛍️') }));
  }, [productos]);

  const top = useMemo(() => masVendidos(productos, puntaje, 40), [productos, puntaje]);
  useEffect(() => {
    if (categoria === TOP && top.length === 0 && categorias[0]) setCategoria(categorias[0].nombre);
  }, [categoria, top.length, categorias]);

  const resultados = useMemo(
    () => (busqueda.trim() ? buscarPredictivo(productos, indice, busqueda, puntaje, 80, (x) => String(x.codigo ?? '')) : null),
    [busqueda, productos, indice, puntaje],
  );
  const visibles = resultados
    ?? (categoria === TOP ? top : productos.filter((x) => ((x.categoria || '').trim() || SIN_CATEGORIA) === categoria));

  const cantidadPorProducto = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of p.carrito) c.set(String(it.producto.id), (c.get(String(it.producto.id)) || 0) + it.cantidad);
    return c;
  }, [p.carrito]);
  const unidades = p.carrito.reduce((s, it) => s + it.cantidad, 0);

  const agregar = (x: ProductoTienda) => {
    if (!p.puedeVender(x)) return;
    p.onAgregar(x);
    if (busqueda) setBusqueda('');
    enfocar();
  };

  const alEnter = () => {
    const texto = busqueda.trim();
    if (!texto) { if (p.carrito.length > 0) p.onCobrar(); return; }
    const exacto = productos.find((x) => normalizar(x.codigo) === normalizar(texto));
    const elegido = exacto ?? resultados?.find((x) => p.puedeVender(x));
    if (elegido) agregar(elegido);
  };

  const contenido = (
    <div
      className={`fixed left-0 top-0 z-[48] flex gap-3 p-3 antialiased ${m('bg-slate-100 text-slate-900', 'bg-slate-950 text-slate-100')}`}
      style={{ display: p.oculto ? 'none' : 'flex', colorScheme: d ? 'dark' : 'light', zoom: tamano, width: `${100 / tamano}vw`, height: `${100 / tamano}dvh` } as React.CSSProperties}
    >
      {/* Izquierda: buscador, categorías y productos */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-[#fff] shadow-lg shadow-fuchsia-600/20">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-7 h-7 text-[#fff]" />
          </div>
          <div className="min-w-0 mr-auto">
            <p className="text-2xl font-bold tracking-tight leading-tight truncate text-[#fff]">Modo fácil</p>
            <p className="text-sm font-medium text-[#fff]/90 truncate">{p.nombreTienda || 'Papelería y piñatería'}</p>
          </div>
          <button type="button" onClick={alternarCompleta} title={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="h-11 px-4 rounded-full bg-white/15 border border-white/40 text-[#fff] text-sm font-semibold flex items-center gap-2 hover:bg-white/25 transition active:scale-95">
            {completa ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden xl:inline text-[#fff]">{completa ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
          </button>
          <div className="h-11 flex items-center rounded-full bg-white/15 border border-white/40 text-[#fff]" title="Tamaño de la pantalla">
            <button type="button" onClick={() => cambiarTamano(-1)} disabled={tamano === TAMANOS[0]} aria-label="Más pequeño"
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-40 transition active:scale-90">
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[56px] text-center text-sm font-bold tabular-nums text-[#fff] flex items-center justify-center gap-1">
              <ZoomIn className="w-4 h-4 text-[#fff]" />{Math.round(tamano * 100)}%
            </span>
            <button type="button" onClick={() => cambiarTamano(1)} disabled={tamano === TAMANOS[TAMANOS.length - 1]} aria-label="Más grande"
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-40 transition active:scale-90">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button type="button" onClick={p.onSalir} className="h-11 px-4 rounded-full bg-white/15 border border-white/40 text-[#fff] text-sm font-semibold flex items-center gap-2 hover:bg-white/25 transition">
            <LogOut className="w-4 h-4" /><span className="text-[#fff]">Salir</span>
          </button>
        </div>

        {/* Buscador predictivo, listo para el lector de barras */}
        <div className="relative">
          <Search className="w-6 h-6 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={buscador}
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); alEnter(); }
              else if (e.key === 'Escape') setBusqueda('');
            }}
            placeholder="Escribe o escanea: «cuaderno», «esfero azul», «globo 12»…"
            className={`w-full h-16 pl-14 pr-28 rounded-2xl border-2 text-xl font-medium shadow-sm outline-none transition placeholder:text-slate-400 ${m('border-slate-200 bg-white text-slate-900', 'border-slate-700 bg-slate-900 text-white')} focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/15`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {busqueda ? (
              <button type="button" onClick={() => { setBusqueda(''); enfocar(); }} aria-label="Borrar búsqueda"
                className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 ${m('bg-slate-100 text-slate-600', 'bg-slate-800 text-slate-300')}`}>
                <X className="w-5 h-5" />
              </button>
            ) : (
              <span className={`hidden md:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${m('bg-slate-100 text-slate-500', 'bg-slate-800 text-slate-400')}`}>
                <ScanBarcode className="w-4 h-4" />Enter agrega
              </span>
            )}
          </div>
        </div>

        {/* Categorías */}
        {!busqueda && (
          <div className="flex gap-3 overflow-x-auto py-1 px-1 [&::-webkit-scrollbar]:hidden">
            {top.length > 0 && (
              <button type="button" onClick={() => setCategoria(TOP)}
                className={`flex-shrink-0 h-14 min-w-[170px] pl-2 pr-5 rounded-2xl flex items-center gap-3 text-base font-bold transition ${categoria === TOP ? `bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/30 ring-2 ring-offset-2 ring-amber-500 ${m('', 'ring-offset-slate-950')}` : m('bg-white text-slate-700 border border-slate-200 hover:bg-amber-50', 'bg-slate-900 text-slate-200 border border-slate-700 hover:bg-slate-800')}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${categoria === TOP ? 'bg-white/40' : m('bg-amber-100', 'bg-amber-500/20')}`}>
                  <Star className="w-5 h-5 text-amber-600 fill-amber-500" />
                </span>
                <span className={categoria === TOP ? 'text-slate-900' : m('text-slate-700', 'text-slate-200')}>Más vendidos</span>
              </button>
            )}
            {categorias.map((c) => {
              const sel = c.nombre === categoria;
              return (
                <button key={c.nombre} type="button" onClick={() => setCategoria(c.nombre)}
                  className={`flex-shrink-0 h-14 min-w-[170px] pl-2 pr-5 rounded-2xl flex items-center gap-3 text-base font-bold text-[#fff] transition ${sel ? `shadow-lg ring-2 ring-offset-2 ${m('', 'ring-offset-slate-950')}` : 'opacity-80 hover:opacity-100'}`}
                  style={{ backgroundColor: c.color, ...(sel ? { ['--tw-ring-color' as any]: c.color, boxShadow: `0 10px 20px -8px ${c.color}` } : {}) }}>
                  <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <img src={urlFluent3D(c.emoji)} alt="" width={28} height={28} loading="lazy" draggable={false}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = urlTwemoji(c.emoji); }} style={{ width: 28, height: 28 }} />
                  </span>
                  <span className="truncate max-w-[200px] text-[#fff]">{c.nombre}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Productos */}
        <div className={`flex-1 overflow-y-auto rounded-2xl border p-3 ${m('bg-white border-slate-200', 'bg-slate-900 border-slate-800')}`}>
          {busqueda && (
            <p className={`px-1 pb-3 text-sm font-medium ${m('text-slate-500', 'text-slate-400')}`}>
              {visibles.length === 0 ? `No hay productos con «${busqueda}»` : `${visibles.length >= 80 ? 'Más de 80' : visibles.length} resultado(s), lo más vendido primero · Enter agrega el primero`}
            </p>
          )}
          {!busqueda && visibles.length === 0 && (
            <p className="text-center text-lg font-medium text-slate-400 mt-16">No hay productos en esta categoría</p>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' }}>
            {visibles.map((x, i) => {
              const cant = cantidadPorProducto.get(String(x.id)) || 0;
              const disponible = p.puedeVender(x);
              const primero = !!busqueda && i === 0 && disponible;
              return (
                <button key={x.id} type="button" onClick={() => agregar(x)} disabled={!disponible}
                  className={`relative rounded-2xl ${m('bg-white', 'bg-slate-800')} px-3 pt-4 pb-3 flex flex-col items-center gap-2 text-center border-2 transition hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:cursor-not-allowed ${cant > 0 ? 'border-emerald-500 shadow-md shadow-emerald-500/20' : primero ? 'border-fuchsia-500 shadow-md shadow-fuchsia-500/20' : m('border-slate-200 hover:border-fuchsia-200', 'border-slate-700 hover:border-fuchsia-500/60')}`}>
                  {cant > 0 && (
                    <span className="absolute top-2 right-2 min-w-8 h-8 px-2 rounded-full bg-emerald-600 text-[#fff] text-base font-bold flex items-center justify-center shadow">{cant}</span>
                  )}
                  {primero && cant === 0 && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-fuchsia-600 text-[#fff] text-[11px] font-bold">Enter</span>
                  )}
                  <span className="h-[92px] flex items-center justify-center"><ImagenTienda producto={x} tam={84} /></span>
                  <span className={`text-[15px] font-semibold leading-tight line-clamp-2 min-h-[2.5em] flex items-center ${m('text-slate-900', 'text-white')}`}>{x.nombre}</span>
                  <span className="min-w-[110px] px-4 py-1.5 rounded-xl bg-blue-600 text-[#fff] text-lg font-bold tabular-nums shadow-sm shadow-blue-600/30">{pesos(x.precio)}</span>
                  <span className={`text-xs font-medium ${!disponible ? 'text-rose-500' : x.stock <= 5 ? m('text-amber-600', 'text-amber-400') : m('text-slate-400', 'text-slate-500')}`}>
                    {!disponible ? 'Agotado' : `Quedan ${Number(x.stock).toLocaleString('es-CO')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Derecha: el carrito de la caja y el cobro */}
      <div className={`w-[340px] flex-shrink-0 flex flex-col rounded-2xl border overflow-hidden ${m('bg-white border-slate-200', 'bg-slate-900 border-slate-800')}`}>
        <div className={`px-4 py-3 flex items-center gap-3 border-b ${m('border-slate-200', 'border-slate-800')}`}>
          <ShoppingBag className={`w-6 h-6 ${m('text-fuchsia-600', 'text-fuchsia-400')}`} />
          <div className="flex-1">
            <p className={`text-lg font-bold leading-tight ${m('text-slate-900', 'text-white')}`}>Venta</p>
            <p className={`text-xs font-medium ${m('text-slate-500', 'text-slate-400')}`}>{unidades} producto(s)</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {p.carrito.length === 0 ? (
            <p className={`text-center text-base mt-12 px-6 ${m('text-slate-500', 'text-slate-400')}`}>Toca un producto o escanea su código para agregarlo</p>
          ) : [...p.carrito].reverse().map((it) => (
            <div key={it.producto.id} className={`flex items-center gap-2 p-2 rounded-xl border ${m('bg-slate-50 border-slate-200', 'bg-slate-800 border-slate-700')}`}>
              <span className="w-11 h-11 flex-shrink-0 flex items-center justify-center"><ImagenTienda producto={it.producto} tam={40} /></span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-tight line-clamp-2 ${m('text-slate-900', 'text-white')}`}>{it.producto.nombre}</p>
                <p className={`text-sm font-bold tabular-nums ${m('text-emerald-700', 'text-emerald-400')}`}>{pesos(it.subtotal)}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => (it.cantidad > 1 ? p.onMenos(String(it.producto.id)) : p.onQuitar(String(it.producto.id)))}
                  aria-label={it.cantidad > 1 ? 'Uno menos' : 'Quitar'}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center active:scale-90 transition ${m('bg-rose-50 text-rose-600 hover:bg-rose-100', 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')}`}>
                  {it.cantidad > 1 ? <Minus className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                </button>
                <span className={`min-w-8 text-center text-lg font-bold tabular-nums ${m('text-slate-900', 'text-white')}`}>{it.cantidad}</span>
                <button type="button" onClick={() => p.onMas(String(it.producto.id))} aria-label="Uno más"
                  className={`w-10 h-10 rounded-lg flex items-center justify-center active:scale-90 transition ${m('bg-emerald-50 text-emerald-700 hover:bg-emerald-100', 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25')}`}>
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className={`p-3 border-t space-y-3 ${m('border-slate-200', 'border-slate-800')}`}>
          <div className="flex items-baseline justify-between px-1">
            <span className={`text-base font-semibold ${m('text-slate-600', 'text-slate-300')}`}>Total</span>
            <span className={`text-3xl font-black tabular-nums ${m('text-slate-900', 'text-white')}`}>{pesos(p.total)}</span>
          </div>
          <button type="button" disabled={p.carrito.length === 0} onClick={p.onCobrar}
            className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-[#fff] text-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed">
            <Calculator className="w-7 h-7" /><span className="text-[#fff]">Cobrar</span>
          </button>
          <p className={`text-center text-xs ${m('text-slate-400', 'text-slate-500')}`}>Con el buscador vacío, Enter también cobra</p>
        </div>
      </div>
    </div>
  );

  return createPortal(contenido, document.body);
}
