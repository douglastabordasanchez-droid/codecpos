/**
 * Modal de Bloqueo Total del Sistema
 * Se activa cuando el trial de 7 días expira
 * Estética Glassmorphism premium con blindaje anti-piratería
 */

import React, { useState } from 'react';
import { Shield, Lock, Key, AlertCircle, CheckCircle2, Copy, Info } from 'lucide-react';
import { useLicense, generarClaveDesarrollo } from '../../contexts/LicenseContext';
import { toast } from 'sonner';

export function ModalBloqueoTrial() {
  const { isLicensed, isTrialActive, machineId, activateLicense, licenseInfo } = useLicense();
  const [claveActivacion, setClaveActivacion] = useState('');
  const [mostrarInfo, setMostrarInfo] = useState(false);

  // Si está licenciado o en trial, no mostrar el modal
  if (isLicensed || isTrialActive) {
    return null;
  }

  const handleActivar = () => {
    const success = activateLicense(claveActivacion.toUpperCase().trim());
    
    if (success) {
      toast.success('¡Licencia PRO activada exitosamente!', {
        description: 'El sistema ahora está completamente desbloqueado',
        duration: 5000,
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      toast.error('Clave de activación inválida', {
        description: 'Verifica que la clave sea correcta y corresponda a este equipo',
      });
    }
  };

  const copiarMachineId = () => {
    navigator.clipboard.writeText(machineId);
    toast.success('MachineID copiado', {
      description: 'Envía este código para obtener tu licencia',
    });
  };

  // SOLO PARA DESARROLLO - Mostrar clave válida
  const claveDesarrollo = generarClaveDesarrollo(machineId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl">
      {/* Overlay de bloqueo */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-purple-900/20" />
      
      {/* Modal principal */}
      <div className="relative w-full max-w-2xl mx-4">
        {/* Glassmorphism Card */}
        <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
          
          {/* Header con icono de bloqueo */}
          <div className="relative bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 p-8 text-center">
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-xl rounded-full mb-4 animate-pulse">
                <Lock className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-black text-white mb-2">
                SISTEMA BLOQUEADO
              </h1>
              <p className="text-white/80 text-lg">
                El período de prueba de 7 días ha finalizado
              </p>
            </div>
          </div>

          {/* Contenido */}
          <div className="p-8 space-y-6">
            
            {/* Alerta de bloqueo */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-bold mb-1">Acceso Restringido</h3>
                <p className="text-white/70 text-sm">
                  Este sistema está blindado mediante <strong>MachineID único</strong> para evitar reinstalaciones ilegales.
                  Las copias no autorizadas no funcionarán en otros equipos.
                </p>
              </div>
            </div>

            {/* MachineID único */}
            <div className="space-y-3">
              <label className="text-white/70 text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" />
                MachineID de Este Equipo (Único e Intransferible)
              </label>
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-white text-center text-lg">
                  {machineId}
                </div>
                <button
                  onClick={copiarMachineId}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 rounded-xl transition-all flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copiar
                </button>
              </div>
              <p className="text-white/50 text-xs">
                Envía este código para obtener tu licencia. No puede ser transferida a otro equipo.
              </p>
            </div>

            {/* Campo de activación */}
            <div className="space-y-3">
              <label className="text-white/70 text-sm font-semibold flex items-center gap-2">
                <Key className="w-4 h-4" />
                Clave de Activación PRO
              </label>
              <input
                type="text"
                value={claveActivacion}
                onChange={(e) => setClaveActivacion(e.target.value.toUpperCase())}
                placeholder="CODEC-PRO-XXXX-XXXX-XXXX"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-center text-lg placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={24}
              />
            </div>

            {/* Botón de activación */}
            <button
              onClick={handleActivar}
              disabled={claveActivacion.length < 24}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-purple-500/20"
            >
              <CheckCircle2 className="w-5 h-5" />
              ACTIVAR LICENCIA PRO
            </button>

            {/* Info de licencia PRO */}
            <button
              onClick={() => setMostrarInfo(!mostrarInfo)}
              className="w-full text-white/50 hover:text-white/80 text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Info className="w-4 h-4" />
              {mostrarInfo ? 'Ocultar' : 'Ver'} Beneficios de Licencia PRO
            </button>

            {mostrarInfo && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <h3 className="text-white font-bold text-lg mb-3">✨ Licencia PRO Incluye:</h3>
                <ul className="space-y-2 text-white/70">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>20,000 productos</strong> en inventario (vs 100 en Trial)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>3 meses de historial</strong> de ventas (vs 1 mes en Trial)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Sincronización Cloud</strong> encriptada de datos</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Codec Verify PRO</strong> sin límites de notificaciones</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Soporte técnico</strong> prioritario</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Actualizaciones automáticas</strong> de por vida</span>
                  </li>
                </ul>
              </div>
            )}

            {/* SOLO DESARROLLO - Mostrar clave válida */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
              <p className="text-yellow-400 text-xs font-mono mb-2">🔧 MODO DESARROLLO:</p>
              <p className="text-white/70 text-xs mb-2">Clave válida para este equipo:</p>
              <div className="bg-black/30 rounded-lg px-3 py-2 font-mono text-yellow-300 text-sm text-center">
                {claveDesarrollo}
              </div>
              <button
                onClick={() => {
                  setClaveActivacion(claveDesarrollo);
                  navigator.clipboard.writeText(claveDesarrollo);
                  toast.success('Clave copiada al portapapeles');
                }}
                className="mt-2 w-full text-yellow-400 hover:text-yellow-300 text-xs transition-all"
              >
                Copiar y usar esta clave →
              </button>
            </div>

          </div>

          {/* Footer */}
          <div className="bg-white/5 border-t border-white/10 px-8 py-4 text-center">
            <p className="text-white/50 text-xs">
              <strong>CODEC POS v2.0</strong> - Sistema blindado con protección anti-piratería
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
