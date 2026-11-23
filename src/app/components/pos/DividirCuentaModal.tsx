/**
 * Dividir la cuenta de una mesa entre varias personas (amigos que pagan cada uno
 * lo suyo). Se elige cuántas personas (2 a 8, por defecto 4), se toca a una persona
 * y luego los productos que se le asignan. Cada persona se cobra por separado:
 * se lleva al punto de venta solo lo suyo y la mesa sigue abierta con lo demás
 * (ver cobro parcial en POSPageNew.limpiarCuentaPanaderia).
 *
 * El reparto se guarda por mesa en este equipo (codecpos_division_<mesa>), así al
 * volver de cobrar a la Persona 1 siguen asignados los de la 2, la 3 y la 4.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Users, X } from 'lucide-react';

export interface ItemDivision { producto: { id: string; nombre: string; precio: number }; cantidad: number }

/** Reparto: por persona, cuántas unidades de cada producto. */
type Reparto = Record<number, Record<string, number>>;

const COLORES = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];
const clave = (mesaId: string) => `codecpos_division_${mesaId}`;
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export function leerDivision(mesaId: string): { personas: number; reparto: Reparto } | null {
  try { return JSON.parse(localStorage.getItem(clave(mesaId)) || 'null'); } catch { return null; }
}
export function guardarDivision(mesaId: string, d: { personas: number; reparto: Reparto } | null) {
  try {
    if (d) localStorage.setItem(clave(mesaId), JSON.stringify(d));
    else localStorage.removeItem(clave(mesaId));
  } catch { /* sin almacenamiento */ }
}

interface Props {
  mesaId: string;
  mesaNombre: string;
  items: ItemDivision[];
  oscuro?: boolean;
  onCobrar: (persona: number, items: ItemDivision[]) => void;
  onCerrar: () => void;
}

