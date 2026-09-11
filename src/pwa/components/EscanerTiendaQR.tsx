/**
 * Overlay de cámara para escanear el QR de sucursal generado en Electron
 * (Multi-Tienda > botón QR) — payload `{type:'codec_pos_tienda', cliente_id,
 * tienda_id, tienda_nombre}`. Compartido por PersonalPage.tsx (admin asigna
 * la sucursal fija de OTRO empleado) y PanaderiaPage.tsx (el propio usuario,
 * normalmente el dueño moviéndose entre locales, elige qué sucursal ve en
 * ESTE dispositivo/sesión) — misma cámara, mismo formato de QR, dos usos
 * distintos del resultado.
 */
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export interface QRPayloadTienda {
  type: 'codec_pos_tienda';
  version: number;
  cliente_id: string;
  tienda_id: string;
  tienda_nombre: string;
}

interface Props {
  clienteIdEsperado: string;
  titulo?: string;
  subtitulo?: string;
  onResultado: (payload: QRPayloadTienda) => void;
  onCerrar: () => void;
}

export function EscanerTiendaQR({ clienteIdEsperado, titulo, subtitulo, onResultado, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    setErrorCamara(null);
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result, _err, controls) => {
          controlsRef.current = controls;
          if (!result) return;
          controls.stop();
          let payload: QRPayloadTienda;
          try {
            payload = JSON.parse(result.getText());
          } catch {
            toast.error('Este código QR no es válido');
            onCerrar();
            return;
          }
          if (payload?.type !== 'codec_pos_tienda' || !payload.tienda_id) {
            toast.error('Este código QR no es de una sucursal de CODEC POS');
            onCerrar();
            return;
          }
          if (payload.cliente_id !== clienteIdEsperado) {
            toast.error('Este QR pertenece a otro negocio — no se puede usar aquí');
            onCerrar();
            return;
          }
          onResultado(payload);
        }
      )
      .catch((e: any) => {
        if (e?.name === 'NotAllowedError') setErrorCamara('Permiso de cámara denegado.');
        else if (e?.name === 'NotFoundError') setErrorCamara('No se encontró ninguna cámara.');
        else setErrorCamara(e?.message || 'No se pudo acceder a la cámara');
      });
    return () => controlsRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteIdEsperado]);

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-white text-lg font-black">{titulo || 'Escanear QR de sucursal'}</h1>
          {subtitulo && <p className="text-slate-400 text-sm">{subtitulo}</p>}
        </div>
        <button onClick={onCerrar} className="p-2 rounded-full bg-slate-900 text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-5">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4/5 h-2/3 border-2 border-violet-400/70 rounded-xl" />
          </div>
        </div>
        {errorCamara && (
          <div className="mt-4 text-center">
            <p className="text-red-400 text-sm mb-3">{errorCamara}</p>
            <button onClick={onCerrar} className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 text-sm border border-slate-700">
              Cerrar
            </button>
          </div>
        )}
        <p className="text-slate-500 text-xs text-center mt-4">Apunta la cámara al QR generado en Electron &gt; Multi-Tienda</p>
      </div>
    </div>
  );
}
