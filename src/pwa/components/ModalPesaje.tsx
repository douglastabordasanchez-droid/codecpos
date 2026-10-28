/**
 * Pesar un producto a granel antes de llevarlo al carrito. Es la MISMA
 * ventana en Vender y Veterinaria de la web y el celular, y en la caja y
 * Veterinaria de Electron (`claro` = Electron en modo claro). Lee la báscula
 * en vivo (basculaWeb.ts) y, si no hay báscula (celular, app Android,
 * navegador sin puerto serie o báscula apagada), deja escribir el peso a mano
 * en kilos, gramos o miligramos.
 */
import { useEffect, useRef, useState } from 'react';
import { Scale, X, Loader2, Plug, ShoppingCart, Keyboard, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useBasculaWeb } from '../hooks/useBasculaWeb';
import { conectarBascula, formatoPeso, soporteBascula, tararBascula, type UnidadBascula } from '../lib/basculaWeb';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const KG_POR_UNIDAD: Record<UnidadBascula, number> = { kg: 1, g: 0.001, mg: 0.000001 };
const NOMBRE_UNIDAD: Record<UnidadBascula, string> = { kg: 'Kilos', g: 'Gramos', mg: 'Miligramos' };

interface Props {
  nombre: string;
  precioPorKg: number;
  /** Kilos disponibles; si se pasa, no deja vender más de eso. */
  stockKg?: number;
  onConfirmar: (pesoKg: number) => void;
  onCerrar: () => void;
  /** Electron en modo claro; la web usa la paleta slate (themeClaro.css la repinta). */
  claro?: boolean;
}

