/**
 * Ajustes de las alertas de pago de Codec Verify en ESTE dispositivo:
 * sonido fuerte, notificaciones, volumen y una prueba. Va en Configuración
 * y en Mi perfil.
 */
import { useEffect, useState } from 'react';
import { BellRing, Volume2, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  obtenerAlertasPago, guardarAlertasPago, reproducirSonidoPago, pedirPermisoNotificaciones, permisoNotificaciones,
  EVENTO_ALERTAS_PAGO, alertarPago,
} from '../lib/alertaPagos';
import { estaEnAppAndroid, getAndroidBridge } from '../lib/androidBridge';
import { codecVerifyPwaActivo } from '../lib/codecVerifyPwa';

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

  const probar = async () => {
    if (enApp && appActualizada) {
      await alertarPago({ id: `prueba-${Date.now()}`, monto: 50000, entidad: 'nequi', referencia: null, origen: 'automatizacion', estado: 'confirmado' });
      return;
    }
    const sono = await reproducirSonidoPago(prefs.volumen);
    try { navigator.vibrate?.([450, 150, 450, 150, 700]); } catch { /* sin vibración */ }
    if (!sono) toast.error('El navegador bloqueó el sonido. Toca la pantalla y vuelve a probar.');
  };

  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BellRing className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Alertas de pago en este dispositivo</span>
        </div>
        <p className="text-slate-500 text-xs">
          Cuando Codec Verify detecta un pago, este dispositivo suena fuerte y avisa.
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
          <p className="text-white text-sm font-semibold">Notificaciones</p>
          <p className="text-slate-500 text-xs">
            {permiso === 'denied' && !enApp ? 'El navegador las tiene bloqueadas: actívalas en los ajustes del sitio.' : 'Aviso en la barra de notificaciones del celular o del computador.'}
          </p>
        </div>
        <Interruptor activo={prefs.notificacion} etiqueta="Notificaciones" onClick={activarNotificaciones} />
      </div>

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

      <button onClick={probar} className="w-full h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2">
        <Play className="w-4 h-4" /> Probar sonido de pago
      </button>

      {enApp && !appActualizada && (
        <p className="text-amber-400 text-xs">Actualiza la app Codec POS de Android para que el sonido funcione aunque la app esté cerrada.</p>
      )}
    </div>
  );
}
