/**
 * Componente para Bloquear Funcionalidades Premium
 * Muestra un overlay cuando el usuario no tiene licencia Premium
 */

import { Crown, Lock, Sparkles, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../ui/button';
import { useLicense, type LicenseContextType } from '../../contexts/LicenseContext';
import { usePOS } from '../../contexts/POSContext';
import { useNavigate } from 'react-router';

interface PremiumFeatureProps {
  featureName: keyof LicenseContextType['licenseInfo']['features'];
  children: React.ReactNode;
  showUpgrade?: boolean;
  customMessage?: string;
}

export function PremiumFeature({ featureName, children, showUpgrade = true, customMessage }: PremiumFeatureProps) {
  const { licenseInfo } = useLicense();
  const { darkMode } = usePOS();
  const navigate = useNavigate();

  // Si la funcionalidad está habilitada, mostrar el contenido normal
  if (licenseInfo.features[featureName]) {
    return <>{children}</>;
  }

  // Mensajes personalizados por funcionalidad
  const messages = {
    codecVerify: '🔔 Codec Verify - Notificaciones de Pagos Móviles en Tiempo Real',
    reportesAvanzados: '📊 Reportes Avanzados - Analítica Empresarial Completa',
    exportarExcel: '📗 Exportar a Excel - Reportes Profesionales',
    exportarPDF: '📄 Exportar a PDF - Facturas y Documentos Profesionales',
    facturacionElectronica: '🧾 Facturación Electrónica DIAN',
    gestionGastos: '💸 Gestión de Gastos - Control Financiero Total',
    alertasAvanzadas: '🚨 Alertas Avanzadas de Stock y Vencimientos',
    backupNube: '☁️ Backup en la Nube - Protección de Datos',
    soportePrioritario: '🎯 Soporte Prioritario 24/7',
    devoluciones: '↩️ Sistema de Devoluciones',
    logoDeLaEmpresa: '🖼️ Logo de tu Empresa en Facturas',
    importarExportarInventario: '📦 Importar/Exportar Inventario',
    inteligenciaDeNegocio: '🧠 Inteligencia de Negocio - Categorías Dinámicas',
  };

  const benefits = [
    '✅ 20,000 productos (vs 100)',
    '✅ 10 usuarios (vs 1 cajero)',
    '✅ 3 meses historial (vs 1 mes)',
    '✅ Codec Verify + WhatsApp/Email',
    '✅ Reportes Excel/PDF ilimitados',
    '✅ Logo personalizado',
    '✅ Backup en la nube',
    '✅ Soporte prioritario 24/7',
  ];

  return (
    <div className="relative min-h-[400px]">
      {/* Contenido bloqueado con blur */}
      <div className="filter blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* Overlay de bloqueo Premium */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 flex items-center justify-center z-10"
      >
        <div className={`max-w-2xl w-full mx-4 p-8 rounded-3xl border-2 backdrop-blur-xl ${
          darkMode
            ? 'bg-gradient-to-br from-purple-900/90 via-indigo-900/90 to-blue-900/90 border-purple-500/30'
            : 'bg-gradient-to-br from-purple-100/90 via-indigo-100/90 to-blue-100/90 border-purple-300'
        }`}>
          {/* Icono Premium */}
          <div className="flex justify-center mb-6">
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${
              darkMode
                ? 'bg-gradient-to-br from-amber-500 to-yellow-600'
                : 'bg-gradient-to-br from-amber-400 to-yellow-500'
            } shadow-2xl`}>
              <Crown className="w-10 h-10 text-white" />
              <Sparkles className="w-5 h-5 text-white absolute -top-1 -right-1 animate-pulse" />
            </div>
          </div>

          {/* Título */}
          <h2 className={`text-3xl font-black text-center mb-3 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Funcionalidad Premium
          </h2>

          {/* Mensaje personalizado */}
          <p className={`text-center text-lg font-semibold mb-6 ${
            darkMode ? 'text-purple-300' : 'text-purple-700'
          }`}>
            {customMessage || messages[featureName]}
          </p>

          {/* Beneficios */}
          <div className={`p-6 rounded-2xl mb-6 ${
            darkMode
              ? 'bg-slate-800/50 border border-slate-700'
              : 'bg-white/70 border border-purple-200'
          }`}>
            <p className={`text-sm font-bold mb-4 flex items-center gap-2 ${
              darkMode ? 'text-amber-400' : 'text-amber-600'
            }`}>
              <Zap className="w-5 h-5" />
              Desbloquea TODAS estas funcionalidades con PREMIUM:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {benefits.map((benefit, index) => (
                <p key={index} className={`text-sm ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {benefit}
                </p>
              ))}
            </div>
          </div>

          {/* Precio y Call to Action */}
          <div className={`text-center p-6 rounded-2xl mb-6 ${
            darkMode
              ? 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border border-purple-500/30'
              : 'bg-gradient-to-r from-purple-100 to-indigo-100 border border-purple-300'
          }`}>
            <p className={`text-sm font-semibold mb-2 ${
              darkMode ? 'text-purple-300' : 'text-purple-700'
            }`}>
              Plan Premium
            </p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className={`text-5xl font-black ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                $89.900
              </span>
              <span className={`text-xl ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                /mes
              </span>
            </div>
            <p className={`text-xs ${
              darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              🎁 Primer mes con 50% de descuento
            </p>
          </div>

          {/* Botones */}
          {showUpgrade && (
            <div className="flex gap-3">
              <Button
                onClick={() => navigate('/licencia')}
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-bold py-6 text-lg shadow-2xl"
              >
                <Crown className="w-5 h-5 mr-2" />
                Actualizar a Premium
              </Button>
            </div>
          )}

          {/* Info adicional */}
          <p className={`text-center text-xs mt-4 ${
            darkMode ? 'text-gray-500' : 'text-gray-600'
          }`}>
            <Lock className="w-3 h-3 inline mr-1" />
            Plan actual: {licenseInfo.tipo}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// Componente para botones bloqueados individualmente
export function PremiumButton({ 
  featureName, 
  onClick, 
  children, 
  className = '',
  disabled = false,
  ...props 
}: {
  featureName: keyof LicenseContextType['licenseInfo']['features'];
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  [key: string]: any;
}) {
  const { licenseInfo } = useLicense();
  const { darkMode } = usePOS();
  const navigate = useNavigate();

  const isBlocked = !licenseInfo.features[featureName];

  if (isBlocked) {
    return (
      <Button
        onClick={() => navigate('/licencia')}
        className={`relative ${className}`}
        disabled={disabled}
        {...props}
      >
        <Lock className="w-4 h-4 mr-2" />
        {children}
        <Crown className="w-4 h-4 ml-2 text-amber-400" />
      </Button>
    );
  }

  return (
    <Button onClick={onClick} className={className} disabled={disabled} {...props}>
      {children}
    </Button>
  );
}