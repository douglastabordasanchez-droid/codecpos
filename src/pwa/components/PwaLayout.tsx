import { useState } from 'react';
import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router';
import { Loader2, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { DesktopLayout } from './DesktopLayout';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useModulosActivos } from '../hooks/useModulosActivos';

/**
 * Mismo enlace, misma app, mismo login — en pantallas ≥1024px (12" en
 * adelante) se ve como el sistema de escritorio (sidebar, como Electron);
 * en celular sigue el shell de bottom nav de siempre. Ninguna página ni
 * servicio cambia, solo la navegación que las envuelve.
 */
export function PwaLayout() {
  const { empleado, cargando } = usePwaAuth();
  const { appHabilitada } = useModulosActivos();
  const esEscritorio = useIsDesktop();
  const [navInferiorVisible, setNavInferiorVisible] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    const avisar = async () => {
      const { data } = await client.from('avisos_licencia')
        .select('id, programado_para')
        .eq('cliente_id', empleado.cliente_id)
        .is('enviado_en', null)
        .lte('programado_para', new Date().toISOString())
        .order('programado_para', { ascending: true })
        .limit(1);
      const aviso = data?.[0];
      if (!aviso) return;
      toast.warning('Tu prueba vence pronto', { description: 'Faltan 2 días para renovar Codec POS.' });
      await client.from('avisos_licencia').update({ enviado_en: new Date().toISOString() }).eq('id', aviso.id);
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
      <div className="w-full max-w-[432px] mx-auto">
        <Outlet />
      </div>
      {navInferiorVisible && <BottomNav />}
    </>
  );
}
