import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Armchair, ArrowLeft, Calculator, ChefHat, Coffee, LogOut, Minus, Plus, Maximize2, Minimize2, Search, ShoppingCart, Star, Store, Users, X, ZoomIn } from 'lucide-react';
import { dbManager } from '../../lib/indexedDB';
import { emojiParaProducto, urlFluent3D, urlTwemoji } from '../../lib/imagenProducto';
import { esEmoji } from '../../lib/estiloMenu';

/**
 * Modo fácil de Alimentos y Bebidas (Tierra Colombiana, 2026-11-23).
 *
 * Pantalla completa pensada para alguien que no maneja computadores: botones
 * grandes, todo a la vista, sin menús escondidos. Usa las mismas cuentas de
 * la página (mostrador y mesas), así que lo que se hace aquí se ve igual en la
 * caja, el celular de los meseros y las estaciones.
 */

export interface CategoriaFacil { id: string; nombre: string; color: string; icono: string }
export interface ProductoFacil { id: string; categoriaId: string; nombre: string; precio: number; color: string; icono: string }
export interface MesaFacil { id: string; nombre: string }
export interface ItemFacil { producto: { id: string; nombre: string; precio: number }; cantidad: number }

interface Props {
  categorias: CategoriaFacil[];
  productos: ProductoFacil[];
  mesas: MesaFacil[];
  cuentaMostrador: ItemFacil[];
  cuentasMesas: Record<string, ItemFacil[]>;
  mesaActiva: MesaFacil | null;
  hayCocina: boolean;
  icono: (key: string, clase: string) => ReactNode;
  onAgregar: (producto: ProductoFacil) => void;
  onQuitarUno: (productoId: string) => void;
  onElegirMesa: (mesa: MesaFacil | null) => void;
  onPasarAMesa: (mesa: MesaFacil) => void;
  onEnviarCocina: (mesa: MesaFacil) => void;
  onCobrar: (mesa: MesaFacil | null) => void;
  /** Dividir la cuenta de la mesa entre varias personas. */
  onDividir?: (mesa: MesaFacil) => void;
  onSalir: () => void;
  /** Sigue el modo oscuro de la caja. */
  oscuro?: boolean;
}

const CLAVE_POSICION_BOTON = 'codecpos_modo_facil_boton_mesas';
const CLAVE_PEDIDOS = 'codecpos_modo_facil_pedidos';
const CLAVE_TAMANO = 'codecpos_modo_facil_tamano';
/** Tamaños del modo fácil: más pequeño para ver más productos, más grande para ver mejor. */
const TAMANOS = [0.75, 0.85, 1, 1.15, 1.3, 1.45];
const leerTamano = () => {
  try { const t = Number(localStorage.getItem(CLAVE_TAMANO)); return TAMANOS.includes(t) ? t : 1; } catch { return 1; }
};
const TOP = '__mas_pedidos';

/** Franja del día: lo que se pide en la mañana no es lo mismo que al mediodía. */
type Franja = 'manana' | 'mediodia' | 'tarde' | 'noche';
const franjaDe = (fecha: Date): Franja => {
  const h = fecha.getHours();
  return h >= 5 && h < 11 ? 'manana' : h >= 11 && h < 15 ? 'mediodia' : h >= 15 && h < 19 ? 'tarde' : 'noche';
};
type Conteo = Record<string, { total: number; franjas: Partial<Record<Franja, number>> }>;
const sumar = (c: Conteo, id: string, franja: Franja, n: number) => {
  const x = c[id] || (c[id] = { total: 0, franjas: {} });
  x.total += n;
  x.franjas[franja] = (x.franjas[franja] || 0) + n;
};
const leerToques = (): Conteo => { try { return JSON.parse(localStorage.getItem(CLAVE_PEDIDOS) || '{}') || {}; } catch { return {}; } };
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const totalDe = (items: ItemFacil[]) => items.reduce((s, it) => s + (Number(it.producto.precio) || 0) * (Number(it.cantidad) || 0), 0);
const unidadesDe = (items: ItemFacil[]) => items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
const claroSobre = (hex: string) => {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
};

/**
 * Imagen del producto: su emoji si ya tiene uno, o el que corresponde a su
 * nombre, dibujado en 3D (Fluent Emoji de Microsoft, unos 4 KB, queda en
 * caché). Si no existe en 3D se usa Twemoji y sin internet el emoji del sistema.
 */