export function ModalPesaje({ nombre, precioPorKg, stockKg, onConfirmar, onCerrar, claro = false }: Props) {
  const bascula = useBasculaWeb();
  const hayPuerto = soporteBascula();
  const [manual, setManual] = useState(!hayPuerto);
  const [pesoManual, setPesoManual] = useState('');
  const [unidadManual, setUnidadManual] = useState<UnidadBascula>('kg');
  // Conectada pero sin peso un buen rato: se avisa qué revisar.
  const [sinPesoHaceRato, setSinPesoHaceRato] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);

  // Si la báscula se conecta mientras la ventana está abierta, se usa sola.
  useEffect(() => { if (bascula.conectada) setManual(false); }, [bascula.conectada]);
  useEffect(() => {
    window.clearTimeout(temporizador.current);
    setSinPesoHaceRato(false);
    if (bascula.conectada && !manual && bascula.pesoKg === 0) {
      temporizador.current = window.setTimeout(() => setSinPesoHaceRato(true), 4000);
    }
    return () => window.clearTimeout(temporizador.current);
  }, [bascula.conectada, bascula.pesoKg, manual]);

  const numeroManual = Math.max(0, parseFloat(pesoManual.replace(',', '.')) || 0);
  const pesoKg = manual ? numeroManual * KG_POR_UNIDAD[unidadManual] : bascula.pesoKg;
  const total = Math.round(pesoKg * precioPorKg);
  const excede = stockKg !== undefined && pesoKg > stockKg + 0.0000005;
  const valido = pesoKg > 0 && !excede;

  const confirmar = () => {
    if (!valido) return;
    onConfirmar(Math.round(pesoKg * 1e6) / 1e6);
  };

  // Enter agrega también cuando se pesa con la báscula (sin tocar el mouse).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'Enter' && !manual) confirmar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const t = claro
    ? {
        hoja: 'bg-white border border-gray-200', texto: 'text-gray-900', suave: 'text-gray-500', caja: 'bg-gray-50 border border-gray-200',
        campo: 'bg-white border border-gray-300 text-gray-900', chip: 'bg-gray-50 border border-gray-200 text-gray-600',
        total: 'bg-emerald-50 border border-emerald-200', totalTxt: 'text-gray-900', cancelar: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        estable: 'text-emerald-600', pesando: 'text-amber-600', aviso: 'bg-amber-50 border border-amber-200 text-amber-800',
      }
    : {
        hoja: 'bg-slate-900 border border-slate-800', texto: 'text-white', suave: 'text-slate-400', caja: 'bg-slate-950 border border-slate-800',
        campo: 'bg-slate-950 border border-slate-700 text-white', chip: 'bg-slate-950 border border-slate-800 text-slate-300',
        total: 'bg-emerald-500/10 border border-emerald-500/30', totalTxt: 'text-white', cancelar: 'bg-slate-800 text-slate-300',
        estable: 'text-emerald-400', pesando: 'text-amber-400', aviso: 'bg-amber-500/10 border border-amber-500/30 text-amber-300',
      };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className={`w-full sm:max-w-md ${t.hoja} rounded-t-3xl sm:rounded-3xl p-6 space-y-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className={`${t.texto} font-bold truncate`}>{nombre}</p>
              <p className={`${t.suave} text-sm`}>{money(precioPorKg)} / kg{stockKg !== undefined ? ` · quedan ${formatoPeso(stockKg)}` : ''}</p>
            </div>
          </div>
          <button onClick={onCerrar} className={`${t.suave} shrink-0`} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {manual ? (
          <div className="space-y-2">
            <label className={`${t.suave} text-xs font-bold`}>Escribe el peso</label>
            <input
              autoFocus
              inputMode="decimal"
              value={pesoManual}
              onChange={(e) => setPesoManual(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && confirmar()}
              placeholder={unidadManual === 'kg' ? '0.500' : unidadManual === 'g' ? '500' : '250'}
              className={`w-full h-16 rounded-2xl ${t.campo} text-center text-3xl font-black outline-none focus:border-emerald-500`}
            />
            <div className="grid grid-cols-3 gap-2">
              {(['kg', 'g', 'mg'] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnidadManual(u)}
                  className={`h-10 rounded-xl text-sm font-bold ${unidadManual === u ? 'bg-amber-500 text-slate-950' : t.chip}`}>
                  {NOMBRE_UNIDAD[u]}
                </button>
              ))}
            </div>
            {pesoKg > 0 && unidadManual !== 'kg' && <p className={`${t.suave} text-xs text-center`}>= {pesoKg.toLocaleString('es-CO', { maximumFractionDigits: 6 })} kg</p>}
          </div>
        ) : (
          <div className={`rounded-2xl ${t.caja} p-5 text-center`}>
            {bascula.conectada ? (
              <>
                <p className={`${t.suave} text-xs mb-1`}>{bascula.pesoKg === 0 ? 'Pon el producto en la báscula' : bascula.estable ? 'Peso estable' : 'Pesando...'}</p>
                <p className={`text-5xl font-black tabular-nums ${bascula.estable ? t.estable : t.pesando}`}>{formatoPeso(bascula.pesoKg)}</p>
                {bascula.pesoKg > 0 && bascula.pesoKg < 1 && (
                  <p className={`${t.suave} text-sm`}>= {bascula.pesoKg.toLocaleString('es-CO', { maximumFractionDigits: 6 })} kg</p>
                )}
                <button onClick={tararBascula} className="mt-2 text-xs text-emerald-500 underline">Tarar (descontar la bolsa o el recipiente)</button>
                {sinPesoHaceRato && (
                  <div className={`mt-3 rounded-xl ${t.aviso} px-3 py-2 text-xs text-left space-y-1`}>
                    <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> La báscula está conectada pero no manda peso</p>
                    <p>Pon el producto encima y espera un momento. Si sigue en 0, revisa en Dispositivos la velocidad y el comando, o escribe el peso a mano.</p>
                    <p className="font-mono opacity-80">Lo que llega: {bascula.ultimaTrama || 'nada todavía'}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className={`${t.suave} text-sm`}>{bascula.conectando ? 'Buscando la báscula…' : bascula.error || 'La báscula no está conectada en este equipo.'}</p>
                {hayPuerto && (
                  <button
                    disabled={bascula.conectando}
                    onClick={() => conectarBascula().catch((e) => toast.error(e?.message || 'No se pudo conectar la báscula'))}
                    className="w-full h-11 rounded-xl bg-emerald-600 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ color: '#fff' }}
                  >
                    {bascula.conectando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Conectar báscula
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {hayPuerto && (
          <button onClick={() => setManual((v) => !v)} className={`text-xs ${t.suave} underline flex items-center gap-1 mx-auto`}>
            <Keyboard className="w-3.5 h-3.5" /> {manual ? 'Usar la báscula' : 'Escribir el peso a mano'}
          </button>
        )}

        <div className={`flex items-center justify-between rounded-2xl ${t.total} px-4 py-3`}>
          <span className={`${t.suave} text-sm`}>Total{pesoKg > 0 ? ` · ${formatoPeso(pesoKg)}` : ''}</span>
          <span className={`${t.totalTxt} text-2xl font-black tabular-nums`}>{money(total)}</span>
        </div>
        {excede && <p className="text-red-500 text-sm text-center">No hay tanto en inventario: quedan {formatoPeso(stockKg || 0)}.</p>}

        <div className="flex gap-3">
          <button onClick={onCerrar} className={`flex-1 h-12 rounded-xl ${t.cancelar} font-semibold`}>Cancelar</button>
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
