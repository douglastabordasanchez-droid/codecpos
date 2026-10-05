/**
 * Sección plegable de Configuración: cerrada por defecto, se abre al tocar el
 * encabezado (flecha arriba a la derecha). Mantiene la pantalla ordenada.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface Props {
  titulo: string;
  subtitulo?: string;
  icono: LucideIcon;
  colorIcono?: string;
  abierta?: boolean;
  destacada?: boolean;
  children: ReactNode;
}

export function SeccionPlegable({ titulo, subtitulo, icono: Icono, colorIcono = 'text-amber-400', abierta = false, destacada, children }: Props) {
  const [abiertaAhora, setAbierta] = useState(abierta);
  return (
    <div className={`bg-slate-900/70 backdrop-blur border rounded-2xl overflow-hidden ${destacada ? 'border-purple-800/40' : 'border-slate-800'}`}>
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abiertaAhora}
        className="w-full flex items-center gap-3 px-4 py-4 text-left"
      >
        <span className="w-9 h-9 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center shrink-0">
          <Icono className={`w-4 h-4 ${colorIcono}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-white text-sm font-bold">{titulo}</span>
          {subtitulo && <span className="block text-slate-500 text-xs truncate">{subtitulo}</span>}
        </span>
        <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${abiertaAhora ? 'rotate-180' : ''}`} />
      </button>
      {abiertaAhora && <div className="px-4 pb-5 pt-1 border-t border-slate-800/70">{children}</div>}
    </div>
  );
}
