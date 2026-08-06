/**
 * CODEC POS v2.0 - Panel de Control de Módulos
 * Permite al desarrollador activar/desactivar funcionalidades del sistema
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { 
  Settings, 
  ToggleLeft, 
  ToggleRight,
  CheckCircle2, 
  XCircle,
  Layers,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Edit3,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { usePOS } from '../../contexts/POSContext';
import {
  MODULOS_CATALOGO,
  ModuloInfo,
  ModuloPOS,
  obtenerModulosGlobales,
  toggleModuloGlobal,
  guardarModulosGlobales,
  obtenerEstadisticasModulos,
  obtenerModulosPersonalizados,
  actualizarModuloPersonalizado,
  resetearModuloPersonalizado,
  ConfiguracionModuloPersonalizado,
} from '../../lib/permissions';

export default function ModulosControlPanel() {
  const { darkMode } = usePOS();
  const [modulosActivos, setModulosActivos] = useState(() => {
    const config = obtenerModulosGlobales();
    return new Set(config.modulosActivos);
  });
  
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>('basico');
  
  const stats = obtenerEstadisticasModulos();
  const [modulosPersonalizados, setModulosPersonalizados] = useState<ConfiguracionModuloPersonalizado[]>(() => obtenerModulosPersonalizados());
  const [moduloEnEdicion, setModuloEnEdicion] = useState<ConfiguracionModuloPersonalizado | null>(null);
  const [formEdicion, setFormEdicion] = useState({
    id: null as ModuloPOS | null,
    nombre: '',
    icono: '',
    color: '',
  });
  
  // Agrupar módulos por categoría
  const modulosPorCategoria = MODULOS_CATALOGO.reduce((acc, modulo) => {
    if (!acc[modulo.categoria]) {
      acc[modulo.categoria] = [];
    }
    acc[modulo.categoria].push(modulo);
    return acc;
  }, {} as Record<string, ModuloInfo[]>);
  
  const categoriasInfo = {
    ventas:         { nombre: 'Ventas',                 icono: '💰', color: 'emerald' },
    inventario:     { nombre: 'Inventario',             icono: '📦', color: 'blue' },
    clientes:       { nombre: 'Clientes',               icono: '👥', color: 'cyan' },
    gestion:        { nombre: 'Gestión',                icono: '🏢', color: 'purple' },
    reportes:       { nombre: 'Reportes y Dashboard',   icono: '📊', color: 'amber' },
    configuracion:  { nombre: 'Configuración',          icono: '⚙️', color: 'green' },
    premium:        { nombre: 'Premium / Integraciones',icono: '👑', color: 'orange' },
    desarrollador:  { nombre: 'Desarrollador',          icono: '🛡️', color: 'red' },
  };
  
  const handleToggleModulo = (modulo: ModuloPOS) => {
    toggleModuloGlobal(modulo);
    
    // Actualizar estado local
    setModulosActivos(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(modulo)) {
        nuevo.delete(modulo);
        toast.success(`Módulo desactivado`, {
          description: `"${MODULOS_CATALOGO.find(m => m.id === modulo)?.nombre}" ya no estará disponible`
        });
      } else {
        nuevo.add(modulo);
        toast.success(`Módulo activado`, {
          description: `"${MODULOS_CATALOGO.find(m => m.id === modulo)?.nombre}" ahora está disponible`
        });
      }
      return nuevo;
    });
  };

  const abrirEditorModulo = (modulo: ModuloInfo) => {
    const personalizado = modulosPersonalizados.find(item => item.id === modulo.id);
    setModuloEnEdicion({
      id: modulo.id,
      nombre: personalizado?.nombre ?? modulo.nombre,
      icono: personalizado?.icono ?? modulo.icono,
      color: personalizado?.color ?? '',
    });
    setFormEdicion({
      id: modulo.id,
      nombre: personalizado?.nombre ?? modulo.nombre,
      icono: personalizado?.icono ?? modulo.icono,
      color: personalizado?.color ?? '',
    });
  };

  const cerrarEditor = () => {
    setModuloEnEdicion(null);
    setFormEdicion({ id: null, nombre: '', icono: '', color: '' });
  };

  const guardarEdicionModulo = () => {
    if (!formEdicion.id) {
      toast.error('Selecciona un módulo para editar');
      return;
    }

    actualizarModuloPersonalizado({
      id: formEdicion.id,
      nombre: formEdicion.nombre.trim() || MODULOS_CATALOGO.find(m => m.id === formEdicion.id)?.nombre,
      icono: formEdicion.icono.trim(),
      color: formEdicion.color.trim(),
    });

    const actualizado = obtenerModulosPersonalizados();
    setModulosPersonalizados(actualizado);
    toast.success('Configuración del módulo guardada', {
      description: `Se han actualizado los ajustes de "${formEdicion.nombre || MODULOS_CATALOGO.find(m => m.id === formEdicion.id)?.nombre}"`
    });
    cerrarEditor();
  };

  const resetearEdicionModulo = (moduloId: ModuloPOS) => {
    resetearModuloPersonalizado(moduloId);
    const actualizado = obtenerModulosPersonalizados();
    setModulosPersonalizados(actualizado);
    if (moduloEnEdicion?.id === moduloId) {
      cerrarEditor();
    }
    toast.success('Personalización restablecida', {
      description: `El módulo ha vuelto a su nombre, color e ícono por defecto`
    });
  };
  
  const handleInputChange = (field: 'nombre' | 'icono' | 'color', value: string) => {
    setFormEdicion(prev => ({ ...prev, [field]: value }));
  };

  const handleSavePersonalizacion = () => {
    guardarEdicionModulo();
  };

  const handleCancelPersonalizacion = () => {
    cerrarEditor();
  };

  const getPersonalizacion = (moduloId: ModuloPOS) => modulosPersonalizados.find(item => item.id === moduloId);

  const isModuloPersonalizado = (moduloId: ModuloPOS) => Boolean(getPersonalizacion(moduloId));

  const handleActivarTodos = () => {
    const todosModulos = MODULOS_CATALOGO.map(m => m.id);
    guardarModulosGlobales({
      modulosActivos: todosModulos,
      ultimaActualizacion: new Date().toISOString(),
    });
    setModulosActivos(new Set(todosModulos));
    toast.success('Todos los módulos activados', {
      description: 'Todas las funcionalidades están ahora disponibles'
    });
  };
  
  const handleDesactivarTodos = () => {
    guardarModulosGlobales({
      modulosActivos: [],
      ultimaActualizacion: new Date().toISOString(),
    });
    setModulosActivos(new Set());
    toast.warning('Todos los módulos desactivados', {
      description: 'El sistema está en modo mínimo'
    });
  };
  
  const handleRestaurarDefecto = () => {
    const modulosPorDefecto = MODULOS_CATALOGO
      .filter(m => m.habilitadoPorDefecto)
      .map(m => m.id);
    
    guardarModulosGlobales({
      modulosActivos: modulosPorDefecto,
      ultimaActualizacion: new Date().toISOString(),
    });
    setModulosActivos(new Set(modulosPorDefecto));
    toast.info('Configuración restaurada', {
      description: 'Se han restaurado los módulos por defecto'
    });
  };
  
  return (
    <div className={`space-y-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Control de Módulos
            </h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Activa o desactiva funcionalidades del sistema
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleRestaurarDefecto}
            variant="outline"
            className={darkMode ? 'border-slate-600 hover:bg-slate-700' : ''}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Restaurar
          </Button>
          <Button
            onClick={handleDesactivarTodos}
            variant="outline"
            className={`border-red-600 text-red-600 hover:bg-red-50 ${darkMode ? 'hover:bg-red-900/20' : ''}`}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Desactivar Todos
          </Button>
          <Button
            onClick={handleActivarTodos}
            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Activar Todos
          </Button>
        </div>
      </div>

      {moduloEnEdicion && (
        <Card className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                  Editar módulo
                </CardTitle>
                <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                  Personaliza el nombre, color y el ícono que se muestra en el sidebar.
                </CardDescription>
              </div>
              <div className="text-right">
                <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {MODULOS_CATALOGO.find(m => m.id === moduloEnEdicion.id)?.nombre}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nombre</label>
                <Input
                  value={formEdicion.nombre}
                  onChange={(event) => handleInputChange('nombre', event.target.value)}
                  placeholder="Nombre visible en el sidebar"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Color</label>
                <Input
                  value={formEdicion.color}
                  onChange={(event) => handleInputChange('color', event.target.value)}
                  placeholder="Ej: emerald, blue, #ff6600"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ícono</label>
                <Input
                  value={formEdicion.icono}
                  onChange={(event) => handleInputChange('icono', event.target.value)}
                  placeholder="Emoji o símbolo (ej: 🛒)"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={handleCancelPersonalizacion}>
                Cancelar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resetearEdicionModulo(moduloEnEdicion.id!)}>
                <Trash2 className="w-4 h-4" />
                Restablecer
              </Button>
              <Button size="sm" onClick={handleSavePersonalizacion}>
                <Save className="w-4 h-4" />
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Total Módulos
                </p>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {stats.total}
                </p>
              </div>
              <Layers className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Activos
                </p>
                <p className={`text-3xl font-bold text-emerald-500`}>
                  {stats.activos}
                </p>
              </div>
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Inactivos
                </p>
                <p className={`text-3xl font-bold text-red-500`}>
                  {stats.inactivos}
                </p>
              </div>
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={darkMode ? 'bg-slate-800 border-slate-700' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Progreso
                </p>
                <p className={`text-3xl font-bold text-purple-500`}>
                  {Math.round((stats.activos / stats.total) * 100)}%
                </p>
              </div>
              <Shield className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Lista de Módulos por Categoría */}
      <div className="space-y-4">
        {Object.entries(modulosPorCategoria).map(([categoria, modulos]) => {
          const info = categoriasInfo[categoria as keyof typeof categoriasInfo];
          const isExpanded = categoriaExpandida === categoria;
          const modulosActivosEnCategoria = modulos.filter(m => modulosActivos.has(m.id)).length;
          
          return (
            <Card key={categoria} className={`shadow-xl ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'
            }`}>
              <CardHeader 
                className="cursor-pointer hover:bg-opacity-80 transition-all"
                onClick={() => setCategoriaExpandida(isExpanded ? null : categoria)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{info.icono}</span>
                    <div>
                      <CardTitle className={darkMode ? 'text-white' : 'text-gray-900'}>
                        {info.nombre}
                      </CardTitle>
                      <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                        {modulosActivosEnCategoria} de {modulos.length} activos
                      </CardDescription>
                    </div>
                  </div>
                  
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </motion.div>
                </div>
              </CardHeader>
              
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {modulos.map((modulo) => {
                          const isActivo = modulosActivos.has(modulo.id);
                          
                          return (
                            <div
                              key={modulo.id}
                              className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                                isActivo
                                  ? darkMode
                                    ? 'bg-emerald-900/20 border-emerald-700/50'
                                    : 'bg-emerald-50 border-emerald-300'
                                  : darkMode
                                  ? 'bg-slate-700/30 border-slate-600'
                                  : 'bg-gray-50 border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <span className="text-2xl">{modulo.icono}</span>
                                <div className="flex-1">
                                  <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                    {modulo.nombre}
                                  </h4>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {modulo.descripcion}
                                  </p>
                                  <div className="flex gap-2 mt-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      modulo.planRequerido === 'premium'
                                        ? 'bg-amber-500/20 text-amber-600'
                                        : 'bg-blue-500/20 text-blue-600'
                                    }`}>
                                      {modulo.planRequerido === 'premium' ? '👑 Premium' : '⚡ Básico'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              <button
                                onClick={() => handleToggleModulo(modulo.id)}
                                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                                  isActivo 
                                    ? 'bg-emerald-600' 
                                    : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    isActivo ? 'translate-x-6' : 'translate-x-0'
                                  }`}
                                />
                              </button>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => abrirEditorModulo(modulo)}>
                                  <Edit3 className="w-4 h-4" />
                                  Editar
                                </Button>
                                {isModuloPersonalizado(modulo.id) && (
                                  <Button size="sm" variant="ghost" onClick={() => resetearEdicionModulo(modulo.id)}>
                                    <Trash2 className="w-4 h-4" />
                                    Restablecer
                                  </Button>
                                )}
                                {isModuloPersonalizado(modulo.id) && (
                                  <span className="text-xs font-semibold text-amber-500">
                                    Personalizado
                                  </span>
                                )}
                              </div>
                            </div>
                        );
                        })}
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
      
      {/* Footer con información */}
      <Card className={`border-2 ${
        darkMode 
          ? 'bg-blue-900/20 border-blue-700/30' 
          : 'bg-blue-50 border-blue-200'
      }`}>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className={`font-semibold text-sm ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                ℹ️ Control Global de Funcionalidades
              </h4>
              <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                <li>• Los módulos desactivados aquí <span className="font-bold">no estarán disponibles para ningún usuario</span></li>
                <li>• Los módulos activados se pueden asignar individualmente a cada usuario en el área de Usuarios</li>
                <li>• Los cambios se aplican inmediatamente a nivel sistema</li>
                <li>• Recomendamos mantener activados solo los módulos que realmente necesitas</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}