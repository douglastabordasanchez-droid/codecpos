/**
 * Edición del menú lateral, igual en computador y celular: mantener
 * presionado un módulo (o clic derecho con el mouse) abre sus acciones —
 * renombrar, subir, bajar, ocultar. Los ocultos quedan en una lista al final
 * del menú para volver a mostrarlos.
 */
import { useRef, useState, type PointerEvent as PointerEventReact } from 'react';
import { ArrowUp, ArrowDown, EyeOff, Eye, Pencil, RotateCcw, X, Check } from 'lucide-react';
import { alternarOculto, moverModulo, renombrarModulo, restablecerMenu } from '../lib/preferenciasMenu';
import type { ItemMenu } from '../hooks/useMenuPersonalizado';

const DURACION_PRESION_MS = 500;

/**
 * Presión larga sin perder el clic normal: si el dedo se queda quieto medio
 * segundo se abre el editor y se cancela la navegación que vendría después;
 * si se mueve (está haciendo scroll), no pasa nada.
 */
export function usePresionLarga(alPresionar: () => void) {
  const temporizador = useRef<number | null>(null);
  const origen = useRef<{ x: number; y: number } | null>(null);
  const disparada = useRef(false);

  const cancelar = () => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  return {
    onPointerDown: (e: PointerEventReact) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      disparada.current = false;
      origen.current = { x: e.clientX, y: e.clientY };
      cancelar();
      temporizador.current = window.setTimeout(() => {
        disparada.current = true;
        navigator.vibrate?.(20);
        alPresionar();
      }, DURACION_PRESION_MS);
    },
    onPointerMove: (e: PointerEventReact) => {
      if (!origen.current) return;
      if (Math.abs(e.clientX - origen.current.x) > 8 || Math.abs(e.clientY - origen.current.y) > 8) cancelar();
    },
    onPointerUp: cancelar,
    onPointerLeave: cancelar,
    onPointerCancel: cancelar,
    onContextMenu: (e: React.MouseEvent) => {
      // Clic derecho (computador) y el menú contextual del celular abren el editor.
      e.preventDefault();
      cancelar();
      disparada.current = true;
      alPresionar();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (disparada.current) {
        e.preventDefault();
        e.stopPropagation();
        disparada.current = false;
      }
    },
  };
}

interface PropsHoja {
  item: ItemMenu;
  /** Rutas visibles del mismo grupo, en el orden actual (para subir/bajar). */
  hermanos: string[];
  onCerrar: () => void;
}

/** Panel de acciones de un módulo. Va sobre todo (z-[60]) para que funcione también con el menú del celular abierto. */
export function HojaAccionesModulo({ item, hermanos, onCerrar }: PropsHoja) {
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const posicion = hermanos.indexOf(item.path);

  const boton = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent';

  const guardarNombre = () => {
    renombrarModulo(item.path, nombre === item.label ? '' : nombre);
    setEditandoNombre(false);
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div
        className="w-full sm:max-w-sm bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-1 pb-3">
          <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
            <item.icon className="w-4 h-4 text-slate-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold truncate">{item.nombre}</p>
            {item.nombre !== item.label && <p className="text-slate-500 text-xs truncate">Nombre original: {item.label}</p>}
          </div>
          <button onClick={onCerrar} className="text-slate-400 p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {editandoNombre ? (
          <div className="flex gap-2 px-1 pb-2">
            <input
              autoFocus
              value={nombre}
              maxLength={40}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') setEditandoNombre(false); }}
              className="flex-1 h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm"
            />
            <button onClick={guardarNombre} className="h-11 w-11 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center" aria-label="Guardar nombre">
              <Check className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button className={boton} onClick={() => setEditandoNombre(true)}>
            <Pencil className="w-4 h-4" /> Cambiar nombre
          </button>
        )}

        <button className={boton} disabled={posicion <= 0} onClick={() => moverModulo(item.path, -1, hermanos)}>
          <ArrowUp className="w-4 h-4" /> Subir
        </button>
        <button className={boton} disabled={posicion < 0 || posicion >= hermanos.length - 1} onClick={() => moverModulo(item.path, 1, hermanos)}>
          <ArrowDown className="w-4 h-4" /> Bajar
        </button>
        {!item.fijo && (
          <button className={boton} onClick={() => { alternarOculto(item.path); onCerrar(); }}>
            <EyeOff className="w-4 h-4" /> Ocultar del menú
          </button>
        )}
        {item.nombre !== item.label && (
          <button className={boton} onClick={() => { renombrarModulo(item.path, ''); onCerrar(); }}>
            <RotateCcw className="w-4 h-4" /> Volver al nombre original
          </button>
        )}

        <div className="pt-2 mt-2 border-t border-slate-800">
          <button
            className={`${boton} text-slate-500`}
            onClick={() => { if (window.confirm('¿Volver el menú a su orden y nombres de fábrica, mostrando todo lo oculto?')) { restablecerMenu(); onCerrar(); } }}
          >
            <RotateCcw className="w-4 h-4" /> Restablecer todo el menú
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lista plegable de módulos ocultos, para volver a mostrarlos. */
export function ModulosOcultos({ ocultos, colapsado }: { ocultos: ItemMenu[]; colapsado?: boolean }) {
  if (ocultos.length === 0 || colapsado) return null;
  return (
    <details className="px-1">
      <summary className="cursor-pointer select-none px-2 py-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
        {ocultos.length} {ocultos.length === 1 ? 'módulo oculto' : 'módulos ocultos'}
      </summary>
      <div className="mt-1 space-y-0.5">
        {ocultos.map((it) => (
          <button
            key={it.path}
            onClick={() => alternarOculto(it.path)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-900"
            title="Mostrar de nuevo en el menú"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{it.nombre}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
