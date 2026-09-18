/**
 * Pantalla de licencia vencida/por vencer -- CODEC POS v2.0
 *
 * A esta ruta ('/planes') llega el usuario por dos caminos:
 *  1) POSLayoutSidebar lo redirige aquí a la fuerza cuando la licencia ya
 *     está EXPIRADA/VENCIDA (antes esta ruta no existía y el router
 *     rebotaba de vuelta a /pos, generando un loop infinito de navegación
 *     -- esa era la causa real del "parpadeo" reportado por Papotas: el
 *     negocio tenía la licencia vencida, no era un bug de rendimiento).
 *  2) El botón "Pagar ahora" del aviso de vencimiento (useAvisoLicencia,
 *     un día antes) trae aquí a alguien cuya licencia AÚN no se ha vencido.
 *
 * El pago reutiliza la misma Mercado Pago Checkout Pro que ya usa la PWA
 * (licenciaPagoService.ts) -- se abre en el navegador del sistema porque
 * Electron no puede incrustar el checkout, y esta pantalla hace polling del
 * resultado real (que solo escribe el webhook, nunca el regreso del
 * navegador) hasta ver la licencia activada.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, CreditCard, ArrowLeft } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import { iniciarPagoLicencia, consultarEstadoPagoLicencia, EstadoPagoLicencia } from '../../lib/licenciaPagoService';
import { Button } from '../ui/button';

type Fase = 'INICIAL' | 'ABRIENDO' | 'VERIFICANDO' | EstadoPagoLicencia;

const MODALIDAD_LABEL: Record<string, string> = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
  VITALICIA: 'Vitalicio',
};

export default function PlanVencidoPage() {
  const { darkMode } = usePOS();
  const navigate = useNavigate();
  const { planInfo, cargando } = usePlanRestrictions();

  const [fase, setFase] = useState<Fase>('INICIAL');
  const [error, setError] = useState<string | null>(null);
  const externalRefRef = useRef<string | null>(null);
  const intentos = useRef(0);

  const licenciaVencida = planInfo.estado === 'EXPIRADA' || planInfo.estado === 'VENCIDA';

  useEffect(() => {
    if (fase !== 'VERIFICANDO' || !externalRefRef.current) return;
    let cancelado = false;
    const MAX_INTENTOS = 40; // ~80s -- el webhook de Mercado Pago suele llegar en segundos

    const consultar = async () => {
      const estado = await consultarEstadoPagoLicencia(externalRefRef.current!);
      if (cancelado) return;

      if (estado && estado !== 'PENDIENTE' && estado !== 'EN_PROCESO') {
        setFase(estado);
        return;
      }
      intentos.current += 1;
      if (intentos.current >= MAX_INTENTOS) {
        setFase(estado || 'EN_PROCESO');
        return;
      }
      setTimeout(consultar, 2000);
    };

    consultar();
    return () => { cancelado = true; };
  }, [fase]);

  const handlePagar = async () => {
    setError(null);
    setFase('ABRIENDO');
    const planCodigo = planInfo.plan || 'PREMIUM';
    const modalidad = planInfo.modalidad || 'MENSUAL';

    const resultado = await iniciarPagoLicencia(planCodigo, modalidad);
    if (!resultado.ok || !resultado.externalReference) {
      setError(resultado.error || 'No se pudo iniciar el pago');
      setFase('INICIAL');
      return;
    }
    externalRefRef.current = resultado.externalReference;
    intentos.current = 0;
    setFase('VERIFICANDO');
  };

  const reintentarVerificacion = () => {
    intentos.current = 0;
    setFase('VERIFICANDO');
  };

  const bg = darkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-white to-emerald-50';
  const card = darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';

  if (cargando) {
    return (
      <div className={`min-h-screen h-screen flex items-center justify-center ${bg}`}>
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const fechaVencimiento = planInfo.fechaFinPeriodoActual
    ? new Date(planInfo.fechaFinPeriodoActual).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className={`min-h-screen h-screen overflow-y-auto p-6 flex items-center justify-center ${bg}`}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-md rounded-3xl border-2 p-6 ${card}`}
      >
        {/* Encabezado según fase */}
        {(fase === 'INICIAL' || fase === 'ABRIENDO') && (
          <>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${licenciaVencida ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
              <AlertTriangle className={`w-7 h-7 ${licenciaVencida ? 'text-red-500' : 'text-amber-500'}`} />
            </div>
            <h1 className={`text-xl font-black mb-1 ${txt}`}>
              {licenciaVencida ? 'Tu licencia venció' : 'Tu licencia está por vencer'}
            </h1>
            <p className={`text-sm mb-4 ${sub}`}>
              {licenciaVencida
                ? 'El sistema quedó bloqueado. Realiza el pago para reactivarlo de inmediato.'
                : 'Renueva ahora para que el sistema no se bloquee cuando venza.'}
            </p>

            <div className={`rounded-2xl border p-4 mb-5 space-y-1.5 ${darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex justify-between text-sm">
                <span className={sub}>Plan</span>
                <span className={`font-bold ${txt}`}>{planInfo.plan || 'PREMIUM'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={sub}>Modalidad</span>
                <span className={`font-bold ${txt}`}>{MODALIDAD_LABEL[planInfo.modalidad || ''] || planInfo.modalidad || 'Mensual'}</span>
              </div>
              {fechaVencimiento && (
                <div className="flex justify-between text-sm">
                  <span className={sub}>{licenciaVencida ? 'Venció el' : 'Vence el'}</span>
                  <span className={`font-bold ${txt}`}>{fechaVencimiento}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
                {error}
              </div>
            )}

            <Button
              onClick={handlePagar}
              disabled={fase === 'ABRIENDO'}
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg"
            >
              {fase === 'ABRIENDO' ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Abriendo Mercado Pago...</>
              ) : (
                <><CreditCard className="w-4 h-4 mr-2" /> Pagar ahora</>
              )}
            </Button>
            <p className={`text-xs text-center mt-2 ${sub}`}>Se abrirá Mercado Pago en tu navegador. El sistema se activa automáticamente al aprobarse el pago.</p>

            {!licenciaVencida && (
              <button
                onClick={() => navigate('/pos')}
                className={`w-full mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold ${sub} ${darkMode ? 'hover:text-white' : 'hover:text-slate-900'}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Ahora no, volver al sistema
              </button>
            )}
          </>
        )}

        {fase === 'VERIFICANDO' && (
          <div className="text-center py-4">
            <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-4" />
            <h2 className={`text-lg font-black mb-1 ${txt}`}>Verificando tu pago...</h2>
            <p className={`text-sm ${sub}`}>Estamos confirmando el resultado directamente con Mercado Pago. No cierres esta ventana.</p>
          </div>
        )}

        {fase === 'APROBADO' && (
          <div className="text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className={`text-lg font-black mb-1 ${txt}`}>¡Pago aprobado!</h2>
            <p className={`text-sm mb-5 ${sub}`}>Tu licencia ya quedó activa. Puedes seguir usando Codec POS sin restricciones.</p>
            <Button
              onClick={() => window.location.reload()}
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
            >
              Continuar
            </Button>
          </div>
        )}

        {(fase === 'EN_PROCESO' || fase === 'PENDIENTE') && (
          <div className="text-center py-4">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className={`text-lg font-black mb-1 ${txt}`}>Tu pago está en proceso</h2>
            <p className={`text-sm mb-5 ${sub}`}>Mercado Pago todavía está confirmando este pago (algunos medios tardan un poco más). Se activará solo apenas se confirme.</p>
            <Button onClick={reintentarVerificacion} variant="outline" className="w-full h-11 rounded-xl font-bold">
              Revisar de nuevo
            </Button>
          </div>
        )}

        {(fase === 'RECHAZADO' || fase === 'CANCELADO' || fase === 'REEMBOLSADO') && (
          <div className="text-center py-4">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className={`text-lg font-black mb-1 ${txt}`}>
              {fase === 'RECHAZADO' ? 'El pago no fue aprobado' : fase === 'CANCELADO' ? 'Pago cancelado' : 'Pago reembolsado'}
            </h2>
            <p className={`text-sm mb-5 ${sub}`}>Puedes intentar de nuevo con otro medio de pago.</p>
            <Button
              onClick={() => setFase('INICIAL')}
              className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
            >
              Intentar de nuevo
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
