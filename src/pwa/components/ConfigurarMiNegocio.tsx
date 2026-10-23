/**
 * Configurar mi negocio — web/celular. Mismas opciones que Electron
 * (Configuración > Mi negocio): tipo de negocio, nombre, propina, cambio de
 * precio e IVA. Lo que se guarde aquí también queda en Electron, y al revés.
 */
import { useEffect, useState } from 'react';
import {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors, UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star, Trophy, BookOpen,
  Briefcase, Check, Loader2, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { TIPOS_NEGOCIO } from '../../data/tipos-negocio';
import { MODULOS_ESPECIALIZADOS, MODULO_POR_TIPO, ocultosParaTipo } from '../../data/modulosEspecializados';
import { useMiNegocio, guardarMiNegocio, ivaDisponible, type MiNegocio } from '../hooks/useMiNegocio';
import type { ConfigIva } from '../../app/lib/dian/configIva';
import { AplicarIvaProductos } from '../../app/components/settings/AplicarIvaProductos';

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

export function ConfigurarMiNegocio({ embebido = false }: { embebido?: boolean } = {}) {
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
      await guardarMiNegocio(form, miNegocio);
      toast.success('Mi negocio guardado', { description: `${tipo?.nombre || form.tipoNegocio}. También se aplica en Electron.` });
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    }
    setGuardando(false);
  };

  return (
    <div className={embebido ? 'space-y-5' : 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-5'}>
      <div>
        {!embebido && (
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Configurar mi negocio</span>
          </div>
        )}
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
                // Elegir el tipo deja el sistema listo para ese negocio: muestra su módulo y oculta los demás especializados.
                onClick={() => setForm({ ...form, tipoNegocio: t.id, modulosOcultos: ocultosParaTipo(t.id, form.modulosOcultos) })}
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

      <div>
        <p className="text-slate-400 text-xs mb-1">Módulos de tu negocio</p>
        <p className="text-slate-500 text-[11px] mb-2">Lo que actives aquí aparece en la web, el celular y Electron; lo apagado se oculta en todo el sistema.</p>
        <div className="space-y-2">
          {MODULOS_ESPECIALIZADOS.map((m) => {
            const contratado = form.modulosContratados.includes(m.id);
            const visible = contratado && !form.modulosOcultos.includes(m.id);
            const sugerido = MODULO_POR_TIPO[form.tipoNegocio] === m.id;
            return (
              <div key={m.id} className={`flex items-center gap-3 rounded-xl border p-3 ${visible ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold flex items-center gap-2">
                    {m.nombre}
                    {sugerido && <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-bold">Para tu tipo</span>}
                  </p>
                  <p className="text-slate-500 text-[11px] truncate">{m.descripcion}</p>
                </div>
                {contratado ? (
                  <Interruptor
                    activo={visible}
                    etiqueta={m.nombre}
                    onClick={() => setForm({
                      ...form,
                      modulosOcultos: visible ? [...form.modulosOcultos, m.id] : form.modulosOcultos.filter((x) => x !== m.id),
                    })}
                  />
                ) : (
                  <a
                    href={`https://wa.me/573238646844?text=${encodeURIComponent(`Hola, quiero activar el módulo ${m.nombre} en Codec POS.`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-[11px] font-bold text-amber-400 border border-amber-500/40 rounded-lg px-2 py-1"
                  >
                    Pedir
                  </a>
                )}
              </div>
            );
          })}
        </div>
        {MODULO_POR_TIPO[form.tipoNegocio] && !form.modulosContratados.includes(MODULO_POR_TIPO[form.tipoNegocio]!) && (
          <p className="text-amber-400 text-[11px] mt-2">Tu plan aún no incluye el módulo de este tipo de negocio. Tócale «Pedir» y te lo activamos.</p>
        )}
        {form.tipoNegocio === 'ropa' && <p className="text-slate-400 text-[11px] mt-2">Modo ropa: talla y color en productos y al vender, y filtro por talla.</p>}
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

      {ivaDisponible() && <SeccionIva iva={form.iva} onChange={(iva) => setForm({ ...form, iva })} />}

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

const TARIFAS_IVA = [19, 5];

/** IVA del negocio: lo mismo que Electron en Configuración › IVA. */
function SeccionIva({ iva, onChange }: { iva: ConfigIva; onChange: (iva: ConfigIva) => void }) {
  const opcion = (activa: boolean) =>
    `text-left rounded-xl border p-3 transition-all ${activa ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/40'}`;
  // Ejemplo con un precio de $100.000.
  const precio = 100000;
  const base = iva.incluidoEnPrecio ? Math.round(precio / (1 + iva.porcentaje / 100)) : precio;
  const total = iva.incluidoEnPrecio ? precio : Math.round(precio * (1 + iva.porcentaje / 100));
  const pesos = (n: number) => `$${n.toLocaleString('es-CO')}`;

  return (
    <div className="space-y-3 border-t border-slate-800 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-white text-sm font-semibold">Cobrar IVA</p>
          <p className="text-slate-500 text-xs">
            {iva.habilitado ? 'Las ventas y las facturas electrónicas llevan IVA.' : 'Apagado: las ventas y las facturas salen sin IVA.'}
          </p>
        </div>
        <Interruptor activo={iva.habilitado} etiqueta="Cobrar IVA" onClick={() => onChange({ ...iva, habilitado: !iva.habilitado })} />
      </div>

      {iva.habilitado && (
        <>
          <div>
            <p className="text-slate-400 text-xs mb-1.5">Tarifa de IVA</p>
            <div className="flex items-center gap-2">
              {TARIFAS_IVA.map((t) => (
                <button key={t} type="button" onClick={() => onChange({ ...iva, porcentaje: t })}
                  className={`h-10 px-4 rounded-lg border text-sm font-bold ${iva.porcentaje === t ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-800 text-slate-300'}`}>
                  {t} %
                </button>
              ))}
              <input
                type="number" inputMode="decimal" min={0} max={100} value={iva.porcentaje} aria-label="Otra tarifa de IVA"
                onChange={(e) => onChange({ ...iva, porcentaje: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className="w-20 h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm text-right"
              />
              <span className="text-slate-400 text-sm">%</span>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs mb-1.5">El precio de los productos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" className={opcion(iva.incluidoEnPrecio)} onClick={() => onChange({ ...iva, incluidoEnPrecio: true })}>
                <p className="text-white text-sm font-semibold">Ya incluye el IVA</p>
                <p className="text-slate-500 text-[11px]">El cliente paga el precio; el IVA sale de adentro.</p>
              </button>
              <button type="button" className={opcion(!iva.incluidoEnPrecio)} onClick={() => onChange({ ...iva, incluidoEnPrecio: false })}>
                <p className="text-white text-sm font-semibold">El IVA se suma encima</p>
                <p className="text-slate-500 text-[11px]">Al precio se le agrega el IVA al cobrar.</p>
              </button>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs mb-1.5">A qué productos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" className={opcion(iva.todosLosProductos)} onClick={() => onChange({ ...iva, todosLosProductos: true })}>
                <p className="text-white text-sm font-semibold">A todos</p>
                <p className="text-slate-500 text-[11px]">Todos llevan el IVA, aunque el producto diga 0 %.</p>
              </button>
              <button type="button" className={opcion(!iva.todosLosProductos)} onClick={() => onChange({ ...iva, todosLosProductos: false })}>
                <p className="text-white text-sm font-semibold">Según cada producto</p>
                <p className="text-slate-500 text-[11px]">Solo los que tienen IVA en su ficha; los demás, exentos o excluidos.</p>
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-xs space-y-1 font-mono">
            <p className="text-slate-500 font-sans">Ejemplo con un producto de {pesos(precio)}</p>
            <div className="flex justify-between"><span className="text-slate-400">Total bruto</span><span className="text-white">{pesos(base)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">IVA {iva.porcentaje} %</span><span className="text-emerald-400">{pesos(total - base)}</span></div>
            <div className="flex justify-between border-t border-slate-800 pt-1 font-bold"><span className="text-white">Total a pagar</span><span className="text-white">{pesos(total)}</span></div>
          </div>

          {iva.porcentaje > 0 && <AplicarIvaProductos porcentaje={iva.porcentaje} />}
        </>
      )}
      <p className="text-slate-500 text-[11px]">Es el mismo IVA de Electron (Configuración › IVA): lo que cambies aquí se aplica en la web, el celular y Electron.</p>
    </div>
  );
}
