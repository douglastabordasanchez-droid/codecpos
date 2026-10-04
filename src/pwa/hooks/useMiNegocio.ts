/**
 * "Mi negocio" en la web/celular: tipo de negocio, nombre, propina y cambio de
 * precio. Es la misma configuración de Electron (Configuración > Mi negocio):
 * vive en clientes_pos y se edita desde cualquiera de los dos lados.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { normalizarTipoNegocio } from '../../data/tipos-negocio';

export interface MiNegocio {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropina: number;
  permitirModificarPrecio: boolean;
}

export const EVENTO_MI_NEGOCIO = 'codecpos:mi-negocio';
let cache: { clienteId: string; datos: MiNegocio } | null = null;

export function useMiNegocio() {
  const { empleado } = usePwaAuth();
  const clienteId = empleado?.cliente_id;
  const [datos, setDatos] = useState<MiNegocio | null>(() => (cache && cache.clienteId === clienteId ? cache.datos : null));

  const recargar = useCallback(async () => {
    if (!clienteId) return;
    const { data } = await getSupabaseClient()!
      .from('clientes_pos')
      .select('tipo_negocio, nombre_negocio, propina_activa, porcentaje_propina_predeterminado, permitir_modificar_precio')
      .eq('id', clienteId)
      .maybeSingle();
    if (!data) return;
    const d = data as Record<string, any>;
    const nuevos: MiNegocio = {
      tipoNegocio: normalizarTipoNegocio(d.tipo_negocio),
      nombreNegocio: d.nombre_negocio || '',
      propinaActiva: d.propina_activa === true,
      porcentajePropina: Math.max(0, Number(d.porcentaje_propina_predeterminado) || 0),
      permitirModificarPrecio: d.permitir_modificar_precio === true,
    };
    cache = { clienteId, datos: nuevos };
    setDatos(nuevos);
  }, [clienteId]);

  useEffect(() => {
    recargar();
    const alCambiar = () => { recargar(); };
    window.addEventListener(EVENTO_MI_NEGOCIO, alCambiar);
    window.addEventListener('focus', alCambiar);
    return () => { window.removeEventListener(EVENTO_MI_NEGOCIO, alCambiar); window.removeEventListener('focus', alCambiar); };
  }, [recargar]);

  return { miNegocio: datos, recargar };
}

export async function guardarMiNegocio(d: MiNegocio) {
  const { error } = await getSupabaseClient()!.rpc('actualizar_mi_negocio', {
    p_tipo_negocio: d.tipoNegocio,
    p_nombre_negocio: d.nombreNegocio.trim(),
    p_propina_activa: d.propinaActiva,
    p_porcentaje_propina: d.porcentajePropina,
    p_permitir_modificar_precio: d.permitirModificarPrecio,
  });
  if (error) throw new Error(error.message);
  cache = null;
  window.dispatchEvent(new CustomEvent(EVENTO_MI_NEGOCIO));
}
