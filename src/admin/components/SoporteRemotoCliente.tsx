import { useEffect, useState } from 'react';
import { Activity, CloudUpload, FileText, RefreshCw, RotateCcw, Stethoscope } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { SectionCard, EmptyState, formatoFechaHora } from './ui';

/**
 * Conexión remota con las cajas Electron del cliente (migración 0167).
 * Deja una orden en soporte_comandos; la caja la toma en menos de un minuto
 * si está abierta y con internet, y aquí aparece el resultado.
 */

type Comando = {
  id: string; machine_id: string | null; accion: string; parametros: any; estado: string;
  resultado: any; created_at: string; terminado_en: string | null; tomado_por_machine: string | null;
};
type Caja = { machine_id: string; codigo_caja: number | null; version: string | null; ultima_conexion: string | null };
type Respaldo = { storage_path: string; nombre_archivo: string; tamano_bytes: number; creado_en: string };

const NOMBRES: Record<string, string> = {
  diagnostico: 'Diagnóstico',
  logs: 'Ver logs',
  subir_respaldo_actual: 'Subir respaldo de lo que hay ahora',
  subir_respaldo_blindado: 'Subir respaldo blindado',
  restaurar_respaldo_nube: 'Restaurar respaldo de la nube',
  restaurar_respaldo_blindado: 'Restaurar respaldo blindado',
  recargar: 'Recargar la app',
};

const COLOR: Record<string, string> = {
  pendiente: 'text-amber-400', tomado: 'text-sky-400', hecho: 'text-emerald-400', error: 'text-red-400',
};

