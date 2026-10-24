/**
 * Configuración › Mi contador. El negocio pega el código que le generó su
 * contador en Codec Document y desde ahí sus ventas, facturas electrónicas,
 * gastos, devoluciones y cierres le llegan solos (ver contadorService.ts). Se usa en Electron y en la web.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Link2, Unlink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { obtenerEstadoContador, conectarContador, desconectarContador, verificarContador, type EstadoContador } from '../../lib/supabase/contadorService';

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'todavía no';

export function MiContador({ oscuro = true }: { oscuro?: boolean }) {
  const [estado, setEstado] = useState<EstadoContador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const suave = oscuro ? 'text-slate-400' : 'text-gray-500';
  const caja = oscuro ? 'bg-slate-950/50 border-slate-800' : 'bg-gray-50 border-gray-200';

  const cargar = useCallback(async () => {
    try {
      setEstado(await obtenerEstadoContador());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar la conexión');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Al abrir se pregunta a Codec Document si la conexión sigue viva: si el
    // contador la cortó allá, aquí pasa a pedir el código nuevo.
    verificarContador().catch(() => undefined).finally(cargar);
    const intervalo = window.setInterval(cargar, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  const conectar = async () => {
    setTrabajando(true);
    try {
      const r = await conectarContador(codigo);
      toast.success(`Conectado con ${r.contador || 'tu contador'}`, {
        description: `${r.encolados.toLocaleString('es-CO')} registros de tu historial se están enviando. Lo nuevo le llega solo.`,
      });
      setCodigo('');
      await cargar();
    } catch (e) {
      toast.error('No se pudo conectar', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTrabajando(false);
    }
  };

  const desconectar = async () => {
    if (!window.confirm(`¿Desconectar a ${estado?.contador || 'tu contador'}? Dejará de recibir tus ventas, facturas y gastos.`)) return;
    setTrabajando(true);
    try {
      await desconectarContador();
      toast.success('Contador desconectado');
      await cargar();
    } catch (e) {
      toast.error('No se pudo desconectar', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return <div className={`flex items-center gap-2 text-sm ${suave}`}><Loader2 className="w-4 h-4 animate-spin" /> Consultando…</div>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  if (estado?.estado === 'activo') {
    return (
      <div className="space-y-3">
        <div className={`rounded-xl border p-3 ${caja}`}>
          <p className={`flex items-center gap-2 font-semibold ${texto}`}><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Conectado con {estado.contador || 'tu contador'}</p>
          {estado.empresa && <p className={`text-xs mt-1 ${suave}`}>Empresa en Codec Document: {estado.empresa}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Enviadas', estado.enviados, 'text-emerald-400'], ['En cola', estado.pendientes, 'text-amber-400'], ['Con error', estado.rechazados, estado.rechazados ? 'text-red-400' : suave]].map(([l, n, c]) => (
            <div key={l as string} className={`rounded-xl border p-2 ${caja}`}>
              <p className={`text-lg font-bold ${c}`}>{Number(n).toLocaleString('es-CO')}</p>
              <p className={`text-[11px] ${suave}`}>{l}</p>
            </div>
          ))}
        </div>
        <p className={`text-xs ${suave}`}>Último envío: {fechaHora(estado.ultimoEnvioEn)}. Tus ventas, facturas electrónicas, gastos, devoluciones y cierres le llegan solos en un par de minutos.</p>
        {estado.ultimoError && <p className="text-xs text-amber-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{estado.ultimoError}</p>}
        <button type="button" onClick={desconectar} disabled={trabajando}
          className="w-full h-10 rounded-xl border border-red-800/60 text-red-400 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />} Desconectar contador
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {estado?.estado === 'revocado' && (
        <p className="text-sm text-amber-400 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Tu contador desconectó esta empresa. Si quieres volver a conectarla, pídele un código nuevo.</p>
      )}
      <p className={`text-sm ${suave}`}>
        Si tu contador usa Codec Document, pídele el <strong className={texto}>código de conexión</strong> de tu empresa y pégalo aquí.
        Desde ese momento tus ventas, facturas electrónicas, gastos, devoluciones y cierres de caja le llegan solos, con todo tu historial.
      </p>
      <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="CD-XXXX-XXXX" autoComplete="off"
        className={`w-full h-11 rounded-xl border px-3 font-mono tracking-wider ${oscuro ? 'bg-slate-950/60 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
      <button type="button" onClick={conectar} disabled={trabajando || codigo.trim().length < 6}
        className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Conectar con mi contador
      </button>
      <p className={`text-[11px] ${suave}`}>El NIT de tu negocio debe ser el mismo de la empresa que creó tu contador.</p>
    </div>
  );
}
