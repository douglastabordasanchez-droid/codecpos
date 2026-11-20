/**
 * Encargos de tortas en el celular y la web. El abono y el saldo pasan a Vender
 * para cobrarlos con cualquier medio de pago (efectivo, Bre-B con Codec Verify…).
 */
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { EncargosPanel } from '../components/EncargosPanel';
import { transferirAlCarrito } from '../lib/carritoTransferido';

export default function EncargosPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const oscuro = typeof document === 'undefined' || document.documentElement.getAttribute('data-theme') !== 'light';
  if (!empleado) return null;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-200" aria-label="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-white text-xl font-black leading-tight">Encargos de tortas</h1>
          <p className="text-slate-400 text-xs">Pedidos con abono: quién, cómo la quiere y cuándo la recoge.</p>
        </div>
      </div>
      <div className="px-5">
        <EncargosPanel
          clienteId={empleado.cliente_id}
          nombreUsuario={empleado.nombre_completo}
          oscuro={oscuro}
          onCobrar={(lineas) => {
            const ok = transferirAlCarrito(lineas.map((l) => ({ productoId: l.id, nombre: l.nombre, cantidad: 1, precio: l.precio, precioOriginal: l.precio, sinInventario: true })));
            if (!ok) { toast.error('No se pudo pasar el cobro a Vender'); return; }
            navigate('/vender');
          }}
        />
      </div>
    </div>
  );
}