function ImagenProducto({ producto, categoria, tam }: { producto: ProductoFacil; categoria?: string; tam: number }) {
  const emoji = esEmoji(producto.icono) ? producto.icono : emojiParaProducto(producto.nombre, categoria);
  const fuentes = useMemo(() => [urlFluent3D(emoji), urlFluent3D(emoji, true), urlTwemoji(emoji)], [emoji]);
  const [intento, setIntento] = useState(0);
  useEffect(() => { setIntento(0); }, [emoji]);
  if (intento >= fuentes.length) return <span className="leading-none select-none" style={{ fontSize: Math.round(tam * 0.8) }} aria-hidden>{emoji}</span>;
  return (
    <img
      src={fuentes[intento]}
      alt=""
      width={tam}
      height={tam}
      loading="lazy"
      draggable={false}
      onError={() => setIntento((i) => i + 1)}
      style={{ width: tam, height: tam, objectFit: 'contain', filter: 'drop-shadow(0 6px 8px rgba(15,23,42,0.18))' }}
      className="select-none pointer-events-none"
    />
  );
}

/** Botón de Mesas flotante: se arrastra con el dedo y recuerda dónde quedó. */
function BotonMesasFlotante({ onTocar, ocupadas, oscuro }: { onTocar: () => void; ocupadas: number; oscuro?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CLAVE_POSICION_BOTON) || 'null');
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch { /* sin almacenamiento */ }
    return { x: window.innerWidth - 170, y: Math.max(8, window.innerHeight - 170) };
  });
  const arrastre = useRef<{ dx: number; dy: number; inicioX: number; inicioY: number; movio: boolean } | null>(null);

  // Si la pantalla cambia de tamaño, el botón no se queda por fuera.
  useEffect(() => {
    const ajustar = () => setPos((p) => ({
      x: Math.min(Math.max(8, p.x), window.innerWidth - 160),
      y: Math.min(Math.max(8, p.y), window.innerHeight - 80),
    }));
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, inicioX: e.clientX, inicioY: e.clientY, movio: false };
      }}
      onPointerMove={(e) => {
        const a = arrastre.current;
        if (!a) return;
        if (!a.movio && Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) < 10) return;
        a.movio = true;
        setPos({
          x: Math.min(Math.max(8, e.clientX - a.dx), window.innerWidth - 160),
          y: Math.min(Math.max(8, e.clientY - a.dy), window.innerHeight - 80),
        });
      }}
      onPointerUp={() => {
        const a = arrastre.current;
        arrastre.current = null;
        if (!a) return;
        if (a.movio) {
          try { localStorage.setItem(CLAVE_POSICION_BOTON, JSON.stringify(pos)); } catch { /* sin almacenamiento */ }
          return;
        }
        onTocar();
      }}
      onPointerCancel={() => { arrastre.current = null; }}
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      className={`fixed z-[75] h-16 px-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-[#fff] border-4 ${oscuro ? 'border-slate-950' : 'border-white'} shadow-xl shadow-emerald-700/30 flex items-center gap-2 select-none transition active:scale-95`}
      aria-label="Ver mesas"
    >
      <Armchair className="w-6 h-6" />
      <span className="text-lg font-bold leading-none text-[#fff]">Mesas</span>
      {ocupadas > 0 && (
        <span className="min-w-6 h-6 px-1.5 rounded-full bg-rose-500 text-[#fff] text-xs font-semibold flex items-center justify-center">
          {ocupadas}
        </span>
      )}
    </button>
  );
}

