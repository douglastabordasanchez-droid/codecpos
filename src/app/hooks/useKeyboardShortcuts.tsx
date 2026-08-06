/**
 * Hook para atajos de teclado globales
 * CODEC POS v2.0
 */

import { useEffect, useCallback, useState } from 'react';
import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type KeyHandler = () => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: KeyHandler;
  description?: string;
  preventDefault?: boolean;
}

/**
 * Hook para registrar atajos de teclado
 * @example
 * useKeyboardShortcut({
 *   key: 'f2',
 *   handler: () => console.log('F2 presionado'),
 *   description: 'Abrir modal de nuevo producto'
 * });
 */
export function useKeyboardShortcut(config: ShortcutConfig) {
  const { key, ctrl, alt, shift, handler, preventDefault = true } = config;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      const ctrlMatch = ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
      const altMatch = alt ? event.altKey : !event.altKey;
      const shiftMatch = shift ? event.shiftKey : !event.shiftKey;

      if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
        if (preventDefault) {
          event.preventDefault();
        }
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, ctrl, alt, shift, handler, preventDefault]);
}

/**
 * Hook para registrar múltiples atajos a la vez
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const config of shortcuts) {
        const { key, ctrl, alt, shift, handler, preventDefault = true } = config;

        const keyMatch = event.key.toLowerCase() === key.toLowerCase();
        const ctrlMatch = ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const altMatch = alt ? event.altKey : !event.altKey;
        const shiftMatch = shift ? event.shiftKey : !event.shiftKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          if (preventDefault) {
            event.preventDefault();
          }
          handler();
          break; // Solo ejecutar el primer match
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/**
 * Atajos predefinidos para el POS
 */
export const POS_SHORTCUTS = {
  // Navegación
  BUSCAR: { key: 'f3', description: 'Buscar producto' },
  NUEVO_PRODUCTO: { key: 'f2', description: 'Nuevo producto' },
  COBRAR: { key: 'f4', description: 'Procesar cobro' },
  
  // Carrito
  LIMPIAR_CARRITO: { key: 'Escape', description: 'Limpiar carrito' },
  QUITAR_ULTIMO: { key: 'Delete', ctrl: true, description: 'Quitar último producto' },
  
  // Cajón y hardware
  ABRIR_CAJON: { key: 'b', ctrl: true, description: 'Abrir cajón monedero' },
  IMPRIMIR: { key: 'p', ctrl: true, description: 'Imprimir última factura' },
  
  // Métodos de pago rápido
  PAGO_EFECTIVO: { key: 'e', ctrl: true, description: 'Pago en efectivo' },
  PAGO_TARJETA: { key: 't', ctrl: true, description: 'Pago con tarjeta' },
  
  // Navegación entre secciones
  IR_INVENTARIO: { key: 'i', ctrl: true, shift: true, description: 'Ir a inventario' },
  IR_VENTAS: { key: 'v', ctrl: true, shift: true, description: 'Ir a ventas' },
  IR_REPORTES: { key: 'r', ctrl: true, shift: true, description: 'Ir a reportes' },
  
  // Utilidades
  AYUDA: { key: 'F1', description: 'Mostrar ayuda de atajos' },
  GUARDAR: { key: 's', ctrl: true, description: 'Guardar cambios' },
} as const;

/**
 * Hook para mostrar panel de ayuda de atajos
 */
export function useShortcutsHelp() {
  const [showHelp, setShowHelp] = useState(false);

  useKeyboardShortcut({
    key: 'F1',
    handler: () => setShowHelp(true),
    description: 'Mostrar ayuda',
  });

  return { showHelp, setShowHelp };
}

/**
 * Componente de ayuda de atajos (opcional)
 */
interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

export function ShortcutsHelpDialog({ isOpen, onClose, darkMode = false }: ShortcutsHelpProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl shadow-2xl z-50 ${
              darkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-900'
            }`}
          >
            {/* Header */}
            <div className={`sticky top-0 p-6 border-b ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Keyboard className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Atajos de Teclado</h2>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Aumenta tu productividad con estos atajos
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Navegación */}
              <div>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}>
                  🔍 Navegación
                </h3>
                <div className="space-y-2">
                  <ShortcutRow shortcut="F3" description="Buscar producto" darkMode={darkMode} />
                  <ShortcutRow shortcut="F2" description="Nuevo producto" darkMode={darkMode} />
                  <ShortcutRow shortcut="F4" description="Procesar cobro" darkMode={darkMode} />
                  <ShortcutRow shortcut="ESC" description="Limpiar carrito" darkMode={darkMode} />
                </div>
              </div>

              {/* Hardware */}
              <div>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  🖨️ Hardware
                </h3>
                <div className="space-y-2">
                  <ShortcutRow shortcut="Ctrl + B" description="Abrir cajón monedero" darkMode={darkMode} />
                  <ShortcutRow shortcut="Ctrl + P" description="Imprimir última factura" darkMode={darkMode} />
                </div>
              </div>

              {/* Pagos */}
              <div>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  💳 Métodos de Pago
                </h3>
                <div className="space-y-2">
                  <ShortcutRow shortcut="Ctrl + E" description="Pago en efectivo" darkMode={darkMode} />
                  <ShortcutRow shortcut="Ctrl + T" description="Pago con tarjeta" darkMode={darkMode} />
                </div>
              </div>

              {/* Secciones */}
              <div>
                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                  📊 Navegación entre Secciones
                </h3>
                <div className="space-y-2">
                  <ShortcutRow shortcut="Ctrl + Shift + I" description="Ir a Inventario" darkMode={darkMode} />
                  <ShortcutRow shortcut="Ctrl + Shift + V" description="Ir a Ventas" darkMode={darkMode} />
                  <ShortcutRow shortcut="Ctrl + Shift + R" description="Ir a Reportes" darkMode={darkMode} />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ShortcutRow({ shortcut, description, darkMode }: { shortcut: string; description: string; darkMode: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        {description}
      </span>
      <kbd className={`px-3 py-1 text-xs font-mono rounded ${
        darkMode ? 'bg-slate-700 text-violet-400' : 'bg-gray-100 text-gray-900'
      } border ${darkMode ? 'border-slate-600' : 'border-gray-300'}`}>
        {shortcut}
      </kbd>
    </div>
  );
}