/**
 * Pesar un producto a granel antes de llevarlo al carrito: lo usan Vender y
 * Veterinaria (web y celular). Lee la báscula en vivo (basculaWeb.ts) y, si
 * no hay báscula (celular, app Android o navegador sin puerto serie), deja
 * escribir el peso a mano, igual que Electron.
 */
import { useEffect, useState } from 'react';
import { Scale, X, Loader2, Plug, ShoppingCart, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { useBasculaWeb } from '../hooks/useBasculaWeb';
import { conectarBascula, soporteBascula, tararBascula } from '../lib/basculaWeb';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

interface Props {
  nombre: string;
  precioPorKg: number;
  /** Kilos disponibles; si se pasa, no deja vender más de eso. */
  stockKg?: number;
  onConfirmar: (pesoKg: number) => void;
  onCerrar: () => void;
}

export function ModalPesaje({ nombre, precioPorKg, stockKg, onConfirmar, onCerrar }: Props) {
  const bascula = useBasculaWeb();
  const hayPuerto = soporteBascula();
  const [manual, setManual] = useState(!hayPuerto);
  const [pesoManual, setPesoManual] = useState('');

  // Si la báscula se conecta mientras la ventana está abierta, se usa sola.
  useEffect(() => { if (bascula.conectada) setManual(false); }, [bascula.conectada]);

  const pesoKg = manual ? Math.max(0, parseFloat(pesoManual.replace(',', '.')) || 0) : bascula.pesoKg;
  const total = Math.round(pesoKg * precioPorKg);
  const excede = stockKg !== undefined && pesoKg > stockKg + 0.0005;
  const valido = pesoKg > 0 && !excede;

  const confirmar = () => {
    if (!valido) return;
    onConfirmar(Math.round(pesoKg * 1000) / 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold truncate">{nombre}</p>
              <p className="text-slate-400 text-sm">{money(precioPorKg)} / kg{stockKg !== undefined ? ` · quedan ${stockKg.toFixed(2)} kg` : ''}</p>
            </div>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-white shrink-0" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {manual ? (
          <div>
            <label className="text-slate-400 text-xs font-bold">Peso en kilos</label>
            <input
              autoFocus
              inputMode="decimal"
              value={pesoManual}
              onChange={(e) => setPesoManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmar()}
              placeholder="0.000"
              className="mt-1 w-full h-16 rounded-2xl bg-slate-950 border border-slate-700 text-white text-center text-3xl font-black outline-none focus:border-emerald-500"
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-950 border border-slate-800 p-5 text-center">
            {bascula.conectada ? (
              <>
                <p className="text-slate-400 text-xs mb-1">{bascula.estable ? 'Peso estable' : 'Pesando...'}</p>
                <p className={`text-5xl font-black tabular-nums ${bascula.estable ? 'text-emerald-400' : 'text-amber-400'}`}>{bascula.pesoKg.toFixed(3)}</p>
                <p className="text-slate-500 text-sm">kilogramos</p>
                <button onClick={tararBascula} className="mt-2 text-xs text-emerald-400 underline">Tarar (descontar la bolsa o el recipiente)</button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-400 text-sm">{bascula.error || 'La báscula no está conectada en este equipo.'}</p>
                <button
                  disabled={bascula.conectando}
                  onClick={() => conectarBascula().catch((e) => toast.error(e?.message || 'No se pudo conectar la báscula'))}
                  className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {bascula.conectando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Conectar báscula
                </button>
              </div>
            )}
          </div>
        )}

        {hayPuerto && (
          <button onClick={() => setManual((v) => !v)} className="text-xs text-slate-400 underline flex items-center gap-1 mx-auto">
            <Keyboard className="w-3.5 h-3.5" /> {manual ? 'Usar la báscula' : 'Escribir el peso a mano'}
          </button>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
          <span className="text-slate-300 text-sm">Total</span>
          <span className="text-white text-2xl font-black tabular-nums">{money(total)}</span>
        </div>
        {excede && <p className="text-red-400 text-sm text-center">No hay tanto en inventario: quedan {stockKg?.toFixed(2)} kg.</p>}

        <div className="flex gap-3">
          <button onClick={onCerrar} className="flex-1 h-12 rounded-xl bg-slate-800 text-slate-300 font-semibold">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={!valido}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ color: '#fff' }}
          >
            <ShoppingCart className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
