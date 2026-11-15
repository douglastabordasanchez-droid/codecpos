/**
 * Envío de un pedido de mesa a las estaciones desde la caja de escritorio
 * (Electron y terminal Android). Funciona igual que en el celular: cada
 * producto nuevo elige su estación (o «Solo cuenta»), sale preseleccionada la
 * última que se usó para ese producto y se crea una comanda por estación.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChefHat, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { enviarComanda, type ItemComanda } from '../../lib/supabase/panaderiaSyncService';
import { type Estacion, estacionesAprendidas, recordarEstaciones } from '../../lib/supabase/estacionesService';

export interface ItemEnvio {
  productoId: string;
  nombre: string;
  cantidad: number;
}

interface Props {
  clienteId: string;
  mesa: { id: string; nombre: string; tiendaId?: string | null };
  items: ItemEnvio[];
  /** Estaciones encendidas del negocio. */
  estaciones: Estacion[];
  mesero?: string;
  oscuro: boolean;
  onCerrar: () => void;
  /** Se llama después de enviar, con lo que quedó despachado (incluye «Solo cuenta»). */
  onEnviado: (items: ItemEnvio[]) => void;
}

export function DialogoEnvioEstaciones({ clienteId, mesa, items, estaciones, mesero, oscuro, onCerrar, onEnviado }: Props) {
  const [aprendidas, setAprendidas] = useState<Record<string, string | null>>({});
  const [destinos, setDestinos] = useState<Record<string, string | null>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let activo = true;
    estacionesAprendidas(clienteId).then((a) => { if (activo) setAprendidas(a); }).catch(() => {});
    return () => { activo = false; };
  }, [clienteId]);

  const destinoDe = (productoId: string): string | null | undefined => {
    if (productoId in destinos) return destinos[productoId];
    const aprendida = aprendidas[productoId];
    if (aprendida === null) return null;
    return aprendida && estaciones.some((e) => e.id === aprendida) ? aprendida : undefined;
  };
  const sinDestino = useMemo(() => items.filter((it) => destinoDe(it.productoId) === undefined).length, [items, destinos, aprendidas, estaciones]);

  const todosA = (estacionId: string | null) => setDestinos(Object.fromEntries(items.map((it) => [it.productoId, estacionId])));

  const enviar = async () => {
    if (sinDestino > 0) { toast.error(`Falta elegir la estación de ${sinDestino} producto${sinDestino === 1 ? '' : 's'}`); return; }
    setEnviando(true);
    const porEstacion = new Map<string, ItemComanda[]>();
    const elecciones: Record<string, string | null> = {};
    for (const it of items) {
      const destino = destinoDe(it.productoId) ?? null;
      elecciones[it.productoId] = destino;
      if (destino) porEstacion.set(destino, [...(porEstacion.get(destino) || []), { nombre: it.nombre, cantidad: it.cantidad }]);
    }
    let fallos = 0;
    await Promise.all([
      recordarEstaciones(clienteId, elecciones).catch(() => {}),
      ...[...porEstacion.entries()].map(([estacionId, itemsEstacion]) => {
        const est = estaciones.find((e) => e.id === estacionId);
        return enviarComanda(clienteId, mesa.id, mesa.nombre, itemsEstacion, mesero, undefined, mesa.tiendaId, est ? { id: est.id, nombre: est.nombre } : null)
          .catch(() => { fallos++; toast.error(`No se pudo enviar a ${est?.nombre || 'la estación'}`); });
      }),
    ]);
    setEnviando(false);
    if (fallos > 0) return;
    const resumen = [...porEstacion.keys()].map((id) => estaciones.find((e) => e.id === id)?.nombre).filter(Boolean);
    toast.success(resumen.length ? `Pedido de ${mesa.nombre} enviado a ${resumen.join(', ')}` : 'Guardado solo en la cuenta');
    onEnviado(items);
  };

  const fondo = oscuro ? 'bg-slate-900 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-200';
  const fila = oscuro ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const chipApagado = oscuro ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-600';
  const tenue = oscuro ? 'text-slate-400' : 'text-slate-500';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !enviando && onCerrar()}>
      <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl ${fondo}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500 flex items-center justify-center"><ChefHat className="w-6 h-6 text-[#fff]" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-black leading-tight">Enviar pedido · {mesa.nombre}</p>
            <p className={`text-sm ${tenue}`}>Elige a qué estación va cada producto. Se recuerda para la próxima vez.</p>
          </div>
          <button onClick={onCerrar} disabled={enviando} className={`w-10 h-10 rounded-xl flex items-center justify-center ${tenue}`}><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-2 flex flex-wrap gap-2 items-center">
          <span className={`text-xs font-bold uppercase tracking-wide ${tenue}`}>Todo a</span>
          {estaciones.map((e) => (
            <button key={e.id} onClick={() => todosA(e.id)} className="h-8 px-3 rounded-full text-xs font-bold text-[#fff]" style={{ background: e.color }}>{e.nombre}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
          {items.map((it) => {
            const destino = destinoDe(it.productoId);
            return (
              <div key={it.productoId} className={`rounded-2xl border p-3 ${fila} ${destino === undefined ? 'border-amber-500' : ''}`}>
                <p className="font-bold mb-2"><span className="text-orange-500 font-black mr-2">{it.cantidad}×</span>{it.nombre}</p>
                <div className="flex flex-wrap gap-1.5">
                  {estaciones.map((e) => {
                    const activo = destino === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setDestinos((prev) => ({ ...prev, [it.productoId]: e.id }))}
                        className={`h-9 px-3.5 rounded-full text-sm font-bold border transition-all ${activo ? 'text-[#fff] border-transparent' : chipApagado}`}
                        style={activo ? { background: e.color } : undefined}
                      >
                        {e.nombre}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setDestinos((prev) => ({ ...prev, [it.productoId]: null }))}
                    className={`h-9 px-3.5 rounded-full text-sm font-bold border transition-all ${destino === null ? 'bg-slate-700 text-[#fff] border-transparent' : chipApagado}`}
                  >
                    Solo cuenta
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-5 pt-3">
          <button
            onClick={() => void enviar()}
            disabled={enviando}
            className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-700 text-[#fff] text-lg font-black flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {sinDestino > 0 ? `Elige la estación de ${sinDestino} producto${sinDestino === 1 ? '' : 's'}` : 'Enviar pedido'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
