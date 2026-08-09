import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { signInSupabase, EmpleadoSupabase } from '../../app/lib/supabase/authService';

interface PwaAuthContextType {
  empleado: EmpleadoSupabase | null;
  cargando: boolean;
  iniciarSesion: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  cerrarSesion: () => Promise<void>;
}

const PwaAuthContext = createContext<PwaAuthContextType | undefined>(undefined);

export function PwaAuthProvider({ children }: { children: ReactNode }) {
  const [empleado, setEmpleado] = useState<EmpleadoSupabase | null>(null);
  const [cargando, setCargando] = useState(true);

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
        .select('id, cliente_id, nombre_completo, rol, activo, es_staff_codec, permisos')
        .eq('id', uid)
        .maybeSingle();
      setEmpleado((fila as EmpleadoSupabase) || null);
      setCargando(false);
    });
  }, []);

  const iniciarSesion = async (email: string, password: string) => {
    const resultado = await signInSupabase(email, password);
    if (resultado.ok && resultado.empleado) {
      setEmpleado(resultado.empleado);
      return { ok: true };
    }
    return { ok: false, error: resultado.error };
  };

  const cerrarSesion = async () => {
    const client = getSupabaseClient();
    await client?.auth.signOut();
    setEmpleado(null);
  };

  return (
    <PwaAuthContext.Provider value={{ empleado, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </PwaAuthContext.Provider>
  );
}

export function usePwaAuth() {
  const ctx = useContext(PwaAuthContext);
  if (!ctx) throw new Error('usePwaAuth debe usarse dentro de PwaAuthProvider');
  return ctx;
}
