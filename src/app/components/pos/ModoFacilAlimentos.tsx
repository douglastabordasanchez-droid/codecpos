import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Armchair, ArrowLeft, ChefHat, LogOut, Minus, Plus, Search, ShoppingCart, Star, Store, Users, X } from 'lucide-react';
import { dbManager } from '../../lib/indexedDB';
import { emojiParaProducto, urlTwemoji } from '../../lib/imagenProducto';
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
}

const CLAVE_POSICION_BOTON = 'codecpos_modo_facil_boton_mesas';
const CLAVE_PEDIDOS = 'codecpos_modo_facil_pedidos';
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
 * nombre. Se dibuja con Twemoji (1 a 2 KB, queda guardado); sin internet se
 * muestra el emoji del sistema.
 */
function ImagenProducto({ producto, categoria, tam }: { producto: ProductoFacil; categoria?: string; tam: number }) {
  const emoji = esEmoji(producto.icono) ? producto.icono : emojiParaProducto(producto.nombre, categoria);
  const [fallo, setFallo] = useState(false);
  if (fallo) return <span className="leading-none select-none" style={{ fontSize: Math.round(tam * 0.8) }} aria-hidden>{emoji}</span>;
  return (
    <img
      src={urlTwemoji(emoji)}
      alt=""
      width={tam}
      height={tam}
      loading="lazy"
      draggable={false}
      onError={() => setFallo(true)}
      style={{ width: tam, height: tam }}
      className="select-none pointer-events-none"
    />
  );
}

