/**
 * CODEC POS v2.0 - Modal de Permisos por Usuario
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { X, Check, Shield, Search, User2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  MODULOS_CATALOGO,
  MODULOS_CLIENTE_OFICIALES,
  ModuloInfo,
  ModuloPOS,
  obtenerPermisosUsuario,
  guardarPermisosUsuario,
  guardarPermisosUsuarioPersistente,
  togglePermisoUsuario,
  esModuloActivoGlobal,
  asignarPermisosCompletos,
} from '../../lib/permissions';

interface PermisosUsuarioModalProps {
  userId: string;
  userName: string;
  userRole: string;
  onClose: () => void;
}

export default function PermisosUsuarioModal({ userId, userName, userRole, onClose }: PermisosUsuarioModalProps) {
  const { darkMode: dm } = usePOS();
  const { usuarioActual, refrescarPermisosUsuario } = useAuth();
  const [permisos, setPermisos] = useState(() => obtenerPermisosUsuario(userId));
  const [searchTerm, setSearchTerm] = useState('');
  const esAdmin = ['admin', 'administrador', 'super_usuario', 'super usuario']
    .includes((usuarioActual?.rol || '').toLowerCase().trim());

  const modulosCliente = MODULOS_CATALOGO.filter(m => MODULOS_CLIENTE_OFICIALES.includes(m.id));
  const modulosFiltrados = modulosCliente.filter(m =>
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const modulosPorCategoria = modulosFiltrados.reduce((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = [];
    acc[m.categoria].push(m);
    return acc;
  }, {} as Record<string, ModuloInfo[]>);

  const categoriasInfo: Record<string, string> = {
    ventas: 'Operaciones Principales',
    inventario: 'Inventario y Control',
    clientes: 'Clientes y Fidelización',
    gestion: 'Gestión Interna',
    reportes: 'Análisis y Reportes',
    configuracion: 'Configuración',
    premium: 'Módulos Avanzados',
  };

  // 🛡️ La sincronización LAN ahora es automática: guardarPermisosUsuario()
  // (llamada por togglePermisoUsuario/asignarPermisosCompletos/resetear.../
  // guardarPermisosUsuarioPersistente, todas usadas abajo) dispara ella misma
  // el evento 'codecpos:usuario-cambio' que LanContext reenvía por red — ver
  // permissions.ts. Ya no hace falta que cada pantalla lo recuerde por su cuenta.

  const handleToggle = (modulo: ModuloPOS) => {
    if (!esAdmin && !esModuloActivoGlobal(modulo)) {
      toast.error('Módulo desactivado globalmente');
      return;
    }
    togglePermisoUsuario(userId, modulo);
    const actualizados = obtenerPermisosUsuario(userId);
    setPermisos(actualizados);
    const tenía = permisos.modulosHabilitados.includes(modulo);
    toast.success(tenía ? 'Permiso revocado' : 'Permiso otorgado', {
      description: MODULOS_CATALOGO.find(m => m.id === modulo)?.nombre,
    });
  };

  const handleActivarTodos = () => {
    asignarPermisosCompletos(userId);
    const actualizados = obtenerPermisosUsuario(userId);
    setPermisos(actualizados);
    toast.success('Todos los permisos otorgados');
  };

  const handleQuitarTodos = () => {
    const sinPermisos = { userId, modulosHabilitados: [] as ModuloPOS[] };
    guardarPermisosUsuario(sinPermisos);
    setPermisos(sinPermisos);
    toast.info('Todos los permisos removidos');
  };

  const handleGuardar = async () => {
    await guardarPermisosUsuarioPersistente({ userId, modulosHabilitados: [...permisos.modulosHabilitados] });
    refrescarPermisosUsuario(userId);
    toast.success('Permisos actualizados y aplicados en tiempo real');
    onClose();
  };

  const total = modulosCliente.length;
  const otorgados = permisos.modulosHabilitados.length;
  const pct = total ? Math.round((otorgados / total) * 100) : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-2xl flex flex-col max-h-[88vh]"
        >
          <Card className={`flex flex-col overflow-hidden rounded-2xl shadow-2xl border ${
            dm ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}>

            {/* ── Header ── */}
            <div className={`shrink-0 px-5 pt-5 pb-4 border-b ${dm ? 'border-slate-700/60' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    dm ? 'bg-indigo-500/15 border border-indigo-500/25' : 'bg-indigo-50 border border-indigo-100'
                  }`}>
                    <Shield className="w-4.5 h-4.5 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <h2 className={`text-sm font-bold leading-none ${dm ? 'text-white' : 'text-slate-900'}`}>
                      Gestionar Permisos
                    </h2>
                    <p className={`mt-0.5 text-xs flex items-center gap-1.5 truncate ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                      <User2 className="w-3 h-3 shrink-0" />
                      <span className="font-medium truncate">{userName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="capitalize">{userRole}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGuardar}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    dm ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress */}
              <div className="mt-3 flex items-center gap-3">
                <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${dm ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                  {otorgados}/{total}
                </span>
              </div>

              {/* Quick actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleActivarTodos}
                  className={`inline-flex items-center gap-1 px-3 h-7 rounded-lg text-xs font-semibold transition-colors ${
                    dm
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25'
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <Check className="w-3 h-3" /> Activar todo
                </button>
                <button
                  onClick={handleQuitarTodos}
                  className={`inline-flex items-center gap-1 px-3 h-7 rounded-lg text-xs font-semibold transition-colors ${
                    dm
                      ? 'bg-slate-700/60 text-slate-300 border border-slate-600 hover:bg-slate-700'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <X className="w-3 h-3" /> Quitar todo
                </button>
                {esAdmin && (
                  <span className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-xs font-medium ${
                    dm ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
            </div>

            {/* ── Search ── */}
            <div className={`shrink-0 px-4 py-2.5 border-b ${dm ? 'border-slate-700/60 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${dm ? 'text-slate-400' : 'text-slate-400'}`} />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar módulo o permiso..."
                  className={`pl-9 h-8 text-xs rounded-lg ${
                    dm ? 'bg-slate-800 border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 placeholder:text-slate-400'
                  }`}
                />
              </div>
            </div>

            {/* ── Module list ── */}
            <CardContent className={`flex-1 overflow-y-auto p-4 space-y-3 [scrollbar-width:thin] ${dm ? 'bg-slate-900/50' : 'bg-slate-50/50'}`}>
              {Object.entries(modulosPorCategoria).map(([categoria, modulos]) => {
                const catNombre = categoriasInfo[categoria] || categoria;
                const activos = modulos.filter(m => permisos.modulosHabilitados.includes(m.id)).length;
                return (
                  <div key={categoria} className={`rounded-xl border overflow-hidden ${dm ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
                    {/* Category header */}
                    <div className={`px-3 py-2 flex items-center justify-between border-b ${dm ? 'border-slate-700 bg-slate-800/80' : 'border-slate-100 bg-slate-50'}`}>
                      <span className={`text-xs font-bold uppercase tracking-wide ${dm ? 'text-slate-300' : 'text-slate-600'}`}>
                        {catNombre}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        activos === modulos.length
                          ? dm ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                          : dm ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {activos}/{modulos.length}
                      </span>
                    </div>

                    {/* Module items */}
                    <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {modulos.map(modulo => {
                        const activo = permisos.modulosHabilitados.includes(modulo.id);
                        const globalOff = !esModuloActivoGlobal(modulo.id) && !esAdmin;
                        return (
                          <div
                            key={modulo.id}
                            onClick={() => !globalOff && handleToggle(modulo.id)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                              globalOff ? 'opacity-40 cursor-not-allowed' : ''
                            } ${
                              activo
                                ? dm ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                                : dm ? 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/60' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {/* Icon */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${
                              activo
                                ? dm ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                                : dm ? 'bg-slate-600/50 text-slate-300' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {modulo.icono}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold leading-none truncate ${dm ? 'text-white' : 'text-slate-800'}`}>
                                {modulo.nombre}
                              </p>
                              <p className={`text-[10px] mt-0.5 line-clamp-1 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                                {modulo.descripcion}
                              </p>
                            </div>

                            {/* Toggle */}
                            <div className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${
                              activo ? 'bg-emerald-500' : dm ? 'bg-slate-600' : 'bg-slate-300'
                            }`}>
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all flex items-center justify-center ${
                                activo ? 'right-0.5' : 'left-0.5'
                              }`}>
                                {activo
                                  ? <Check className="w-2.5 h-2.5 text-emerald-500" />
                                  : <X className="w-2.5 h-2.5 text-slate-400" />
                                }
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>

            {/* ── Footer ── */}
            <div className={`shrink-0 px-4 py-3 border-t flex gap-2 ${dm ? 'border-slate-700 bg-slate-900' : 'border-slate-100 bg-white'}`}>
              <Button
                onClick={onClose}
                variant="outline"
                className={`flex-1 h-9 rounded-xl text-xs font-semibold ${dm ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleGuardar}
                className="flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Guardar Cambios
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