export function SoporteRemotoCliente({ clienteId }: { clienteId: string }) {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [respaldos, setRespaldos] = useState<Respaldo[]>([]);
  const [comandos, setComandos] = useState<Comando[] | null>(null);
  const [machine, setMachine] = useState('');
  const [archivoBlindado, setArchivoBlindado] = useState('');
  const [respaldoNube, setRespaldoNube] = useState('');
  const [forzar, setForzar] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const c = getSupabaseClient();
    if (!c) return;
    const [cj, rs, cm] = await Promise.all([
      c.from('instalaciones').select('machine_id, codigo_caja, version, ultima_conexion').eq('cliente_id', clienteId).eq('tipo', 'ELECTRON').order('ultima_conexion', { ascending: false }),
      c.from('respaldos_nube').select('storage_path, nombre_archivo, tamano_bytes, creado_en').eq('cliente_id', clienteId).order('creado_en', { ascending: false }),
      c.from('soporte_comandos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(20),
    ]);
    setCajas((cj.data || []) as Caja[]);
    setRespaldos((rs.data || []) as Respaldo[]);
    setComandos((cm.data || []) as Comando[]);
    if (cm.error) setError(cm.error.message);
  };

  useEffect(() => { void cargar(); }, [clienteId]);

  useEffect(() => {
    const c = getSupabaseClient();
    if (!c) return;
    const canal = c.channel(`soporte-admin-${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soporte_comandos', filter: `cliente_id=eq.${clienteId}` }, () => { void cargar(); })
      .subscribe();
    return () => { c.removeChannel(canal); };
  }, [clienteId]);

  const enviar = async (accion: string, parametros: Record<string, any> = {}) => {
    setError(null);
    const restaura = accion.startsWith('restaurar');
    if (restaura && !window.confirm(`Esto reemplaza los datos del PC con el respaldo elegido (antes guarda una copia de lo que tiene).${forzar ? ' Con FORZAR aunque el PC tenga ventas más nuevas.' : ''} ¿Seguir?`)) return;
    const c = getSupabaseClient();
    if (!c) return;
    const { error: e } = await c.from('soporte_comandos').insert({
      cliente_id: clienteId, machine_id: machine || null, accion,
      parametros: restaura ? { ...parametros, forzar } : parametros,
    });
    if (e) setError(e.message); else void cargar();
  };

  const boton = 'h-9 px-3 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1.5';
  const select = 'h-9 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs px-2';

  return (
    <SectionCard title="Conexión remota con la caja" className="mb-6">
      <p className="text-slate-500 text-[11px] mb-3">
        La caja toma la orden en menos de un minuto si está abierta y con internet. Necesita la versión de Electron que trae esta función.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={machine} onChange={(e) => setMachine(e.target.value)} className={select}>
          <option value="">Cualquier caja del negocio</option>
          {cajas.map((k) => (
            <option key={k.machine_id} value={k.machine_id}>
              Caja {k.codigo_caja ?? '?'} · {k.machine_id.slice(0, 8)} · v{k.version ?? '?'} · {formatoFechaHora(k.ultima_conexion)}
            </option>
          ))}
        </select>
        <button disabled={soloLectura} onClick={() => enviar('diagnostico')} className={boton}><Stethoscope className="w-3.5 h-3.5" /> Diagnóstico</button>
        <button disabled={soloLectura} onClick={() => enviar('logs', { lineas: 400 })} className={boton}><FileText className="w-3.5 h-3.5" /> Logs</button>
        <button disabled={soloLectura} onClick={() => enviar('subir_respaldo_actual')} className={boton}><CloudUpload className="w-3.5 h-3.5" /> Subir lo que hay ahora</button>
        <button disabled={soloLectura} onClick={() => enviar('recargar')} className={boton}><RefreshCw className="w-3.5 h-3.5" /> Recargar</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={archivoBlindado} onChange={(e) => setArchivoBlindado(e.target.value)} placeholder="Respaldo blindado (nombre del archivo, sale en el diagnóstico)" className={`${select} flex-1 min-w-[240px]`} />
        <button disabled={soloLectura || !archivoBlindado} onClick={() => enviar('subir_respaldo_blindado', { archivo: archivoBlindado.trim() })} className={boton}><CloudUpload className="w-3.5 h-3.5" /> Subirlo</button>
        <button disabled={soloLectura || !archivoBlindado} onClick={() => enviar('restaurar_respaldo_blindado', { archivo: archivoBlindado.trim() })} className={boton}><RotateCcw className="w-3.5 h-3.5" /> Restaurarlo</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={respaldoNube} onChange={(e) => setRespaldoNube(e.target.value)} className={`${select} flex-1 min-w-[240px]`}>
          <option value="">Respaldo de la nube…</option>
          {respaldos.map((r) => (
            <option key={r.storage_path} value={r.storage_path}>
              {r.nombre_archivo} · {Math.round(r.tamano_bytes / 1024)} KB · {formatoFechaHora(r.creado_en)}
            </option>
          ))}
        </select>
        <button disabled={soloLectura || !respaldoNube} onClick={() => enviar('restaurar_respaldo_nube', { storage_path: respaldoNube })} className={boton}><RotateCcw className="w-3.5 h-3.5" /> Restaurar en la caja</button>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Forzar
        </label>
      </div>

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {!comandos ? null : comandos.length === 0 ? <EmptyState mensaje="Todavía no hay órdenes." /> : (
        <div className="space-y-1.5">
          {comandos.map((c) => (
            <div key={c.id} className="bg-slate-950/60 border border-slate-800 rounded-lg">
              <button onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <Activity className={`w-3.5 h-3.5 ${COLOR[c.estado] || 'text-slate-400'}`} />
                <span className="text-xs text-slate-200 font-semibold">{NOMBRES[c.accion] || c.accion}</span>
                <span className={`text-[11px] ${COLOR[c.estado] || ''}`}>{c.estado}</span>
                <span className="text-[11px] text-slate-500 ml-auto">{formatoFechaHora(c.created_at)}</span>
              </button>
              {abierto === c.id && (
                <pre className="text-[10px] text-slate-300 px-3 pb-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
                  {JSON.stringify({ parametros: c.parametros, caja: c.tomado_por_machine, terminado: c.terminado_en, resultado: c.resultado }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
