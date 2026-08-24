import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { getSupabaseClient } from '../../app/lib/supabase/config';

type EstadoPago = 'PENDIENTE' | 'EN_PROCESO' | 'APROBADO' | 'RECHAZADO' | 'CANCELADO' | 'REEMBOLSADO';

/**
 * Página de retorno del Checkout Pro de Mercado Pago (success/pending/failure
 * en back_urls, ver crear-pago-licencia). A propósito NUNCA confía en que el
 * usuario haya vuelto aquí como señal de "pagó" -- el estado real solo lo
 * escribe el webhook (webhook-mercadopago) sobre `pagos_licencia`. Esta
 * página solo hace polling de esa fila hasta ver un estado final.
 */
export default function PagoResultadoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const externalReference = params.get('external_reference');

  const [estado, setEstado] = useState<EstadoPago | 'BUSCANDO' | 'NO_ENCONTRADO'>('BUSCANDO');
  const intentos = useRef(0);

  useEffect(() => {
    if (!externalReference) {
      setEstado('NO_ENCONTRADO');
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setEstado('NO_ENCONTRADO');
      return;
    }

    let cancelado = false;
    const MAX_INTENTOS = 20; // ~40s de espera (webhook suele llegar en segundos)

    const consultar = async () => {
      const { data } = await client
        .from('pagos_licencia')
        .select('estado')
        .eq('external_reference', externalReference)
        .maybeSingle();

      if (cancelado) return;

      const est = data?.estado as EstadoPago | undefined;
      if (est && est !== 'PENDIENTE' && est !== 'EN_PROCESO') {
        setEstado(est);
        return;
      }
      // Sigue pendiente (o todavía no llegó el webhook) -- reintenta.
      intentos.current += 1;
      if (intentos.current >= MAX_INTENTOS) {
        setEstado(est || 'EN_PROCESO');
        return;
      }
      setTimeout(consultar, 2000);
    };

    consultar();
    return () => { cancelado = true; };
  }, [externalReference]);

  const contenido = () => {
    switch (estado) {
      case 'BUSCANDO':
        return {
          icon: <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />,
          titulo: 'Verificando tu pago…',
          texto: 'Estamos confirmando el resultado directamente con Mercado Pago. No cierres esta pantalla.',
        };
      case 'APROBADO':
        return {
          icon: <CheckCircle2 className="w-10 h-10 text-emerald-400" />,
          titulo: '¡Pago aprobado!',
          texto: 'Tu plan ya quedó activado. Puedes seguir usando Codec POS sin restricciones.',
        };
      case 'EN_PROCESO':
      case 'PENDIENTE':
        return {
          icon: <Clock className="w-10 h-10 text-amber-400" />,
          titulo: 'Tu pago está en proceso',
          texto: 'Mercado Pago todavía está confirmando este pago (algunos medios tardan un poco más). Te avisaremos apenas se confirme -- puedes revisar el estado más tarde en Planes.',
        };
      case 'RECHAZADO':
        return {
          icon: <XCircle className="w-10 h-10 text-red-400" />,
          titulo: 'El pago no fue aprobado',
          texto: 'Mercado Pago rechazó este pago. Puedes intentar de nuevo con otro medio de pago.',
        };
      case 'CANCELADO':
        return {
          icon: <XCircle className="w-10 h-10 text-red-400" />,
          titulo: 'Pago cancelado',
          texto: 'Este intento de pago fue cancelado.',
        };
      case 'REEMBOLSADO':
        return {
          icon: <XCircle className="w-10 h-10 text-red-400" />,
          titulo: 'Pago reembolsado',
          texto: 'Este pago fue reembolsado y no activó ningún plan.',
        };
      default:
        return {
          icon: <XCircle className="w-10 h-10 text-slate-400" />,
          titulo: 'No pudimos verificar este pago',
          texto: 'Si ya pagaste, escríbenos a soporte con el número de referencia para confirmarlo manualmente.',
        };
    }
  };

  const { icon, titulo, texto } = contenido();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h1 className="text-white text-xl font-black mb-2">{titulo}</h1>
      <p className="text-slate-400 text-sm mb-8 max-w-xs">{texto}</p>
      {externalReference && (
        <p className="text-slate-600 text-xs mb-6">Referencia: {externalReference}</p>
      )}
      <Button
        onClick={() => navigate('/planes', { replace: true })}
        className="w-full max-w-xs h-12 bg-gradient-to-r from-amber-500 to-orange-600"
      >
        Volver a Planes
      </Button>
    </div>
  );
}
