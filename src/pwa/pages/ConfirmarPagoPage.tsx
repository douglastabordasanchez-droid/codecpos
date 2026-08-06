import { useEffect, useState, FormEvent } from 'react';
import { DollarSign, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import {
  confirmarPagoManual,
  NotificacionPagoRow,
} from '../../app/lib/supabase/codecVerifyService';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const ENTIDADES = ['nequi', 'daviplata', 'bancolombia', 'dale', 'otro'];

export default function ConfirmarPagoPage() {
  const { empleado } = usePwaAuth();
  const [monto, setMonto] = useState('');
  const [entidad, setEntidad] = useState('nequi');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [recientes, setRecientes] = useState<NotificacionPagoRow[]>([]);

  const cargarRecientes = async () => {
    const client = getSupabaseClient();
    if (!client || !empleado) return;
    const { data } = await client
      .from('notificaciones_pago')
      .select('*')
      .eq('cliente_id', empleado.cliente_id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecientes((data as NotificacionPagoRow[]) || []);
  };

  useEffect(() => {
    cargarRecientes();
  }, [empleado?.cliente_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleado) return;

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa un monto válido' });
      return;
    }

    setEnviando(true);
    setMensaje(null);

    const resultado = await confirmarPagoManual({
      monto: montoNum,
      entidad,
      referencia: referencia.trim() || undefined,
      clienteId: empleado.cliente_id,
    });

    setEnviando(false);

    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: 'Pago confirmado — la caja se desbloqueará automáticamente' });
      setMonto('');
      setReferencia('');
      cargarRecientes();
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error || 'No se pudo confirmar el pago' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Confirmar Pago</h1>
        <p className="text-slate-400 text-sm">Registra el pago que viste en tu celular</p>
      </div>

      <form onSubmit={handleSubmit} className="px-5 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Monto</Label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="number"
                inputMode="numeric"
                required
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="h-14 pl-9 text-2xl font-bold bg-slate-950 border-slate-700 text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Entidad</Label>
            <div className="grid grid-cols-3 gap-2">
              {ENTIDADES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEntidad(e)}
                  className={`h-11 rounded-lg text-xs font-bold capitalize transition-all ${
                    entidad === e
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Referencia (opcional)</Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nombre del remitente, # de referencia..."
              className="h-12 bg-slate-950 border-slate-700 text-white"
            />
          </div>
        </div>

        {mensaje && (
          <p className={`text-sm text-center ${mensaje.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {mensaje.texto}
          </p>
        )}

        <Button
          type="submit"
          disabled={enviando}
          className="w-full h-14 text-base bg-gradient-to-r from-emerald-500 to-emerald-600"
        >
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
          {enviando ? 'Confirmando...' : 'Confirmar Pago'}
        </Button>
      </form>

      <div className="px-5 mt-8">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">Recientes</h2>
        <div className="space-y-2">
          {recientes.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-6">Sin pagos registrados todavía</p>
          )}
          {recientes.map((n) => (
            <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">
                  ${n.monto.toLocaleString('es-CO')} <span className="text-slate-500 font-normal capitalize">· {n.entidad}</span>
                </p>
                {n.referencia && <p className="text-slate-500 text-xs">{n.referencia}</p>}
              </div>
              <EstadoBadge estado={n.estado} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: NotificacionPagoRow['estado'] }) {
  if (estado === 'confirmado') {
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado
      </span>
    );
  }
  if (estado === 'descartado') {
    return (
      <span className="flex items-center gap-1 text-slate-500 text-xs font-bold">
        <XCircle className="w-3.5 h-3.5" /> Descartado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-amber-400 text-xs font-bold">
      <Clock className="w-3.5 h-3.5" /> Pendiente
    </span>
  );
}
