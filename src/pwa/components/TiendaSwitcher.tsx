import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Store, Check, Eye } from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import logo from '/logo.png';

/**
 * Selector de tienda para dueños con varias instalaciones vinculadas (ver
 * migración 0045 + PwaAuthContext). Si el usuario solo tiene su propia
 * tienda (el caso normal, sin multi-negocio) no se renderiza nada distinto:
 * se muestra el logo de siempre, sin selector, para no añadir ruido visual
 * a la inmensa mayoría de negocios que no usan esta función.
 */
export function TiendaSwitcher() {
  const { tiendasDisponibles, tiendaActiva, seleccionarTienda, soloLectura } = usePwaAuth();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrarFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrarFuera);
    return () => document.removeEventListener('mousedown', cerrarFuera);
  }, []);

  if (tiendasDisponibles.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <img src={logo} alt="CODEC POS" className="w-5 h-5 object-contain" />
        <span className="text-white text-sm font-black tracking-tight">CODEC POS</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 max-w-[160px] px-2 py-1.5 rounded-lg active:bg-slate-900"
      >
        <Store className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-white text-sm font-bold truncate">{tiendaActiva?.nombreNegocio || 'Elegir tienda'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden z-40">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tus tiendas</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {tiendasDisponibles.map((t) => (
              <button
                key={t.clienteId}
                onClick={() => { seleccionarTienda(t.clienteId); setAbierto(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-slate-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{t.nombreNegocio}</p>
                  <p className="text-[11px] text-slate-500">{t.esPropia ? 'Tu tienda' : 'Solo ver — vinculada'}</p>
                </div>
                {t.clienteId === tiendaActiva?.clienteId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {soloLectura && (
        <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-[10px] text-amber-400 font-semibold whitespace-nowrap">
          <Eye className="w-3 h-3" /> Solo lectura
        </div>
      )}
    </div>
  );
}
