/**
 * Overlay de cámara para escanear el QR de sucursal generado en Electron
 * (Multi-Tienda > botón QR) — payload `{type:'codec_pos_tienda', cliente_id,
 * tienda_id, tienda_nombre}`. Compartido por PersonalPage.tsx (admin asigna
 * la sucursal fija de OTRO empleado) y PanaderiaPage.tsx (el propio usuario,
 * normalmente el dueño moviéndose entre locales, elige qué sucursal ve en
 * ESTE dispositivo/sesión) — misma cámara, mismo formato de QR, dos usos
 * distintos del resultado.
 *
 * Se monta vía portal directo a `document.body`: quien lo abre (ej. el ícono
 * de la barra inferior) vive dentro de contenedores angostos con `flex-1`,
 * así que si el overlay se renderizara en su lugar normal del árbol React
 * heredaría ese ancho reducido. El portal lo saca de ahí para que siempre
 * ocupe la pantalla completa sin importar desde dónde se abra.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
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

    // TRY_HARDER + restringir a QR ayuda bastante cuando se escanea un QR
    // mostrado en una pantalla (brillo/reflejo) en vez de impreso en papel.
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } } },
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

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />

      {/* Scrim oscuro con recorte cuadrado centrado — guía visual de encuadre */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        <div className="flex-1 bg-black/70" />
        <div className="flex items-stretch shrink-0" style={{ height: 'min(72vw, 320px)' }}>
          <div className="flex-1 bg-black/70" />
          <div className="relative shrink-0" style={{ width: 'min(72vw, 320px)' }}>
            <div className="absolute inset-0 rounded-3xl ring-1 ring-white/30" />
            <span className="absolute -top-px -left-px w-9 h-9 border-t-[3px] border-l-[3px] border-violet-400 rounded-tl-3xl" />
            <span className="absolute -top-px -right-px w-9 h-9 border-t-[3px] border-r-[3px] border-violet-400 rounded-tr-3xl" />
            <span className="absolute -bottom-px -left-px w-9 h-9 border-b-[3px] border-l-[3px] border-violet-400 rounded-bl-3xl" />
            <span className="absolute -bottom-px -right-px w-9 h-9 border-b-[3px] border-r-[3px] border-violet-400 rounded-br-3xl" />
          </div>
          <div className="flex-1 bg-black/70" />
        </div>
        <div className="flex-1 bg-black/70" />
      </div>

      {/* Encabezado flotante */}
      <div
        className="absolute top-0 inset-x-0 px-5 pb-5 flex items-start justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0 pr-3">
          <h1 className="text-white text-lg font-black leading-tight">{titulo || 'Escanear QR de sucursal'}</h1>
          {subtitulo && <p className="text-slate-300 text-sm mt-0.5">{subtitulo}</p>}
        </div>
        <button
          onClick={onCerrar}
          className="p-2.5 rounded-full bg-white/10 backdrop-blur-md text-white shrink-0 active:bg-white/20"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Pie flotante */}
      <div
        className="absolute bottom-0 inset-x-0 px-8 pt-10 text-center bg-gradient-to-t from-black/80 via-black/40 to-transparent"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-slate-200 text-sm font-medium">
          Apunta la cámara al QR generado en Electron &gt; Multi-Tienda
        </p>
      </div>

      {errorCamara && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 px-8">
          <div className="text-center max-w-xs">
            <p className="text-red-400 text-sm mb-4">{errorCamara}</p>
            <button
              onClick={onCerrar}
              className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold border border-slate-700 active:bg-slate-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
