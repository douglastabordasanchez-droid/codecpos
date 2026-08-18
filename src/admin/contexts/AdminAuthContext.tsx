/**
 * Autenticación del Admin Web (Fase 4).
 *
 * Reutiliza EXACTAMENTE la misma verificación que ya existe para el Panel
 * Desarrollador de Electron (`verificarAccesoStaff`, `src/app/lib/supabase/
 * authService.ts`, migración 0046) -- no se creó un sistema paralelo. La
 * única diferencia deliberada frente a Electron: aquí SÍ se persiste la
 * sesión de Supabase Auth (comportamiento estándar del navegador), porque
 * el Admin Web es una herramienta de uso repetido durante el día, a
 * diferencia de Electron donde no persistir la sesión de staff fue una
 * decisión de seguridad explícita para un equipo compartido en el negocio
 * del cliente.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { verificarAccesoStaff } from '../../app/lib/supabase/authService';

export interface StaffActual {
  id: string;
  nombreCompleto: string;
  email: string;
  nivelStaff: 'SUPER_ADMIN' | 'SOPORTE' | 'LECTURA' | null;
}

interface AdminAuthContextType {
  staff: StaffActual | null;
  cargando: boolean;
  iniciarSesion: (usuario: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  cerrarSesion: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

async function cargarStaffActual(): Promise<StaffActual | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: sesion } = await client.auth.getSession();
  const usuarioId = sesion?.session?.user?.id;
  if (!usuarioId) return null;

  const { data: empleado, error } = await client
    .from('empleados')
    .select('id, nombre_completo, es_staff_codec, nivel_staff')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error || !empleado || !empleado.es_staff_codec) {
    // Sesión de Supabase válida pero sin permiso de staff -- no es un
    // administrador del Admin Web, se trata como "no autenticado" aquí.
    return null;
  }

  return {
    id: empleado.id,
    nombreCompleto: empleado.nombre_completo,
    email: sesion.session!.user.email ?? '',
    nivelStaff: empleado.nivel_staff,
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffActual | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    cargarStaffActual().then((s) => {
      if (!cancelado) {
        setStaff(s);
        setCargando(false);
      }
    });

    const client = getSupabaseClient();
    const { data: subscripcion } = client?.auth.onAuthStateChange(async (_evento, _sesion) => {
      const s = await cargarStaffActual();
      if (!cancelado) setStaff(s);
    }) ?? { data: { subscription: null } };

    return () => {
      cancelado = true;
      subscripcion?.subscription?.unsubscribe();
    };
  }, []);

  const iniciarSesion = async (usuario: string, password: string) => {
    const resultado = await verificarAccesoStaff(usuario, password);
    if (!resultado.ok) return resultado;
    const s = await cargarStaffActual();
    setStaff(s);
    return { ok: true };
  };

  const cerrarSesion = async () => {
    const client = getSupabaseClient();
    await client?.auth.signOut();
    setStaff(null);
  };

  return (
    <AdminAuthContext.Provider value={{ staff, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider');
  return ctx;
}
