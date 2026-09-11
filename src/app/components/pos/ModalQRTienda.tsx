import { useEffect, useState } from 'react';
import { X, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import type { Tienda } from '../../lib/multitiendaService';

/**
 * Modal de QR de sucursal — compartido por Multi-Tienda (una tarjeta por
 * sucursal) y por el acceso rápido en Punto de Venta (la sucursal que está
 * activa en este equipo ahora mismo). Mismo payload, mismo modal, dos
 * puntos de entrada.
 *
 * Vinculación rápida (requerimiento Multi-Tienda): desde la PWA/celular se
 * usa para 1) que un admin asigne la sucursal fija de OTRO empleado
 * (Personal > Vincular sucursal), o 2) que el propio admin/dueño conecte SU
 * celular a la sucursal donde está parado (ícono en el menú inferior). El
 * payload NO trae credenciales — solo identifica cliente_id (para que la
 * app rechace un QR de otro negocio) y tienda_id/nombre. Cualquier
 * asignación real de permisos pasa por el RPC `asignar_empleado_a_tienda`
 * (migración 0092), que exige que quien escanea esté autenticado como admin
 * de ESTE mismo cliente_id — este QR por sí solo no otorga acceso a nada.
 */
export interface ModalQRTiendaProps {
  isOpen: boolean;
  onClose: () => void;
  tienda: Tienda | null;
}

export function ModalQRTienda({ isOpen, onClose, tienda }: ModalQRTiendaProps) {
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (!isOpen || !tienda) { setQrDataUrl(''); return; }
    setGenerando(true);
    (async () => {
      try {
        const { getLinkedClienteId } = await import('../../lib/supabase/tenantLink');
        const QRCodeGenerator = (await import('qrcode')).default;
        const clienteId = getLinkedClienteId();
        if (!clienteId) {
          toast.error('Este equipo aún no está vinculado a la nube — vincúlalo primero para generar el QR');
          setGenerando(false);
          return;
        }
        const payload = JSON.stringify({
          type: 'codec_pos_tienda',
          version: 1,
          cliente_id: clienteId,
          tienda_id: tienda.id,
          tienda_nombre: tienda.nombre,
        });
        const dataUrl = await QRCodeGenerator.toDataURL(payload, {
          width: 300,
          margin: 2,
          color: { dark: '#1f2937', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        setQrDataUrl(dataUrl);
      } catch {
        toast.error('No se pudo generar el código QR');
      } finally {
        setGenerando(false);
      }
    })();
  }, [isOpen, tienda]);

  if (!isOpen || !tienda) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <div className={`relative rounded-3xl shadow-2xl border p-6 text-center ${dm('border-white/10 bg-slate-900', 'border-gray-200 bg-white')}`}>
          <button onClick={onClose} className={`absolute top-4 right-4 p-1.5 rounded-full ${dm('text-white/50 hover:text-white hover:bg-white/10', 'text-gray-400 hover:text-gray-700 hover:bg-gray-100')}`}>
            <X className="w-4 h-4" />
          </button>

          <div className="text-3xl mb-1">{tienda.emoji}</div>
          <h3 className={`text-lg font-bold ${dm('text-white', 'text-gray-900')}`}>{tienda.nombre}</h3>
          <p className={`text-xs mb-5 ${dm('text-white/50', 'text-gray-500')}`}>QR de conexión de sucursal</p>

          <div className="w-full max-w-[260px] mx-auto bg-white rounded-2xl p-4 shadow-lg">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR de ${tienda.nombre}`} className="w-full h-auto rounded-lg" />
            ) : (
              <div className="aspect-square flex items-center justify-center">
                {generando ? <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" /> : <Info className="w-8 h-8 text-slate-300" />}
              </div>
            )}
          </div>

          <div className={`mt-5 text-left text-xs rounded-xl p-3 ${dm('bg-white/5 text-white/60', 'bg-gray-50 text-gray-500')}`}>
            <p className="font-semibold mb-1">Cómo usarlo:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Abre la app en el celular e ingresa con tu usuario</li>
              <li>Toca el ícono de sucursal (menú inferior o Personal)</li>
              <li>Apunta la cámara a este código</li>
              <li>Ese celular queda conectado a "{tienda.nombre}"</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
