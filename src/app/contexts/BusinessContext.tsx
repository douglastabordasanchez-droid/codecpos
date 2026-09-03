import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { isLinked } from '../lib/supabase/tenantLink';

export interface BusinessConfig {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropinaPredeterminado: number;
}

interface BusinessContextType {
  tipoNegocio: string;
  nombreNegocio: string;
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
      const tipoNegocio = ID_MIGRATIONS[raw] ?? raw;
      return {
        tipoNegocio,
        nombreNegocio: parsed.nombreNegocio ?? 'Mi Negocio',
        propinaActiva: parsed.propinaActiva === true,
        porcentajePropinaPredeterminado: Math.max(0, Number(parsed.porcentajePropinaPredeterminado) || 0),
      };
    }
    const legacyType = localStorage.getItem(LEGACY_KEY);
    if (legacyType) {
      const tipoNegocio = ID_MIGRATIONS[legacyType] ?? legacyType;
      return { tipoNegocio, nombreNegocio: 'Mi Negocio', propinaActiva: false, porcentajePropinaPredeterminado: 0 };
    }
  } catch { /* ignore */ }
  return { tipoNegocio: 'minimercado', nombreNegocio: 'Mi Negocio', propinaActiva: false, porcentajePropinaPredeterminado: 0 };
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BusinessConfig>(loadConfig);

  const setBusinessConfig = useCallback((newConfig: BusinessConfig) => {
    const tipoAnterior = config.tipoNegocio;
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      localStorage.setItem(LEGACY_KEY, newConfig.tipoNegocio);
    } catch { /* storage full */ }
    window.dispatchEvent(new CustomEvent('codec-business-changed', { detail: newConfig }));

    // 🐛 FIX: clientes_pos.tipo_negocio nunca se actualizaba cuando el dueño
    // cambiaba el tipo de negocio aquí (100% local hasta ahora) — la PWA
    // (categorías de producto dinámicas por tipo de negocio) quedaba viendo
    // siempre el valor del registro original, o vacío. Best-effort: si falla
    // (sin internet, sin vincular todavía) no bloquea el cambio local.
    if (newConfig.tipoNegocio !== tipoAnterior && isLinked()) {
      const client = getSupabaseClient();
      client?.rpc('actualizar_tipo_negocio', { p_tipo_negocio: newConfig.tipoNegocio }).then(({ error }) => {
        if (error) console.warn('[BusinessContext] No se pudo sincronizar tipo_negocio a la nube:', error.message);
      });
    }
    if (
      isLinked() &&
      (newConfig.propinaActiva !== config.propinaActiva || newConfig.porcentajePropinaPredeterminado !== config.porcentajePropinaPredeterminado)
    ) {
      const client = getSupabaseClient();
      client?.rpc('actualizar_configuracion_propina', {
        p_propina_activa: newConfig.propinaActiva,
        p_porcentaje_propina_predeterminado: newConfig.porcentajePropinaPredeterminado,
      }).then(({ error }) => {
        if (error) console.warn('[BusinessContext] No se pudo sincronizar configuración de propina:', error.message);
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
      setBusinessConfig,
    }),
    [config.tipoNegocio, config.nombreNegocio, config.propinaActiva, config.porcentajePropinaPredeterminado, setBusinessConfig]
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
