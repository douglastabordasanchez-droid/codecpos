import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '../ui/button';
import { Check, AlertCircle, type LucideIcon } from 'lucide-react';
import {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors,
  UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star,
  Trophy, BookOpen,
} from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { useBusinessContext } from '../../contexts/BusinessContext';
import { TIPOS_NEGOCIO } from '../../../data/tipos-negocio';
import { toast } from 'sonner';

const ICON_MAP: Record<string, LucideIcon> = {
  Store, Shirt, Pill, Hammer, Pencil, ChefHat, Scissors,
  UtensilsCrossed, Wine, Laptop, Sparkles, PawPrint, Star,
  Trophy, BookOpen,
};

export function ConfiguracionTipoNegocio() {
  const { darkMode } = usePOS();
  const { tipoNegocio: tipoActual, nombreNegocio: nombreActual, setBusinessConfig } = useBusinessContext();

  const [tipoSeleccionado, setTipoSeleccionado] = useState(tipoActual);
  const [nombreNegocio, setNombreNegocio] = useState(nombreActual);
  const [cambiosPendientes, setCambiosPendientes] = useState(false);

  const tipos = Object.values(TIPOS_NEGOCIO);

  const handleSeleccion = (id: string) => {
    setTipoSeleccionado(id);
    setCambiosPendientes(true);
  };

  const handleGuardar = () => {
    if (!nombreNegocio.trim()) {
      toast.error('Por favor ingresa el nombre de tu negocio');
      return;
    }
    setBusinessConfig({ tipoNegocio: tipoSeleccionado, nombreNegocio: nombreNegocio.trim() });
    setCambiosPendientes(false);
    const tipo = TIPOS_NEGOCIO[tipoSeleccionado];
    toast.success('Configuración guardada', {
      description: tipo ? `Tipo de negocio: ${tipo.nombre}` : tipoSeleccionado,
    });
  };

  return (
    <div className={`p-6 rounded-2xl ${
      darkMode
        ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700'
        : 'bg-gradient-to-br from-white to-gray-50 border border-gray-200'
    } shadow-xl`}>
      <div className="mb-6">
        <h2 className={`text-2xl font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Tipo de Negocio
        </h2>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Adapta el inventario, el POS y los reportes a tu sector comercial
        </p>
      </div>

      {/* Nombre del negocio */}
      <div className="mb-6">
        <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Nombre del Negocio
        </label>
        <input
          type="text"
          value={nombreNegocio}
          onChange={(e) => { setNombreNegocio(e.target.value); setCambiosPendientes(true); }}
          placeholder="Ej: Mi Minimercado"
          className={`w-full px-4 py-3 rounded-xl border-2 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 ${
            darkMode
              ? 'bg-slate-900 border-slate-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          }`}
        />
      </div>

      {/* Grid de tipos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
        {tipos.map((tipo) => {
          const Icon = ICON_MAP[tipo.icono] ?? Store;
          const isSelected = tipoSeleccionado === tipo.id;

          return (
            <motion.button
              key={tipo.id}
              onClick={() => handleSeleccion(tipo.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-transparent shadow-xl shadow-blue-500/30'
                  : darkMode
                  ? 'bg-slate-800 border-slate-600 text-gray-300 hover:border-slate-500'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="bg-white rounded-full p-0.5">
                    <Check className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                </div>
              )}

              <div className="flex justify-center mb-3">
                <div className={`p-2.5 rounded-xl ${
                  isSelected
                    ? 'bg-white/20'
                    : darkMode ? 'bg-slate-700' : 'bg-gray-100'
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>

              <p className="font-bold text-xs leading-tight line-clamp-2">
                {tipo.nombre}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Atributos del tipo seleccionado */}
      {TIPOS_NEGOCIO[tipoSeleccionado] && (
        <div className={`p-4 rounded-xl mb-6 ${
          darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Campos especiales activados
          </p>
          <div className="flex flex-wrap gap-2">
            {TIPOS_NEGOCIO[tipoSeleccionado].atributosEspeciales.map((attr) => (
              <span
                key={attr}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  darkMode
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {attr}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Config actual */}
      <div className={`p-4 rounded-xl mb-6 ${
        darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-50 border border-gray-200'
      }`}>
        <h4 className={`font-bold text-sm mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Configuración Activa
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Nombre:</span>
            <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {nombreActual}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Tipo:</span>
            <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {TIPOS_NEGOCIO[tipoActual]?.nombre ?? tipoActual}
            </span>
          </div>
        </div>
      </div>

      {/* Cambios pendientes */}
      {cambiosPendientes && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3 rounded-xl mb-6 flex items-center gap-3 ${
            darkMode
              ? 'bg-yellow-900/20 border border-yellow-700/50'
              : 'bg-yellow-50 border border-yellow-200'
          }`}
        >
          <AlertCircle className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
          <p className={`text-sm font-medium ${darkMode ? 'text-yellow-200' : 'text-yellow-800'}`}>
            Cambios sin guardar — se aplicarán al guardar
          </p>
        </motion.div>
      )}

      <Button
        onClick={handleGuardar}
        disabled={!cambiosPendientes}
        className={`w-full py-3 rounded-xl font-bold text-base ${
          cambiosPendientes
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-xl'
            : darkMode
            ? 'bg-slate-700 text-gray-500 cursor-not-allowed'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {cambiosPendientes ? 'Guardar Configuración' : 'Configuración Guardada'}
      </Button>
    </div>
  );
}
