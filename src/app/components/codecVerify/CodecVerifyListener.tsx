/**
 * Componente que escucha notificaciones de Codec Verify
 * y muestra alertas de pagos entrantes en el POS
 * ⚡ OPTIMIZADO: Solo conecta cuando está habilitado
 */

import { useCodecVerify, AlertaPagoEntrante } from './AlertaPagoEntrante';
import { useEffect, useState } from 'react';

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