/**
 * CODEC POS - Badge de Modo Electron
 * Muestra si la app está corriendo en escritorio o web
 */

import { Monitor, Globe } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';

export function ElectronBadge() {
  const { darkMode } = usePOS();
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  return (
    <div className={`fixed top-4 left-4 z-50 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 ${
      isElectron
        ? darkMode
          ? 'bg-emerald-900/30 border border-emerald-500/50'
          : 'bg-emerald-50 border border-emerald-200'
        : darkMode
        ? 'bg-blue-900/30 border border-blue-500/50'
        : 'bg-blue-50 border border-blue-200'
    }`}>
      {isElectron ? (
        <>
          <Monitor className="w-4 h-4 text-emerald-500" />
          <span className={`text-xs font-semibold ${
            darkMode ? 'text-emerald-400' : 'text-emerald-700'
          }`}>
            Modo Escritorio
          </span>
        </>
      ) : (
        <>
          <Globe className="w-4 h-4 text-blue-500" />
          <span className={`text-xs font-semibold ${
            darkMode ? 'text-blue-400' : 'text-blue-700'
          }`}>
            Modo Web
          </span>
        </>
      )}
    </div>
  );
}
