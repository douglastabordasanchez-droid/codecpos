import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Wrench, Database, Zap, Clock, TrendingDown, Phone, Mail, MessageCircle, CheckCircle, Loader2, Trash2, HardDrive, FileText, BarChart3 } from 'lucide-react';
import { SystemHealth } from './SystemHealthMonitor';

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemHealth: SystemHealth;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({ 
  isOpen, 
  onClose,
  systemHealth 
}) => {
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMethod, setContactMethod] = useState<'whatsapp' | 'phone' | 'email'>('whatsapp');
  const [isCleaningCache, setIsCleaningCache] = useState(false);
  const [cleanupComplete, setCleanupComplete] = useState(false);

  // 🧹 Función de limpieza básica gratuita
  const performBasicCleanup = () => {
    setIsCleaningCache(true);
    
    setTimeout(() => {
      // Limpiar caché y archivos temporales
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('codecpos_cache_') ||
          key.startsWith('codecpos_temp_') ||
          key.startsWith('codecpos_log_')
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      setIsCleaningCache(false);
      setCleanupComplete(true);
      
      console.log(`🧹 Limpieza básica completada: ${keysToRemove.length} elementos eliminados`);
      
      // Ocultar mensaje después de 3 segundos
      setTimeout(() => setCleanupComplete(false), 3000);
    }, 2000);
  };

  // 📞 Función para contactar soporte
  const contactSupport = () => {
    const clienteActivo = JSON.parse(localStorage.getItem('codecpos_cliente_activo') || '{}');
    const mensaje = encodeURIComponent(
      `🛠️ SOLICITUD DE MANTENIMIENTO PREMIUM\n\n` +
      `📋 Información del sistema:\n` +
      `• Negocio: ${clienteActivo.nombreNegocio || 'No especificado'}\n` +
      `• NIT: ${clienteActivo.nit || 'No especificado'}\n` +
      `• Plan: ${clienteActivo.plan || 'No especificado'}\n\n` +
      `📊 Diagnóstico:\n` +
      `• Rendimiento: ${systemHealth.performanceScore}%\n` +
      `• Base de datos: ${systemHealth.dbSize.toFixed(1)} MB\n` +
      `• Transacciones: ${systemHealth.totalTransactions.toLocaleString()}\n` +
      `• Días activos: ${systemHealth.daysActive}\n\n` +
      `🔧 Razones de mantenimiento:\n` +
      systemHealth.maintenanceReason.map(r => `• ${r}`).join('\n') +
      `\n\nSolicito agendar un mantenimiento premium para optimizar el sistema.`
    );

    if (contactMethod === 'whatsapp') {
      window.open(`https://wa.me/573001234567?text=${mensaje}`, '_blank');
    } else if (contactMethod === 'phone') {
      window.open('tel:+573001234567');
    } else {
      window.open(`mailto:soporte@codecstudio.com?subject=Solicitud de Mantenimiento Premium&body=${mensaje}`);
    }
  };

  if (!isOpen) return null;

  // 🎨 Color basado en el rendimiento
  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getPerformanceBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 60) return 'bg-yellow-500/20';
    if (score >= 40) return 'bg-orange-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500/20 via-red-500/20 to-orange-500/20 p-6 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  Mantenimiento del Sistema Requerido
                </h2>
                <p className="text-white/70 text-sm">
                  Tu sistema necesita optimización para mantener el mejor rendimiento
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Puntuación de Rendimiento */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                Rendimiento del Sistema
              </h3>
              <span className={`text-3xl font-bold ${getPerformanceColor(systemHealth.performanceScore)}`}>
                {systemHealth.performanceScore}%
              </span>
            </div>
            <div className="relative w-full h-4 bg-white/5 rounded-full overflow-hidden">
              <div 
                className={`absolute inset-y-0 left-0 transition-all duration-1000 ${
                  systemHealth.performanceScore >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                  systemHealth.performanceScore >= 60 ? 'bg-gradient-to-r from-yellow-500 to-amber-500' :
                  systemHealth.performanceScore >= 40 ? 'bg-gradient-to-r from-orange-500 to-red-500' :
                  'bg-gradient-to-r from-red-500 to-rose-600'
                }`}
                style={{ width: `${systemHealth.performanceScore}%` }}
              />
            </div>
            {systemHealth.performanceScore < 60 && (
              <p className="text-orange-400 text-sm mt-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Rendimiento degradado. El sistema puede estar más lento de lo normal.
              </p>
            )}
          </div>

          {/* Diagnóstico del Sistema */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className={`p-4 rounded-xl ${getPerformanceBg(systemHealth.performanceScore)} border border-white/10`}>
              <div className="flex items-center gap-3 mb-2">
                <Database className="w-5 h-5 text-blue-400" />
                <span className="text-white/70 text-sm">Base de Datos</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {systemHealth.dbSize.toFixed(1)} MB
              </p>
              {systemHealth.dbSize > 100 && (
                <p className="text-xs text-orange-400 mt-1">Requiere optimización</p>
              )}
            </div>

            <div className={`p-4 rounded-xl ${getPerformanceBg(systemHealth.performanceScore)} border border-white/10`}>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-green-400" />
                <span className="text-white/70 text-sm">Transacciones</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {systemHealth.totalTransactions.toLocaleString()}
              </p>
              {systemHealth.totalTransactions > 10000 && (
                <p className="text-xs text-orange-400 mt-1">Alto volumen</p>
              )}
            </div>

            <div className={`p-4 rounded-xl ${getPerformanceBg(systemHealth.performanceScore)} border border-white/10`}>
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <span className="text-white/70 text-sm">Días Activos</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {systemHealth.daysActive}
              </p>
              <p className="text-xs text-white/60 mt-1">
                {Math.floor(systemHealth.daysActive / 30)} meses de uso
              </p>
            </div>

            <div className={`p-4 rounded-xl ${getPerformanceBg(systemHealth.performanceScore)} border border-white/10`}>
              <div className="flex items-center gap-3 mb-2">
                <HardDrive className="w-5 h-5 text-cyan-400" />
                <span className="text-white/70 text-sm">Caché</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {systemHealth.cacheSize.toFixed(1)} MB
              </p>
              {systemHealth.cacheSize > 20 && (
                <p className="text-xs text-orange-400 mt-1">Limpieza recomendada</p>
              )}
            </div>
          </div>

          {/* Razones de Mantenimiento */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-500" />
              Diagnóstico Detectado
            </h3>
            <div className="space-y-2">
              {systemHealth.maintenanceReason.map((reason, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <p className="text-white/90 text-sm">{reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Limpieza Básica Gratuita */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-blue-400" />
              Limpieza Básica (Gratuita)
            </h3>
            <p className="text-white/70 text-sm mb-4">
              Elimina archivos temporales y caché para liberar espacio. Esto puede mejorar ligeramente el rendimiento.
            </p>
            <button
              onClick={performBasicCleanup}
              disabled={isCleaningCache || cleanupComplete}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCleaningCache ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Limpiando...
                </>
              ) : cleanupComplete ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Limpieza Completada
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  Ejecutar Limpieza Básica
                </>
              )}
            </button>
            {cleanupComplete && (
              <p className="text-green-400 text-sm mt-2 text-center">
                ✓ Caché limpiado exitosamente. Se liberaron {systemHealth.cacheSize.toFixed(1)} MB.
              </p>
            )}
          </div>

          {/* Mantenimiento Premium */}
          <div className="p-6 bg-gradient-to-br from-orange-500/20 via-red-500/20 to-orange-500/20 border border-orange-500/30 rounded-xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Wrench className="w-6 h-6 text-orange-400" />
              Mantenimiento Premium (Pago)
            </h3>
            <p className="text-white/80 mb-4">
              Para una optimización completa y recuperar el 100% del rendimiento, nuestro equipo técnico realizará:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Optimización completa de base de datos</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Eliminación de datos redundantes</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Reorganización de índices</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Backup completo antes de optimizar</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Actualización de sistema a última versión</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm">Soporte técnico remoto incluido</span>
              </div>
            </div>

            {!showContactForm ? (
              <button
                onClick={() => setShowContactForm(true)}
                className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <Wrench className="w-5 h-5" />
                Solicitar Mantenimiento Premium
              </button>
            ) : (
              <div className="space-y-4">
                <p className="text-white/90 font-semibold">Elige tu método de contacto preferido:</p>
                
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setContactMethod('whatsapp')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      contactMethod === 'whatsapp'
                        ? 'border-green-500 bg-green-500/20'
                        : 'border-white/10 bg-white/5 hover:border-green-500/50'
                    }`}
                  >
                    <MessageCircle className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <span className="text-white text-sm font-medium">WhatsApp</span>
                  </button>
                  
                  <button
                    onClick={() => setContactMethod('phone')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      contactMethod === 'phone'
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/10 bg-white/5 hover:border-blue-500/50'
                    }`}
                  >
                    <Phone className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <span className="text-white text-sm font-medium">Llamada</span>
                  </button>
                  
                  <button
                    onClick={() => setContactMethod('email')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      contactMethod === 'email'
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/10 bg-white/5 hover:border-purple-500/50'
                    }`}
                  >
                    <Mail className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <span className="text-white text-sm font-medium">Email</span>
                  </button>
                </div>

                <button
                  onClick={contactSupport}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
                >
                  {contactMethod === 'whatsapp' && <MessageCircle className="w-5 h-5" />}
                  {contactMethod === 'phone' && <Phone className="w-5 h-5" />}
                  {contactMethod === 'email' && <Mail className="w-5 h-5" />}
                  Contactar por {contactMethod === 'whatsapp' ? 'WhatsApp' : contactMethod === 'phone' ? 'Teléfono' : 'Email'}
                </button>

                <button
                  onClick={() => setShowContactForm(false)}
                  className="w-full px-4 py-2 text-white/60 hover:text-white transition-colors text-sm"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center">
          <p className="text-white/60 text-sm">
            Última revisión: {systemHealth.lastMaintenance 
              ? new Date(systemHealth.lastMaintenance).toLocaleDateString('es-CO')
              : 'Nunca'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
