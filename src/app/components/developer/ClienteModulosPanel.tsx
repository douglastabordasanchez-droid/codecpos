/**
 * CODEC POS v2.0 - Panel de Módulos por Cliente
 * Permite al desarrollador activar/desactivar módulos para cada cliente individual.
 * Los cambios son independientes: un cliente BÁSICO puede tener módulos premium activados.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Crown, Zap, ChevronDown, RefreshCw, CheckCircle2, XCircle,
  Layers, Shield, ToggleLeft, ToggleRight, Save, Star, Lock, Unlock,
  Users, Info, Smartphone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { MODULOS_CATALOGO, ModuloInfo, ModuloPOS } from '../../lib/permissions';
import { obtenerModulosClienteAdmin, actualizarModulosClienteAdmin, obtenerMenuInferiorClienteAdmin, actualizarMenuInferiorClienteAdmin } from '../../lib/supabase/clientesAdminService';
import { MENU_INFERIOR_CATALOGO, MENU_INFERIOR_IDS, MENU_INFERIOR_DEFAULT, type MenuInferiorItemId, type MenuInferiorConfig } from '../../lib/menuInferiorCatalogo';

interface Cliente {
  id: string;
  nombreNegocio: string;
  plan: 'BASICO' | 'PREMIUM';
  estado: 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA';
  contacto: string;
}

interface ClienteModulosPanelProps {
  cliente: Cliente;
  onClose: () => void;
}

const CATEGORIAS_INFO: Record<string, { nombre: string; icono: string }> = {
  ventas:        { nombre: 'Ventas',                  icono: '💰' },
  inventario:    { nombre: 'Inventario',              icono: '📦' },
  clientes:      { nombre: 'Clientes',                icono: '👥' },
  gestion:       { nombre: 'Gestión',                 icono: '🏢' },
  reportes:      { nombre: 'Reportes y Dashboard',    icono: '📊' },
  configuracion: { nombre: 'Configuración',           icono: '⚙️' },
  premium:       { nombre: 'Premium / Integraciones', icono: '👑' },
  desarrollador: { nombre: 'Desarrollador',           icono: '🛡️' },
};

export function ClienteModulosPanel({ cliente, onClose }: ClienteModulosPanelProps) {
  const { darkMode } = usePOS();

  const [modulosActivos, setModulosActivos] = useState<Set<ModuloPOS>>(new Set());
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>('ventas');
  const [haycambios, setHayCambios] = useState(false);

  // Módulos sin categoría desarrollador (el cliente no debe ver eso)
  const modulosVisibles = MODULOS_CATALOGO.filter(m => m.categoria !== 'desarrollador');

  // Agrupar por categoría
  const modulosPorCategoria = modulosVisibles.reduce((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = [];
    acc[m.categoria].push(m);
    return acc;
  }, {} as Record<string, ModuloInfo[]>);

  const [cargando, setCargando] = useState(true);

  // 🧭 Menú inferior de la PWA — solo el staff edita esto (ver
  // menuInferiorCatalogo.ts). Las opciones disponibles en cada dropdown se
  // filtran en vivo contra `modulosActivos` de arriba: si el admin apaga un
  // módulo que estaba asignado a un slot, ese slot cae al default al guardar.
  const [menuInferior, setMenuInferiorState] = useState<MenuInferiorConfig>(MENU_INFERIOR_DEFAULT);

  useEffect(() => {
    setCargando(true);
    Promise.all([
      obtenerModulosClienteAdmin(cliente.id),
      obtenerMenuInferiorClienteAdmin(cliente.id),
    ])
      .then(([modulosGuardados, menuGuardado]) => {
        if (modulosGuardados) {
          setModulosActivos(new Set(modulosGuardados as ModuloPOS[]));
        } else {
          const porDefecto = modulosVisibles.filter((m) =>
            cliente.plan === 'PREMIUM' ? m.habilitadoPorDefecto : m.planRequerido === 'basico' && m.habilitadoPorDefecto
          );
          setModulosActivos(new Set(porDefecto.map((m) => m.id)));
        }
        setMenuInferiorState(menuGuardado);
      })
      .catch((error) => toast.error('No se pudieron cargar los módulos', { description: error.message }))
      .finally(() => setCargando(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id, cliente.plan]);

  const opcionesMenuInferior = MENU_INFERIOR_IDS.filter((id) => {
    const item = MENU_INFERIOR_CATALOGO[id];
    return !item.moduloRequerido || modulosActivos.has(item.moduloRequerido);
  });

  const actualizarSlotMenu = (lado: 'izquierda' | 'derecha', indice: 0 | 1, valor: MenuInferiorItemId) => {
    const nuevo: MenuInferiorConfig = {
      izquierda: [...menuInferior.izquierda] as MenuInferiorItemId[],
      derecha: [...menuInferior.derecha] as MenuInferiorItemId[],
    };
    nuevo[lado][indice] = valor;
    setMenuInferiorState(nuevo);
    actualizarMenuInferiorClienteAdmin(cliente.id, nuevo).catch((error) =>
      toast.error('No se pudo guardar el menú inferior', { description: error.message })
    );
  };

  const guardarSet = (set: Set<ModuloPOS>) => {
    actualizarModulosClienteAdmin(cliente.id, Array.from(set)).catch((error) =>
      toast.error('No se pudo guardar', { description: error.message })
    );
    setHayCambios(false);
  };

  const handleToggle = (modulo: ModuloPOS) => {
    const nuevo = new Set(modulosActivos);
    if (nuevo.has(modulo)) {
      nuevo.delete(modulo);
    } else {
      nuevo.add(modulo);
    }
    setModulosActivos(nuevo);
    // Auto-guardar inmediatamente para sincronización en tiempo real con la barra lateral del cliente
    guardarSet(nuevo);
  };

  const handleGuardar = () => {
    guardarSet(modulosActivos);
    toast.success(`✅ Módulos de ${cliente.nombreNegocio} actualizados`, {
      description: `${modulosActivos.size} módulos activos guardados correctamente`,
    });
  };

  const handleActivarTodos = () => {
    const todos = new Set(modulosVisibles.map(m => m.id) as ModuloPOS[]);
    setModulosActivos(todos);
    guardarSet(todos);
    toast.success('Todos los módulos activados y guardados');
  };

  const handleResetearPlan = () => {
    const modulosPlan = modulosVisibles.filter(m => {
      if (cliente.plan === 'PREMIUM') return m.habilitadoPorDefecto;
      return m.planRequerido === 'basico' && m.habilitadoPorDefecto;
    });
    const planSet = new Set(modulosPlan.map(m => m.id) as ModuloPOS[]);
    setModulosActivos(planSet);
    guardarSet(planSet);
    toast.info(`Módulos restaurados al plan ${cliente.plan}`);
  };

  // Contar cuántos módulos extra (fuera del plan) tiene activos
  const modulosExtra = Array.from(modulosActivos).filter(id => {
    const info = MODULOS_CATALOGO.find(m => m.id === id);
    if (!info) return false;
    return cliente.plan === 'BASICO' && info.planRequerido === 'premium';
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg shadow-xl overflow-hidden ${
          darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'
        }`}
      >
        {/* ── HEADER ── */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700 bg-slate-800/80' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              cliente.plan === 'PREMIUM'
                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                : 'bg-gradient-to-br from-blue-500 to-cyan-600'
            }`}>
              {cliente.plan === 'PREMIUM' ? (
                <Crown className="w-7 h-7 text-white" />
              ) : (
                <Zap className="w-7 h-7 text-white" />
              )}
            </div>
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {cliente.nombreNegocio}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  cliente.plan === 'PREMIUM'
                    ? 'bg-amber-500/20 text-amber-600'
                    : 'bg-blue-500/20 text-blue-600'
                }`}>
                  {cliente.plan === 'PREMIUM' ? '👑 Premium' : '⚡ Básico'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  cliente.estado === 'ACTIVA'
                    ? 'bg-emerald-500/20 text-emerald-600'
                    : 'bg-red-500/20 text-red-600'
                }`}>
                  {cliente.estado}
                </span>
                {modulosExtra.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-600 font-semibold">
                    ✨ {modulosExtra.length} extras activados
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BARRA DE ACCIONES ── */}
        <div className={`flex items-center gap-2 px-6 py-3 border-b ${
          darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-100 bg-gray-50/80'
        }`}>
          <div className="flex items-center gap-1.5 flex-1">
            <Layers className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {modulosActivos.size} de {modulosVisibles.length} módulos activos
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetearPlan}
            className={darkMode ? 'border-slate-600 hover:bg-slate-700 text-gray-300' : ''}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Restaurar plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleActivarTodos}
            className={darkMode ? 'border-slate-600 hover:bg-slate-700 text-gray-300' : ''}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Activar todos
          </Button>
          {haycambios && (
            <Button
              size="sm"
              onClick={handleGuardar}
              className="bg-indigo-600 hover:bg-indigo-700 font-semibold"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Guardar cambios
            </Button>
          )}
        </div>

        {/* ── NOTA INFORMATIVA ── */}
        {cliente.plan === 'BASICO' && (
          <div className={`mx-6 mt-4 p-3 rounded-md flex items-start gap-2.5 ${
            darkMode ? 'bg-amber-900/20 border border-amber-700/30' : 'bg-amber-50 border border-amber-200'
          }`}>
            <Star className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
              <span className="font-bold">Cliente en plan Básico.</span> Puedes activar módulos Premium de forma individual como cortesía o upgrade puntual. Los módulos marcados con 👑 son exclusivos de Premium.
            </p>
          </div>
        )}

        {/* ── MENÚ INFERIOR DE LA PWA ── */}
        <div className="px-6 pt-4">
          <Card className={darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}>
            <CardHeader className="py-4 px-5">
              <div className="flex items-center gap-3">
                <Smartphone className={`w-5 h-5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                <div>
                  <CardTitle className={`text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>Menú inferior de la app móvil</CardTitle>
                  <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                    Inicio y Vender son fijos. Elige qué va en los otros 4 botones — solo aparecen módulos que este cliente tiene activos.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-5 pb-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Izquierda</p>
                  {[0, 1].map((i) => (
                    <select
                      key={`izq-${i}`}
                      value={menuInferior.izquierda[i] || MENU_INFERIOR_DEFAULT.izquierda[i]}
                      onChange={(e) => actualizarSlotMenu('izquierda', i as 0 | 1, e.target.value as MenuInferiorItemId)}
                      className={`w-full h-10 rounded-lg border px-2 text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      {opcionesMenuInferior.map((id) => (
                        <option key={id} value={id}>{MENU_INFERIOR_CATALOGO[id].label}</option>
                      ))}
                    </select>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Derecha</p>
                  {[0, 1].map((i) => (
                    <select
                      key={`der-${i}`}
                      value={menuInferior.derecha[i] || MENU_INFERIOR_DEFAULT.derecha[i]}
                      onChange={(e) => actualizarSlotMenu('derecha', i as 0 | 1, e.target.value as MenuInferiorItemId)}
                      className={`w-full h-10 rounded-lg border px-2 text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      {opcionesMenuInferior.map((id) => (
                        <option key={id} value={id}>{MENU_INFERIOR_CATALOGO[id].label}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
              <p className={`text-xs mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Vista previa: {opcionesMenuInferior.length > 0 ? (
                  <span className="font-mono">
                    {(menuInferior.izquierda[0] && MENU_INFERIOR_CATALOGO[menuInferior.izquierda[0]]?.label) || '—'} · {(menuInferior.izquierda[1] && MENU_INFERIOR_CATALOGO[menuInferior.izquierda[1]]?.label) || '—'} · (Vender) · {(menuInferior.derecha[0] && MENU_INFERIOR_CATALOGO[menuInferior.derecha[0]]?.label) || '—'} · {(menuInferior.derecha[1] && MENU_INFERIOR_CATALOGO[menuInferior.derecha[1]]?.label) || '—'}
                  </span>
                ) : null}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── LISTA DE MÓDULOS ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {cargando && (
            <div className={`flex items-center justify-center gap-2 py-12 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Cargando módulos...
            </div>
          )}
          {!cargando && Object.entries(modulosPorCategoria).map(([categoria, modulos]) => {
            const info = CATEGORIAS_INFO[categoria];
            const isExpanded = categoriaExpandida === categoria;
            const activosEnCat = modulos.filter(m => modulosActivos.has(m.id)).length;

            return (
              <Card key={categoria} className={`shadow-sm ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'
              }`}>
                <CardHeader
                  className="cursor-pointer py-4 px-5"
                  onClick={() => setCategoriaExpandida(isExpanded ? null : categoria)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{info?.icono}</span>
                      <div>
                        <CardTitle className={`text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {info?.nombre}
                        </CardTitle>
                        <CardDescription className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                          {activosEnCat} de {modulos.length} activos
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {modulos.slice(0, 5).map(m => (
                          <div
                            key={m.id}
                            className={`w-2 h-2 rounded-full ${
                              modulosActivos.has(m.id)
                                ? 'bg-emerald-500'
                                : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      </motion.div>
                    </div>
                  </div>
                </CardHeader>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <CardContent className="pt-0 px-5 pb-4">
                        <div className="space-y-2">
                          {modulos.map((modulo) => {
                            const isActivo = modulosActivos.has(modulo.id);
                            const esPremiumEnBasico = cliente.plan === 'BASICO' && modulo.planRequerido === 'premium';

                            return (
                              <div
                                key={modulo.id}
                                className={`flex items-center justify-between p-3 rounded-md border transition-all ${
                                  isActivo
                                    ? darkMode
                                      ? 'bg-emerald-700/45 border-emerald-400/70 text-white'
                                      : 'bg-emerald-50 border-emerald-400 text-slate-900'
                                    : darkMode
                                    ? 'bg-slate-700/30 border-slate-600/50'
                                    : 'bg-gray-50 border-gray-200'
                                }`}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="text-xl flex-shrink-0">{modulo.icono}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                        {modulo.nombre}
                                      </h4>
                                      {esPremiumEnBasico && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-semibold">
                                          👑 Premium
                                        </span>
                                      )}
                                      {esPremiumEnBasico && isActivo && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 font-semibold">
                                          ✨ Extra
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                      {modulo.descripcion}
                                    </p>
                                  </div>
                                </div>

                                {/* Toggle */}
                                <button
                                  onClick={() => handleToggle(modulo.id)}
                                  className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ml-3 ${
                                    isActivo
                                      ? esPremiumEnBasico
                                        ? 'bg-purple-600'
                                          : 'bg-emerald-600'
                                      : darkMode ? 'bg-slate-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                                      isActivo ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
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

        {/* ── FOOTER ── */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-gray-200 bg-gray-50'
        }`}>
          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            💡 Los cambios solo afectan a <strong>{cliente.nombreNegocio}</strong>. Otros clientes no se ven afectados.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className={darkMode ? 'border-slate-600 text-gray-300' : ''}>
              Cerrar
            </Button>
            <Button
              onClick={handleGuardar}
              className={`font-semibold ${
                haycambios
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : darkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-200 text-gray-500'
              }`}
              disabled={!haycambios}
            >
              <Save className="w-4 h-4 mr-2" />
              {haycambios ? 'Guardar cambios' : 'Sin cambios'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}