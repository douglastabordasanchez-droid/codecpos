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
  /** Módulos que el administrador ocultó en "Configurar mi negocio" (web/celular), migración 0108. */
  modulosOcultos?: string[];
}

interface BusinessContextType {
  tipoNegocio: string;
  nombreNegocio: string;
  propinaActiva: boolean;
  porcentajePropinaPredeterminado: number;
  permitirModificarPrecio: boolean;
  modulosOcultos: string[];
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
        modulosOcultos: Array.isArray(parsed.modulosOcultos) ? parsed.modulosOcultos : [],
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

/** Negocio cuyos datos están cargados en este equipo (ver tenantSwap.ts). */
function negocioActivo(): string {
  try { return localStorage.getItem('codecpos_datos_activos_cliente_id') || getLinkedClienteId() || 'local'; }
  catch { return 'local'; }
}

/**
 * Copia en disco (Electron) de lo que es propio de este equipo. «Reparar base
 * de datos», un PC que queda vacío o restaurar un respaldo borraban el
 * localStorage y la propina y el cambio de precio volvían apagados.
 */
function guardarEnDisco(c: BusinessConfig) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api?.guardarConfigNegocio) return;
  api.guardarConfigNegocio(negocioActivo(), {
    propinaActiva: c.propinaActiva,
    porcentajePropinaPredeterminado: c.porcentajePropinaPredeterminado,
    permitirModificarPrecio: c.permitirModificarPrecio,
    guardadoEn: new Date().toISOString(),
  }).catch(() => { /* best-effort */ });
}

function guardarLocal(c: BusinessConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    localStorage.setItem(LEGACY_KEY, c.tipoNegocio);
  } catch { /* storage full */ }
  guardarEnDisco(c);
  window.dispatchEvent(new CustomEvent('codec-business-changed', { detail: c }));
}

/**
 * Cambio guardado en este computador que la nube todavía no aceptó (valor: el
 * negocio al que pertenece). Mientras exista, lo de la nube no se aplica:
 * antes la nube rechazaba o no recibía el cambio y, al volver a leerla, la
 * propina y el cambio de precio se apagaban solos.
 */
const POR_SUBIR_KEY = 'codec_pos_config_negocio_por_subir';

function hayCambioPorSubir(clienteId: string): boolean {
  try { return localStorage.getItem(POR_SUBIR_KEY) === clienteId; } catch { return false; }
}

/**
 * La propina y el cambio de precio son de cada Electron: se activan aquí y no
 * viajan a la web ni bajan de ella (en la web se activan a mano). La función
 * de la nube los pide, así que se le devuelven los que ya tiene.
 */
