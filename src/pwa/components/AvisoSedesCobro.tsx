/**
 * Aviso de cobro de sedes (migración 0150): una sede adicional nueva tiene 14
 * días de prueba gratis; después cuesta 29.990 (Básico) o 49.990 (Premium)
 * mensuales + 50.000 de
 * instalación y la activa Codec Studio. Se muestra al dueño y a los
 * administradores en el inicio (web, celular y caja de escritorio).
 */
import { useEffect, useState } from 'react';
import { Store, MessageCircle } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';

export interface EstadoSede {
  local_id: string;
  nombre: string;
  cobro_estado: 'incluida' | 'pagada' | 'prueba' | 'vencida';
  prueba_hasta: string | null;
  dias_restantes: number | null;
}

const WHATSAPP_CODEC = '573238646844';

export async function obtenerEstadoSedes(): Promise<EstadoSede[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.rpc('estado_sedes_negocio');
  if (error) return [];
  return (data as EstadoSede[]) || [];
}

/** true si la sede está vencida (terminó la prueba y no se ha pagado). */
export function sedeVencida(sedes: EstadoSede[], localId: string | null | undefined): boolean {
  if (!localId) return false;
  return sedes.some((s) => s.local_id === localId && s.cobro_estado === 'vencida');
}

export function AvisoSedesCobro({ oscuro = true, className = '' }: { oscuro?: boolean; className?: string }) {
  const [sedes, setSedes] = useState<EstadoSede[]>([]);
  useEffect(() => {
    let activo = true;
    void obtenerEstadoSedes().then((s) => { if (activo) setSedes(s); });
    return () => { activo = false; };
  }, []);

  const avisos = sedes.filter((s) => s.cobro_estado === 'prueba' || s.cobro_estado === 'vencida');
  if (avisos.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {avisos.map((s) => {
        const vencida = s.cobro_estado === 'vencida';
        const texto = vencida
          ? `Terminó la prueba gratis de la sede «${s.nombre}». Para seguir vendiendo en ella, actívala con Codec Studio.`
          : `La sede «${s.nombre}» está en prueba gratis: ${s.dias_restantes === 1 ? 'queda 1 día' : `quedan ${s.dias_restantes} días`}.`;
        const mensaje = encodeURIComponent(`Hola Codec Studio, quiero activar la sede «${s.nombre}».`);
        return (
          <div key={s.local_id} className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${
            vencida ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
            <Store className={`w-5 h-5 shrink-0 ${vencida ? 'text-red-500' : 'text-amber-500'}`} />
            <div className="flex-1 min-w-[180px]">
              <p className={`text-sm font-bold ${oscuro ? 'text-white' : 'text-slate-900'}`}>{texto}</p>
              <p className={`text-xs ${oscuro ? 'text-slate-400' : 'text-slate-600'}`}>Sede adicional: Básico $29.990 o Premium $49.990 al mes, más $50.000 de instalación. Incluye un administrador para esa sede.</p>
            </div>
            <a
              href={`https://wa.me/${WHATSAPP_CODEC}?text=${mensaje}`}
              target="_blank"
              rel="noreferrer"
              className="h-10 px-4 rounded-xl bg-emerald-600 text-[#fff] text-sm font-bold flex items-center gap-1.5 shrink-0"
            >
              <MessageCircle className="w-4 h-4" />Activar sede
            </a>
          </div>
        );
      })}
    </div>
  );
}
