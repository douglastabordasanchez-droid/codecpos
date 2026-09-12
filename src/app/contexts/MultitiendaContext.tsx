/**
 * 🏪 CONTEXTO MULTI-TIENDA — CODEC POS v2.0
 * Provee la tienda activa a toda la aplicación.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  Tienda,
  listarTiendas,
  getTiendaActiva,
  setTiendaActivaId,
  crearTienda,
  actualizarTienda,
  eliminarTienda,
} from '../lib/multitiendaService';
import { publicarTiendas, eliminarTiendaEnNube } from '../lib/supabase/tiendasSyncService';

interface MultitiendaContextType {
  tiendas: Tienda[];
  tiendaActual: Tienda | null;
  cambiarTienda: (id: string) => void;
  recargarTiendas: () => void;
  crearNuevaTienda: (datos: Omit<Tienda, 'id' | 'esPrincipal' | 'fechaCreacion' | 'activo'>) => Tienda;
  editarTienda: (id: string, datos: Partial<Tienda>) => Tienda;
  borrarTienda: (id: string) => void;
}

const MultitiendaContext = createContext<MultitiendaContextType | undefined>(undefined);

export function MultitiendaProvider({ children }: { children: ReactNode }) {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [tiendaActual, setTiendaActual] = useState<Tienda | null>(null);

  const recargarTiendas = useCallback(() => {
    const lista = listarTiendas();
    setTiendas(lista);
    const activa = getTiendaActiva();
    setTiendaActual(activa || lista[0] || null);
  }, []);

  // ✅ FIX: Solo cargar UNA VEZ al montar
  useEffect(() => {
    recargarTiendas();
  }, []); // ✅ Array vacío para cargar solo una vez

  useEffect(() => {
    const actualizar = () => recargarTiendas();
    window.addEventListener('codecpos:tiendas-sincronizadas', actualizar);
    return () => window.removeEventListener('codecpos:tiendas-sincronizadas', actualizar);
  }, [recargarTiendas]);

  const cambiarTienda = useCallback((id: string) => {
    setTiendaActivaId(id);
    const lista = listarTiendas();
    const nueva = lista.find(t => t.id === id) || lista[0] || null;
    setTiendaActual(nueva);
  }, []);

  // 📡 Cada alta/edición/baja de tienda se publica de inmediato en la nube —
  // antes solo se subían al tocar "Publicar datos ahora" en Configuración,
  // así que una tienda nueva no aparecía en el celular del admin hasta que
  // alguien recordara ese botón. Best-effort: si falla (sin red, sin
  // vincular), la tienda sigue funcionando local y se publica en el próximo
  // intento manual.
  const crearNuevaTienda = useCallback((datos: Omit<Tienda, 'id' | 'esPrincipal' | 'fechaCreacion' | 'activo'>) => {
    const nueva = crearTienda(datos);
    recargarTiendas();
    publicarTiendas(listarTiendas()).catch(() => {});
    return nueva;
  }, [recargarTiendas]);

  const editarTienda = useCallback((id: string, datos: Partial<Tienda>) => {
    const updated = actualizarTienda(id, datos);
    recargarTiendas();
    publicarTiendas(listarTiendas()).catch(() => {});
    return updated;
  }, [recargarTiendas]);

  const borrarTienda = useCallback((id: string) => {
    eliminarTienda(id);
    eliminarTiendaEnNube(id).catch(() => {});
    // Si borramos la activa, cambiar a la principal
    if (tiendaActual?.id === id) {
      cambiarTienda('tienda_principal');
    } else {
      recargarTiendas();
    }
  }, [tiendaActual, cambiarTienda, recargarTiendas]);

  // 🚀 FIX rendimiento: este value se recreaba en cada render sin useMemo,
  // forzando a TODO consumidor de useMultitienda() a re-renderizar aunque
  // nada de esto hubiera cambiado. Ver auditoría de rendimiento en curso.
  const value = useMemo(
    () => ({
      tiendas,
      tiendaActual,
      cambiarTienda,
      recargarTiendas,
      crearNuevaTienda,
      editarTienda,
      borrarTienda,
    }),
    [tiendas, tiendaActual, cambiarTienda, recargarTiendas, crearNuevaTienda, editarTienda, borrarTienda]
  );

  return (
    <MultitiendaContext.Provider value={value}>
      {children}
    </MultitiendaContext.Provider>
  );
}

export function useMultitienda() {
  const ctx = useContext(MultitiendaContext);
  if (!ctx) throw new Error('useMultitienda debe usarse dentro de MultitiendaProvider');
  return ctx;
}
