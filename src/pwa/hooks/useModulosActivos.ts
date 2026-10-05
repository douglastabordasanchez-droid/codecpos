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
import { MenuInferiorConfig, MENU_INFERIOR_DEFAULT, normalizarMenuInferior } from '../../app/lib/menuInferiorCatalogo';
import { usePwaAuth } from '../contexts/PwaAuthContext';

const REFRESH_MS = 60000;

export function useModulosActivos() {
  const { empleado } = usePwaAuth();
  const [modulos, setModulos] = useState<Set<ModuloPOS> | null>(null);
  const [cargando, setCargando] = useState(true);
  // 📱 Gate de pago de la app entera (independiente de qué módulos vea) —
  // ver migración 0026 y el toggle en Panel Desarrollador > Clientes.
  // `null` mientras carga o si no hay respuesta: no bloquear de más.
  const [appHabilitada, setAppHabilitada] = useState<boolean | null>(null);
  // 🧭 Menú inferior — editable SOLO desde Panel Desarrollador (ver
  // migración 0027). Empieza en el default para no mostrar un menú vacío
  // mientras carga.
  const [menuInferior, setMenuInferior] = useState<MenuInferiorConfig>(MENU_INFERIOR_DEFAULT);

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
        .select('plan, modulos_activos, modulos_web, modulos_ocultos, app_movil_habilitada, menu_inferior')
        .eq('id', empleado.cliente_id)
        .maybeSingle();

      if (cancelado) return;

      const row = data as {
        plan: string | null;
        modulos_activos: string[] | null;
        modulos_web: string[] | null;
        modulos_ocultos: string[] | null;
        app_movil_habilitada: boolean | null;
        menu_inferior: unknown;
      } | null;

      setAppHabilitada(row?.app_movil_habilitada !== false);
      if (row?.menu_inferior) setMenuInferior(normalizarMenuInferior(row.menu_inferior));

      let modulosNegocio: ModuloPOS[];
      if (row?.modulos_activos) {
        modulosNegocio = row.modulos_activos as ModuloPOS[];
      } else {
        const esPremium = row?.plan === 'PREMIUM';
        modulosNegocio = MODULOS_CATALOGO.filter((m) =>
          esPremium ? m.habilitadoPorDefecto : m.planRequerido === 'basico' && m.habilitadoPorDefecto
        ).map((m) => m.id);
      }

      // 📱 Selección del dueño desde Electron (Configuración → Módulos en la
      // App Web / Celular, columna `modulos_web`, migración 0024). Es un
      // SUBCONJUNTO de la licencia: nunca puede conceder un módulo no
      // comprado. `null` = el dueño todavía no eligió → se ve todo lo
      // licenciado, igual que antes de existir esta columna.
      // Módulos que el administrador ocultó en "Configurar mi negocio" (migración 0108).
      if (row?.modulos_ocultos?.length) {
        const ocultos = new Set(row.modulos_ocultos);
        modulosNegocio = modulosNegocio.filter((m) => !ocultos.has(m));
      }
      if (row?.modulos_web) {
        const permitidosEnWeb = new Set(row.modulos_web as ModuloPOS[]);
        // Facturación electrónica se contrata aparte: si está en la licencia
        // se ve, aunque el dueño haya guardado su selección de módulos web
        // antes de que este existiera (no estaría en su lista y quedaría
        // oculto justo después de pagarlo).
        modulosNegocio = modulosNegocio.filter((m) => permitidosEnWeb.has(m) || m === ModuloPOS.FACTURACION_DIAN);
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
    // Al guardar "Configurar mi negocio" (módulos ocultos) se refresca de inmediato.
    const alCambiarNegocio = () => { cargar(); };
    window.addEventListener('codecpos:mi-negocio', alCambiarNegocio);
    return () => {
      cancelado = true;
      window.clearInterval(interval);
      window.removeEventListener('codecpos:mi-negocio', alCambiarNegocio);
    };
  }, [empleado?.cliente_id]);

  const tieneModulo = (modulo: ModuloPOS): boolean => (modulos === null ? true : modulos.has(modulo));

  /**
   * Para módulos que se venden aparte (Facturación electrónica): mientras
   * carga, o si Supabase no responde, la respuesta es NO. `tieneModulo` es
   * permisivo a propósito para no dejar al empleado frente a una pantalla
   * vacía; aquí es al revés, porque mostrar aunque sea un instante un módulo
   * que el negocio no pagó es peor que tardar un segundo en mostrarlo.
   */
  const tieneModuloDePago = (modulo: ModuloPOS): boolean => modulos !== null && modulos.has(modulo);

  return { tieneModulo, tieneModuloDePago, cargando, appHabilitada, menuInferior };
}
