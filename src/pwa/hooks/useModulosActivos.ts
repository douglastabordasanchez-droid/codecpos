/**
 * Fase A (ampliación PWA): el celular ahora respeta los módulos/plan reales
 * del negocio (clientes_pos.modulos_activos / plan), la misma configuración
 * que el admin gestiona desde Panel Desarrollador > Clientes (ver
 * clientesAdminService.ts). Mientras carga o si Supabase no responde,
 * `tieneModulo` devuelve true para no bloquear al empleado con una pantalla
 * vacía — se corrige solo en el siguiente refresco.
 */
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { MODULOS_CATALOGO, ModuloPOS } from '../../app/lib/permissions';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const REFRESH_MS = 60000;

export function useModulosActivos() {
  const { empleado } = usePwaAuth();
  const [modulos, setModulos] = useState<Set<ModuloPOS> | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    const cargar = async () => {
      const client = getSupabaseClient();
      if (!client) {
        setCargando(false);
        return;
      }

      const { data } = await client
        .from('clientes_pos')
        .select('plan, modulos_activos')
        .eq('id', empleado.cliente_id)
        .maybeSingle();

      if (cancelado) return;

      const row = data as { plan: string | null; modulos_activos: string[] | null } | null;

      if (row?.modulos_activos) {
        setModulos(new Set(row.modulos_activos as ModuloPOS[]));
      } else {
        const esPremium = row?.plan === 'PREMIUM';
        const porDefecto = MODULOS_CATALOGO.filter((m) =>
          esPremium ? m.habilitadoPorDefecto : m.planRequerido === 'basico' && m.habilitadoPorDefecto
        ).map((m) => m.id);
        setModulos(new Set(porDefecto));
      }
      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, REFRESH_MS);
    return () => {
      cancelado = true;
      window.clearInterval(interval);
    };
  }, [empleado?.cliente_id]);

  const tieneModulo = (modulo: ModuloPOS): boolean => (modulos === null ? true : modulos.has(modulo));

  return { tieneModulo, cargando };
}
