/**
 * ATAJO DE TECLADO PARA PANEL DE DESARROLLADOR
 * Presionar Ctrl+Shift+D para ir al Panel de Desarrollador
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export function useDeveloperShortcut() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ctrl+Shift+D o Cmd+Shift+D
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        console.log('🔧 Atajo de desarrollador activado - Redirigiendo...');
        navigate('/developer', { replace: true });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [navigate]);
}
