/**
 * Componentes de Loading States
 * CODEC POS v2.0
 */

import { Skeleton } from '../ui/skeleton';

interface LoadingProps {
  darkMode?: boolean;
}

/**
 * Skeleton para lista de productos
 */
export function ProductListSkeleton({ darkMode = false }: LoadingProps) {
  return (
    <div className="space-y-3">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className={`p-4 rounded-xl border ${
            darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center gap-4">
            {/* Imagen */}
            <Skeleton className={`w-16 h-16 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            
            {/* Info */}
            <div className="flex-1 space-y-2">
              <Skeleton className={`h-5 w-3/4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
              <Skeleton className={`h-4 w-1/2 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            </div>
            
            {/* Precio */}
            <Skeleton className={`h-8 w-24 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para grid de productos
 */
export function ProductGridSkeleton({ darkMode = false }: LoadingProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className={`p-4 rounded-xl border ${
            darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-white'
          }`}
        >
          <Skeleton className={`w-full h-32 rounded-lg mb-3 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-4 w-full mb-2 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-4 w-2/3 mb-3 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-6 w-1/2 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para tabla de ventas
 */
export function VentasTableSkeleton({ darkMode = false }: LoadingProps) {
  return (
    <div className="space-y-2">
      {[...Array(10)].map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 p-3 rounded-lg ${
            darkMode ? 'bg-slate-800/50' : 'bg-gray-50'
          }`}
        >
          <Skeleton className={`w-16 h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`w-32 h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`flex-1 h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`w-24 h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`w-20 h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para cards de dashboard
 */
export function DashboardCardSkeleton({ darkMode = false }: LoadingProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`p-6 rounded-xl border ${
            darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <Skeleton className={`w-12 h-12 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
            <Skeleton className={`w-20 h-6 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          </div>
          <Skeleton className={`h-8 w-32 mb-2 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-4 w-24 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para formulario
 */
export function FormSkeleton({ darkMode = false, fields = 6 }: LoadingProps & { fields?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(fields)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={`h-4 w-32 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <Skeleton className={`h-10 w-full ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton genérico con mensaje
 */
export function LoadingSpinner({ 
  mensaje = 'Cargando...', 
  darkMode = false 
}: LoadingProps & { mensaje?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative">
        {/* Spinner animado */}
        <div className={`w-16 h-16 border-4 rounded-full animate-spin ${
          darkMode 
            ? 'border-slate-700 border-t-violet-500' 
            : 'border-gray-200 border-t-violet-600'
        }`} />
        
        {/* Pulso interno */}
        <div className={`absolute inset-0 w-16 h-16 border-4 rounded-full animate-ping opacity-20 ${
          darkMode ? 'border-violet-500' : 'border-violet-600'
        }`} />
      </div>
      
      <p className={`mt-4 text-sm font-medium ${
        darkMode ? 'text-gray-400' : 'text-gray-600'
      }`}>
        {mensaje}
      </p>
    </div>
  );
}

/**
 * Estado vacío (cuando no hay datos)
 */
export function EmptyState({ 
  icono: Icono,
  titulo = 'No hay datos',
  descripcion = 'Los datos aparecerán aquí cuando estén disponibles',
  accion,
  darkMode = false 
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo?: string;
  descripcion?: string;
  accion?: { label: string; onClick: () => void };
  darkMode?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
        darkMode ? 'bg-slate-800' : 'bg-gray-100'
      }`}>
        <Icono className={`w-10 h-10 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
      </div>
      
      <h3 className={`text-lg font-semibold mb-2 ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        {titulo}
      </h3>
      
      <p className={`text-sm text-center max-w-md mb-6 ${
        darkMode ? 'text-gray-400' : 'text-gray-600'
      }`}>
        {descripcion}
      </p>
      
      {accion && (
        <button
          onClick={accion.onClick}
          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg font-medium hover:from-violet-700 hover:to-purple-700 transition-all"
        >
          {accion.label}
        </button>
      )}
    </div>
  );
}
