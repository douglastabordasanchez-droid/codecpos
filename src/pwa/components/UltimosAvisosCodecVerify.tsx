/**
 * Últimos avisos de Codec Verify: cada aviso de banco que llegó desde el
 * celular Android, el iPhone (Atajos) o el correo, y si se volvió pago o por
 * qué no (migración 0107). Sirve para saber al instante si un pago de prueba
 * llegó al sistema.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle, XCircle, Smartphone, Apple, Mail, RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { nombreMedioPago } from '../../app/lib/voz';

interface Evento {
  id: number;
  created_at: string;
  origen: string;
  entidad: string | null;
  monto: number | null;
  resultado: string;
  detalle: string | null;
  texto: string | null;
}

const RESULTADOS: Record<string, { etiqueta: string; icono: typeof CheckCircle2; color: string }> = {
  registrado: { etiqueta: 'Pago registrado', icono: CheckCircle2, color: 'text-emerald-400' },
  no_leido: { etiqueta: 'No se encontró el monto', icono: AlertTriangle, color: 'text-amber-400' },
  ignorado: { etiqueta: 'Ignorado (movimiento saliente)', icono: MinusCircle, color: 'text-slate-500' },
  error: { etiqueta: 'Error', icono: XCircle, color: 'text-red-400' },
};

const ORIGENES: Record<string, typeof Smartphone> = { android: Smartphone, iphone: Apple, correo: Mail };

export function UltimosAvisosCodecVerify({ clienteId }: { clienteId: string }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  const cargar = async () => {
    const { data } = await getSupabaseClient()!
      .from('codec_verify_eventos')
      .select('id, created_at, origen, entidad, monto, resultado, detalle, texto')
      .eq('cliente_id', clienteId)
      .order('id', { ascending: false })
      .limit(15);
    setEventos((data as Evento[]) || []);
  };

  useEffect(() => {
    cargar();
    const client = getSupabaseClient();
    if (!client) return;
    const canal = client
      .channel(`codec-verify-eventos-${clienteId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'codec_verify_eventos', filter: `cliente_id=eq.${clienteId}` }, (p) => {
        setEventos((prev) => [p.new as Evento, ...(prev || [])].slice(0, 15));
      })
      .subscribe();
    return () => { client.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  return (
    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-bold">Últimos avisos recibidos</p>
          <p className="text-slate-500 text-[11px]">Se actualiza en vivo. Haz un pago de prueba y mira si aparece aquí.</p>
        </div>
        <button onClick={cargar} className="p-2 rounded-lg text-slate-400 hover:text-white" title="Actualizar"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {eventos === null ? (
        <p className="text-slate-500 text-xs">Cargando...</p>
      ) : eventos.length === 0 ? (
        <p className="text-slate-500 text-xs">
          Todavía no llega ningún aviso. Revisa que el celular con la app Codec POS tenga activo el acceso a notificaciones e internet,
          o que la automatización del iPhone esté creada.
        </p>
      ) : (
        <div className="space-y-2">
          {eventos.map((e) => {
            const r = RESULTADOS[e.resultado] || RESULTADOS.error;
            const Icono = r.icono;
            const Origen = ORIGENES[e.origen] || Smartphone;
            return (
              <div key={e.id} className="flex items-start gap-2.5 rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
                <Icono className={`w-4 h-4 mt-0.5 shrink-0 ${r.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-bold ${r.color}`}>
                      {r.etiqueta}{e.monto ? ` · $${Math.round(Number(e.monto)).toLocaleString('es-CO')}` : ''}
                    </p>
                    <span className="text-slate-500 text-[10px] shrink-0 flex items-center gap-1">
                      <Origen className="w-3 h-3" /> {new Date(e.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] truncate">
                    {nombreMedioPago(e.entidad) || 'Banco'}{e.texto ? ` · ${e.texto}` : ''}
                  </p>
                  {e.detalle && e.resultado !== 'registrado' && <p className="text-slate-500 text-[10px] truncate">{e.detalle}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
