/**
 * Fase A (ampliación PWA): el celular ahora respeta los módulos/plan reales
 * del negocio (clientes_pos.modulos_activos / plan), la misma configuración
 * que el admin gestiona desde Panel Desarrollador > Clientes (ver
 * clientesAdminService.ts). Mientras carga o si Supabase no responde,
 * `tieneModulo` devuelve true para no bloquear al empleado con una pantalla
 * vacía — se corrige solo en el siguiente refresco.
 *
 * Además de lo que el NEGOCIO tiene activo, cada empleado puede tener sus
 * propios permisos (empleados.permisos.modulosHabilitados, editable desde
 * Perfil > Equipo) — un subconjunto de lo que el negocio ya tiene. Si el
 * empleado no tiene permisos explícitos configurados (array vacío o
 * ausente), ve todo lo que el negocio tiene activo — mismo criterio que ya
 * usa Electron en PermisosUsuarioModal/POSLayoutSidebar, para que ambas
 * plataformas se comporten igual.
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

      let modulosNegocio: ModuloPOS[];
      if (row?.modulos_activos) {
        modulosNegocio = row.modulos_activos as ModuloPOS[];
      } else {
        const esPremium = row?.plan === 'PREMIUM';
        modulosNegocio = MODULOS_CATALOGO.filter((m) =>
          esPremium ? m.habilitadoPorDefecto : m.planRequerido === 'basico' && m.habilitadoPorDefecto
        ).map((m) => m.id);
      }

      const modulosEmpleado = empleado.permisos?.modulosHabilitados;
      if (modulosEmpleado && modulosEmpleado.length > 0) {
        const permitidos = new Set(modulosEmpleado);
        setModulos(new Set(modulosNegocio.filter((m) => permitidos.has(m))));
      } else {
        setModulos(new Set(modulosNegocio));
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
