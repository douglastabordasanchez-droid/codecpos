/**
 * El menú lateral ya filtrado (licencia, permisos, rol) y ordenado según las
 * preferencias del usuario. Lo usan el menú del computador y el del celular,
 * así los dos muestran exactamente lo mismo.
 */
import { useEffect, useMemo, useState } from 'react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from './useModulosActivos';
import { NAV_TODOS, GRUPOS_NAV, type GrupoNav, type ItemNavSidebar } from '../lib/sidebarNav';
import {
  obtenerPreferenciasMenu, sincronizarPreferenciasMenu, EVENTO_PREFERENCIAS_MENU, type PreferenciasMenu,
} from '../lib/preferenciasMenu';

export interface ItemMenu extends ItemNavSidebar {
  /** Nombre a mostrar: el propio del usuario o el de fábrica. */
  nombre: string;
  oculto: boolean;
}

export interface GrupoMenu {
  id: GrupoNav;
  titulo: string | null;
  destacado?: boolean;
  items: ItemMenu[];
}

export function useMenuPersonalizado(opciones: { movil: boolean }) {
  const { empleado } = usePwaAuth();
  const { tieneModulo, tieneModuloDePago } = useModulosActivos();
  const [prefs, setPrefs] = useState<PreferenciasMenu>(obtenerPreferenciasMenu);

  useEffect(() => {
    const actualizar = () => setPrefs(obtenerPreferenciasMenu());
    window.addEventListener(EVENTO_PREFERENCIAS_MENU, actualizar);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS_MENU, actualizar);
  }, []);

  useEffect(() => {
    if (empleado?.id) sincronizarPreferenciasMenu(empleado.id);
  }, [empleado?.id]);

  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  const grupos = useMemo<GrupoMenu[]>(() => {
    const permitido = (it: ItemNavSidebar) =>
      (opciones.movil || !it.soloMovil) &&
      (!it.modulo || (it.dePago ? tieneModuloDePago(it.modulo) : tieneModulo(it.modulo))) &&
      (!it.soloAdmin || esAdmin) &&
      (!it.soloStaff || !!empleado?.es_staff_codec);

    const posicion = (path: string) => {
      const i = prefs.orden.indexOf(path);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };

    return GRUPOS_NAV.map((g) => ({
      ...g,
      items: NAV_TODOS
        .filter((it) => it.grupo === g.id && permitido(it))
        // Orden estable: lo que el usuario movió primero, lo demás en el orden de fábrica.
        .map((it, i) => ({ it, i }))
        .sort((a, b) => (posicion(a.it.path) - posicion(b.it.path)) || (a.i - b.i))
        .map(({ it }) => ({ ...it, nombre: prefs.nombres[it.path] || it.label, oculto: !it.fijo && prefs.ocultos.includes(it.path) })),
    }));
  }, [prefs, opciones.movil, tieneModulo, tieneModuloDePago, esAdmin, empleado?.es_staff_codec]);

  const ocultos = grupos.flatMap((g) => g.items.filter((it) => it.oculto));

  return { grupos, ocultos, prefs };
}
