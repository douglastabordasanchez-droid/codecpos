/**
 * Hook de restricciones de plan - CODEC POS v2.0
 *
 * Lee las capacidades reales del cliente desde el motor comercial central
 * (Supabase, migración 0047: `licencias` + `entitlements`), vía las RPCs
 * `mi_licencia_vigente()` y `mis_entitlements()` -- ambas resuelven contra
 * `current_cliente_id()` en el backend, así que nunca reciben ni confían en
 * nada que venga del cliente.
 *
 * Reemplaza dos hooks previos (`usePlanRestrictions.ts` y `.tsx`, ambos
 * import-ambiguos entre sí) que leían un mock local en
 * `localStorage['codecpos_dev_clientes']`. Ese mock tenía dos fallas de
 * seguridad reales: un usuario con username 'Admin' obtenía Premium
 * ilimitado sin licencia, y cualquier usuario no encontrado en el mock caía
 * por defecto en PREMIUM en vez de Básico. Ninguna decisión de plan debe
 * salir de aquí sin pasar por el backend.
 */

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase/config';
import { useAuth } from '../contexts/AuthContext';

export type PlanTipo = 'BASICO' | 'PREMIUM' | null;

export type FeatureName =
  | 'dashboard'
  | 'codec_verify'
  | 'personalizacion_tirilla'
  | 'configuracion_iva'
  | 'reportes_avanzados'
  | 'analytics'
  | 'multi_usuario_5'
  | 'inventario_20k'
  | 'historial_3_meses';

export interface PlanInfo {
  plan: PlanTipo;
  modalidad: string | null;
  estado: string | null;
  enPrueba: boolean;
  diasPruebaRestantes: number;
  /** Fecha real de fin del período vigente (ISO) -- se guarda para poder
   *  recalcular diasPruebaRestantes sin conexión durante la ventana de
   *  tolerancia offline (ver CACHE_KEY más abajo). */
  fechaFinPeriodoActual: string | null;
  // No existe todavía un entitlement de límite de productos/historial en el
  // motor comercial (Fase 3) -- son valores de referencia fijos por plan,
  // no un límite realmente vigente desde el backend. Cuando se defina ese
  // entitlement, reemplazar aquí por su valor real vía mis_entitlements().
  maxProductos: number;
  mesesHistorial: number;
  maxUsuarios: number | null; // entitlement real MAX_USUARIOS -- null = ilimitado
  tieneCodecVerify: boolean;
  // Tampoco existe un entitlement propio para "personalización" ni
  // "dashboard" -- se mapean a Premium hasta que el catálogo los defina.
  tienePersonalizacion: boolean;
  tieneDashboard: boolean;
  tieneAppMovil: boolean;
  tieneFacturacionElectronica: boolean;
  tieneReportesAvanzados: boolean;
  tieneMultiTienda: boolean;
}

// Fail-closed a propósito: mientras carga o si algo falla, el plan es
// Básico (el más restrictivo), nunca Premium. Antes uno de los dos hooks
// viejos hacía lo contrario ("por defecto PREMIUM para desarrollo"), lo que
// regalaba funciones pagas a cualquier usuario que la consulta no lograra
// resolver a tiempo.
const PLAN_INFO_BASICO_POR_DEFECTO: PlanInfo = {
  plan: 'BASICO',
  modalidad: null,
  estado: null,
  enPrueba: false,
  diasPruebaRestantes: 0,
  fechaFinPeriodoActual: null,
  maxProductos: 5000,
  mesesHistorial: 3,
  maxUsuarios: 5,
  tieneCodecVerify: false,
  tienePersonalizacion: false,
  tieneDashboard: false,
  tieneAppMovil: false,
  tieneFacturacionElectronica: false,
  tieneReportesAvanzados: false,
  tieneMultiTienda: false,
};

const MAX_PRODUCTOS_PREMIUM = 999999999;

/**
 * Ventana de tolerancia offline (punto 18, Fase 5 ampliada): Electron es
 * offline-first a propósito -- que se caiga internet no puede significar
 * "el POS deja de funcionar" para un cliente que ya pagó Premium. Se
 * guarda el último plan confirmado por el backend y, si una consulta
 * falla (sin red), se reutiliza mientras no pase de 7 días desde la
 * última confirmación real. Pasados los 7 días sin poder validar contra
 * el backend, se cae a Básico (fail-closed) hasta reconectar -- 7 días
 * cubre un corte de internet largo o un negocio en zona con mala señal
 * sin dejar una ventana indefinida para seguir usando Premium sin pagar.
 * Apenas hay conexión, la próxima consulta corrige el estado real de
 * inmediato (si el plan de verdad venció, se refleja al reconectar).
 */
