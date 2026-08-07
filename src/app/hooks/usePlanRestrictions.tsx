/**
 * HOOK DE RESTRICCIONES DE PLAN - CODEC POS v2.0
 * Verifica permisos según el plan activo del usuario
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type PlanTipo = 'BASICO' | 'PREMIUM' | 'TRIAL';
export type DuracionTipo = 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | 'VITALICIA';
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

interface PlanInfo {
  plan: PlanTipo;
  duracion: DuracionTipo;
  enPrueba: boolean;
  diasPruebaRestantes: number;
  maxProductos: number;
  maxUsuarios: number;
  mesesHistorial: number;
  tieneCodecVerify: boolean;
  tienePersonalizacion: boolean;
  tieneDashboard: boolean;
}

export function usePlanRestrictions() {
  const { usuarioActual } = useAuth();
  const [planInfo, setPlanInfo] = useState<PlanInfo>({
    plan: 'BASICO',
    duracion: 'MENSUAL',
    enPrueba: false,
    diasPruebaRestantes: 0,
    maxProductos: 500,
    maxUsuarios: 2,
    mesesHistorial: 1,
    tieneCodecVerify: false,
    tienePersonalizacion: false,
    tieneDashboard: false,
  });

  useEffect(() => {
    if (!usuarioActual) return;

    // 🔐 USUARIO ADMIN = ACCESO TOTAL PREMIUM (Panel de Desarrollador)
    if (usuarioActual.username === 'Admin') {
      setPlanInfo({
        plan: 'PREMIUM',
        duracion: 'VITALICIA',
        enPrueba: false,
        diasPruebaRestantes: 0,
        maxProductos: 999999, // Ilimitado para desarrollador
        maxUsuarios: 999,     // Ilimitado para desarrollador
        mesesHistorial: 12,   // 1 año de historial
        tieneCodecVerify: true,
        tienePersonalizacion: true,
        tieneDashboard: true,
      });
      console.log('🔐 Usuario Admin detectado - ACCESO TOTAL PREMIUM activado');
      return;
    }

    // Cargar información del plan desde localStorage (Panel de Desarrollador)
    const clientesGuardados = localStorage.getItem('codecpos_dev_clientes');
    
    if (clientesGuardados) {
      const clientes = JSON.parse(clientesGuardados);
      const clienteActual = clientes.find(
        (c: any) => c.usuario === usuarioActual.username && c.estado === 'ACTIVA'
      );

      if (clienteActual) {
        const esPremium = clienteActual.plan === 'PREMIUM';
        
        setPlanInfo({
          plan: clienteActual.plan,
          duracion: clienteActual.duracion || 'MENSUAL',
          enPrueba: clienteActual.enPrueba || false,
          diasPruebaRestantes: clienteActual.diasPruebaRestantes || 0,
          maxProductos: esPremium ? 999999 : 5000,  // Premium: Ilimitado | Básico: 5000
          maxUsuarios: esPremium ? 999999 : 5,      // Premium: Ilimitado | Básico: 5
          mesesHistorial: esPremium ? 12 : 3,       // Premium: 12 meses | Básico: 3 meses
          tieneCodecVerify: esPremium,
          tienePersonalizacion: esPremium,
          tieneDashboard: esPremium,
        });
        console.log(`✅ Cliente "${clienteActual.usuario}" - Plan ${clienteActual.plan} activado`);
        return;
      }
    }

    // Si no se encuentra en clientes, asumir BÁSICO por defecto
    setPlanInfo({
      plan: 'BASICO',
      duracion: 'MENSUAL',
      enPrueba: false,
      diasPruebaRestantes: 0,
      maxProductos: 5000,  // Básico: 5000 productos
      maxUsuarios: 5,      // Básico: 5 usuarios
      mesesHistorial: 3,   // Básico: 3 meses de historial
      tieneCodecVerify: false,
      tienePersonalizacion: false,
      tieneDashboard: false,
    });
    console.log('⚠️ Cliente no encontrado - Plan BÁSICO por defecto');
  }, [usuarioActual]);

  /**
   * Verifica si una feature específica está habilitada
   */
  const hasFeature = (feature: FeatureName): boolean => {
    // Si está en prueba, todas las features están habilitadas
    if (planInfo.enPrueba) return true;

    // Verificar según el plan
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
        return planInfo.plan === 'PREMIUM';
      
      case 'multi_usuario_5':
        return planInfo.maxUsuarios >= 5;
      
      case 'inventario_20k':
        return planInfo.maxProductos >= 20000;
      
      case 'historial_3_meses':
        return planInfo.mesesHistorial >= 3;
      
      default:
        return false;
    }
  };

  /**
   * Verifica si puede agregar más productos
   */
  const canAddProduct = (currentCount: number): boolean => {
    return currentCount < planInfo.maxProductos;
  };

  /**
   * Verifica si puede agregar más usuarios
   */
  const canAddUser = (currentCount: number): boolean => {
    return currentCount < planInfo.maxUsuarios;
  };

  /**
   * Obtiene el mensaje de restricción para una feature
   */
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
          : `Tu plan Básico permite hasta 5 usuarios. Actualiza a Premium para usuarios ilimitados`;
      
      case 'inventario_20k':
        return planInfo.plan === 'PREMIUM'
          ? 'Tu plan Premium permite productos ilimitados'
          : `Tu plan Básico permite hasta 5,000 productos. Actualiza a Premium para productos ilimitados`;
      
      case 'historial_3_meses':
        return planInfo.plan === 'PREMIUM'
          ? 'Tu plan Premium guarda 12 meses de historial'
          : `Tu plan Básico guarda 3 meses de historial. Actualiza a Premium para 12 meses`;
      
      default:
        return 'Esta funcionalidad requiere el Plan Premium';
    }
  };

  return {
    planInfo,
    hasFeature,
    canAddProduct,
    canAddUser,
    getRestrictionMessage,
    isPremium: planInfo.plan === 'PREMIUM',
    isBasico: planInfo.plan === 'BASICO',
    isTrial: planInfo.enPrueba,
  };
}