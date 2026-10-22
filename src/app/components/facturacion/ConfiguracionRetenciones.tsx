/**
 * Facturación › Retenciones: retención en la fuente y ReteICA que le
 * practican al negocio sus clientes agentes de retención. Se guarda en el
 * perfil fiscal (migración 0123), así vale igual en Electron, web y celular.
 * La factura las lleva solo cuando el cliente está marcado como agente en
 * Facturación › Clientes y se alcanza la base mínima.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Percent, X } from 'lucide-react';
import { actualizarPerfilFiscal } from '../../lib/supabase/fiscalProfileService';
import type { ConfiguracionRetenciones as Config, FiscalProfile } from '../../lib/dian/types';

interface Props {
  perfil: FiscalProfile;
  soloLectura?: boolean;
  onGuardado: () => void;
}

const POR_DEFECTO: Config = {
  retefuenteActiva: false,
  retefuentePorcentaje: 2.5,
  retefuenteBaseMinima: 0,
  reteicaActiva: false,
  reteicaTarifaPorMil: 0,
  reteicaBaseMinima: 0,
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const numero = (v: string) => Number(v.replace(',', '.')) || 0;

export function ConfiguracionRetenciones({ perfil, soloLectura, onGuardado }: Props) {
  const actual = perfil.retenciones || POR_DEFECTO;
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Config>(actual);
  const [actividad, setActividad] = useState(perfil.actividadEconomica || '');
  const [guardando, setGuardando] = useState(false);

  const resumen = [
    actual.retefuenteActiva ? `ReteFuente ${actual.retefuentePorcentaje}%` : '',
    actual.reteicaActiva ? `ReteICA ${actual.reteicaTarifaPorMil} por mil` : '',
  ].filter(Boolean).join(' · ');

  async function guardar() {
    if (!perfil.id) return;
    setGuardando(true);
    try {
      await actualizarPerfilFiscal(perfil.id, { retenciones: form, actividadEconomica: actividad.trim() });
      toast.success('Retenciones guardadas', { description: 'Aplican a los clientes marcados como agentes de retención.' });
      setAbierto(false);
      onGuardado();
    } catch (e: any) {
      toast.error('No se guardaron las retenciones', { description: e?.message });
    } finally {
      setGuardando(false);
    }
  }

  const campo = 'w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

  return (
    <>
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${resumen ? 'bg-emerald-500/15' : 'bg-slate-800'}`}>
          <Percent className={`w-4 h-4 ${resumen ? 'text-emerald-400' : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-bold">Retenciones (ReteFuente y ReteICA)</p>
          <p className="text-slate-400 text-xs">
            {resumen
              ? `${resumen}. Se aplican a los clientes marcados como agentes de retención.`
              : 'Desactivadas: ninguna factura lleva retenciones.'}
          </p>
        </div>
        {!soloLectura && (
          <button onClick={() => { setForm(actual); setActividad(perfil.actividadEconomica || ''); setAbierto(true); }} className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold">
            Configurar
          </button>
        )}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p className="font-bold text-white">Retenciones</p>
              <button onClick={() => setAbierto(false)} className="text-slate-400" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-slate-400 text-xs">
              Son las que le descuentan sus clientes agentes de retención al pagarle. La factura las informa a la DIAN y
              muestra el valor neto a pagar. Confirme las tarifas con su contador.
            </p>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-white font-bold">
                <input type="checkbox" checked={form.retefuenteActiva} onChange={(e) => setForm({ ...form, retefuenteActiva: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                Retención en la fuente
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400 space-y-1">
                  <span>Porcentaje (%)</span>
                  <input defaultValue={String(form.retefuentePorcentaje)} onChange={(e) => setForm({ ...form, retefuentePorcentaje: numero(e.target.value) })} inputMode="decimal" className={campo} disabled={!form.retefuenteActiva} />
                </label>
                <label className="text-xs text-slate-400 space-y-1">
                  <span>Base mínima ($)</span>
                  <input defaultValue={String(form.retefuenteBaseMinima)} onChange={(e) => setForm({ ...form, retefuenteBaseMinima: numero(e.target.value) })} inputMode="numeric" className={campo} disabled={!form.retefuenteActiva} />
                </label>
              </div>
              <p className="text-slate-500 text-[11px]">Compras en general: 2,5 % desde 27 UVT (antes de IVA).</p>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-white font-bold">
                <input type="checkbox" checked={form.reteicaActiva} onChange={(e) => setForm({ ...form, reteicaActiva: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                ReteICA
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400 space-y-1">
                  <span>Tarifa (por mil)</span>
                  <input defaultValue={String(form.reteicaTarifaPorMil)} onChange={(e) => setForm({ ...form, reteicaTarifaPorMil: numero(e.target.value) })} inputMode="decimal" className={campo} disabled={!form.reteicaActiva} />
                </label>
                <label className="text-xs text-slate-400 space-y-1">
                  <span>Base mínima ($)</span>
                  <input defaultValue={String(form.reteicaBaseMinima)} onChange={(e) => setForm({ ...form, reteicaBaseMinima: numero(e.target.value) })} inputMode="numeric" className={campo} disabled={!form.reteicaActiva} />
                </label>
              </div>
              <p className="text-slate-500 text-[11px]">
                Es la tarifa de ICA de su actividad en su municipio (ejemplo: Bogotá, comercio al por menor 11,04 por mil).
              </p>
            </div>

            <label className="block text-xs text-slate-400 space-y-1">
              <span>Actividad económica (código CIIU, sale en la factura)</span>
              <input value={actividad} onChange={(e) => setActividad(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4719" inputMode="numeric" className={campo} />
            </label>

            {(form.retefuenteActiva || form.reteicaActiva) && (
              <p className="text-slate-400 text-xs">
                Ejemplo, venta de {pesos(1000000)} antes de IVA a un agente de retención:
                {form.retefuenteActiva && ` ReteFuente ${pesos(1000000 * form.retefuentePorcentaje / 100)}`}
                {form.retefuenteActiva && form.reteicaActiva && ','}
                {form.reteicaActiva && ` ReteICA ${pesos(1000000 * form.reteicaTarifaPorMil / 1000)}`}.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="h-10 px-4 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