const VENTANA_TOLERANCIA_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIJO = 'codecpos_plan_cache_v1_';

interface CachePlan {
  usuarioId: string;
  confirmadoEn: number;
  planInfo: PlanInfo;
}

function guardarCachePlan(usuarioId: string, planInfo: PlanInfo) {
  try {
    const cache: CachePlan = { usuarioId, confirmadoEn: Date.now(), planInfo };
    localStorage.setItem(CACHE_KEY_PREFIJO + usuarioId, JSON.stringify(cache));
  } catch {
    // localStorage no disponible/lleno -- sin caché, simplemente no hay tolerancia offline esta vez.
  }
}

function leerCachePlanSiVigente(usuarioId: string | undefined): CachePlan | null {
  if (!usuarioId) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIJO + usuarioId);
    if (!raw) return null;
    const cache: CachePlan = JSON.parse(raw);
    if (cache.usuarioId !== usuarioId) return null;
    if (Date.now() - cache.confirmadoEn > VENTANA_TOLERANCIA_OFFLINE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

/** Recalcula diasPruebaRestantes con la hora actual del cliente -- el plan
 *  en sí viene del backend (cacheado), solo el conteo de días se refresca
 *  para no mostrar un número congelado mientras dura la tolerancia offline. */
function recalcularDiasRestantes(cache: CachePlan): PlanInfo {
  const { planInfo } = cache;
  if (!planInfo.enPrueba || !planInfo.fechaFinPeriodoActual) return planInfo;
  const msRestantes = new Date(planInfo.fechaFinPeriodoActual).getTime() - Date.now();
  return { ...planInfo, diasPruebaRestantes: Math.max(0, Math.ceil(msRestantes / (1000 * 60 * 60 * 24))) };
}

export function usePlanRestrictions() {
  const { usuarioActual } = useAuth();
  const [planInfo, setPlanInfo] = useState<PlanInfo>(PLAN_INFO_BASICO_POR_DEFECTO);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      const client = getSupabaseClient();
      if (!client || !usuarioActual) {
        if (!cancelado) {
          setPlanInfo(PLAN_INFO_BASICO_POR_DEFECTO);
          setCargando(false);
        }
        return;
      }

      try {
        const [{ data: licenciaRows, error: errorLicencia }, { data: entitlementRows, error: errorEntitlements }] =
          await Promise.all([
            client.rpc('mi_licencia_vigente'),
            client.rpc('mis_entitlements'),
          ]);

        if (errorLicencia) throw new Error(errorLicencia.message);
        if (errorEntitlements) throw new Error(errorEntitlements.message);

        const licencia = licenciaRows?.[0] ?? null;
        const entitlements = new Map<string, any>((entitlementRows ?? []).map((e: any) => [e.codigo, e.valor]));

        const habilitado = (codigo: string) => entitlements.get(codigo)?.habilitado === true;
        const limite = (codigo: string): number | null => {
          const v = entitlements.get(codigo)?.limite;
          return v === undefined ? null : v;
        };

        const plan: PlanTipo = licencia?.plan_codigo ?? null;
        const esPremium = plan === 'PREMIUM';
        const enPrueba = licencia?.estado === 'TRIAL';

        let diasPruebaRestantes = 0;
        if (enPrueba && licencia?.fecha_fin_periodo_actual) {
          const msRestantes = new Date(licencia.fecha_fin_periodo_actual).getTime() - Date.now();
          diasPruebaRestantes = Math.max(0, Math.ceil(msRestantes / (1000 * 60 * 60 * 24)));
        }

        const nuevo: PlanInfo = {
          plan,
          modalidad: licencia?.modalidad ?? null,
          estado: licencia?.estado ?? null,
          enPrueba,
          diasPruebaRestantes,
          fechaFinPeriodoActual: licencia?.fecha_fin_periodo_actual ?? null,
          maxProductos: esPremium ? MAX_PRODUCTOS_PREMIUM : 5000,
          mesesHistorial: esPremium ? 12 : 3,
          maxUsuarios: limite('MAX_USUARIOS'),
          tieneCodecVerify: habilitado('CODEC_VERIFY'),
          tienePersonalizacion: esPremium,
          tieneDashboard: esPremium,
          tieneAppMovil: habilitado('MOBILE_APP'),
          tieneFacturacionElectronica: habilitado('ELECTRONIC_INVOICING'),
          tieneReportesAvanzados: habilitado('ADVANCED_REPORTS'),
          tieneMultiTienda: habilitado('MULTI_BRANCH'),
        };

        if (!cancelado) setPlanInfo(nuevo);
        guardarCachePlan(usuarioActual!.id, nuevo);
      } catch (error) {
        console.error('usePlanRestrictions: error consultando el motor comercial:', error);
        const cache = leerCachePlanSiVigente(usuarioActual?.id);
        if (cache) {
          console.warn('usePlanRestrictions: sin conexión -- usando el último plan confirmado (ventana de tolerancia offline).');
          if (!cancelado) setPlanInfo(recalcularDiasRestantes(cache));
        } else {
          if (!cancelado) setPlanInfo(PLAN_INFO_BASICO_POR_DEFECTO);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [usuarioActual?.id]);

  const hasFeature = (feature: FeatureName): boolean => {
    if (planInfo.enPrueba) return true;

    switch (feature) {
      case 'dashboard':
        return planInfo.tieneDashboard;
      case 'codec_verify':
        return planInfo.tieneCodecVerify;
      case 'personalizacion_tirilla':
      case 'configuracion_iva':
        return planInfo.tienePersonalizacion;
      case 'reportes_avanzados':
      case 'analytics':
        return planInfo.tieneReportesAvanzados || planInfo.plan === 'PREMIUM';
      case 'multi_usuario_5':
        return planInfo.maxUsuarios === null || planInfo.maxUsuarios >= 5;
      case 'inventario_20k':
        return planInfo.maxProductos >= 20000;
      case 'historial_3_meses':
        return planInfo.mesesHistorial >= 3;
      default:
        return false;
    }
  };

  const canAddProduct = (currentCount: number): boolean => currentCount < planInfo.maxProductos;

  const canAddUser = (currentCount: number): boolean =>
    planInfo.maxUsuarios === null || currentCount < planInfo.maxUsuarios;

  const getRestrictionMessage = (feature: FeatureName): string => {
    switch (feature) {
      case 'dashboard':
        return 'El Dashboard Ejecutivo está disponible únicamente en el Plan Premium';
      case 'codec_verify':
        return 'Codec Verify PRO requiere el Plan Premium para funcionar';
      case 'personalizacion_tirilla':
        return 'La personalización de tirillas es exclusiva del Plan Premium';
      case 'configuracion_iva':
        return 'La configuración de IVA personalizado requiere Plan Premium';
      case 'reportes_avanzados':
        return 'Los reportes avanzados están disponibles en el Plan Premium';
      case 'analytics':
        return 'Las analíticas en tiempo real requieren el Plan Premium';
      case 'multi_usuario_5':
        return planInfo.plan === 'PREMIUM'
          ? 'Tu plan Premium permite usuarios ilimitados'
          : 'Tu plan Básico permite hasta 5 usuarios. Actualiza a Premium para usuarios ilimitados';
      case 'inventario_20k':
        return planInfo.plan === 'PREMIUM'
          ? 'Tu plan Premium permite productos ilimitados'
          : 'Tu plan Básico permite hasta 5,000 productos. Actualiza a Premium para productos ilimitados';
      case 'historial_3_meses':
        return planInfo.plan === 'PREMIUM'
          ? 'Tu plan Premium guarda 12 meses de historial'
          : 'Tu plan Básico guarda 3 meses de historial. Actualiza a Premium para 12 meses';
      default:
        return 'Esta funcionalidad requiere el Plan Premium';
    }
  };

  return {
    planInfo,
    cargando,
    hasFeature,
    canAddProduct,
    canAddUser,
    getRestrictionMessage,
    isPremium: planInfo.plan === 'PREMIUM',
    isBasico: planInfo.plan === 'BASICO',
    isTrial: planInfo.enPrueba,
  };
}
