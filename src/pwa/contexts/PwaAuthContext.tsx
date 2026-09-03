import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { signInSupabase, EmpleadoSupabase } from '../../app/lib/supabase/authService';
import { sincronizarSesionConAndroid, cerrarSesionAndroid } from '../lib/androidBridge';
import { registrarInstalacionPwa } from '../lib/registrarInstalacion';

export interface TiendaDisponible {
  clienteId: string;
  nombreNegocio: string;
  esPropia: boolean;
}

const TIENDA_SELECCIONADA_KEY = 'pwa_tienda_seleccionada';

interface PwaAuthContextType {
  /** El empleado, con `cliente_id` reflejando la tienda ACTUALMENTE
   *  seleccionada (no necesariamente la propia) — todo el resto de la PWA
   *  sigue leyendo `empleado.cliente_id` exactamente igual que antes, sin
   *  cambios, y automáticamente respeta el selector de tienda. */
  empleado: EmpleadoSupabase | null;
  cargando: boolean;
  iniciarSesion: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  cerrarSesion: () => Promise<void>;
  actualizarEmpleadoLocal: (cambios: Partial<EmpleadoSupabase>) => void;

  /** Tiendas multi-negocio: la propia + las que un admin de Codec Studio
   *  haya vinculado (ver migración 0045). Si `tiendasDisponibles.length <= 1`
   *  este dueño no tiene multi-tienda — no mostrar el selector. */
  tiendasDisponibles: TiendaDisponible[];
  tiendaActiva: TiendaDisponible | null;
  seleccionarTienda: (clienteId: string) => void;
  /** true cuando se está viendo una tienda vinculada que NO es la propia —
   *  las pantallas que permiten vender/editar/registrar deben bloquearse en
   *  este modo (es una vista de solo lectura; el servidor también lo exige
   *  vía RLS, esto es además para una buena experiencia, no el único freno). */
  soloLectura: boolean;
}

const PwaAuthContext = createContext<PwaAuthContextType | undefined>(undefined);

