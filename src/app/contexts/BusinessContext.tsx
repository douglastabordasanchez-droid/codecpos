import React, { createContext, useContext, useState } from 'react';

export interface BusinessConfig {
  tipoNegocio: string;
  nombreNegocio: string;
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
      return { tipoNegocio, nombreNegocio: parsed.nombreNegocio ?? 'Mi Negocio' };
    }
    const legacyType = localStorage.getItem(LEGACY_KEY);
    if (legacyType) {
      const tipoNegocio = ID_MIGRATIONS[legacyType] ?? legacyType;
      return { tipoNegocio, nombreNegocio: 'Mi Negocio' };
    }
  } catch { /* ignore */ }
  return { tipoNegocio: 'minimercado', nombreNegocio: 'Mi Negocio' };
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BusinessConfig>(loadConfig);

  const setBusinessConfig = (newConfig: BusinessConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      localStorage.setItem(LEGACY_KEY, newConfig.tipoNegocio);
    } catch { /* storage full */ }
    window.dispatchEvent(new CustomEvent('codec-business-changed', { detail: newConfig }));
  };

  return (
    <BusinessContext.Provider value={{
      tipoNegocio: config.tipoNegocio,
      nombreNegocio: config.nombreNegocio,
      setBusinessConfig,
    }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessContext() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusinessContext must be used within BusinessProvider');
  return ctx;
}
