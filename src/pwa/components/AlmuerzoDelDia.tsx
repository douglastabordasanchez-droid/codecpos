/**
 * Almuerzo del día en el celular (migración 0161, menuDelDiaService.ts).
 *  - TarjetaAlmuerzo: resumen en el salón; el administrador lo edita desde ahí.
 *  - EditorAlmuerzo: el administrador publica en la mañana precio y opciones.
 *  - ElegirAlmuerzo: el mesero elige una opción de cada grupo al pedirlo.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Plus, X, UtensilsCrossed, Pencil, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../app/components/ui/input';
import { Button } from '../../app/components/ui/button';
import {
  GRUPOS_SUGERIDOS, hoyColombia, publicarMenuDelDia, type GrupoAlmuerzo, type MenuDelDia,
} from '../../app/lib/supabase/menuDelDiaService';

const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;

function Hoja({ abierta, onCerrar, children }: { abierta: boolean; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {abierta && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[92vh] flex flex-col"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Resumen en el salón ──────────────────────────────────────────────────────

export function TarjetaAlmuerzo({ menu, esAdmin, onEditar }: { menu: MenuDelDia | null; esAdmin: boolean; onEditar: () => void }) {
  const deHoy = !!menu && menu.fecha === hoyColombia();
  const conOpciones = menu?.grupos.filter((g) => g.opciones.length) ?? [];
  if (!esAdmin && (!deHoy || conOpciones.length === 0)) return null;
  return (
    <div className="px-5 mb-5">
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-black leading-tight">Almuerzo del día</p>
            <p className="text-slate-500 text-xs">
              {!menu ? 'Sin publicar' : deHoy ? `Hoy · ${money(menu.precio)}` : 'Es el menú de otro día: actualízalo'}
            </p>
          </div>
          {esAdmin && (
            <button onClick={onEditar} className="h-9 px-3 rounded-xl bg-emerald-600 text-[#fff] text-xs font-bold flex items-center gap-1.5 shrink-0">
              <Pencil className="w-3.5 h-3.5" /> {menu ? 'Editar' : 'Publicar'}
            </button>
          )}
        </div>
        {conOpciones.length > 0 && (
          <div className="space-y-1">
            {conOpciones.map((g) => (
              <p key={g.nombre} className={`text-xs leading-snug ${deHoy ? 'text-slate-300' : 'text-slate-500'}`}>
                <span className="font-bold">{g.nombre}:</span> {g.opciones.join(' · ')}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor del administrador ─────────────────────────────────────────────────

export function EditorAlmuerzo({
  abierto, clienteId, menu, onCerrar, onPublicado,
}: {
  abierto: boolean; clienteId: string; menu: MenuDelDia | null; onCerrar: () => void; onPublicado: () => void;
}) {
  const inicial = (): GrupoAlmuerzo[] => (menu?.grupos.length ? menu.grupos : GRUPOS_SUGERIDOS).map((g) => ({ ...g, opciones: [...g.opciones] }));
  const [grupos, setGrupos] = useState<GrupoAlmuerzo[]>(inicial);
  const [precio, setPrecio] = useState(menu?.precio ? String(menu.precio) : '');
  const [nuevaOpcion, setNuevaOpcion] = useState<Record<number, string>>({});
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [preparado, setPreparado] = useState(false);
  if (abierto && !preparado) {
    setGrupos(inicial());
    setPrecio(menu?.precio ? String(menu.precio) : '');
    setNuevaOpcion({});
    setPreparado(true);
  }
  if (!abierto && preparado) setPreparado(false);

  const agregarOpcion = (i: number) => {
    const texto = (nuevaOpcion[i] || '').trim();
    if (!texto) return;
    setGrupos((prev) => prev.map((g, j) => (j === i && !g.opciones.includes(texto) ? { ...g, opciones: [...g.opciones, texto] } : g)));
    setNuevaOpcion((prev) => ({ ...prev, [i]: '' }));
  };
  const quitarOpcion = (i: number, o: string) => setGrupos((prev) => prev.map((g, j) => (j === i ? { ...g, opciones: g.opciones.filter((x) => x !== o) } : g)));
  const quitarGrupo = (i: number) => setGrupos((prev) => prev.filter((_, j) => j !== i));
  const agregarGrupo = () => {
    const nombre = nuevoGrupo.trim();
    if (!nombre) return;
    setGrupos((prev) => [...prev, { nombre, opciones: [] }]);
    setNuevoGrupo('');
  };

  const publicar = async () => {
    const valor = Number(precio.replace(/\D/g, '')) || 0;
    if (valor <= 0) { toast.error('Pon el precio del almuerzo'); return; }
    // Lo escrito en una casilla sin tocar «+» también cuenta.
    const finales = grupos.map((g, i) => {
      const pendiente = (nuevaOpcion[i] || '').trim();
      return pendiente && !g.opciones.includes(pendiente) ? { ...g, opciones: [...g.opciones, pendiente] } : g;
    });
    if (!finales.some((g) => g.opciones.length)) { toast.error('Agrega al menos una opción'); return; }
    setGuardando(true);
    try {
      await publicarMenuDelDia(clienteId, finales, valor);
      toast.success('Almuerzo del día publicado', { description: 'Los meseros ya ven las opciones de hoy.' });
      onPublicado();
      onCerrar();
    } catch (e) {
      toast.error('No se pudo publicar', { description: e instanceof Error ? e.message : undefined });
    }
    setGuardando(false);
  };

  return (
    <Hoja abierta={abierto} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-lg leading-tight">Almuerzo del día</p>
          <p className="text-slate-400 text-xs">Escribe las opciones de hoy. Lo de ayer queda para que solo cambies lo nuevo.</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <p className="text-slate-400 text-xs font-bold mb-1.5">Precio del almuerzo</p>
          <Input
            inputMode="numeric"
            value={precio ? Number(precio.replace(/\D/g, '') || 0).toLocaleString('es-CO') : ''}
            onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ''))}
            placeholder="Ej: 15.000"
            className="h-12 bg-slate-900 border-slate-700 text-white text-lg font-black"
          />
        </div>

        {grupos.map((g, i) => (
          <div key={`${g.nombre}-${i}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-white text-sm font-black flex-1">{g.nombre}</p>
              <button onClick={() => quitarGrupo(i)} className="text-slate-500 p-1" aria-label={`Quitar ${g.nombre}`}><Trash2 className="w-4 h-4" /></button>
            </div>
            {g.opciones.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {g.opciones.map((o) => (
                  <span key={o} className="h-8 pl-3 pr-1 rounded-full bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1">
                    {o}
                    <button onClick={() => quitarOpcion(i, o)} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400" aria-label={`Quitar ${o}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={nuevaOpcion[i] || ''}
                onChange={(e) => setNuevaOpcion((prev) => ({ ...prev, [i]: e.target.value.slice(0, 60) }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarOpcion(i); } }}
                placeholder={g.nombre === 'Sopa' ? 'Ej: Ajiaco' : g.nombre === 'Proteína' ? 'Ej: Pollo asado' : 'Escribe una opción'}
                className="h-10 bg-slate-950 border-slate-700 text-white text-sm"
              />
              <button onClick={() => agregarOpcion(i)} className="w-10 h-10 rounded-xl bg-emerald-600 text-[#fff] flex items-center justify-center shrink-0" aria-label="Agregar opción">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={nuevoGrupo}
            onChange={(e) => setNuevoGrupo(e.target.value.slice(0, 40))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarGrupo(); } }}
            placeholder="Otra parte (ej: Postre)"
            className="h-10 bg-slate-900 border-slate-700 text-white text-sm"
          />
          <button onClick={agregarGrupo} className="h-10 px-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold shrink-0">Agregar parte</button>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-slate-800 shrink-0">
        <Button onClick={publicar} disabled={guardando} className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-700 disabled:opacity-50">
          {guardando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
          Publicar almuerzo de hoy
        </Button>
      </div>
    </Hoja>
  );
}

// ── Selector del mesero ──────────────────────────────────────────────────────

export function ElegirAlmuerzo({
  abierto, menu, onCerrar, onElegir,
}: {
  abierto: boolean; menu: MenuDelDia | null; onCerrar: () => void; onElegir: (texto: string) => void;
}) {
  const grupos = (menu?.grupos ?? []).filter((g) => g.opciones.length);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [preparado, setPreparado] = useState(false);
  if (abierto && !preparado) {
    // Si un grupo tiene una sola opción, va marcada de una vez.
    setEleccion(Object.fromEntries(grupos.filter((g) => g.opciones.length === 1).map((g) => [g.nombre, g.opciones[0]])));
    setPreparado(true);
  }
  if (!abierto && preparado) setPreparado(false);

  const faltan = grupos.filter((g) => !eleccion[g.nombre]).length;
  const confirmar = () => {
    onElegir(grupos.filter((g) => eleccion[g.nombre]).map((g) => `${g.nombre}: ${eleccion[g.nombre]}`).join(', '));
  };

  return (
    <Hoja abierta={abierto} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-lg leading-tight">Almuerzo del día</p>
          <p className="text-slate-400 text-xs">Toca una opción de cada parte · {money(menu?.precio || 0)}</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1.5">{g.nombre}</p>
            <div className="flex flex-wrap gap-2">
              {g.opciones.map((o) => {
                const activo = eleccion[g.nombre] === o;
                return (
                  <button
                    key={o}
                    onClick={() => setEleccion((prev) => ({ ...prev, [g.nombre]: activo ? '' : o }))}
                    className={`min-h-11 px-4 rounded-2xl text-sm font-bold border-2 transition-all ${activo ? 'bg-emerald-600 border-emerald-600 text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-200'}`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-slate-800 shrink-0">
        <Button onClick={confirmar} className="w-full h-14 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600">
          <Check className="w-5 h-5 mr-2" />
          {faltan > 0 ? `Agregar (faltan ${faltan === 1 ? '1 parte' : `${faltan} partes`})` : 'Agregar almuerzo'}
        </Button>
      </div>
    </Hoja>
  );
}