async function subirANube(c: BusinessConfig, clienteId: string): Promise<boolean> {
  try {
    const client = getSupabaseClient()!;
    const { data: nube, error: errorLectura } = await client
      .from('clientes_pos')
      .select('propina_activa, porcentaje_propina_predeterminado, permitir_modificar_precio')
      .eq('id', clienteId)
      .single();
    if (errorLectura) throw new Error(errorLectura.message);
    const d = nube as Record<string, any>;
    const { error } = await client.rpc('actualizar_mi_negocio', {
      p_tipo_negocio: c.tipoNegocio,
      p_nombre_negocio: c.nombreNegocio || 'Mi Negocio',
      p_propina_activa: d.propina_activa === true,
      p_porcentaje_propina: Math.max(0, Number(d.porcentaje_propina_predeterminado) || 0),
      p_permitir_modificar_precio: d.permitir_modificar_precio === true,
    });
    if (error) console.warn('[BusinessContext] No se pudo sincronizar Mi negocio a la nube:', error.message);
    return !error;
  } catch (e) {
    console.warn('[BusinessContext] No se pudo sincronizar Mi negocio a la nube:', e);
    return false;
  }
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BusinessConfig>(loadConfig);
  const configRef = useRef(config);
  configRef.current = config;
  // Cada guardado local suma uno: una lectura o subida que empezó antes ya no vale.
  const edicionRef = useRef(0);

  // Si el localStorage quedó sin «Mi negocio» (reparación, PC vacío), se
  // recupera la copia en disco; si es la primera vez, se crea la copia.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.cargarConfigNegocio) return;
    let habiaLocal = false;
    try { habiaLocal = localStorage.getItem(STORAGE_KEY) !== null; } catch { /* sin storage */ }
    if (habiaLocal) { guardarEnDisco(configRef.current); return; }
    const edicion = edicionRef.current;
    api.cargarConfigNegocio(negocioActivo()).then((r) => {
      const d = r?.config;
      if (!d || edicionRef.current !== edicion) return;
      const actual = configRef.current;
      const recuperado: BusinessConfig = {
        ...actual,
        propinaActiva: d.propinaActiva === true,
        porcentajePropinaPredeterminado: Math.max(0, Number(d.porcentajePropinaPredeterminado) || 0),
        permitirModificarPrecio: d.permitirModificarPrecio === true,
      };
      // Una lectura de la nube que ya iba en camino se descarta: traía lo de antes.
      edicionRef.current += 1;
      configRef.current = recuperado;
      setConfig(recuperado);
      guardarLocal(recuperado);
    }).catch(() => { /* best-effort */ });
  }, []);

  // "Mi negocio" también se puede configurar desde la web/celular: Electron lo
  // trae de la nube al abrir, al volver a la ventana y cada 2 minutos.
  useEffect(() => {
    const traer = async () => {
      const clienteId = getLinkedClienteId();
      if (!isLinked() || !clienteId) return;
      const edicion = edicionRef.current;
      if (hayCambioPorSubir(clienteId)) {
        if (!(await subirANube(configRef.current, clienteId))) return;
        if (edicionRef.current !== edicion) return;
        localStorage.removeItem(POR_SUBIR_KEY);
      }
      const client = getSupabaseClient();
      const { data, error } = await client!
        .from('clientes_pos')
        .select('tipo_negocio, nombre_negocio, modulos_ocultos')
        .eq('id', clienteId)
        .maybeSingle();
      if (error || !data || edicionRef.current !== edicion) return;
      const d = data as Record<string, any>;
      const actual = configRef.current;
      const nube: BusinessConfig = {
        tipoNegocio: d.tipo_negocio ? normalizarTipoNegocio(d.tipo_negocio) : actual.tipoNegocio,
        nombreNegocio: d.nombre_negocio || actual.nombreNegocio,
        propinaActiva: actual.propinaActiva,
        porcentajePropinaPredeterminado: actual.porcentajePropinaPredeterminado,
        permitirModificarPrecio: actual.permitirModificarPrecio,
        modulosOcultos: Array.isArray(d.modulos_ocultos) ? d.modulos_ocultos : [],
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
    // Los módulos ocultos se manejan desde la web: Electron los conserva al guardar lo demás.
    const newConfig = { ...config, ...nuevo, tipoNegocio: normalizarTipoNegocio(nuevo.tipoNegocio) };
    const cambio = JSON.stringify(newConfig) !== JSON.stringify(config);
    setConfig(newConfig);
    guardarLocal(newConfig);

    // Se sube todo de una vez (misma función que usa la web/celular) para que
    // "Mi negocio" quede igual en todo el sistema. Best-effort: sin internet o
    // sin vincular, el cambio local igual queda.
    edicionRef.current += 1;
    const clienteId = getLinkedClienteId();
    if (cambio && isLinked() && clienteId) {
      const edicion = edicionRef.current;
      try { localStorage.setItem(POR_SUBIR_KEY, clienteId); } catch { /* storage full */ }
      subirANube(newConfig, clienteId).then((ok) => {
        if (ok && edicionRef.current === edicion) localStorage.removeItem(POR_SUBIR_KEY);
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
      modulosOcultos: config.modulosOcultos || [],
      setBusinessConfig,
    }),
    [config.tipoNegocio, config.nombreNegocio, config.propinaActiva, config.porcentajePropinaPredeterminado, config.permitirModificarPrecio, config.modulosOcultos, setBusinessConfig]
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
