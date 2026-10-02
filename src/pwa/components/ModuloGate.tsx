import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { ModuloPOS } from '../../app/lib/permissions';
import { useModulosActivos } from '../hooks/useModulosActivos';

interface Props {
  modulo: ModuloPOS;
  children: ReactNode;
  /** Módulo que se vende aparte: no se muestra nada hasta confirmar la licencia. */
  dePago?: boolean;
}

/** Bloquea el contenido de una página si el negocio no tiene ese módulo activo — protege deep-links directos, no solo la navegación inferior. */
export function ModuloGate({ modulo, children, dePago }: Props) {
  const { tieneModulo, tieneModuloDePago, cargando } = useModulosActivos();

  if (dePago) {
    if (tieneModuloDePago(modulo)) return <>{children}</>;
    if (cargando) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
  } else if (cargando || tieneModulo(modulo)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center pb-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-center mb-4 shadow-sm">
        <Lock className="w-6 h-6 text-amber-400" />
      </div>
      <h1 className="text-white font-bold text-lg mb-1">Módulo no disponible</h1>
      <p className="text-slate-400 text-sm max-w-xs">
        {dePago
          ? 'Este es un módulo adicional y tu negocio todavía no lo tiene contratado. Escríbenos para activarlo.'
          : 'Tu negocio no tiene esta función activada. Contacta al administrador si crees que debería estarlo.'}
      </p>
    </div>
  );
}