export function ModoFacilAlimentos(p: Props) {
  const [categoria, setCategoria] = useState<string>(TOP);
  const [vistaMesas, setVistaMesas] = useState<null | 'elegir' | 'pasar'>(null);
  const [busqueda, setBusqueda] = useState('');
  const [tamano, setTamano] = useState<number>(leerTamano);
  const cambiarTamano = (paso: 1 | -1) => {
    const i = Math.min(TAMANOS.length - 1, Math.max(0, TAMANOS.indexOf(tamano) + paso));
    setTamano(TAMANOS[i]);
    try { localStorage.setItem(CLAVE_TAMANO, String(TAMANOS[i])); } catch { /* sin almacenamiento */ }
  };
  // Lo que más se pide: ventas de los últimos 30 días en esta caja más los
  // toques del modo fácil, pesando más lo que se pide a esta hora del día.
  const [historial, setHistorial] = useState<Conteo>({});
  const [toques, setToques] = useState<Conteo>(leerToques);

  useEffect(() => {
    let vivo = true;
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
    dbManager.getVentasDesde(desde).then((ventas: any[]) => {
      const c: Conteo = {};
      for (const v of ventas || []) {
        if (v?.estado === 'anulada') continue;
        const franja = franjaDe(new Date(v.fecha));
        for (const it of v.items || []) if (it?.id) sumar(c, String(it.id), franja, Number(it.cantidad) || 1);
      }
      if (vivo) setHistorial(c);
    }).catch(() => { /* sin historial: se usa solo lo tocado aquí */ });
    return () => { vivo = false; };
  }, []);

  const franjaActual = franjaDe(new Date());
  const masPedidos = useMemo(() => {
    const puntaje = (id: string) => {
      const h = historial[id], t = toques[id];
      return (h?.franjas[franjaActual] || 0) * 3 + (h?.total || 0) + (t?.franjas[franjaActual] || 0) * 3 + (t?.total || 0);
    };
    return p.productos
      .map((x) => ({ x, n: puntaje(String(x.id)) }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 21)
      .map((r) => r.x);
  }, [p.productos, historial, toques, franjaActual]);

  // Sin historial todavía, se arranca en la primera categoría.
  useEffect(() => {
    if (categoria === TOP && masPedidos.length === 0 && p.categorias[0]) setCategoria(p.categorias[0].id);
    else if (categoria !== TOP && !p.categorias.some((c) => c.id === categoria)) setCategoria(masPedidos.length ? TOP : p.categorias[0]?.id ?? '');
  }, [p.categorias, categoria, masPedidos.length]);

  const agregar = (prod: ProductoFacil) => {
    p.onAgregar(prod);
    setToques((prev) => {
      const nuevo: Conteo = JSON.parse(JSON.stringify(prev));
      sumar(nuevo, String(prod.id), franjaDe(new Date()), 1);
      try { localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(nuevo)); } catch { /* sin almacenamiento */ }
      return nuevo;
    });
  };

  // Pantalla completa: al entrar al modo fácil se pide (sin barra de Windows ni del
  // navegador) y al salir se quita. Si el navegador no la deja (por ejemplo al abrir
  // la caja ya en modo fácil, sin un toque), queda el botón del encabezado.
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
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar);
      if (document.fullscreenElement) { try { void document.exitFullscreen?.()?.catch(() => {}); } catch { /* ignorar */ } }
    };
  }, []);

  // La pantalla de atrás no se mueve mientras el modo fácil está abierto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);

  const cuenta = p.mesaActiva ? (p.cuentasMesas[p.mesaActiva.id] || []) : p.cuentaMostrador;
  const total = totalDe(cuenta);
  const cantidadPorProducto = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of cuenta) m.set(String(it.producto.id), (m.get(String(it.producto.id)) || 0) + (Number(it.cantidad) || 0));
    return m;
  }, [cuenta]);
  const textoBusqueda = sinTildes(busqueda.trim());
  const productosVisibles = textoBusqueda
    ? p.productos.filter((x) => sinTildes(x.nombre).includes(textoBusqueda))
        .sort((a, b) => Number(!sinTildes(a.nombre).startsWith(textoBusqueda)) - Number(!sinTildes(b.nombre).startsWith(textoBusqueda)) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
    : categoria === TOP ? masPedidos : p.productos.filter((x) => x.categoriaId === categoria);
  const nombreCategoria = useMemo(() => new Map(p.categorias.map((c) => [c.id, c.nombre])), [p.categorias]);
  const mesasOrdenadas = useMemo(
    () => [...p.mesas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' })),
    [p.mesas],
  );
  const ocupadas = mesasOrdenadas.filter((m) => (p.cuentasMesas[m.id] || []).length > 0).length;
  const destino = p.mesaActiva ? p.mesaActiva.nombre : 'Mostrador';
  const d = !!p.oscuro;
  /** Clase según el modo: clara u oscura. */
  const m = (claro: string, oscuro: string) => (d ? oscuro : claro);

  const contenido = (
    <div className={`fixed left-0 top-0 z-[70] flex flex-col gap-3 p-3 antialiased ${m('bg-slate-100 text-slate-900', 'bg-slate-950 text-slate-100')}`} style={{ colorScheme: d ? 'dark' : 'light', zoom: tamano, width: `${100 / tamano}vw`, height: `${100 / tamano}dvh` } as React.CSSProperties}>
      {/* Encabezado: dónde estoy y cómo salir */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-600 to-rose-600 text-[#fff] shadow-lg shadow-orange-600/20">
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Coffee className="w-7 h-7 text-[#fff]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold tracking-tight leading-tight truncate text-[#fff]">Alimentos y Bebidas</p>
          <p className="text-sm font-medium text-[#fff]/90 truncate">
            Pedido para: <span className="font-semibold text-[#fff]">{destino}</span>
          </p>
        </div>
        {p.mesaActiva && (
          <button type="button" onClick={() => p.onElegirMesa(null)} className="h-11 px-4 rounded-full bg-white/15 border border-white/40 text-[#fff] text-sm font-semibold flex items-center gap-2 hover:bg-white/25 transition">
            <Store className="w-4 h-4" />Mostrador
          </button>
        )}
        <button type="button" onClick={alternarCompleta} title={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
          className="h-11 px-4 rounded-full bg-white/15 border border-white/40 text-[#fff] text-sm font-semibold flex items-center gap-2 hover:bg-white/25 transition active:scale-95">
          {completa ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </button>
        {/* Tamaño de la pantalla: se recuerda en este equipo */}
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
          <LogOut className="w-4 h-4" />Salir del modo fácil
        </button>
      </div>

      {/* Búsqueda y categorías */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0 w-[240px]">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            className={`w-full h-14 pl-11 pr-11 rounded-2xl border ${m('border-slate-200 bg-white text-slate-900', 'border-slate-700 bg-slate-900 text-white')} text-base font-medium placeholder:text-slate-400 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 transition`}
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl ${m('bg-slate-100 text-slate-600', 'bg-slate-800 text-slate-300')} flex items-center justify-center active:scale-90`}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 flex gap-3 overflow-x-auto py-1 px-1 [&::-webkit-scrollbar]:hidden">
          {masPedidos.length > 0 && (
            <button
              type="button"
              onClick={() => { setCategoria(TOP); setBusqueda(''); }}
              className={`flex-shrink-0 h-14 min-w-[180px] pl-2 pr-5 rounded-2xl flex items-center gap-3 text-base font-bold transition ${categoria === TOP && !busqueda ? `bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/30 ring-2 ring-offset-2 ring-amber-500 ${m('', 'ring-offset-slate-950')}` : m('bg-white text-slate-700 border border-slate-200 hover:bg-amber-50', 'bg-slate-900 text-slate-200 border border-slate-700 hover:bg-slate-800')}`}
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${categoria === TOP && !busqueda ? 'bg-white/40' : m('bg-amber-100', 'bg-amber-500/20')}`}>
                <Star className="w-5 h-5 text-amber-600 fill-amber-500" />
              </span>
              <span className={`truncate ${categoria === TOP && !busqueda ? 'text-slate-900' : m('text-slate-700', 'text-slate-200')}`}>Más pedidos</span>
            </button>
          )}
          {p.categorias.map((c) => {
            const sel = c.id === categoria && !busqueda;
            const claro = claroSobre(c.color);
            const texto = claro ? 'text-slate-900' : 'text-[#fff]';
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setCategoria(c.id); setBusqueda(''); }}
                className={`flex-shrink-0 h-14 min-w-[180px] pl-2 pr-5 rounded-2xl flex items-center gap-3 text-base font-bold transition ${texto} ${sel ? `shadow-lg ring-2 ring-offset-2 ${m('', 'ring-offset-slate-950')}` : 'opacity-80 hover:opacity-100'}`}
                style={{ backgroundColor: c.color, ...(sel ? { ['--tw-ring-color' as any]: c.color, boxShadow: `0 10px 20px -8px ${c.color}` } : {}) }}
              >
                <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">{p.icono(c.icono, `w-5 h-5 ${texto}`)}</span>
                <span className={`truncate ${texto}`}>{c.nombre}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Productos: llenan toda la pantalla, columnas según el ancho */}
      <div className={`flex-1 overflow-y-auto rounded-2xl border p-3 pb-24 ${m('bg-white border-slate-200', 'bg-slate-900 border-slate-800')}`}>
        {productosVisibles.length === 0 ? (
          <p className="text-center text-lg font-medium text-slate-400 mt-16">{busqueda ? `No hay productos con «${busqueda}»` : 'No hay productos en esta categoría'}</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' }}>
            {productosVisibles.map((prod) => {
              const cant = cantidadPorProducto.get(String(prod.id)) || 0;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => agregar(prod)}
                  className={`relative rounded-2xl ${m('bg-white', 'bg-slate-800')} px-3 pt-4 pb-3 flex flex-col items-center gap-2 text-center border-2 transition hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] ${cant > 0 ? 'border-emerald-500 shadow-md shadow-emerald-500/20' : m('border-slate-200 hover:border-blue-200', 'border-slate-700 hover:border-blue-500/60')}`}
                >
                  {cant > 0 && (
                    <span className="absolute top-2 right-2 min-w-8 h-8 px-2 rounded-full bg-emerald-600 text-[#fff] text-base font-bold flex items-center justify-center shadow">
                      {cant}
                    </span>
                  )}
                  <span className="h-[92px] flex items-center justify-center">
                    <ImagenProducto producto={prod} categoria={nombreCategoria.get(prod.categoriaId)} tam={84} />
                  </span>
                  <span className={`text-[15px] font-semibold ${m('text-slate-900', 'text-white')} leading-tight line-clamp-2 min-h-[2.5em] flex items-center`}>{prod.nombre}</span>
                  <span className="min-w-[110px] px-4 py-1.5 rounded-xl bg-blue-600 text-[#fff] text-lg font-bold tabular-nums shadow-sm shadow-blue-600/30">{pesos(prod.precio)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pedido y cobro, siempre abajo */}
      <div className="flex items-stretch gap-3">
        <div className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-2 rounded-2xl border ${m('bg-amber-50 border-amber-200', 'bg-slate-900 border-amber-500/30')}`}>
          <div className={`flex items-center gap-3 flex-shrink-0 pr-4 border-r ${m('border-amber-200', 'border-amber-500/30')}`}>
            <ShoppingCart className={`w-7 h-7 ${m('text-slate-800', 'text-amber-300')}`} />
            <div>
              <p className={`text-base font-bold leading-tight ${m('text-slate-900', 'text-white')}`}>Tu pedido</p>
              <p className={`text-xs font-medium ${m('text-slate-500', 'text-slate-400')}`}>{unidadesDe(cuenta)} producto(s)</p>
            </div>
          </div>
          <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden">
            {cuenta.length === 0 ? (
              <p className={`flex-1 text-center text-base ${m('text-slate-500', 'text-slate-400')} self-center`}>Toca un producto para agregarlo a la cuenta</p>
            ) : cuenta.map((it) => (
              <div key={it.producto.id} className={`flex-shrink-0 flex items-center gap-2 h-12 pl-4 pr-1 rounded-xl border shadow-sm ${m('bg-white border-amber-200', 'bg-slate-800 border-slate-700')}`}>
                <span className={`text-sm font-semibold max-w-[160px] truncate ${m('text-slate-900', 'text-white')}`}>{it.producto.nombre}</span>
                <span className={`text-sm font-bold ${m('text-emerald-700', 'text-emerald-400')} tabular-nums`}>×{it.cantidad}</span>
                <button type="button" onClick={() => p.onQuitarUno(String(it.producto.id))} aria-label={`Quitar un ${it.producto.nombre}`} className={`w-10 h-10 rounded-lg ${m('bg-rose-50 text-rose-600 hover:bg-rose-100', 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25')} flex items-center justify-center active:scale-90 transition`}>
                  <Minus className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {cuenta.length > 0 && !p.mesaActiva && mesasOrdenadas.length > 0 && (
          <button type="button" onClick={() => setVistaMesas('pasar')} className={`flex-shrink-0 px-5 rounded-2xl border-2 border-emerald-600 text-base font-bold flex items-center gap-2 active:scale-95 transition ${m('bg-white text-emerald-700 hover:bg-emerald-50', 'bg-slate-900 text-emerald-400 hover:bg-emerald-500/10')}`}>
            <Armchair className="w-5 h-5" />A una mesa
          </button>
        )}
        {cuenta.length > 0 && p.mesaActiva && p.hayCocina && (
          <button type="button" onClick={() => p.onEnviarCocina(p.mesaActiva!)} className="flex-shrink-0 px-5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-[#fff] text-base font-bold flex items-center gap-2 active:scale-95 transition">
            <ChefHat className="w-5 h-5" />Enviar a cocina
          </button>
        )}
        {cuenta.length > 1 && p.mesaActiva && p.onDividir && (
          <button type="button" onClick={() => p.onDividir!(p.mesaActiva!)} className="flex-shrink-0 px-5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-[#fff] text-base font-bold flex items-center gap-2 active:scale-95 transition">
            <Users className="w-5 h-5" />Dividir
          </button>
        )}
        <button
          type="button"
          disabled={cuenta.length === 0}
          onClick={() => p.onCobrar(p.mesaActiva)}
          className="flex-shrink-0 min-w-[230px] h-16 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-[#fff] text-xl font-bold tabular-nums flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Calculator className="w-6 h-6" />Cobrar {pesos(total)}
        </button>
      </div>


      {/* Mesas en pantalla completa */}
      {vistaMesas && (
        <div className={`absolute inset-0 z-[76] flex flex-col gap-3 p-3 ${m('bg-slate-100', 'bg-slate-950')}`}>
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-[#fff] shadow-lg shadow-emerald-600/20">
            <button type="button" onClick={() => setVistaMesas(null)} className="h-11 px-4 rounded-full bg-white text-emerald-800 text-sm font-semibold flex items-center gap-2 active:scale-95">
              <ArrowLeft className="w-4 h-4" />Volver a productos
            </button>
            <p className="flex-1 text-2xl font-bold tracking-tight text-center truncate text-[#fff]">
              {vistaMesas === 'pasar' ? '¿A qué mesa va este pedido?' : 'Elige una mesa'}
            </p>
            <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-[#fff]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-300" />Libre</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-300" />Ocupada</span>
            </div>
            <button type="button" onClick={() => setVistaMesas(null)} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className={`flex-1 overflow-y-auto rounded-2xl border p-4 ${m('bg-white border-slate-200', 'bg-slate-900 border-slate-800')}`}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))' }}>
              {vistaMesas === 'elegir' && (
                <button
                  type="button"
                  onClick={() => { p.onElegirMesa(null); setVistaMesas(null); }}
                  className={`h-36 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition hover:shadow-lg active:scale-95 ${m('bg-white', 'bg-slate-800')} ${!p.mesaActiva ? m('border-slate-900', 'border-white') : m('border-slate-200', 'border-slate-700')}`}
                >
                  <span className={`w-12 h-12 rounded-xl ${m('bg-amber-100', 'bg-amber-500/20')} flex items-center justify-center`}><Store className="w-7 h-7 text-amber-500" /></span>
                  <span className={`text-lg font-bold ${m('text-slate-900', 'text-white')}`}>Mostrador</span>
                  <span className={`text-sm font-medium ${m('text-slate-500', 'text-slate-400')} tabular-nums`}>{p.cuentaMostrador.length > 0 ? pesos(totalDe(p.cuentaMostrador)) : 'Sin mesa'}</span>
                </button>
              )}
              {mesasOrdenadas.map((m) => {
                const items = p.cuentasMesas[m.id] || [];
                const ocupada = items.length > 0;
                const actual = p.mesaActiva?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (vistaMesas === 'pasar') p.onPasarAMesa(m);
                      else p.onElegirMesa(m);
                      setVistaMesas(null);
                    }}
                    className={`h-36 rounded-2xl flex flex-col items-center justify-center gap-1 text-[#fff] shadow-md transition hover:shadow-lg active:scale-95 ${actual ? (d ? 'ring-4 ring-offset-2 ring-white ring-offset-slate-900' : 'ring-4 ring-offset-2 ring-slate-900') : ''} ${ocupada ? 'bg-gradient-to-br from-rose-500 to-rose-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}`}
                  >
                    <Armchair className="w-9 h-9 text-[#fff]" />
                    <span className="text-xl font-bold leading-tight text-[#fff]">{m.nombre}</span>
                    <span className="text-sm font-semibold text-[#fff]/90 tabular-nums">
                      {ocupada ? `${unidadesDe(items)} prod. · ${pesos(totalDe(items))}` : 'Libre'}
                    </span>
                  </button>
                );
              })}
            </div>
            {mesasOrdenadas.length === 0 && (
              <p className="text-center text-lg font-medium text-slate-400 mt-16">Todavía no hay mesas. Créalas fuera del modo fácil, en la sección Mesas.</p>
            )}
            {vistaMesas === 'elegir' && mesasOrdenadas.length > 0 && (
              <p className={`text-center text-sm font-medium ${m('text-slate-500', 'text-slate-400')} mt-6 flex items-center justify-center gap-2`}>
                <Plus className="w-4 h-4" />Toca una mesa para tomarle el pedido.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(
    <>
      {contenido}
      {!vistaMesas && <BotonMesasFlotante onTocar={() => setVistaMesas('elegir')} ocupadas={ocupadas} oscuro={d} />}
    </>,
    document.body,
  );
}
