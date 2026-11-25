/**
 * Cargo del personal: lista desplegable (una opción por renglón) agrupada por
 * tipo de negocio, con buscador y un «Otro cargo» para escribir uno propio.
 * Cada cargo trae el acceso que le corresponde en el sistema (ventas y caja,
 * taller o administrador), así al elegir el cargo ya queda elegido el rol.
 * Los cargos agregados a mano quedan guardados en este equipo.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';

export type RolCargo = 'cajero' | 'tecnico' | 'admin_nube';

interface GrupoCargos { grupo: string; cargos: { nombre: string; rol: RolCargo }[] }

const c = (nombre: string, rol: RolCargo = 'cajero') => ({ nombre, rol });

export const GRUPOS_CARGOS: GrupoCargos[] = [
  { grupo: 'Dirección', cargos: [c('Administrador', 'admin_nube'), c('Supervisor'), c('Jefe de tienda'), c('Contador'), c('Auxiliar contable')] },
  { grupo: 'Ventas y caja', cargos: [c('Cajero'), c('Vendedor'), c('Asesor comercial'), c('Mercaderista'), c('Domiciliario')] },
  { grupo: 'Bodega e inventario', cargos: [c('Jefe de bodega'), c('Bodeguero'), c('Auxiliar de bodega'), c('Almacenista'), c('Despachador')] },
  { grupo: 'Papelería y copias', cargos: [c('Auxiliar de papelería'), c('Operador de fotocopiadora'), c('Diseñador gráfico')] },
  { grupo: 'Restaurante y cocina', cargos: [c('Mesero'), c('Cocinero'), c('Jefe de cocina'), c('Auxiliar de cocina'), c('Parrillero'), c('Pizzero'), c('Barista'), c('Bartender'), c('Lavaplatos')] },
  { grupo: 'Panadería', cargos: [c('Panadero'), c('Pastelero'), c('Auxiliar de panadería')] },
  { grupo: 'Taller y servicio técnico', cargos: [c('Técnico', 'tecnico'), c('Jefe de taller', 'tecnico'), c('Auxiliar técnico', 'tecnico')] },
  { grupo: 'Salud y belleza', cargos: [c('Veterinario'), c('Auxiliar veterinario'), c('Estilista'), c('Barbero'), c('Farmaceuta')] },
  { grupo: 'Apoyo', cargos: [c('Servicios generales'), c('Vigilante'), c('Conductor')] },
];

export const CARGOS_BASE = GRUPOS_CARGOS.flatMap((g) => g.cargos.map((x) => x.nombre));

const iguales = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Acceso que corresponde a un cargo; los cargos propios entran como ventas y caja. */
export function rolDeCargo(cargo: string): RolCargo {
  for (const g of GRUPOS_CARGOS) {
    const x = g.cargos.find((y) => iguales(y.nombre, cargo));
    if (x) return x.rol;
  }
  return 'cajero';
}

const CLAVE = 'codecpos_cargos_personalizados';

function leerPropios(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}

const ETIQUETA_ROL: Record<RolCargo, string> = { cajero: 'Ventas y caja', tecnico: 'Taller', admin_nube: 'Acceso total' };

interface Props {
  valor: string;
  onCambio: (cargo: string, rol: RolCargo) => void;
  oscuro: boolean;
}

