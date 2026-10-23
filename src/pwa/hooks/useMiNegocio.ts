/**
 * "Mi negocio" en la web/celular: tipo de negocio, nombre, propina y cambio de
 * precio. Es la misma configuración de Electron (Configuración > Mi negocio):
 * vive en clientes_pos y se edita desde cualquiera de los dos lados.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { normalizarTipoNegocio } from '../../data/tipos-negocio';
import { CONFIG_IVA_APAGADO, guardarConfigIva, leerConfigIva, type ConfigIva } from '../../app/lib/dian/configIva';

export interface MiNegocio {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropina: number;
  permitirModificarPrecio: boolean;
  /** Módulos que el administrador ocultó en todo el sistema. */
  modulosOcultos: string[];
  /** Módulos contratados (los activa Codec en el Panel Desarrollador). */
  modulosContratados: string[];
  /** IVA del negocio (el mismo de Electron, en empresa_configuraciones). */
  iva: ConfigIva;
}

export const EVENTO_MI_NEGOCIO = 'codecpos:mi-negocio';
let cache: { clienteId: string; datos: MiNegocio } | null = null;
let ivaLeido = false;

/** ¿Se pudo leer el IVA del negocio? Si no, el formulario no lo deja cambiar. */
export function ivaDisponible() {
  return ivaLeido;
}

export function useMiNegocio() {
  const { empleado } = usePwaAuth();
  const clienteId = empleado?.cliente_id;
  const [datos, setDatos] = useState<MiNegocio | null>(() => (cache && cache.clienteId === clienteId ? cache.datos : null));

  const recargar = useCallback(async () => {
    if (!clienteId) return;
    const [{ data }, iva] = await Promise.all([
      getSupabaseClient()!
        .from('clientes_pos')
        .select('tipo_negocio, nombre_negocio, propina_activa, porcentaje_propina_predeterminado, permitir_modificar_precio, modulos_ocultos, modulos_activos')
        .eq('id', clienteId)
        .maybeSingle(),
      leerConfigIva(clienteId).catch(() => null),
    ]);
    if (!data) return;
    const d = data as Record<string, any>;
    const nuevos: MiNegocio = {
      tipoNegocio: normalizarTipoNegocio(d.tipo_negocio),
      nombreNegocio: d.nombre_negocio || '',
      propinaActiva: d.propina_activa === true,
      porcentajePropina: Math.max(0, Number(d.porcentaje_propina_predeterminado) || 0),
      permitirModificarPrecio: d.permitir_modificar_precio === true,
      modulosOcultos: Array.isArray(d.modulos_ocultos) ? d.modulos_ocultos : [],
      modulosContratados: Array.isArray(d.modulos_activos) ? d.modulos_activos : [],
      iva: iva || CONFIG_IVA_APAGADO,
    };
    // Sin poder leer el IVA no se ofrece guardarlo: se borraría lo que tenga Electron.
    ivaLeido = iva !== null;
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

export async function guardarMiNegocio(d: MiNegocio, anterior?: MiNegocio | null) {
  const { error } = await getSupabaseClient()!.rpc('actualizar_mi_negocio', {
    p_tipo_negocio: d.tipoNegocio,
    p_nombre_negocio: d.nombreNegocio.trim(),
    p_propina_activa: d.propinaActiva,
    p_porcentaje_propina: d.porcentajePropina,
    p_permitir_modificar_precio: d.permitirModificarPrecio,
  });
  if (error) throw new Error(error.message);
  const { error: e2 } = await getSupabaseClient()!.rpc('actualizar_modulos_ocultos', { p_modulos: d.modulosOcultos });
  if (e2) throw new Error(e2.message);
  // El IVA solo se escribe si se cambió: guardar lo demás no toca lo que Electron tenga.
  if (ivaLeido && JSON.stringify(d.iva) !== JSON.stringify(anterior?.iva)) await guardarConfigIva(d.iva);
  cache = null;
  window.dispatchEvent(new CustomEvent(EVENTO_MI_NEGOCIO));
}
