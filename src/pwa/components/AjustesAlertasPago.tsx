/**
 * Ajustes de las alertas de pago de Codec Verify en ESTE dispositivo:
 * sonido fuerte, notificaciones, volumen y una prueba. Va en Configuración
 * y en Mi perfil.
 */
import { useEffect, useState } from 'react';
import { BellRing, Volume2, Eye, Smartphone, Share, SquarePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  obtenerAlertasPago, guardarAlertasPago, pedirPermisoNotificaciones, permisoNotificaciones, EVENTO_ALERTAS_PAGO,
} from '../lib/alertaPagos';
import { mostrarEjemploPago } from '../hooks/useAlertasPago';
import { estaEnAppAndroid, getAndroidBridge } from '../lib/androidBridge';
import { codecVerifyPwaActivo } from '../lib/codecVerifyPwa';
import { estadoPush, activarPush, desactivarPush, esIphone, type EstadoPush } from '../lib/pushPagos';

function Interruptor({ activo, onClick, etiqueta }: { activo: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onClick}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${activo ? 'bg-emerald-500' : 'bg-slate-700'}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full transition-all ${activo ? 'left-6' : 'left-1'}`} style={{ background: '#ffffff' }} />
    </button>
  );
}

export function AjustesAlertasPago() {
  const [prefs, setPrefs] = useState(obtenerAlertasPago);
  const [permiso, setPermiso] = useState(permisoNotificaciones);
  const enApp = estaEnAppAndroid();
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [activandoPush, setActivandoPush] = useState(false);

  useEffect(() => { estadoPush().then(setPush); }, []);

  const alternarPush = async () => {
    setActivandoPush(true);
    if (push === 'activo') {
      await desactivarPush();
      toast('Avisos con la app cerrada desactivados en este dispositivo');
    } else {
      const r = await activarPush();
      if (r.ok) toast.success('Listo: este dispositivo avisará los pagos aunque la app esté cerrada');
      else toast.error(r.mensaje || 'No se pudo activar');
    }
    setPush(await estadoPush());
    setActivandoPush(false);
  };
  const appActualizada = !!getAndroidBridge()?.avisarPago;

  useEffect(() => {
    const actualizar = () => setPrefs(obtenerAlertasPago());
    window.addEventListener(EVENTO_ALERTAS_PAGO, actualizar);
    return () => window.removeEventListener(EVENTO_ALERTAS_PAGO, actualizar);
  }, []);

  const cambiar = (cambios: Parameters<typeof guardarAlertasPago>[0]) => setPrefs(guardarAlertasPago(cambios));

  const activarNotificaciones = async () => {
    if (!prefs.notificacion) {
      const ok = await pedirPermisoNotificaciones();
      setPermiso(permisoNotificaciones());
      if (!ok && !enApp) toast.error('El navegador no dio permiso. Actívalo en los ajustes del sitio para recibir notificaciones.');
    }
    cambiar({ notificacion: !prefs.notificacion });
  };


  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BellRing className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Alertas de pago en este dispositivo</span>
        </div>
        <p className="text-slate-500 text-xs">
          Cuando Codec Verify detecta un pago, este dispositivo suena fuerte, una voz dice el monto y aparece el aviso.
          {!codecVerifyPwaActivo() && ' Ahora Codec Verify está apagado aquí: actívalo con el escudo de la barra superior.'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold">Sonido fuerte</p>
          <p className="text-slate-500 text-xs">{enApp && appActualizada ? 'Suena por el volumen de alarma, aunque el celular esté en silencio.' : 'Suena mientras la app esté abierta.'}</p>
        </div>
        <Interruptor activo={prefs.sonido} etiqueta="Sonido fuerte" onClick={() => cambiar({ sonido: !prefs.sonido })} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold">Voz</p>
          <p className="text-slate-500 text-xs">Dice el monto: «Has recibido un pago de doce mil trescientos cuarenta y cinco pesos por Nequi».</p>
        </div>
        <Interruptor activo={prefs.voz} etiqueta="Voz" onClick={() => cambiar({ voz: !prefs.voz })} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold">Notificaciones</p>
          <p className="text-slate-500 text-xs">
            {permiso === 'denied' && !enApp ? 'El navegador las tiene bloqueadas: actívalas en los ajustes del sitio.' : 'Aviso en la barra de notificaciones del celular o del computador.'}
          </p>
        </div>
        <Interruptor activo={prefs.notificacion} etiqueta="Notificaciones" onClick={activarNotificaciones} />
      </div>

      {push && push !== 'app-android' && (
        <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-emerald-400" /> Avisos con la app cerrada</p>
              <p className="text-slate-500 text-xs">
                {push === 'activo' && 'Activos: llega la notificación aunque la app esté cerrada o el celular bloqueado.'}
                {push === 'inactivo' && 'Recibe la notificación del pago aunque la app esté cerrada.'}
                {push === 'bloqueado' && (esIphone() ? 'Bloqueadas: actívalas en Ajustes del iPhone > Notificaciones > Codec POS.' : 'Bloqueadas por el navegador: actívalas en los ajustes del sitio.')}
                {push === 'no-soportado' && 'Este navegador no permite avisos con la app cerrada. Usa Chrome, Edge o Safari actualizados.'}
                {push === 'falta-instalar' && 'En iPhone, primero agrega Codec POS a la pantalla de inicio:'}
              </p>
            </div>
            {(push === 'activo' || push === 'inactivo') && (
              activandoPush
                ? <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                : <Interruptor activo={push === 'activo'} etiqueta="Avisos con la app cerrada" onClick={alternarPush} />
            )}
          </div>
          {push === 'falta-instalar' && (
            <ol className="text-slate-300 text-xs space-y-1.5 pl-1">
              <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>Abre esta página en <b>Safari</b>.</li>
              <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>Toca <Share className="w-3.5 h-3.5 inline" /> <b>Compartir</b>.</li>
              <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>Elige <SquarePlus className="w-3.5 h-3.5 inline" /> <b>Agregar a pantalla de inicio</b>.</li>
              <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold shrink-0">4</span>Abre Codec POS desde ese ícono, entra a esta sección y activa los avisos.</li>
            </ol>
          )}
          {esIphone() && push !== 'falta-instalar' && (
            <p className="text-slate-500 text-[11px]">En iPhone la notificación suena con el tono del sistema; el sonido de caja y la voz se oyen al abrir la app.</p>
          )}
        </div>
      )}

      {!(enApp && appActualizada) && prefs.sonido && (
        <div className="flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="range" min={0.2} max={1} step={0.1} value={prefs.volumen}
            onChange={(e) => cambiar({ volumen: Number(e.target.value) })}
            className="flex-1 accent-emerald-500" aria-label="Volumen del sonido de pagos"
          />
          <span className="text-slate-400 text-xs w-9 text-right">{Math.round(prefs.volumen * 100)} %</span>
        </div>
      )}

      <button onClick={() => mostrarEjemploPago()} className="w-full h-12 rounded-xl bg-emerald-600 text-sm font-bold flex items-center justify-center gap-2" style={{ color: '#ffffff' }}>
        <Eye className="w-4 h-4" /> Ver ejemplo de un pago
      </button>
      <p className="text-slate-500 text-[11px] -mt-2 text-center">Simula un pago de $12.345 por Nequi: verás el aviso y oirás el sonido y la voz.</p>

      {enApp && !appActualizada && (
        <p className="text-amber-400 text-xs">Actualiza la app Codec POS de Android para que el sonido funcione aunque la app esté cerrada.</p>
      )}
    </div>
  );
}