export function SelectorCargo({ valor, onCambio, oscuro }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [propios, setPropios] = useState<string[]>(leerPropios);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera de la lista.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const propiosLimpios = propios.filter((p) => !CARGOS_BASE.some((b) => iguales(b, p)));
  // Un cargo escrito antes a mano (por ejemplo al editar) también aparece en la lista.
  if (valor && !CARGOS_BASE.some((b) => iguales(b, valor)) && !propiosLimpios.some((p) => iguales(p, valor))) propiosLimpios.push(valor);

  const grupos: GrupoCargos[] = [
    ...GRUPOS_CARGOS,
    ...(propiosLimpios.length ? [{ grupo: 'Agregados por ti', cargos: propiosLimpios.map((p) => c(p)) }] : []),
  ];
  const q = sinTildes(busqueda.trim());
  const filtrados = grupos
    .map((g) => ({ ...g, cargos: q ? g.cargos.filter((x) => sinTildes(x.nombre).includes(q)) : g.cargos }))
    .filter((g) => g.cargos.length > 0);

  const elegir = (nombre: string) => {
    onCambio(nombre, rolDeCargo(nombre));
    setAbierto(false); setAgregando(false); setBusqueda('');
  };

  const guardarNuevo = () => {
    const limpio = nuevo.trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    const bonito = limpio.charAt(0).toUpperCase() + limpio.slice(1);
    if (![...CARGOS_BASE, ...propios].some((x) => iguales(x, bonito))) {
      const lista = [...propios, bonito];
      setPropios(lista);
      try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* ignorar */ }
    }
    setNuevo('');
    elegir(bonito);
  };

  const quitarPropio = (nombre: string) => {
    const lista = propios.filter((p) => !iguales(p, nombre));
    setPropios(lista);
    try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* ignorar */ }
  };

  const borde = oscuro ? 'border-slate-600' : 'border-gray-300';
  const textoSuave = oscuro ? 'text-slate-400' : 'text-gray-500';

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`w-full h-11 px-3 rounded-md border flex items-center justify-between gap-2 text-left ${oscuro ? 'bg-slate-800 text-white' : 'bg-white text-gray-900'} ${abierto ? 'border-indigo-500 ring-2 ring-indigo-500/20' : borde}`}
      >
        <span className={`truncate ${valor ? 'font-semibold' : oscuro ? 'text-slate-400' : 'text-gray-400'}`}>{valor || 'Elige el cargo'}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden ${oscuro ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`}>
          <div className={`p-2 border-b ${oscuro ? 'border-slate-700' : 'border-gray-100'}`}>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 ${textoSuave}`} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cargo"
                className={`w-full h-9 pl-8 pr-2 rounded-lg border text-sm outline-none ${oscuro ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
              />
            </div>
          </div>

          <ul role="listbox" className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {filtrados.map((g) => (
              <li key={g.grupo}>
                <p className={`px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide ${textoSuave}`}>{g.grupo}</p>
                <ul>
                  {g.cargos.map((x) => {
                    const activo = iguales(x.nombre, valor);
                    const esPropio = g.grupo === 'Agregados por ti' && propios.some((p) => iguales(p, x.nombre));
                    return (
                      <li key={x.nombre} className="flex items-center">
                        <button
                          type="button"
                          role="option"
                          aria-selected={activo}
                          onClick={() => elegir(x.nombre)}
                          className={`flex-1 min-h-[42px] px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors ${
                            activo ? (oscuro ? 'bg-indigo-500/20 text-indigo-200 font-bold' : 'bg-indigo-50 text-indigo-700 font-bold')
                              : oscuro ? 'text-slate-100 hover:bg-slate-800' : 'text-gray-800 hover:bg-gray-50'}`}
                        >
                          <span className="w-4 shrink-0">{activo && <Check className="w-4 h-4" />}</span>
                          <span className="flex-1">{x.nombre}</span>
                          {x.rol !== 'cajero' && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${x.rol === 'admin_nube' ? 'bg-amber-500/15 text-amber-600' : 'bg-cyan-500/15 text-cyan-600'}`}>
                              {ETIQUETA_ROL[x.rol]}
                            </span>
                          )}
                        </button>
                        {esPropio && (
                          <button type="button" onClick={() => quitarPropio(x.nombre)} aria-label={`Quitar ${x.nombre}`}
                            className={`w-9 h-9 mr-1 rounded-lg flex items-center justify-center ${oscuro ? 'text-slate-400 hover:bg-red-500/20 hover:text-red-300' : 'text-gray-400 hover:bg-red-50 hover:text-red-600'}`}>
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {filtrados.length === 0 && (
              <li className={`px-3 py-4 text-sm text-center ${textoSuave}`}>No hay cargos con ese nombre. Agrégalo abajo.</li>
            )}
          </ul>

          <div className={`p-2 border-t ${oscuro ? 'border-slate-700' : 'border-gray-100'}`}>
            {agregando ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nuevo}
                  onChange={(e) => setNuevo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNuevo(); } }}
                  placeholder="Nombre del cargo"
                  maxLength={40}
                  className={`flex-1 h-10 px-3 rounded-lg border outline-none text-sm ${oscuro ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
                <button type="button" onClick={guardarNuevo} className="h-10 px-4 rounded-lg bg-indigo-600 text-[#fff] text-sm font-bold">Agregar</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setAgregando(true); setNuevo(busqueda.trim()); }}
                className={`w-full h-10 rounded-lg flex items-center justify-center gap-1.5 text-sm font-bold ${oscuro ? 'text-indigo-300 hover:bg-slate-800' : 'text-indigo-600 hover:bg-indigo-50'}`}
              >
                <Plus className="w-4 h-4" />Otro cargo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
