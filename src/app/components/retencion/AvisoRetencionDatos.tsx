/**
 * Aviso de la limpieza mensual de la caja (ver src/app/lib/retencionDatos.ts):
 * aparece en los 5 días previos, una vez en la mañana, otra en la tarde y
 * otra en la noche. Cada vez que se muestra queda en la bitácora de la nube.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, FolderCheck, FolderDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { sugerirProductosSinMovimiento } from './ProductosSinMovimiento';
import {
  autorizarCarpeta, diasParaLimpieza, fechaCorte, guardarFacturasElectronicas, guardarHistorialAhora, iniciarRetencionDatos,
  leerConfigRetencion, marcarAvisoMostrado, revisarFacturasElectronicas, MESES_EN_CAJA, MESES_FACTURAS_NUBE,
} from '../../lib/retencionDatos';

const fechaLarga = (d: Date) => d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function AvisoRetencionDatos() {
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState<'guardar' | 'autorizar' | null>(null);
  const [config, setConfig] = useState(leerConfigRetencion);

  useEffect(() => iniciarRetencionDatos(() => setVisible(true)), []);
  useEffect(() => sugerirProductosSinMovimiento(), []);

  // Facturas electrónicas: aviso discreto, sin interrumpir la venta.
  useEffect(() => {
    const revisar = () => revisarFacturasElectronicas((cantidad) => {
      toast.warning('Guarda una copia de tus facturas electrónicas', {
        description: `Tienes ${cantidad}. En la nube duran ${MESES_FACTURAS_NUBE} meses y luego se borran; guárdalas en una carpeta o una memoria cada 6 meses.`,
        duration: 30000,
        action: { label: 'Guardar ahora', onClick: () => {
          guardarFacturasElectronicas()
            .then((r) => { if (r) toast.success('Facturas guardadas', { description: `${r.documentos} documentos en ${r.carpeta}` }); })
            .catch((e) => toast.error('No se pudieron guardar las facturas', { description: e?.message }));
        } },
      });
    }).catch((e) => console.warn('[retención] revisión de facturas falló:', e));
    const primera = window.setTimeout(revisar, 240_000);
    const intervalo = window.setInterval(revisar, 6 * 60 * 60_000);
    return () => { clearTimeout(primera); clearInterval(intervalo); };
  }, []);

  useEffect(() => {
    const alCambiar = () => setConfig(leerConfigRetencion());
    window.addEventListener('codecpos:retencion-cambio', alCambiar);
    return () => window.removeEventListener('codecpos:retencion-cambio', alCambiar);
  }, []);

  // El aviso cuenta como dado en cuanto aparece en pantalla.
  useEffect(() => {
    if (visible) marcarAvisoMostrado().catch(() => {});
  }, [visible]);

  const guardarAhora = useCallback(async () => {
    setOcupado('guardar');
    try {
      const r = await guardarHistorialAhora();
      if (r) toast.success('Historial guardado en tu computador', { description: `${r.registros} registros en ${r.carpeta}` });
    } catch (e) {
      toast.error('No se pudo guardar el historial', { description: (e as Error)?.message });
    } finally {
      setOcupado(null);
    }
  }, []);

  const autorizar = useCallback(async () => {
    setOcupado('autorizar');
    try {
      const carpeta = await autorizarCarpeta();
      if (carpeta) toast.success('Listo: cada mes se guardará el historial en esa carpeta', { description: carpeta });
    } catch (e) {
      toast.error('No se pudo usar esa carpeta', { description: (e as Error)?.message });
    } finally {
      setOcupado(null);
    }
  }, []);

  if (!visible) return null;

  const limpieza = new Date(config.proximaLimpieza);
  const corte = fechaCorte(limpieza);
  const dias = diasParaLimpieza(config);
  const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
  const boton = 'h-11 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Limpieza mensual de la caja">
      <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-5 border-b border-slate-800">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">Limpieza mensual de la caja: {cuando}</h2>
            <p className="text-slate-400 text-sm capitalize">{fechaLarga(limpieza)}</p>
          </div>
          <button onClick={() => setVisible(false)} className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm text-slate-300">
          <p>
            Para que el sistema siga rápido, CODEC POS guarda el mes actual y los {MESES_EN_CAJA} meses anteriores. Se borrarán definitivamente,
            de este computador y de la nube, las <strong className="text-white">ventas, gastos, cierres y devoluciones anteriores al {corte.toLocaleDateString('es-CO')}</strong>.
          </p>
          <p>
            Tus usuarios, contraseñas, productos, precios, clientes, configuración y cartera abierta <strong className="text-white">no se borran</strong>.
            Las facturas electrónicas duran {MESES_FACTURAS_NUBE} meses en la nube: guárdalas en una carpeta cada 6 meses. Lo que aún no se haya subido a la nube se queda en esta caja.
          </p>
          {config.carpeta ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-300">
              <FolderCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <p>Antes de borrar se guardará automáticamente en <strong className="break-all">{config.carpeta}</strong>.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-amber-200">
              Si quieres conservar una copia en este computador, guárdala antes de esa fecha o autoriza una carpeta para que se guarde sola cada mes.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 grid gap-2 sm:grid-cols-2">
          <button onClick={guardarAhora} disabled={!!ocupado} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}>
            {ocupado === 'guardar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderDown className="w-4 h-4" />} Guardar copia ahora
          </button>
          {config.carpeta ? (
            <button onClick={() => setVisible(false)} className={`${boton} bg-slate-700 hover:bg-slate-600 text-white`}>Entendido</button>
          ) : (
            <button onClick={autorizar} disabled={!!ocupado} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}>
              {ocupado === 'autorizar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderCheck className="w-4 h-4" />} Guardar solo cada mes
            </button>
          )}
          {!config.carpeta && (
            <button onClick={() => setVisible(false)} className={`${boton} sm:col-span-2 bg-slate-800 hover:bg-slate-700 text-slate-300`}>Entendido, recordarme después</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
