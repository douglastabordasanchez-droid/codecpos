import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { isLinked, getLinkedClienteId } from '../lib/supabase/tenantLink';
import { normalizarTipoNegocio } from '../../data/tipos-negocio';

export interface BusinessConfig {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropinaPredeterminado: number;
  permitirModificarPrecio: boolean;
}

interface BusinessContextType {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropinaPredeterminado: number;
  permitirModificarPrecio: boolean;
  setBusinessConfig: (config: BusinessConfig) => void;
}

const STORAGE_KEY = 'codec_pos_config_negocio';
const LEGACY_KEY = 'pos-tipo-negocio';

const ID_MIGRATIONS: Record<string, string> = {
  retail: 'minimercado',
  farmacia: 'drogueria',
  tienda_ropa: 'ropa',
  miscelanea: 'minimercado',
  deposito: 'ferreteria',
  servicios: 'minimercado',
  otros: 'minimercado',
};

function loadConfig(): BusinessConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const raw = parsed.tipoNegocio ?? 'minimercado';
      const tipoNegocio = normalizarTipoNegocio(ID_MIGRATIONS[raw] ?? raw);
      return {
        tipoNegocio,
        nombreNegocio: parsed.nombreNegocio ?? 'Mi Negocio',
        propinaActiva: parsed.propinaActiva === true,
        porcentajePropinaPredeterminado: Math.max(0, Number(parsed.porcentajePropinaPredeterminado) || 0),
        permitirModificarPrecio: parsed.permitirModificarPrecio === true,
      };
    }
    const legacyType = localStorage.getItem(LEGACY_KEY);
    if (legacyType) {
      const tipoNegocio = ID_MIGRATIONS[legacyType] ?? legacyType;
      return { tipoNegocio, nombreNegocio: 'Mi Negocio', propinaActiva: false, porcentajePropinaPredeterminado: 0, permitirModificarPrecio: false };
    }
  } catch { /* ignore */ }
  return { tipoNegocio: 'minimercado', nombreNegocio: 'Mi Negocio', propinaActiva: false, porcentajePropinaPredeterminado: 0, permitirModificarPrecio: false };
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

function guardarLocal(c: BusinessConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    localStorage.setItem(LEGACY_KEY, c.tipoNegocio);
  } catch { /* storage full */ }
  window.dispatchEvent(new CustomEvent('codec-business-changed', { detail: c }));
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BusinessConfig>(loadConfig);
  const configRef = useRef(config);
  configRef.current = config;

  // "Mi negocio" también se puede configurar desde la web/celular: Electron lo
  // trae de la nube al abrir, al volver a la ventana y cada 2 minutos.
  useEffect(() => {
    const traer = async () => {
      const clienteId = getLinkedClienteId();
      if (!isLinked() || !clienteId) return;
      const client = getSupabaseClient();
      const { data, error } = await client!
        .from('clientes_pos')
        .select('tipo_negocio, nombre_negocio, propina_activa, porcentaje_propina_predeterminado, permitir_modificar_precio')
        .eq('id', clienteId)
        .maybeSingle();
      if (error || !data) return;
      const d = data as Record<string, any>;
      const actual = configRef.current;
      const nube: BusinessConfig = {
        tipoNegocio: d.tipo_negocio ? normalizarTipoNegocio(d.tipo_negocio) : actual.tipoNegocio,
        nombreNegocio: d.nombre_negocio || actual.nombreNegocio,
        propinaActiva: d.propina_activa === true,
        porcentajePropinaPredeterminado: Math.max(0, Number(d.porcentaje_propina_predeterminado) || 0),
        permitirModificarPrecio: d.permitir_modificar_precio === true,
      };
      if (JSON.stringify(nube) !== JSON.stringify(actual)) {
        setConfig(nube);
        guardarLocal(nube);
      }
    };
    traer();
    const alEnfocar = () => { traer(); };
    window.addEventListener('focus', alEnfocar);
    const intervalo = window.setInterval(traer, 120_000);
    return () => { window.removeEventListener('focus', alEnfocar); window.clearInterval(intervalo); };
  }, []);

  const setBusinessConfig = useCallback((nuevo: BusinessConfig) => {
    const newConfig = { ...nuevo, tipoNegocio: normalizarTipoNegocio(nuevo.tipoNegocio) };
    const cambio = JSON.stringify(newConfig) !== JSON.stringify(config);
    setConfig(newConfig);
    guardarLocal(newConfig);

    // Se sube todo de una vez (misma función que usa la web/celular) para que
    // "Mi negocio" quede igual en todo el sistema. Best-effort: sin internet o
    // sin vincular, el cambio local igual queda.
    if (cambio && isLinked()) {
      const client = getSupabaseClient();
      client?.rpc('actualizar_mi_negocio', {
        p_tipo_negocio: newConfig.tipoNegocio,
        p_nombre_negocio: newConfig.nombreNegocio || 'Mi Negocio',
        p_propina_activa: newConfig.propinaActiva,
        p_porcentaje_propina: newConfig.porcentajePropinaPredeterminado,
        p_permitir_modificar_precio: newConfig.permitirModificarPrecio,
      }).then(({ error }) => {
        if (error) console.warn('[BusinessContext] No se pudo sincronizar Mi negocio a la nube:', error.message);
      });
    }
  }, [config]);

  // 🚀 FIX rendimiento: este value se recreaba en cada render sin useMemo,
  // forzando a TODO consumidor de useBusinessContext() a re-renderizar
  // aunque nada de esto hubiera cambiado. Ver auditoría de rendimiento en curso.
  const value = useMemo(
    () => ({
      tipoNegocio: config.tipoNegocio,
      nombreNegocio: config.nombreNegocio,
      propinaActiva: config.propinaActiva,
      porcentajePropinaPredeterminado: config.porcentajePropinaPredeterminado,
      permitirModificarPrecio: config.permitirModificarPrecio,
      setBusinessConfig,
    }),
    [config.tipoNegocio, config.nombreNegocio, config.propinaActiva, config.porcentajePropinaPredeterminado, config.permitirModificarPrecio, setBusinessConfig]
  );

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusinessContext must be used within BusinessProvider');
  return ctx;
}
