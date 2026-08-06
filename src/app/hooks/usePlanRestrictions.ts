/**
 * Hook para gestionar restricciones de plan (BÁSICO vs PREMIUM)
 */

import { useAuth } from '../contexts/AuthContext';
import { useMemo } from 'react';

export interface PlanInfo {
  plan: 'BASICO' | 'PREMIUM';
  maxProductos: number;
  maxUsuarios: number;
  historialMeses: number;
}

export function usePlanRestrictions() {
  const { user, usuarioActual } = useAuth();

  // ✅ FIX: Usar useMemo para evitar recalcular en cada render
  const planInfo = useMemo((): PlanInfo => {
    try {
      const clientesStr = localStorage.getItem('codecpos_dev_clientes');
      if (clientesStr) {
        const clientes = JSON.parse(clientesStr);
        
        // Buscar el cliente del usuario actual
        const clienteActual = clientes.find((c: any) => 
          c.usuario === usuarioActual?.username || c.usuario === user?.username
        );
        
        if (clienteActual) {
          const isPremium = clienteActual.plan === 'PREMIUM';
          return {
            plan: isPremium ? 'PREMIUM' : 'BASICO',
            maxProductos: isPremium ? 20000 : 500,
            maxUsuarios: isPremium ? 5 : 2,
            historialMeses: isPremium ? 3 : 1,
          };
        }
      }
    } catch (error) {
      console.error('Error obteniendo plan:', error);
    }

    // Por defecto, retornar PREMIUM para desarrollo
    return {
      plan: 'PREMIUM',
      maxProductos: 20000,
      maxUsuarios: 5,
      historialMeses: 3,
    };
  }, [usuarioActual?.username, user?.username]); // ✅ Solo recalcular si cambia el usuario

  // Verificar si tiene acceso a una feature
  const hasFeature = (feature: 'dashboard' | 'codec_verify' | 'reportes_avanzados'): boolean => {
    // En plan PREMIUM, todo está disponible
    if (planInfo.plan === 'PREMIUM') return true;

    // En plan BÁSICO, solo features básicas
    return false;
  };

  // Verificar si puede agregar más productos
  const canAddProduct = (): boolean => {
    try {
      const productosStr = localStorage.getItem('codecpos_productos');
      if (!productosStr) return true;

      const productos = JSON.parse(productosStr);
      return productos.length < planInfo.maxProductos;
    } catch (error) {
      console.error('Error verificando productos:', error);
      return true;
    }
  };

  // Verificar si puede agregar más usuarios
  const canAddUser = (): boolean => {
    try {
      const usuariosStr = localStorage.getItem('codecpos_usuarios');
      if (!usuariosStr) return true;

      const usuarios = JSON.parse(usuariosStr);
      return usuarios.length < planInfo.maxUsuarios;
    } catch (error) {
      console.error('Error verificando usuarios:', error);
      return true;
    }
  };

  return {
    planInfo,
    hasFeature,
    canAddProduct,
    canAddUser,
  };
}