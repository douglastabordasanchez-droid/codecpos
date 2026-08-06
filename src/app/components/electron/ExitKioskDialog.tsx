/**
 * CODEC POS - Dialog para salir del modo kiosko
 * Se activa con Ctrl+Shift+Q
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';

declare global {
  interface Window {
    electronAPI?: {
      verifyAdminPassword: (password: string) => Promise<boolean>;
      exitApp: (password: string) => void;
      onShowExitDialog: (callback: () => void) => void;
      onRequestAdminPassword: (callback: () => void) => void;
      onInvalidPassword: (callback: () => void) => void;
      isElectron: boolean;
    };
  }
}

export function ExitKioskDialog() {
  const { darkMode } = usePOS();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron) return;

    // Escuchar evento de salida (Ctrl+Shift+Q)
    window.electronAPI!.onShowExitDialog(() => {
      setIsOpen(true);
      setPassword('');
    });

    // Escuchar solicitud de contraseña
    window.electronAPI!.onRequestAdminPassword(() => {
      setIsOpen(true);
      setPassword('');
    });

    // Escuchar contraseña inválida
    window.electronAPI!.onInvalidPassword(() => {
      toast.error('Contraseña de administrador incorrecta');
      setPassword('');
      setIsVerifying(false);
    });
  }, [isElectron]);

  const handleExit = async () => {
    if (!password.trim()) {
      toast.error('Ingrese la contraseña de administrador');
      return;
    }

    setIsVerifying(true);

    try {
      const isValid = await window.electronAPI!.verifyAdminPassword(password);
      
      if (isValid) {
        toast.success('Saliendo de CODEC POS...', {
          description: 'Cerrando sesión'
        });
        
        // Pequeño delay para mostrar el toast
        setTimeout(() => {
          window.electronAPI!.exitApp(password);
        }, 500);
      } else {
        toast.error('Contraseña incorrecta', {
          description: 'Contacte al administrador del sistema'
        });
        setPassword('');
        setIsVerifying(false);
      }
    } catch (error) {
      console.error('Error al verificar contraseña:', error);
      toast.error('Error al verificar credenciales');
      setIsVerifying(false);
    }
  };

  // No mostrar en web
  if (!isElectron) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`max-w-md ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'
      }`}>
        <DialogHeader>
          <DialogTitle className={`text-2xl font-bold flex items-center gap-2 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            <Shield className="w-6 h-6 text-red-500" />
            Salir del Modo Kiosko
          </DialogTitle>
        </DialogHeader>

        <div className={`p-6 rounded-xl ${
          darkMode ? 'bg-red-900/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm mb-4 ${
            darkMode ? 'text-red-300' : 'text-red-800'
          }`}>
            ⚠️ Esta acción cerrará completamente CODEC POS y saldrá del modo kiosko.
            Se requiere la contraseña de administrador.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="admin-password" className={
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }>
                Contraseña de Administrador
              </Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleExit();
                  }
                }}
                placeholder="Ingrese contraseña de admin"
                disabled={isVerifying}
                autoFocus
                className={`mt-2 ${
                  darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              />
            </div>

            <div className={`p-3 rounded-lg ${
              darkMode ? 'bg-slate-700' : 'bg-gray-100'
            }`}>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                💡 <strong>Atajo:</strong> Presione Ctrl+Shift+Q para abrir este diálogo
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setPassword('');
            }}
            disabled={isVerifying}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExit}
            disabled={isVerifying || !password.trim()}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {isVerifying ? 'Verificando...' : 'Salir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
