/**
 * Ordenar las categorías de Alimentos y Bebidas: alfabético (A→Z, Z→A) o a
 * mano, arrastrando con el dedo o el mouse (mantener presionada la manija y
 * deslizar) o con las flechas. Pensado para pantalla táctil.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, GripVertical, X } from 'lucide-react';

export interface CategoriaOrdenable {
  id: string;
  nombre: string;
  color: string;
}

interface Props<T extends CategoriaOrdenable> {
  categorias: T[];
  oscuro: boolean;
  /** Dibuja el ícono o emoji de la categoría. */
  icono: (c: T) => React.ReactNode;
  onGuardar: (ordenadas: T[]) => void;
  onCerrar: () => void;
}

const comparar = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

export function OrdenarCategoriasModal<T extends CategoriaOrdenable>({ categorias, oscuro, icono, onGuardar, onCerrar }: Props<T>) {
  const [lista, setLista] = useState<T[]>(categorias);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const cambiado = lista.some((c, i) => c.id !== categorias[i]?.id);

  const mover = (desde: number, hasta: number) => {
    if (desde === hasta || hasta < 0 || hasta >= lista.length) return;
    setLista((prev) => {
      const nueva = [...prev];
      const [item] = nueva.splice(desde, 1);
      nueva.splice(hasta, 0, item);
      return nueva;
    });
  };

  // Arrastre con dedo o mouse: la fila sigue al puntero y cambia de lugar al pasar sobre otra.
  const iniciarArrastre = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setArrastrando(id);
    try { navigator.vibrate?.(20); } catch { /* sin vibración */ }
  };
  const moverArrastre = (e: React.PointerEvent) => {
    if (!arrastrando || !contenedor.current) return;
    const filas = Array.from(contenedor.current.querySelectorAll<HTMLElement>('[data-fila-categoria]'));
    const desde = lista.findIndex((c) => c.id === arrastrando);
    let hasta = desde;
    for (let i = 0; i < filas.length; i++) {
      const r = filas[i].getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) { hasta = i; break; }
    }
    if (hasta !== desde) mover(desde, hasta);
    // Si el dedo llega al borde de la lista, se desplaza sola.
    const caja = contenedor.current.getBoundingClientRect();
    if (e.clientY < caja.top + 40) contenedor.current.scrollTop -= 12;
    else if (e.clientY > caja.bottom - 40) contenedor.current.scrollTop += 12;
  };
  const terminarArrastre = () => setArrastrando(null);

  const fondo = oscuro ? 'bg-slate-900 text-white border border-slate-700' : 'bg-white text-slate-900';
  const fila = oscuro ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';
  const boton = oscuro ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-700';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className={`w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl shadow-2xl ${fondo}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-5 pb-3">
          <p className="flex-1 text-xl font-black">Ordenar categorías</p>
          <button onClick={onCerrar} className="w-10 h-10 rounded-xl flex items-center justify-center opacity-70" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-3 grid grid-cols-2 gap-2">
          <button onClick={() => setLista((p) => [...p].sort((a, b) => comparar(a.nombre, b.nombre)))} className={`h-12 rounded-2xl border-2 font-black ${boton}`}>A → Z</button>
          <button onClick={() => setLista((p) => [...p].sort((a, b) => comparar(b.nombre, a.nombre)))} className={`h-12 rounded-2xl border-2 font-black ${boton}`}>Z → A</button>
        </div>
        <p className={`px-5 pb-2 text-xs ${oscuro ? 'text-slate-400' : 'text-slate-500'}`}>
          O mantén presionada la manija <GripVertical className="inline w-3.5 h-3.5" /> y desliza la categoría a su lugar.
        </p>

        <div
          ref={contenedor}
          className="flex-1 overflow-y-auto px-5 space-y-2 touch-none select-none"
          onPointerMove={moverArrastre}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
        >
          {lista.map((c, i) => (
            <div
              key={c.id}
              data-fila-categoria
              className={`flex items-center gap-2 rounded-2xl border p-2 transition-shadow ${fila} ${arrastrando === c.id ? 'ring-2 ring-amber-500 shadow-xl scale-[1.02]' : ''}`}
            >
              <button
                onPointerDown={(e) => iniciarArrastre(e, c.id)}
                className="w-11 h-11 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing opacity-70"
                aria-label={`Mover ${c.nombre}`}
              >
                <GripVertical className="w-6 h-6" />
              </button>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[#fff]" style={{ background: c.color }}>{icono(c)}</span>
              <span className="flex-1 min-w-0 font-bold truncate">{c.nombre}</span>
              <button onClick={() => mover(i, i - 1)} disabled={i === 0} className={`w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-25 ${boton}`} aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
              <button onClick={() => mover(i, i + 1)} disabled={i === lista.length - 1} className={`w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-25 ${boton}`} aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <div className="p-5 pt-3 flex gap-2">
          <button onClick={onCerrar} className={`h-12 flex-1 rounded-2xl border-2 font-bold ${boton}`}>Cancelar</button>
          <button
            onClick={() => onGuardar(lista)}
            disabled={!cambiado}
            className="h-12 flex-1 rounded-2xl bg-emerald-600 text-[#fff] font-black flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Check className="w-5 h-5" />Guardar orden
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
