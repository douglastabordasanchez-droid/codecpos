/**
 * Peso rápido: al poner algo en la báscula aparece solo una ventana con el
 * peso y un buscador de productos a granel; se escribe el código (G16) o el
 * nombre, Enter, y queda en el carrito. Se activa en Dispositivos → Báscula
 * ("Ventana automática al pesar"). Es la misma en la caja de Electron y en
 * Vender de la web.
 *
 * No vuelve a salir hasta que se vacía la báscula: así no se repite con el
 * mismo producto encima.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Scale, Search, X, ShoppingCart } from 'lucide-react';
import { useBasculaWeb } from '../hooks/useBasculaWeb';
import { formatoPeso, obtenerConfigBascula, EVENTO_CONFIG_BASCULA } from '../lib/basculaWeb';

export interface ProductoPesoRapido {
  id: string;
  nombre: string;
  codigo?: string | null;
  precioKg: number;
  /** Kilos en inventario; sin dato no se limita. */
  stockKg?: number;
}

/** Desde cuánto se considera que pusieron algo (5 g) y cuándo quedó vacía (2 g). */
const PESO_MINIMO_KG = 0.005;
const VACIA_KG = 0.002;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export function PesoRapido({ productos, bloqueado, onAgregar, claro = false }: {
  productos: ProductoPesoRapido[];
  /** Otra ventana abierta (cobro, pesaje, factura…): no estorbar. */
  bloqueado: boolean;
  onAgregar: (id: string, pesoKg: number) => void;
  claro?: boolean;
}) {
  const [activa, setActiva] = useState(() => !!obtenerConfigBascula().popupAlPesar);
  useEffect(() => {
    const leer = () => setActiva(!!obtenerConfigBascula().popupAlPesar);
    window.addEventListener(EVENTO_CONFIG_BASCULA, leer);
    return () => window.removeEventListener(EVENTO_CONFIG_BASCULA, leer);
  }, []);

  const bascula = useBasculaWeb((e) => ({ conectada: e.conectada, pesoKg: e.pesoKg, estable: e.estable }));
  const [abierta, setAbierta] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(0);
  // Se "arma" cuando la báscula queda vacía; se desarma al abrir la ventana.
  const armada = useRef(true);
  const campo = useRef<HTMLInputElement>(null);

  const funciona = activa && bascula.conectada && productos.length > 0;

  useEffect(() => {
    if (!funciona) { setAbierta(false); return; }
    if (bascula.pesoKg < VACIA_KG) {
      armada.current = true;
      if (abierta) setAbierta(false); // quitaron el producto sin agregarlo
      return;
    }
    if (!abierta && !bloqueado && armada.current && bascula.estable && bascula.pesoKg >= PESO_MINIMO_KG) {
      armada.current = false;
      setBusqueda('');
      setElegido(0);
      setAbierta(true);
    }
  }, [funciona, bascula.pesoKg, bascula.estable, bloqueado, abierta]);

  useEffect(() => { if (bloqueado) setAbierta(false); }, [bloqueado]);
  useEffect(() => { if (abierta) setTimeout(() => campo.current?.focus(), 30); }, [abierta]);

  const resultados = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return productos.slice(0, 8);
    const exacto = (p: ProductoPesoRapido) => sinTildes(String(p.codigo ?? '')) === q;
    return productos
      .filter((p) => exacto(p) || sinTildes(p.nombre).includes(q) || sinTildes(String(p.codigo ?? '')).includes(q))
      .sort((a, b) => Number(exacto(b)) - Number(exacto(a)))
      .slice(0, 8);
  }, [productos, busqueda]);

  if (!abierta) return null;

  const peso = bascula.pesoKg;
  const excede = (p: ProductoPesoRapido) => p.stockKg !== undefined && peso > p.stockKg + 0.0000005;
  const agregar = (p: ProductoPesoRapido | undefined) => {
    if (!p || excede(p) || !(peso > 0)) return;
    onAgregar(p.id, Math.round(peso * 1e6) / 1e6);
    setAbierta(false);
  };

  const t = claro
    ? { hoja: 'bg-white border border-gray-200', texto: 'text-gray-900', suave: 'text-gray-500', campo: 'bg-white border-gray-300 text-gray-900', fila: 'hover:bg-gray-50', activa: 'bg-emerald-50 border-emerald-300', borde: 'border-gray-100' }
    : { hoja: 'bg-slate-900 border border-slate-800', texto: 'text-white', suave: 'text-slate-400', campo: 'bg-slate-950 border-slate-700 text-white', fila: 'hover:bg-slate-800/60', activa: 'bg-emerald-500/10 border-emerald-500/40', borde: 'border-slate-800' };

  return (
    <div className="fixed inset-0 z-[115] bg-black/60 flex items-start sm:items-center justify-center p-3 sm:p-4 pt-10" onClick={() => setAbierta(false)}>
      <div className={`w-full max-w-lg rounded-3xl p-5 ${t.hoja} shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center"><Scale className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className={`text-xs ${t.suave}`}>{bascula.estable ? 'Peso en la báscula' : 'Pesando…'}</p>
              <p className={`text-4xl font-black tabular-nums ${bascula.estable ? 'text-emerald-500' : 'text-amber-500'}`}>{formatoPeso(peso)}</p>
            </div>
          </div>
          <button onClick={() => setAbierta(false)} className={t.suave} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="relative mb-3">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${t.suave}`} />
          <input
            ref={campo}
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setElegido(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); agregar(resultados[elegido]); }
              if (e.key === 'ArrowDown') { e.preventDefault(); setElegido((i) => Math.min(i + 1, resultados.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setElegido((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Escape') setAbierta(false);
            }}
            placeholder="Código (G16) o nombre del producto"
            className={`w-full h-12 pl-10 pr-3 rounded-2xl border-2 text-lg font-semibold outline-none focus:border-emerald-500 ${t.campo}`}
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
          {resultados.length === 0 && <p className={`text-sm text-center py-6 ${t.suave}`}>No hay productos a granel con "{busqueda}".</p>}
          {resultados.map((p, i) => {
            const sinStock = excede(p);
            return (
              <button key={p.id} type="button" disabled={sinStock} onClick={() => agregar(p)} onMouseEnter={() => setElegido(i)}
                className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${i === elegido ? t.activa : `${t.borde} ${t.fila}`}`}>
                <span className="shrink-0 min-w-[3.25rem] text-center rounded-lg bg-emerald-600 text-white text-xs font-black px-2 py-1">{p.codigo || '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold text-sm truncate ${t.texto}`}>{p.nombre}</span>
                  <span className={`block text-xs ${sinStock ? 'text-red-500' : t.suave}`}>
                    {sinStock ? `Solo quedan ${formatoPeso(p.stockKg || 0)}` : `${money(p.precioKg)} / kg`}
                  </span>
                </span>
                <span className={`shrink-0 text-lg font-black tabular-nums ${t.texto}`}>{money(peso * p.precioKg)}</span>
                {i === elegido && !sinStock && <ShoppingCart className="w-4 h-4 text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </div>
        <p className={`text-xs text-center mt-3 ${t.suave}`}>Enter agrega el marcado · Esc cierra · Se desactiva en Dispositivos → Báscula</p>
      </div>
    </div>
  );
}