export function DividirCuentaModal({ mesaId, mesaNombre, items, oscuro = false, onCobrar, onCerrar }: Props) {
  const guardada = leerDivision(mesaId);
  const [personas, setPersonas] = useState<number>(guardada?.personas || 4);
  const [activa, setActiva] = useState(1);
  const [reparto, setReparto] = useState<Reparto>(() => guardada?.reparto || {});

  // Unidades por producto en la cuenta (se suman si el mismo producto está en varias líneas).
  const enCuenta = useMemo(() => {
    const m = new Map<string, ItemDivision>();
    for (const it of items) {
      const id = String(it.producto.id);
      const ya = m.get(id);
      if (ya) ya.cantidad += Number(it.cantidad) || 0;
      else m.set(id, { producto: it.producto, cantidad: Number(it.cantidad) || 0 });
    }
    return m;
  }, [items]);

  // Si la cuenta cambió (se cobró a alguien, se agregó o quitó algo), el reparto se ajusta.
  const repartoValido = useMemo(() => {
    const libre = new Map([...enCuenta].map(([id, it]) => [id, it.cantidad]));
    const r: Reparto = {};
    for (let p = 1; p <= personas; p++) {
      for (const [id, n] of Object.entries(reparto[p] || {})) {
        const queda = libre.get(id) || 0;
        const toma = Math.min(queda, n);
        if (toma > 0) { (r[p] ||= {})[id] = toma; libre.set(id, queda - toma); }
      }
    }
    return r;
  }, [reparto, enCuenta, personas]);

  useEffect(() => { guardarDivision(mesaId, { personas, reparto: repartoValido }); }, [mesaId, personas, repartoValido]);

  const asignadas = (id: string) => Object.values(repartoValido).reduce((s, x) => s + (x[id] || 0), 0);
  const sinAsignar = [...enCuenta.values()].map((it) => ({ ...it, cantidad: it.cantidad - asignadas(String(it.producto.id)) })).filter((it) => it.cantidad > 0);
  const itemsDe = (p: number): ItemDivision[] => Object.entries(repartoValido[p] || {})
    .map(([id, n]) => ({ producto: enCuenta.get(id)!.producto, cantidad: n }))
    .filter((it) => it.producto && it.cantidad > 0);
  const totalDe = (p: number) => itemsDe(p).reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
  const totalSinAsignar = sinAsignar.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);

  const asignar = (id: string, delta: 1 | -1, p = activa) => setReparto(() => {
    const r: Reparto = JSON.parse(JSON.stringify(repartoValido));
    const actual = r[p]?.[id] || 0;
    const nuevo = actual + delta;
    if (delta > 0 && asignadas(id) >= (enCuenta.get(id)?.cantidad || 0)) return r;
    if (nuevo <= 0) { if (r[p]) delete r[p][id]; } else (r[p] ||= {})[id] = nuevo;
    return r;
  });
  // Lo que queda sin asignar se le pasa todo a la persona elegida.
  const pasarResto = () => setReparto(() => {
    const r: Reparto = JSON.parse(JSON.stringify(repartoValido));
    for (const it of sinAsignar) (r[activa] ||= {})[String(it.producto.id)] = (r[activa]?.[String(it.producto.id)] || 0) + it.cantidad;
    return r;
  });

  const fondo = oscuro ? 'bg-slate-900 text-white' : 'bg-white text-slate-900';
  const tarjeta = oscuro ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';
  const suave = oscuro ? 'text-slate-400' : 'text-slate-500';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3" style={{ background: 'rgba(15,23,42,.6)' }} role="dialog" aria-modal="true" aria-label="Dividir la cuenta">
      <div className={`w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col ${fondo}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-500/20">
          <Users className="w-6 h-6 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-black">Dividir la cuenta · {mesaNombre}</p>
            <p className={`text-sm ${suave}`}>Toca una persona y luego los productos que pagó. Cada una se cobra por separado.</p>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-sm mr-1 ${suave}`}>Personas</span>
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <button key={n} type="button" onClick={() => { setPersonas(n); if (activa > n) setActiva(1); }}
                className={`w-9 h-9 rounded-xl text-sm font-black ${personas === n ? 'bg-amber-500 text-slate-900' : oscuro ? 'bg-slate-800' : 'bg-slate-100'}`}>{n}</button>
            ))}
          </div>
          <button type="button" onClick={onCerrar} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-500/20" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          {/* Productos de la mesa sin asignar */}
          <div className={`rounded-2xl border p-3 ${tarjeta}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-black">Sin asignar · {pesos(totalSinAsignar)}</p>
              {sinAsignar.length > 0 && (
                <button type="button" onClick={pasarResto} className="text-xs font-bold px-2 py-1 rounded-lg text-[#fff]" style={{ background: COLORES[(activa - 1) % COLORES.length] }}>
                  Todo a Persona {activa}
                </button>
              )}
            </div>
            {sinAsignar.length === 0 ? (
              <p className={`text-sm py-6 text-center ${suave}`}>Todo está asignado.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sinAsignar.map((it) => (
                  <button key={it.producto.id} type="button" onClick={() => asignar(String(it.producto.id), 1)}
                    className={`text-left rounded-xl border px-3 py-2 active:scale-95 transition ${oscuro ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <p className="font-bold leading-tight">{it.producto.nombre}</p>
                    <p className={`text-xs ${suave}`}>{it.cantidad} sin asignar · {pesos(it.producto.precio)} c/u</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Personas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            {Array.from({ length: personas }, (_, i) => i + 1).map((p) => {
              const color = COLORES[(p - 1) % COLORES.length];
              const suyos = itemsDe(p);
              const total = totalDe(p);
              const sel = p === activa;
              return (
                <div key={p} onClick={() => setActiva(p)} role="button" tabIndex={0}
                  className={`rounded-2xl border-2 p-3 cursor-pointer transition ${tarjeta}`}
                  style={{ borderColor: sel ? color : 'transparent', boxShadow: sel ? `0 0 0 3px ${color}33` : undefined }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded-lg text-sm font-black text-[#fff]" style={{ background: color }}>Persona {p}</span>
                    <span className="text-lg font-black">{pesos(total)}</span>
                  </div>
                  {suyos.length === 0 ? (
                    <p className={`text-xs py-2 ${suave}`}>{sel ? 'Toca productos de la izquierda para asignárselos.' : 'Tócala para asignarle productos.'}</p>
                  ) : (
                    <ul className="space-y-1 mb-2">
                      {suyos.map((it) => (
                        <li key={it.producto.id} className="flex items-center gap-2 text-sm">
                          <button type="button" onClick={(e) => { e.stopPropagation(); asignar(String(it.producto.id), -1, p); }}
                            className="w-6 h-6 rounded-md bg-slate-500/20 flex items-center justify-center shrink-0" aria-label="Quitar uno"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="flex-1 min-w-0 truncate">{it.cantidad} × {it.producto.nombre}</span>
                          <span className="font-bold">{pesos(it.producto.precio * it.cantidad)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" disabled={suyos.length === 0}
                    onClick={(e) => { e.stopPropagation(); onCobrar(p, suyos); }}
                    className="w-full h-11 rounded-xl font-black text-[#fff] disabled:opacity-40" style={{ background: color }}>
                    Cobrar Persona {p} {total > 0 ? pesos(total) : ''}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
