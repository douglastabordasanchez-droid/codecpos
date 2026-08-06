/**
 * RUTA PROTEGIDA POR PLAN - CODEC POS v2.0
 * Bloquea acceso a funciones según el plan del usuario
 * Muestra modal de upgrade si intenta acceder sin permisos
 */

import { ReactNode, useState, useEffect } from 'react';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import { useAuth } from '../../contexts/AuthContext';
import { ModalUpgradePremium } from '../licencia/ModalUpgradePremium';

interface PlanProtectedRouteProps {
  children: ReactNode;
  requiredFeature: 'dashboard' | 'codec_verify' | 'reportes_avanzados';
  featureName: string;
  featureDescription: string;
}

export function PlanProtectedRoute({
  children,
  requiredFeature,
  featureName,
  featureDescription,
}: PlanProtectedRouteProps) {
  const { hasFeature } = usePlanRestrictions();
  const { modoAdminTemporalActivo } = useAuth();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const access = hasFeature(requiredFeature) || modoAdminTemporalActivo;
    setHasAccess(access);
    
    if (!access) {
      setShowUpgradeModal(true);
    }
  }, [requiredFeature, hasFeature, modoAdminTemporalActivo]);

  if (!hasAccess) {
    return (
      <>
        <ModalUpgradePremium
          isOpen={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            // Redirigir a POS después de cerrar
            window.location.href = '/pos';
          }}
          featureName={featureName}
          featureDescription={featureDescription}
        />
        
        {/* Mostrar una pantalla bloqueada mientras tanto */}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-white mb-4 bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
              Función Bloqueada
            </h2>
            <p className="text-gray-400 mb-6 max-w-md">
              Esta funcionalidad requiere el Plan Premium
            </p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}