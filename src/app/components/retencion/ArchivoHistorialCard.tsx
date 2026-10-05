/**
 * Configuración › Respaldo: carpeta donde la caja guarda cada mes el
 * historial antes de borrarlo, próxima limpieza y bitácora de avisos.
 * Ver src/app/lib/retencionDatos.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, FolderCheck, FolderDown, FolderOpen, FolderX, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  abrirCarpeta, autorizarCarpeta, diasParaLimpieza, fechaCorte, guardarHistorialAhora, hayCarpetaDisponible,
  leerBitacoraLocal, leerConfigRetencion, retirarCarpeta, DIAS_AVISO, DIAS_EN_CAJA, type EntradaBitacora,
} from '../../lib/retencionDatos';

const ETIQUETA: Record<EntradaBitacora['tipo'], string> = {
  aviso: 'Aviso mostrado',
  descarga: 'Copia guardada',
  limpieza: 'Limpieza hecha',
  carpeta_autorizada: 'Carpeta autorizada',
  carpeta_retirada: 'Carpeta retirada',
  error: 'Error',
};

export function ArchivoHistorialCard({ darkMode = true }: { darkMode?: boolean }) {
  const [config, setConfig] = useState(leerConfigRetencion);
  const [bitacora, setBitacora] = useState(leerBitacoraLocal);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    const alCambiar = () => { setConfig(leerConfigRetencion()); setBitacora(leerBitacoraLocal()); };
    window.addEventListener('codecpos:retencion-cambio', alCambiar);
    return () => window.removeEventListener('codecpos:retencion-cambio', alCambiar);
  }, []);

  const accion = useCallback(async (nombre: string, fn: () => Promise<unknown>, exito?: string) => {
    setOcupado(nombre);
    try {
      const r = await fn();
      if (exito && r !== null) toast.success(exito);
    } catch (e) {
      toast.error('No se pudo completar', { description: (e as Error)?.message });
    } finally {
      setOcupado(null);
      setConfig(leerConfigRetencion());
      setBitacora(leerBitacoraLocal());
    }
  }, []);

  if (!hayCarpetaDisponible()) return null;

  const limpieza = new Date(config.proximaLimpieza);
  const texto = darkMode ? 'text-slate-300' : 'text-slate-700';
  const tarjeta = darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200';
  const boton = 'h-10 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

  return (
    <div className={`rounded-xl border p-4 space-y-4 ${tarjeta}`}>
      <div>
        <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Historial en este computador</h3>
        <p className={`text-sm ${texto}`}>
          Para que la caja sea rápida, aquí se guarda solo el último mes de ventas, gastos, cierres y devoluciones ({DIAS_EN_CAJA} días).
          Lo anterior sigue en la nube. Se avisa {DIAS_AVISO} días antes, tres veces al día.
        </p>
      </div>

      <div className={`flex items-center gap-3 rounded-lg p-3 ${darkMode ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
        <CalendarClock className="w-5 h-5 text-amber-500 shrink-0" />
        <p className={`text-sm ${texto}`}>
          Próxima limpieza: <strong>{limpieza.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> (en {diasParaLimpieza(config)} días).
          Borrará lo anterior al {fechaCorte(limpieza).toLocaleDateString('es-CO')}.
        </p>
      </div>

      <div className={`rounded-lg p-3 text-sm ${config.carpeta ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : darkMode ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
        {config.carpeta ? (
          <>Cada mes se guarda una copia antes de borrar en <strong className="break-all">{config.carpeta}</strong>
            {config.autorizadaEn && <> (autorizada por {config.autorizadaPor} el {new Date(config.autorizadaEn).toLocaleDateString('es-CO')})</>}.</>
        ) : (
          <>No hay carpeta autorizada: la limpieza borra de la caja sin guardar copia en el computador (la nube conserva todo).</>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => accion('autorizar', autorizarCarpeta, 'Carpeta autorizada')} disabled={!!ocupado} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}>
          {ocupado === 'autorizar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderCheck className="w-4 h-4" />} {config.carpeta ? 'Cambiar carpeta' : 'Autorizar carpeta'}
        </button>
        <button onClick={() => accion('guardar', guardarHistorialAhora, 'Copia guardada')} disabled={!!ocupado} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}>
          {ocupado === 'guardar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderDown className="w-4 h-4" />} Guardar copia ahora
        </button>
        {config.carpeta && (
          <>
            <button onClick={() => accion('abrir', abrirCarpeta)} disabled={!!ocupado} className={`${boton} ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
              <FolderOpen className="w-4 h-4" /> Abrir carpeta
            </button>
            <button onClick={() => accion('retirar', retirarCarpeta, 'Carpeta retirada')} disabled={!!ocupado} className={`${boton} ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
              <FolderX className="w-4 h-4" /> Quitar autorización
            </button>
          </>
        )}
      </div>

      {bitacora.length > 0 && (
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Bitácora (también guardada en la nube)</p>
          <ul className="max-h-48 overflow-y-auto space-y-1 text-xs">
            {bitacora.slice(0, 40).map((e, i) => (
              <li key={i} className={`flex justify-between gap-3 ${texto}`}>
                <span>{ETIQUETA[e.tipo] || e.tipo}{e.detalle?.franja ? ` (${e.detalle.franja})` : ''}{e.usuario ? ` · ${e.usuario}` : ''}</span>
                <span className="shrink-0 opacity-70">{new Date(e.horaEquipo).toLocaleString('es-CO')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
