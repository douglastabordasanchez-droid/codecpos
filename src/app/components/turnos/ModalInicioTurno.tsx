/**
 * CODEC POS v2.0 - Modal de Inicio de Turno
 * Permite al cajero iniciar su turno de trabajo
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, User, Lock, Eye, EyeOff, AlertCircle, CheckCircle, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

interface ModalInicioTurnoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalInicioTurno({ open, onOpenChange }: ModalInicioTurnoProps) {
  const { darkMode } = usePOS();
  const { iniciarSesion, usuarioActual } = useAuth();
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleIniciarTurno = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast.error('Campos requeridos', {
        description: 'Ingresa tu usuario y contraseña'
      });
      return;
    }

    try {
      setIsLoading(true);

      // Intentar iniciar sesión
      const exito = await iniciarSesion(username, password);

      if (exito) {
        // Cerrar modal
        onOpenChange(false);
        
        // Mensaje de bienvenida
        toast.success('¡Bienvenido!', {
          description: 'Accediendo a tu área de trabajo',
          icon: '👋'
        });

        // Redirigir al portal de empleados
        setTimeout(() => {
          navigate('/portal-empleados');
        }, 500);

        // Resetear formulario
        setUsername('');
        setPassword('');
        setMostrarPassword(false);
      } else {
        toast.error('Credenciales incorrectas', {
          description: 'Usuario o contraseña inválidos'
        });
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error iniciando turno:', error);
      toast.error('Error al iniciar turno');
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-md ${
        darkMode ? 'bg-slate-800/95 border-slate-700 backdrop-blur-xl' : 'bg-white/95 backdrop-blur-xl'
      }`}>
        <DialogHeader>
          <DialogTitle className={`text-2xl font-bold flex items-center gap-3 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <PlayCircle className="w-7 h-7 text-white" />
            </div>
            Iniciar Turno
          </DialogTitle>
          <DialogDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
            Ingresa tus credenciales para comenzar tu jornada laboral
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleIniciarTurno} className="space-y-6 pt-4">
          {/* Información del Turno */}
          <div className={`p-4 rounded-xl border-2 ${
            darkMode 
              ? 'bg-slate-700/50 border-slate-600' 
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <Clock className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Información del Turno
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Fecha:</span>
                <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {new Date().toLocaleDateString('es-CO', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Hora de inicio:</span>
                <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {new Date().toLocaleTimeString('es-CO', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Formulario de Login */}
          <div className="space-y-4">
            {/* Usuario */}
            <div className="space-y-2">
              <Label htmlFor="username" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                Usuario
              </Label>
              <div className="relative">
                <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`} />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario"
                  className={`pl-10 ${
                    darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' 
                      : 'bg-white border-gray-300'
                  }`}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-2">
              <Label htmlFor="password" className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                Contraseña
              </Label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`} />
                <Input
                  id="password"
                  type={mostrarPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className={`pl-10 pr-10 ${
                    darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' 
                      : 'bg-white border-gray-300'
                  }`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {mostrarPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Nota Importante */}
          <div className={`p-4 rounded-xl border-2 ${
            darkMode 
              ? 'bg-amber-900/20 border-amber-600/50' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-3">
              <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                darkMode ? 'text-amber-400' : 'text-amber-600'
              }`} />
              <div className="text-sm">
                <p className={`font-semibold mb-1 ${
                  darkMode ? 'text-amber-300' : 'text-amber-900'
                }`}>
                  Después de iniciar sesión:
                </p>
                <p className={darkMode ? 'text-amber-200/80' : 'text-amber-800'}>
                  Serás redirigido a <strong>Apertura de Caja</strong> para contar la base inicial 
                  y comenzar a trabajar.
                </p>
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setUsername('');
                setPassword('');
                setMostrarPassword(false);
              }}
              className="flex-1"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 mr-2" />
                  Iniciar Turno
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}