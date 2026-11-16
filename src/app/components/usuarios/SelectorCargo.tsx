/**
 * Cargo del personal: desplegable táctil con los cargos típicos de
 * panadería, restaurante y comercio, y un «+» para agregar otros. Los
 * cargos agregados quedan guardados en este equipo para la próxima vez.
 */
import { useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

export const CARGOS_BASE = [
  'Cajero', 'Mesero', 'Cocinero', 'Parrillero', 'Barista', 'Bodeguero', 'Administrador',
  'Auxiliar de cocina', 'Jefe de cocina', 'Panadero', 'Pastelero', 'Pizzero', 'Bartender',
  'Domiciliario', 'Lavaplatos', 'Servicios generales', 'Supervisor', 'Vendedor', 'Contador',
];

const CLAVE = 'codecpos_cargos_personalizados';

function leerPropios(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}

interface Props {
  valor: string;
  onCambio: (cargo: string) => void;
  oscuro: boolean;
}

export function SelectorCargo({ valor, onCambio, oscuro }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [propios, setPropios] = useState<string[]>(leerPropios);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState('');

  const iguales = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const todos = [...CARGOS_BASE, ...propios.filter((p) => !CARGOS_BASE.some((b) => iguales(b, p)))];
  // Un cargo escrito antes a mano (por ejemplo al editar) también aparece en la lista.
  if (valor && !todos.some((c) => iguales(c, valor))) todos.push(valor);

  const elegir = (c: string) => { onCambio(c); setAbierto(false); setAgregando(false); };

  const guardarNuevo = () => {
    const limpio = nuevo.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    const bonito = limpio.charAt(0).toUpperCase() + limpio.slice(1);
    if (!todos.some((c) => iguales(c, bonito))) {
      const lista = [...propios, bonito];
      setPropios(lista);
      try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* ignorar */ }
    }
    setNuevo('');
    elegir(bonito);
  };

  const quitarPropio = (c: string) => {
    const lista = propios.filter((p) => !iguales(p, c));
    setPropios(lista);
    try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* ignorar */ }
  };

  const chip = (activo: boolean) => `h-11 px-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${
    activo ? 'bg-indigo-600 border-indigo-600 text-[#fff]'
      : oscuro ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-800'}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`w-full h-11 px-3 rounded-md border flex items-center justify-between text-left ${oscuro ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
      >
        <span className={valor ? 'font-semibold' : (oscuro ? 'text-slate-400' : 'text-gray-400')}>{valor || 'Elige el cargo'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className={`mt-2 rounded-2xl border p-2 ${oscuro ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-gray-50'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {todos.map((c) => {
              const esPropio = propios.some((p) => iguales(p, c));
              return (
                <div key={c} className="relative">
                  <button type="button" onClick={() => elegir(c)} className={`w-full ${chip(iguales(c, valor))}`}>
                    {iguales(c, valor) && <Check className="w-4 h-4" />}{c}
                  </button>
                  {esPropio && (
                    <button type="button" onClick={() => quitarPropio(c)} aria-label={`Quitar ${c}`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-[#fff] flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {!agregando && (
              <button type="button" onClick={() => setAgregando(true)} className={`${chip(false)} border-dashed`}>
                <Plus className="w-4 h-4" />Otro cargo
              </button>
            )}
          </div>
          {agregando && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNuevo(); } }}
                placeholder="Nombre del cargo"
                maxLength={40}
                className={`flex-1 h-11 px-3 rounded-xl border-2 outline-none ${oscuro ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              />
              <button type="button" onClick={guardarNuevo} className="h-11 px-4 rounded-xl bg-indigo-600 text-[#fff] font-bold">Agregar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
