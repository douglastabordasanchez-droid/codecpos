/**
 * CODEC POS v2.0 — Facturación Electrónica DIAN (habilitación propia)
 *
 * Punto de entrada visual dentro de Configuración → Facturación Electrónica
 * cuando el negocio elige "DIAN directo". Muestra el PERFIL FISCAL activo
 * (si existe), permite abrir el asistente para configurarlo/crear uno nuevo,
 * y lista los perfiles históricos (persona natural → SAS, etc.) — nunca se
 * edita en el sitio un perfil que ya facturó, se crea uno nuevo y se activa.
 * La lógica real vive en src/app/lib/dian/ — este componente es solo la
 * vitrina + el trigger del asistente.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2, Settings2, History, PlusCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { listarPerfilesFiscales, activarPerfilFiscal as activarPerfilFiscalRpc } from '../../lib/supabase/fiscalProfileService';
import type { FiscalProfile, EstadoPerfilFiscal } from '../../lib/dian/types';
import { AsistenteConfiguracionDian } from './AsistenteConfiguracionDian';

const ESTADO_INFO: Record<EstadoPerfilFiscal, { label: string; color: string; Icon: typeof ShieldCheck }> = {
  NOT_CONFIGURED: { label: 'No configurado', color: 'text-slate-400', Icon: ShieldOff },
  CONFIGURING: { label: 'En configuración', color: 'text-amber-400', Icon: ShieldAlert },
  TESTING: { label: 'En pruebas (habilitación)', color: 'text-sky-400', Icon: ShieldAlert },
  READY_FOR_PRODUCTION: { label: 'Listo para producción', color: 'text-sky-400', Icon: ShieldAlert },
  ACTIVE: { label: 'Activo en producción', color: 'text-emerald-400', Icon: ShieldCheck },
  SUSPENDED: { label: 'Suspendido', color: 'text-red-400', Icon: ShieldAlert },
  ERROR: { label: 'Error de configuración', color: 'text-red-400', Icon: ShieldAlert },
};

export function ConfiguracionDianDirecto({ darkMode }: { darkMode: boolean }) {
  const [perfiles, setPerfiles] = useState<FiscalProfile[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asistente, setAsistente] = useState<{ abierto: boolean; perfil: FiscalProfile | null }>({ abierto: false, perfil: null });
  const [activando, setActivando] = useState<string | null>(null);
  const clienteId = getLinkedClienteId();

  const cargar = async () => {
    setCargando(true);
    const lista = await listarPerfilesFiscales(clienteId || undefined);
    setPerfiles(lista);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  if (!clienteId) {
    return (
      <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-amber-900/30 border-amber-600 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
        Esta instalación todavía no está vinculada a la nube — la facturación DIAN directa necesita que primero
        vincules el negocio (ver "Vinculación con la nube" arriba en Configuración).
      </div>
    );
  }

  const perfilActivo = perfiles.find((p) => p.activo) || null;
  // "Borrador" = el perfil no-activo más reciente que todavía no llegó a ACTIVE — se sigue editando en vez de crear otro.
  const borrador = !perfilActivo ? perfiles.find((p) => p.estado !== 'ACTIVE') || null : null;
  const historicos = perfiles.filter((p) => p.id !== perfilActivo?.id && p.id !== borrador?.id);

  const info = ESTADO_INFO[perfilActivo?.estado || borrador?.estado || 'NOT_CONFIGURED'];
  const Icon = info.Icon;

  async function activar(perfilId: string) {
    setActivando(perfilId);
    try {
      await activarPerfilFiscalRpc(perfilId);
      toast.success('Perfil fiscal activado');
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo activar el perfil');
    } finally {
      setActivando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-xl border-2 flex items-center justify-between gap-4 ${
        darkMode ? 'bg-slate-800/60 border-slate-600' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          {cargando ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          ) : (
            <Icon className={`w-6 h-6 ${info.color}`} />
          )}
          <div>
            <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {perfilActivo?.nombreORazonSocial || borrador?.nombreORazonSocial || 'Estado DIAN'}
            </p>
            <p className={`text-sm ${info.color}`}>{cargando ? 'Cargando...' : info.label}</p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setAsistente({ abierto: true, perfil: perfilActivo?.estado === 'ACTIVE' ? null : (perfilActivo || borrador) })}
          className="bg-gradient-to-b from-orange-500 to-orange-700"
        >
          <Settings2 className="w-4 h-4 mr-2" />
          {perfilActivo || borrador ? 'Editar / continuar' : 'Configurar'}
        </Button>
      </div>

      {(perfilActivo || borrador) && (
        <div className={`p-4 rounded-xl border grid grid-cols-2 gap-3 text-sm ${darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
          <div><span className="opacity-60">NIT:</span> {(perfilActivo || borrador)?.nit || '—'}{(perfilActivo || borrador)?.digitoVerificacion ? `-${(perfilActivo || borrador)?.digitoVerificacion}` : ''}</div>
          <div><span className="opacity-60">Tipo:</span> {(perfilActivo || borrador)?.tipoPersona === 'juridica' ? 'Persona jurídica' : 'Persona natural'}</div>
          <div><span className="opacity-60">Ambiente:</span> {(perfilActivo || borrador)?.ambiente === 'produccion' ? 'Producción' : 'Habilitación (pruebas)'}</div>
          <div><span className="opacity-60">PIN configurado:</span> {(perfilActivo || borrador)?.pinConfigurado ? 'Sí' : 'No'}</div>
        </div>
      )}

      {perfilActivo && (
        <button
          type="button"
          onClick={() => setAsistente({ abierto: true, perfil: null })}
          className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold ${
            darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          Crear nuevo perfil fiscal (ej. paso de persona natural a SAS)
        </button>
      )}

      {historicos.length > 0 && (
        <div className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Perfiles fiscales históricos</p>
          {historicos.map((p) => (
            <div key={p.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-sm ${darkMode ? 'bg-slate-800/40 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
              <span>{p.nombreORazonSocial} · NIT {p.nit || '—'} · {ESTADO_INFO[p.estado].label}</span>
              {p.estado === 'READY_FOR_PRODUCTION' && (
                <Button type="button" size="sm" variant="outline" disabled={activando === p.id} onClick={() => p.id && activar(p.id)}>
                  {activando === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Activar'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <a
        href="#/facturacion-electronica"
        className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold ${
          darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <History className="w-4 h-4" />
        Ver historial de facturas electrónicas
      </a>

      {asistente.abierto && (
        <AsistenteConfiguracionDian
          clienteId={clienteId}
          perfilExistente={asistente.perfil}
          darkMode={darkMode}
          onClose={() => setAsistente({ abierto: false, perfil: null })}
          onGuardado={() => { setAsistente({ abierto: false, perfil: null }); cargar(); }}
        />
      )}
    </div>
  );
}
