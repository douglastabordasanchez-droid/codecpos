/**
 * Configurar mi negocio — web/celular. Mismas opciones que Electron
 * (Configuración > Mi negocio): tipo de negocio, nombre, propina y cambio de
 * precio. Lo que se guarde aquí también queda en Electron, y al revés.
 */
import { useEffect, useState } from 'react';
import {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors, UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star, Trophy, BookOpen,
  Briefcase, Check, Loader2, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { TIPOS_NEGOCIO } from '../../data/tipos-negocio';
import { useMiNegocio, guardarMiNegocio, type MiNegocio } from '../hooks/useMiNegocio';

const ICONOS: Record<string, LucideIcon> = {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors, UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star, Trophy, BookOpen,
};

function Interruptor({ activo, onClick, etiqueta }: { activo: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onClick}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${activo ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <span className={`absolute top-1 w-5 h-5 rounded-full transition-all ${activo ? 'left-6' : 'left-1'}`} style={{ background: '#ffffff' }} />
    </button>
  );
}

export function ConfigurarMiNegocio() {
  const { miNegocio } = useMiNegocio();
  const [form, setForm] = useState<MiNegocio | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (miNegocio && !form) setForm(miNegocio); }, [miNegocio, form]);

  if (!form) {
    return <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex justify-center"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>;
  }

  const cambios = JSON.stringify(form) !== JSON.stringify(miNegocio);
  const tipo = TIPOS_NEGOCIO[form.tipoNegocio];

  const guardar = async () => {
    if (!form.nombreNegocio.trim()) { toast.error('Escribe el nombre de tu negocio'); return; }
    setGuardando(true);
    try {
      await guardarMiNegocio(form);
      toast.success('Mi negocio guardado', { description: `${tipo?.nombre || form.tipoNegocio}. También se aplica en Electron.` });
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    }
    setGuardando(false);
  };

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Configurar mi negocio</span>
        </div>
        <p className="text-slate-500 text-xs">Lo mismo que en Electron, en Configuración › Mi negocio. Lo que cambies aquí se aplica en todo el sistema.</p>
      </div>

      <div>
        <p className="text-slate-400 text-xs mb-1.5">Nombre del negocio</p>
        <input
          value={form.nombreNegocio}
          onChange={(e) => setForm({ ...form, nombreNegocio: e.target.value })}
          maxLength={120}
          className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm"
        />
      </div>

      <div>
        <p className="text-slate-400 text-xs mb-2">Tipo de negocio</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.values(TIPOS_NEGOCIO).map((t) => {
            const Icono = ICONOS[t.icono] || Store;
            const activo = form.tipoNegocio === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm({ ...form, tipoNegocio: t.id })}
                className={`relative text-left rounded-xl p-3 border transition-all ${activo ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}
              >
                {activo && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center"><Check className="w-3 h-3 text-slate-950" /></span>}
                <Icono className={`w-5 h-5 mb-1.5 ${activo ? 'text-amber-400' : 'text-slate-400'}`} />
                <p className={`text-xs font-semibold leading-tight ${activo ? 'text-white' : 'text-slate-300'}`}>{t.nombre}</p>
              </button>
            );
          })}
        </div>
        {tipo && (
          <p className="text-slate-500 text-[11px] mt-2">
            Categorías sugeridas: {tipo.categorias.slice(0, 5).join(', ')}{tipo.categorias.length > 5 ? '…' : ''}.
            {tipo.atributosEspeciales.length > 0 && ` Datos extra de cada producto: ${tipo.atributosEspeciales.slice(0, 4).join(', ')}.`}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-semibold">Propina sugerida</p>
            <p className="text-slate-500 text-xs">Se suma al cobrar; el cliente puede quitarla.</p>
          </div>
          <Interruptor activo={form.propinaActiva} etiqueta="Propina" onClick={() => setForm({ ...form, propinaActiva: !form.propinaActiva })} />
        </div>
        {form.propinaActiva && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs w-28">Porcentaje</span>
            <input
              type="number" inputMode="decimal" min={0} max={100} value={form.porcentajePropina}
              onChange={(e) => setForm({ ...form, porcentajePropina: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              className="w-24 h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm text-right"
            />
            <span className="text-slate-400 text-sm">%</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-semibold">Permitir cambiar el precio al vender</p>
            <p className="text-slate-500 text-xs">El cajero puede ajustar el precio de una línea en el cobro.</p>
          </div>
          <Interruptor activo={form.permitirModificarPrecio} etiqueta="Cambiar precio" onClick={() => setForm({ ...form, permitirModificarPrecio: !form.permitirModificarPrecio })} />
        </div>
      </div>

      <button
        onClick={guardar}
        disabled={!cambios || guardando}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ color: '#ffffff' }}
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {cambios ? 'Guardar cambios' : 'Guardado'}
      </button>
    </div>
  );
}