/** Botón de Mesas flotante: se arrastra con el dedo y recuerda dónde quedó. */
function BotonMesasFlotante({ onTocar, ocupadas }: { onTocar: () => void; ocupadas: number }) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(CLAVE_POSICION_BOTON) || 'null');
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch { /* sin almacenamiento */ }
    return { x: window.innerWidth - 132, y: Math.max(8, window.innerHeight - 250) };
  });
  const arrastre = useRef<{ dx: number; dy: number; inicioX: number; inicioY: number; movio: boolean } | null>(null);

  // Si la pantalla cambia de tamaño, el botón no se queda por fuera.
  useEffect(() => {
    const ajustar = () => setPos((p) => ({
      x: Math.min(Math.max(8, p.x), window.innerWidth - 120),
      y: Math.min(Math.max(8, p.y), window.innerHeight - 120),
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
          x: Math.min(Math.max(8, e.clientX - a.dx), window.innerWidth - 120),
          y: Math.min(Math.max(8, e.clientY - a.dy), window.innerHeight - 120),
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
      className="fixed z-[75] w-28 h-28 rounded-full bg-emerald-600 text-[#fff] shadow-2xl border-4 border-white flex flex-col items-center justify-center gap-1 select-none active:scale-95"
      aria-label="Ver mesas"
    >
      <Armchair className="w-9 h-9" />
      <span className="text-lg font-black leading-none text-[#fff]">Mesas</span>
      {ocupadas > 0 && (
        <span className="absolute -top-1 -right-1 min-w-9 h-9 px-2 rounded-full bg-red-600 text-[#fff] text-lg font-black flex items-center justify-center border-2 border-white">
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

  const contenido = (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100 text-slate-900" style={{ colorScheme: 'light' }}>
      {/* Encabezado: dónde estoy y cómo salir */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-[#fff] shadow-lg">
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-black leading-tight truncate text-[#fff]">Alimentos y Bebidas</p>
          <p className="text-base font-bold text-[#fff] truncate">
            Pedido para: <span className="underline decoration-2 underline-offset-4">{destino}</span>
          </p>
        </div>
        {p.mesaActiva && (
          <button type="button" onClick={() => p.onElegirMesa(null)} className="h-14 px-4 rounded-2xl bg-white/20 border-2 border-white/60 text-lg font-black flex items-center gap-2 active:scale-95">
            <Store className="w-6 h-6" />Mostrador
          </button>
        )}
        <button type="button" onClick={p.onSalir} className="h-14 px-5 rounded-2xl bg-white text-rose-700 text-lg font-black flex items-center gap-2 shadow-lg active:scale-95">
          <LogOut className="w-6 h-6" />Salir del modo fácil
        </button>
      </div>

      {/* Categorías grandes */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white shadow-sm">
      <div className="relative flex-shrink-0 w-[240px]">
        <Search className="w-6 h-6 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto"
          className="w-full h-12 pl-11 pr-11 rounded-2xl border-2 border-slate-300 bg-slate-50 text-lg font-bold text-slate-900 outline-none focus:border-orange-500"
        />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center active:scale-90">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0 flex gap-3 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden">
        {masPedidos.length > 0 && (
          <button
            type="button"
            onClick={() => { setCategoria(TOP); setBusqueda(''); }}
            className={`flex-shrink-0 h-12 min-w-[150px] px-4 rounded-2xl flex items-center gap-2 text-lg font-black bg-amber-400 text-slate-900 transition ${categoria === TOP && !busqueda ? 'ring-4 ring-offset-2 ring-slate-900 scale-[1.03]' : 'opacity-75'}`}
          >
            <Star className="w-6 h-6 fill-current" />
            <span className="truncate text-slate-900">Más pedidos</span>
          </button>
        )}
        {p.categorias.map((c) => {
          const sel = c.id === categoria && !busqueda;
          const claro = claroSobre(c.color);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { setCategoria(c.id); setBusqueda(''); }}
              className={`flex-shrink-0 h-12 min-w-[145px] px-4 rounded-2xl flex items-center gap-2 text-lg font-black transition ${claro ? 'text-slate-900' : 'text-[#fff]'} ${sel ? 'ring-4 ring-offset-2 ring-slate-900 scale-[1.03]' : 'opacity-75'}`}
              style={{ backgroundColor: c.color }}
            >
              {p.icono(c.icono, 'w-6 h-6')}
              <span className={`truncate ${claro ? 'text-slate-900' : 'text-[#fff]'}`}>{c.nombre}</span>
            </button>
          );
        })}
      </div>
      </div>

      {/* Productos: llenan toda la pantalla, columnas según el ancho */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-28">
        {productosVisibles.length === 0 ? (
          <p className="text-center text-2xl font-bold text-slate-400 mt-16">{busqueda ? `No hay productos con «${busqueda}»` : 'No hay productos en esta categoría'}</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))' }}>
            {productosVisibles.map((prod) => {
              const cant = cantidadPorProducto.get(String(prod.id)) || 0;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => agregar(prod)}
                  className={`relative rounded-3xl bg-white px-2 pt-2 pb-3 flex flex-col items-center gap-1 text-center shadow-md border-4 transition active:scale-95 ${cant > 0 ? 'border-emerald-500' : 'border-transparent'}`}
                >
                  {cant > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-10 h-10 px-2 rounded-full bg-emerald-600 text-[#fff] text-lg font-black flex items-center justify-center border-4 border-white shadow">
                      {cant}
                    </span>
                  )}
                  <span className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ backgroundColor: `${prod.color}22` }}>
                    <ImagenProducto producto={prod} categoria={nombreCategoria.get(prod.categoriaId)} tam={50} />
                  </span>
                  <span className="text-[15px] font-black leading-tight line-clamp-2 min-h-[2.5em] flex items-center">{prod.nombre}</span>
                  <span className="px-3 py-0.5 rounded-full bg-blue-600 text-[#fff] text-base font-black">{pesos(prod.precio)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pedido y cobro, siempre abajo */}
      <div className="border-t-4 border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <ShoppingCart className="w-8 h-8 text-amber-700" />
          <div>
            <p className="text-lg font-black leading-tight">Tu pedido</p>
            <p className="text-sm font-bold text-slate-600">{unidadesDe(cuenta)} producto(s)</p>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden">
          {cuenta.length === 0 ? (
            <p className="text-lg font-semibold text-slate-500 self-center">Toca un producto para agregarlo</p>
          ) : cuenta.map((it) => (
            <div key={it.producto.id} className="flex-shrink-0 flex items-center gap-2 h-14 pl-4 pr-1 rounded-2xl bg-white border-2 border-amber-200 shadow-sm">
              <span className="text-base font-black max-w-[160px] truncate">{it.producto.nombre}</span>
              <span className="text-base font-black text-emerald-700">×{it.cantidad}</span>
              <button type="button" onClick={() => p.onQuitarUno(String(it.producto.id))} aria-label={`Quitar un ${it.producto.nombre}`} className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center active:scale-90">
                <Minus className="w-6 h-6" />
              </button>
            </div>
          ))}
        </div>
        {cuenta.length > 0 && !p.mesaActiva && mesasOrdenadas.length > 0 && (
          <button type="button" onClick={() => setVistaMesas('pasar')} className="flex-shrink-0 h-16 px-5 rounded-2xl bg-white border-2 border-emerald-600 text-emerald-700 text-lg font-black flex items-center gap-2 active:scale-95">
            <Armchair className="w-6 h-6" />A una mesa
          </button>
        )}
        {cuenta.length > 0 && p.mesaActiva && p.hayCocina && (
          <button type="button" onClick={() => p.onEnviarCocina(p.mesaActiva!)} className="flex-shrink-0 h-16 px-5 rounded-2xl bg-sky-600 text-[#fff] text-lg font-black flex items-center gap-2 active:scale-95">
            <ChefHat className="w-6 h-6" />Enviar a cocina
          </button>
        )}
        {cuenta.length > 1 && p.mesaActiva && p.onDividir && (
          <button type="button" onClick={() => p.onDividir!(p.mesaActiva!)} className="flex-shrink-0 h-16 px-5 rounded-2xl bg-violet-600 text-[#fff] text-lg font-black flex items-center gap-2 active:scale-95">
            <Users className="w-6 h-6" />Dividir
          </button>
        )}
        <button
          type="button"
          disabled={cuenta.length === 0}
          onClick={() => p.onCobrar(p.mesaActiva)}
          className="flex-shrink-0 h-16 px-6 rounded-2xl bg-emerald-600 text-[#fff] text-2xl font-black shadow-lg disabled:opacity-40 active:scale-95"
        >
          Cobrar {pesos(total)}
        </button>
      </div>

      {!vistaMesas && <BotonMesasFlotante onTocar={() => setVistaMesas('elegir')} ocupadas={ocupadas} />}

      {/* Mesas en pantalla completa */}
      {vistaMesas && (
        <div className="absolute inset-0 z-[76] flex flex-col bg-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-700 text-[#fff] shadow-lg">
            <button type="button" onClick={() => setVistaMesas(null)} className="h-14 px-5 rounded-2xl bg-white text-emerald-800 text-lg font-black flex items-center gap-2 active:scale-95">
              <ArrowLeft className="w-6 h-6" />Volver a productos
            </button>
            <p className="flex-1 text-2xl font-black text-center truncate text-[#fff]">
              {vistaMesas === 'pasar' ? '¿A qué mesa va este pedido?' : 'Elige una mesa'}
            </p>
            <button type="button" onClick={() => setVistaMesas(null)} aria-label="Cerrar" className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center active:scale-95">
              <X className="w-8 h-8" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {vistaMesas === 'elegir' && (
                <button
                  type="button"
                  onClick={() => { p.onElegirMesa(null); setVistaMesas(null); }}
                  className={`h-40 rounded-3xl border-4 flex flex-col items-center justify-center gap-2 shadow-md active:scale-95 ${!p.mesaActiva ? 'border-slate-900 bg-white' : 'border-transparent bg-white'}`}
                >
                  <Store className="w-12 h-12 text-amber-600" />
                  <span className="text-2xl font-black text-slate-900">Mostrador</span>
                  <span className="text-base font-bold text-slate-500">{p.cuentaMostrador.length > 0 ? pesos(totalDe(p.cuentaMostrador)) : 'Sin mesa'}</span>
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
                    className={`h-40 rounded-3xl border-4 flex flex-col items-center justify-center gap-1 shadow-md text-[#fff] active:scale-95 ${actual ? 'border-slate-900' : 'border-transparent'} ${ocupada ? 'bg-rose-600' : 'bg-emerald-600'}`}
                  >
                    <Armchair className="w-11 h-11" />
                    <span className="text-2xl font-black leading-tight text-[#fff]">{m.nombre}</span>
                    <span className="text-lg font-black text-[#fff]">
                      {ocupada ? `${unidadesDe(items)} prod. · ${pesos(totalDe(items))}` : 'Libre'}
                    </span>
                  </button>
                );
              })}
            </div>
            {mesasOrdenadas.length === 0 && (
              <p className="text-center text-2xl font-bold text-slate-400 mt-16">Todavía no hay mesas. Créalas fuera del modo fácil, en la sección Mesas.</p>
            )}
            {vistaMesas === 'elegir' && (
              <p className="text-center text-lg font-bold text-slate-500 mt-6 flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" />Toca una mesa para tomarle el pedido. Roja = ocupada, verde = libre.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(contenido, document.body);
}
