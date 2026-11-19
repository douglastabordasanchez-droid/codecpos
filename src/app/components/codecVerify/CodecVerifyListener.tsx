/**
 * Componente que escucha notificaciones de Codec Verify
 * y muestra alertas de pagos entrantes en el POS
 * ⚡ OPTIMIZADO: Solo conecta cuando está habilitado
 */

import { useCodecVerify, AlertaPagoEntrante } from './AlertaPagoEntrante';
import { useEffect, useState } from 'react';
import { PopupPagoRecibido } from '../../../pwa/components/PopupPagoRecibido';
import { isVozActiva, setVozActiva } from '../../lib/voz';

// En Electron "Silenciar" apaga la voz de Codec Verify (la misma de su pantalla de conexión).
const SILENCIO_ELECTRON = { estaSilenciado: () => !isVozActiva(), poner: (silenciar: boolean) => setVozActiva(!silenciar) };

function leerCodecVerifyHabilitado(): boolean {
  try {
    return JSON.parse(localStorage.getItem('codecverify_config') || '{}').enabled === true;
  } catch {
    return false;
  }
}

export function CodecVerifyListener() {
  const [isEnabled, setIsEnabled] = useState(leerCodecVerifyHabilitado);

  // ⚡ Verificar si Codec Verify está habilitado, y reaccionar en caliente al
  // toggle en CodecVerifyConexionPage sin necesitar recargar la app.
  useEffect(() => {
    const actualizar = () => setIsEnabled(leerCodecVerifyHabilitado());
    actualizar();
    window.addEventListener('codecverify:config-changed', actualizar);
    return () => window.removeEventListener('codecverify:config-changed', actualizar);
  }, []);

  // 🔔 Si el negocio tiene Codec Verify encendido en la nube y este equipo nunca lo
  // prendió ni lo apagó a mano, se enciende solo: la caja empieza a escuchar los
  // pagos sin buscar el interruptor. Si alguien lo apagó en este equipo, se respeta.
  useEffect(() => {
    let cfg: Record<string, unknown> = {};
    try { cfg = JSON.parse(localStorage.getItem('codecverify_config') || '{}') || {}; } catch { cfg = {}; }
    if (typeof cfg.enabled === 'boolean') return;
    void Promise.all([import('../../lib/supabase/config'), import('../../lib/supabase/tenantLink')])
      .then(async ([{ getSupabaseClient }, { getLinkedClienteId }]) => {
        const client = getSupabaseClient();
        const clienteId = getLinkedClienteId();
        if (!client || !clienteId) return;
        const { data } = await client.from('clientes_pos').select('codec_verify_activo').eq('id', clienteId).maybeSingle();
        if (!(data as { codec_verify_activo?: boolean } | null)?.codec_verify_activo) return;
        localStorage.setItem('codecverify_config', JSON.stringify({ ...cfg, enabled: true }));
        window.dispatchEvent(new Event('codecverify:config-changed'));
      })
      .catch(() => { /* sin nube: se deja como está */ });
  }, []);

  // Si no está habilitado, no renderizar nada
  if (!isEnabled) {
    return null;
  }

  return <CodecVerifyListenerContent />;
}

// Componente interno optimizado
function CodecVerifyListenerContent() {
  const { pagoEntrante, vincularPago, descartarPago, connected, connect } = useCodecVerify();

  // ⚡ Conectar automáticamente al montar
  useEffect(() => {
    connect();
  }, [connect]);

  // ⚡ Log de estado (solo desarrollo)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (connected) {
        console.log('✅ [CodecVerifyListener] Conectado y escuchando');
      } else {
        console.log('⚠️ [CodecVerifyListener] Desconectado');
      }
    }
  }, [connected]);

  return (
    <>
      {/* Ventana grande de pago recibido (mismo diseño de la web) */}
      <PopupPagoRecibido rutaPagos="/codec-verify" silencio={SILENCIO_ELECTRON} />

      {/* Alerta de pago entrante */}
      <AlertaPagoEntrante
        pago={pagoEntrante}
        onVincular={vincularPago}
        onDescartar={descartarPago}
      />

      {/* Indicador de estado (solo desarrollo) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 z-[9999]">
          <div className={`px-3 py-2 rounded-lg text-xs font-medium shadow-lg ${ 
            connected 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
          }`}>
            {connected ? '🟢 CodecVerify' : '⚪ CodecVerify'}
          </div>
        </div>
      )}
    </>
  );
}