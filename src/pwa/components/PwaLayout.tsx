import { useState } from 'react';
import { useEffect } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router';
import { Loader2, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { DesktopLayout } from './DesktopLayout';
import { SucursalFlotante } from './SucursalFlotante';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { PantallaBloqueoLicencia } from '../../app/components/licencia/PantallaBloqueoLicencia';
import { tituloAvisoLicencia } from '../../app/lib/bloqueoLicencia';
import { useAvisoNumeracionDian } from '../../app/hooks/useAvisoNumeracionDian';

/**
 * Mismo enlace, misma app, mismo login — en pantallas ≥1024px (12" en
 * adelante) se ve como el sistema de escritorio (sidebar, como Electron);
 * en celular sigue el shell de bottom nav de siempre. Ninguna página ni
 * servicio cambia, solo la navegación que las envuelve.
 */
export function PwaLayout() {
  const { empleado, cargando, cerrarSesion } = usePwaAuth();
  const { appHabilitada, bloqueoLicencia, nombreNegocio } = useModulosActivos();
  const esEscritorio = useIsDesktop();
  const [navInferiorVisible, setNavInferiorVisible] = useState(true);
  const navigate = useNavigate();

  // 🧾 Numeración DIAN que vence en 15 días o menos: aviso diario al administrador.
  useAvisoNumeracionDian(empleado?.es_staff_codec ? null : empleado?.cliente_id, empleado?.rol === 'super_usuario' || empleado?.rol === 'admin');

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    const avisar = async () => {
      const { data } = await client.from('avisos_licencia')
        .select('id, tipo, programado_para')
        .eq('cliente_id', empleado.cliente_id)
        .is('enviado_en', null)
        .lte('programado_para', new Date().toISOString())
        .order('programado_para', { ascending: false });
      const aviso = data?.[0];
      if (!aviso) return;
      toast.warning(tituloAvisoLicencia(aviso.tipo), {
        description: 'Renueva tu plan de Codec POS. Si no se recibe el pago, el sistema se pausa el día que vence.',
        duration: 20000,
        action: { label: 'Pagar ahora', onClick: () => navigate('/planes') },
      });
      // Si se acumularon (equipo apagado), se muestra el más reciente y se dan todos por entregados.
      await client.from('avisos_licencia').update({ enviado_en: new Date().toISOString() }).in('id', (data ?? []).map((a) => a.id));
    };
    avisar();
    const canal = client.channel(`avisos-licencia-${empleado.cliente_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos_licencia', filter: `cliente_id=eq.${empleado.cliente_id}` }, avisar)
      .subscribe();
    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id]);

  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!empleado) {
    return <Navigate to="/login" replace />;
  }

  // 🔒 Negocio suspendido o con la licencia vencida: no se puede usar la app.
  // El staff de Codec Studio no se bloquea, para poder seguir administrando.
  if (bloqueoLicencia && !empleado.es_staff_codec) {
    return (
      <PantallaBloqueoLicencia
        motivo={bloqueoLicencia}
        nombreNegocio={nombreNegocio}
        onVerificar={() => { window.dispatchEvent(new Event('codecpos:revisar-licencia')); }}
        onCerrarSesion={cerrarSesion}
      />
    );
  }

  // 📱 Gate de pago: el negocio del empleado no tiene la app móvil activada.
  // `appHabilitada === null` mientras carga — no bloquear con datos viejos.
  if (appHabilitada === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-center mb-4 shadow-sm">
          <CloudOff className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-white font-bold text-lg mb-1">Esperando conexión con app</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          Tu negocio todavía no tiene la app móvil activada. Contacta a Codec Studio para activarla.
        </p>
      </div>
    );
  }

  if (esEscritorio) {
    return <DesktopLayout />;
  }

  return (
    <>
      <TopBar navInferiorVisible={navInferiorVisible} onToggleNavInferior={() => setNavInferiorVisible((v) => !v)} />
      <main
        className={`w-full min-h-[100dvh] overflow-x-hidden ${
          navInferiorVisible ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : ''
        }`}
      >
        <Outlet />
      </main>
      {navInferiorVisible && <BottomNav />}
      <SucursalFlotante sobreNavInferior={navInferiorVisible} />
    </>
  );
}
