/**
 * CODEC POS v2.0 — Licencia de Software
 *
 * Pantalla "Acerca de" de uso INTERNO del negocio (no tiene ningún efecto
 * sobre cómo la DIAN valida las facturas electrónicas — eso lo garantiza la
 * cadena técnica de habilitación/CUFE/firma configurada en el asistente DIAN,
 * no una pantalla). Sirve para que el dueño (o cualquiera que revise el
 * equipo) confirme de un vistazo que esta instalación es una copia legítima
 * y con licencia activa de Codec Studio, con los datos reales del negocio y
 * del estado de la suscripción — nada de esto se inventa ni se guarda aquí,
 * todo viene de las mismas fuentes que ya usa el resto del sistema
 * (usePlanRestrictions, getRealMachineUUID, tenantLink, codec_pos_config).
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, Building2, Calendar, Fingerprint, Copy, Check, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import { getRealMachineUUID } from '../../utils/machineId';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { getCached } from '../../lib/cachedLocalStorage';

interface Props {
  darkMode: boolean;
}

interface EmpresaConfigBasica {
  nombreComercial?: string;
  razonSocial?: string;
  nit?: string;
  digitoVerificacion?: string;
}

const ESTADO_LABEL: Record<string, string> = {
  ACTIVA: 'Activa',
  TRIAL: 'Prueba gratuita',
  VENCIDA: 'Vencida',
  EXPIRADA: 'Vencida',
  SUSPENDIDA: 'Suspendida',
};

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function LicenciaSoftwareCard({ darkMode }: Props) {
  const { planInfo, cargando } = usePlanRestrictions();
  const [machineId, setMachineId] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const empresa = getCached<EmpresaConfigBasica>('codec_pos_config', {});
  const clienteId = getLinkedClienteId();

  useEffect(() => {
    getRealMachineUUID().then(setMachineId).catch(() => setMachineId(''));
    (window as any).electron?.getRuntimeVersions?.()
      .then((v: { appVersion?: string } | null) => setVersion(v?.appVersion ?? null))
      .catch(() => setVersion(null));
  }, []);

  const licenciaVigente = planInfo.estado === 'ACTIVA' || planInfo.enPrueba;
  const estadoTexto = planInfo.estado ? (ESTADO_LABEL[planInfo.estado] ?? planInfo.estado) : (cargando ? 'Verificando…' : 'Sin licencia vinculada');

  async function copiarId(valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      toast.success('Copiado');
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  const cardCls = darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200';
  const labelCls = darkMode ? 'text-gray-500' : 'text-gray-500';
  const valueCls = darkMode ? 'text-white' : 'text-gray-900';

  return (
    <div className="space-y-4">
      {/* Sello de originalidad */}
      <div className={`p-5 rounded-2xl border-2 flex items-center gap-4 ${
        licenciaVigente
          ? darkMode ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-emerald-50 border-emerald-300'
          : darkMode ? 'bg-red-900/20 border-red-700/40' : 'bg-red-50 border-red-300'
      }`}>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
          licenciaVigente ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-red-500 to-rose-600'
        }`}>
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <div>
          <p className={`font-bold text-lg ${licenciaVigente ? (darkMode ? 'text-emerald-300' : 'text-emerald-800') : (darkMode ? 'text-red-300' : 'text-red-800')}`}>
            {licenciaVigente ? 'Copia original con licencia activa' : 'Sin licencia activa'}
          </p>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Codec POS es desarrollado y licenciado por Codec Studio — esta instalación está registrada contra el
            negocio y la licencia que se muestran abajo.
          </p>
        </div>
      </div>

      {/* Datos del negocio + licencia */}
      <div className={`p-5 rounded-xl border-2 ${cardCls} space-y-4`}>
        <div className="flex items-center gap-2">
          <Building2 className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <h4 className={`font-bold ${valueCls}`}>Negocio licenciado</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className={labelCls}>Razón social / comercial</p>
            <p className={`font-semibold ${valueCls}`}>{empresa.nombreComercial || empresa.razonSocial || 'Sin configurar'}</p>
          </div>
          <div>
            <p className={labelCls}>NIT</p>
            <p className={`font-semibold ${valueCls}`}>
              {empresa.nit ? `${empresa.nit}${empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}` : 'Sin configurar'}
            </p>
          </div>
          <div>
            <p className={labelCls}>Plan</p>
            <p className={`font-semibold flex items-center gap-1.5 ${valueCls}`}>
              <Tag className="w-3.5 h-3.5" />
              {planInfo.plan === 'PREMIUM' ? 'Premium' : planInfo.plan === 'BASICO' ? 'Básico' : '—'}
            </p>
          </div>
          <div>
            <p className={labelCls}>Estado de la licencia</p>
            <p className={`font-semibold ${licenciaVigente ? 'text-emerald-500' : 'text-red-500'}`}>{estadoTexto}</p>
          </div>
          {planInfo.enPrueba && (
            <div>
              <p className={labelCls}>Días de prueba restantes</p>
              <p className={`font-semibold ${valueCls}`}>{planInfo.diasPruebaRestantes}</p>
            </div>
          )}
          {planInfo.fechaFinPeriodoActual && (
            <div>
              <p className={labelCls}>
                <Calendar className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                {planInfo.enPrueba ? 'Vence la prueba' : 'Próxima renovación'}
              </p>
              <p className={`font-semibold ${valueCls}`}>{fmtFecha(planInfo.fechaFinPeriodoActual)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Identificadores técnicos */}
      <div className={`p-5 rounded-xl border-2 ${cardCls} space-y-3`}>
        <div className="flex items-center gap-2">
          <Fingerprint className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          <h4 className={`font-bold ${valueCls}`}>Identificadores de esta instalación</h4>
        </div>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Úsalos si soporte de Codec Studio te los pide para validar tu licencia — nunca los compartas públicamente.
        </p>
        <div className="space-y-2">
          <IdRow label="ID de instalación (equipo)" valor={machineId || 'Calculando…'} onCopiar={copiarId} copiado={copiado} darkMode={darkMode} />
          {clienteId && <IdRow label="ID del negocio (nube)" valor={clienteId} onCopiar={copiarId} copiado={copiado} darkMode={darkMode} />}
          <div className="flex items-center justify-between text-sm">
            <span className={labelCls}>Versión instalada</span>
            <span className={`font-mono font-semibold ${valueCls}`}>{version || '—'}</span>
          </div>
        </div>
      </div>

      <p className={`text-xs text-center ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
        © {new Date().getFullYear()} Codec Studio. Uso sujeto a los términos de la licencia de Codec POS entregada al adquirir el software.
        Soporte: WhatsApp +57 323 864 6844.
      </p>
    </div>
  );
}

function IdRow({ label, valor, onCopiar, copiado, darkMode }: { label: string; valor: string; onCopiar: (v: string) => void; copiado: boolean; darkMode: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-mono truncate max-w-[220px] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{valor}</span>
        <button
          onClick={() => onCopiar(valor)}
          className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
          aria-label={`Copiar ${label}`}
        >
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>
    </div>
  );
}
