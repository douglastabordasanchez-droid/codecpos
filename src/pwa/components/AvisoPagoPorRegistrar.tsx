/**
 * Aviso en el punto de venta (caja, terminal) y en Vender (celular) mientras se
 * registra un pago que llegó sin venta (Ventas › Registrar). Al cobrar una venta
 * del mismo valor con ese medio, la espera de pago lo reconoce sola
 * (suscribirPagoEsperado) y el aviso se quita.
 */
import { useEffect, useState } from 'react';
import { Receipt, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  EVENTO_PAGO_POR_REGISTRAR,
  guardarPagoPorRegistrar,
  leerPagoPorRegistrar,
  pagoYaRegistrado,
  type PagoSinVenta,
} from '../../app/lib/supabase/pagosSinVenta';
import { nombreMedioPago } from '../../app/lib/voz';

export function AvisoPagoPorRegistrar({ className = '' }: { className?: string }) {
  const [pago, setPago] = useState<PagoSinVenta | null>(() => leerPagoPorRegistrar());

  useEffect(() => {
    const leer = () => setPago(leerPagoPorRegistrar());
    window.addEventListener(EVENTO_PAGO_POR_REGISTRAR, leer);
    return () => window.removeEventListener(EVENTO_PAGO_POR_REGISTRAR, leer);
  }, []);

  // Cada 8 s se mira si una venta ya lo reclamó.
  useEffect(() => {
    if (!pago) return;
    const t = window.setInterval(async () => {
      const listo = await pagoYaRegistrado(pago.id).catch(() => null);
      if (listo) {
        guardarPagoPorRegistrar(null);
        toast.success(`Pago de $${Math.round(pago.monto).toLocaleString('es-CO')} registrado en la venta`);
      }
    }, 8000);
    return () => window.clearInterval(t);
  }, [pago]);

  if (!pago) return null;
  const medio = nombreMedioPago(pago.entidad) || 'transferencia';
  const hora = new Date(pago.created_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-blue-400/60 bg-blue-600 px-3 py-2 text-[#fff] shadow-lg ${className}`}>
      <Receipt className="w-5 h-5 shrink-0" />
      <p className="flex-1 min-w-0 text-sm leading-tight">
        <b>Registrando pago de ${Math.round(pago.monto).toLocaleString('es-CO')} por {medio}</b> ({hora}).
        {' '}Agrega los productos y cobra con {medio}: el pago se reconoce solo.
      </p>
      <button type="button" onClick={() => guardarPagoPorRegistrar(null)} className="shrink-0 p-1 rounded-lg hover:bg-white/20" aria-label="Quitar aviso">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