export function PwaAuthProvider({ children }: { children: ReactNode }) {
  // `empleadoReal` guarda SIEMPRE la fila auténtica (su propio cliente_id) —
  // nunca se muta. Lo que el resto de la app consume es `empleado`, derivado
  // más abajo con el cliente_id de la tienda activa.
  const [empleadoReal, setEmpleadoReal] = useState<EmpleadoSupabase | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tiendasDisponibles, setTiendasDisponibles] = useState<TiendaDisponible[]>([]);
  const [tiendaActivaId, setTiendaActivaId] = useState<string | null>(null);

  const cargarTiendasDisponibles = useCallback(async (clienteIdPropio: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.rpc('mis_tiendas_para_selector');
    if (error || !data) {
      // Sin vínculos o función no disponible aún (proyecto sin la migración
      // 0045) — se sigue funcionando normal con una sola tienda, la propia.
      setTiendasDisponibles([{ clienteId: clienteIdPropio, nombreNegocio: '', esPropia: true }]);
      return;
    }
    const lista: TiendaDisponible[] = (data as any[]).map((r) => ({
      clienteId: r.cliente_id,
      nombreNegocio: r.nombre_negocio,
      esPropia: r.es_propia,
    }));
    setTiendasDisponibles(lista);

    const guardada = localStorage.getItem(TIENDA_SELECCIONADA_KEY);
    const sigueValida = guardada && lista.some((t) => t.clienteId === guardada);
    setTiendaActivaId(sigueValida ? guardada! : clienteIdPropio);
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setCargando(false);
      return;
    }

    client.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) {
        setCargando(false);
        return;
      }
      const { data: fila } = await client
        .from('empleados')
        .select('id, cliente_id, nombre_completo, rol, activo, es_staff_codec, permisos, foto_url, fecha_nacimiento, telefono')
        .eq('id', uid)
        .maybeSingle();
      const empleadoCargado = (fila as EmpleadoSupabase) || null;
      setEmpleadoReal(empleadoCargado);
      if (empleadoCargado) {
        await cargarTiendasDisponibles(empleadoCargado.cliente_id);
        // 📱 App Android nativa: si esta PWA corre dentro de su WebView, le
        // pasa el webhook_token del negocio para que el listener de
        // notificaciones quede configurado solo, sin ningún paso aparte.
        sincronizarSesionConAndroid(empleadoCargado.cliente_id);
        registrarInstalacionPwa();
      }
      setCargando(false);
    });
  }, [cargarTiendasDisponibles]);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const resultado = await signInSupabase(email, password);
    if (resultado.ok && resultado.empleado) {
      setEmpleadoReal(resultado.empleado);
      await cargarTiendasDisponibles(resultado.empleado.cliente_id);
      sincronizarSesionConAndroid(resultado.empleado.cliente_id);
      registrarInstalacionPwa();
      return { ok: true };
    }
    return { ok: false, error: resultado.error };
  }, [cargarTiendasDisponibles]);

  const cerrarSesion = useCallback(async () => {
    const client = getSupabaseClient();
    await client?.auth.signOut();
    setEmpleadoReal(null);
    setTiendasDisponibles([]);
    setTiendaActivaId(null);
    localStorage.removeItem(TIENDA_SELECCIONADA_KEY);
    cerrarSesionAndroid();
  }, []);

  /** Refleja en memoria un cambio ya guardado en Supabase — sin recargar sesión. */
  const actualizarEmpleadoLocal = useCallback((cambios: Partial<EmpleadoSupabase>) => {
    setEmpleadoReal((prev) => (prev ? { ...prev, ...cambios } : prev));
  }, []);

  const seleccionarTienda = useCallback((clienteId: string) => {
    if (!tiendasDisponibles.some((t) => t.clienteId === clienteId)) return;
    setTiendaActivaId(clienteId);
    localStorage.setItem(TIENDA_SELECCIONADA_KEY, clienteId);
  }, [tiendasDisponibles]);

  const tiendaActiva = useMemo(
    () => tiendasDisponibles.find((t) => t.clienteId === tiendaActivaId) || null,
    [tiendasDisponibles, tiendaActivaId]
  );

  // El resto de la PWA (~120 pantallas) lee `empleado.cliente_id` tal cual
  // ya lo hacía — este es el único punto donde se sustituye por el de la
  // tienda activa, así que el selector "solo funciona" sin tocar cada
  // pantalla una por una.
  const empleado: EmpleadoSupabase | null = useMemo(
    () => (empleadoReal ? { ...empleadoReal, cliente_id: tiendaActivaId || empleadoReal.cliente_id } : null),
    [empleadoReal, tiendaActivaId]
  );

  const soloLectura = !!tiendaActiva && !tiendaActiva.esPropia;

  // 🚀 FIX rendimiento: este value se recreaba en cada render sin useMemo
  // (y sus funciones no tenían identidad estable), forzando a TODA la PWA
  // (~120 pantallas leen usePwaAuth()) a re-renderizar en cada cambio de
  // estado de este provider, aunque no les importara. Ver auditoría de
  // rendimiento en curso.
  const value = useMemo(
    () => ({
      empleado,
      cargando,
      iniciarSesion,
      cerrarSesion,
      actualizarEmpleadoLocal,
      tiendasDisponibles,
      tiendaActiva,
      seleccionarTienda,
      soloLectura,
    }),
    [empleado, cargando, iniciarSesion, cerrarSesion, actualizarEmpleadoLocal, tiendasDisponibles, tiendaActiva, seleccionarTienda, soloLectura]
  );

  return (
    <PwaAuthContext.Provider value={value}>
      {children}
    </PwaAuthContext.Provider>
  );
}

export function usePwaAuth() {
  const ctx = useContext(PwaAuthContext);
  if (!ctx) throw new Error('usePwaAuth debe usarse dentro de PwaAuthProvider');
  return ctx;
}
