/**
 * 🎁 PÁGINA DE PROMOCIONES Y DESCUENTOS
 * Dashboard profesional con glassmorphism y animaciones
 * CODEC POS v2.0 - Sistema completo de gestión de promociones
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles, Plus, Search, Filter, TrendingUp, TrendingDown,
  Tag, Percent, Package, Gift, Calendar, Clock, Star,
  Zap, Crown, Edit, Trash2, Copy, Power, PowerOff,
  BarChart3, DollarSign, Users, Target, Download, Upload
} from 'lucide-react';
import {
  Promocion,
  listarPromociones,
  obtenerEstadisticas,
  togglePromocion,
  duplicarPromocion,
  eliminarPromocion,
  limpiarPromocionesVencidas,
} from '../lib/promocionesService';
import { ModalPromocion } from '../components/modals/ModalPromocion';
import { toast } from 'sonner';

export default function PromocionesPage() {
  const [promociones, setPromociones] = useState<Promocion[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [promocionEditar, setPromocionEditar] = useState<Promocion | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'activas' | 'inactivas'>('todas');
  const [vista, setVista] = useState<'grid' | 'lista'>('grid');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [promos, stats] = await Promise.all([
        listarPromociones(),
        obtenerEstadisticas(),
      ]);
      setPromociones(promos);
      setEstadisticas(stats);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await togglePromocion(id);
      toast.success('Estado actualizado');
      cargarDatos();
    } catch (error) {
      toast.error('Error al actualizar');
    }
  };

  const handleDuplicar = async (id: string) => {
    try {
      await duplicarPromocion(id);
      toast.success('✅ Promoción duplicada');
      cargarDatos();
    } catch (error) {
      toast.error('Error al duplicar');
    }
  };

  const handleEliminar = async (id: string, nombre: string) => {
    if (confirm(`¿Eliminar la promoción "${nombre}"?`)) {
      try {
        await eliminarPromocion(id);
        toast.success('🗑️ Promoción eliminada');
        cargarDatos();
      } catch (error) {
        toast.error('Error al eliminar');
      }
    }
  };

  const handleEditar = (promo: Promocion) => {
    setPromocionEditar(promo);
    setModalOpen(true);
  };

  const handleLimpiarVencidas = async () => {
    try {
      const eliminadas = await limpiarPromocionesVencidas();
      if (eliminadas > 0) {
        toast.success(`🧹 ${eliminadas} promociones vencidas eliminadas`);
        cargarDatos();
      } else {
        toast.info('No hay promociones vencidas');
      }
    } catch (error) {
      toast.error('Error al limpiar');
    }
  };

  const promocionesFiltradas = promociones.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.descripcion.toLowerCase().includes(busqueda.toLowerCase());
    
    if (filtroEstado === 'activas') return matchBusqueda && p.activa;
    if (filtroEstado === 'inactivas') return matchBusqueda && !p.activa;
    return matchBusqueda;
  });

  const getTipoInfo = (tipo: Promocion['tipo']) => {
    const tipos = {
      porcentaje: { icon: Percent, color: 'from-blue-500 to-cyan-500', emoji: '💙', label: 'Descuento %' },
      monto_fijo: { icon: DollarSign, color: 'from-green-500 to-emerald-500', emoji: '💵', label: 'Descuento $' },
      '2x1': { icon: Package, color: 'from-purple-500 to-pink-500', emoji: '🎁', label: '2x1' },
      '3x2': { icon: Package, color: 'from-orange-500 to-red-500', emoji: '🎉', label: '3x2' },
      combo: { icon: Gift, color: 'from-yellow-500 to-orange-500', emoji: '🎪', label: 'Combo' },
      regalo_producto: { icon: Sparkles, color: 'from-pink-500 to-rose-500', emoji: '🎀', label: 'Regalo' },
    };
    return tipos[tipo] || tipos.porcentaje;
  };

  const estaVigente = (promo: Promocion) => {
    const ahora = new Date();
    const inicio = new Date(promo.fechaInicio);
    const fin = new Date(promo.fechaFin);
    return ahora >= inicio && ahora <= fin;
  };

  return (
    <div className="h-screen overflow-y-auto p-6 space-y-6">
      
      {/* Header Premium */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm animate-pulse">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                  Promociones y Descuentos
                  <Crown className="w-8 h-8 text-yellow-300 animate-bounce" />
                </h1>
                <p className="text-white/80 text-lg mt-1">
                  Gestiona ofertas irresistibles para aumentar tus ventas
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleLimpiarVencidas}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 border border-white/30"
            >
              <Trash2 className="w-5 h-5" />
              Limpiar
            </button>
            <button
              onClick={() => {
                setPromocionEditar(null);
                setModalOpen(true);
              }}
              className="bg-white text-purple-600 hover:bg-white/90 px-6 py-3 rounded-xl font-bold transition-all shadow-xl flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nueva Promoción
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas con Glassmorphism */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Promociones */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-3 rounded-xl shadow-lg">
                  <Tag className="w-6 h-6 text-white" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {estadisticas.totalPromociones}
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Total Promociones
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full font-bold">
                  {estadisticas.promocionesActivas} Activas
                </span>
              </div>
            </div>
          </div>

          {/* Descuentos Hoy */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-500 p-3 rounded-xl shadow-lg">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <Zap className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                ${(estadisticas.descuentosHoy / 1000).toFixed(0)}K
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Descuentos Hoy
              </div>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Esta semana: ${(estadisticas.descuentosSemana / 1000).toFixed(0)}K
              </div>
            </div>
          </div>

          {/* Ahorro Promedio */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-orange-500 to-red-500 p-3 rounded-xl shadow-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <BarChart3 className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                ${estadisticas.ahorroPromedioPorVenta.toFixed(0)}
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Ahorro Promedio
              </div>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Por venta realizada
              </div>
            </div>
          </div>

          {/* Más Usada */}
          <div className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 transition-transform">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-xl shadow-lg">
                  <Star className="w-6 h-6 text-white fill-white" />
                </div>
                <Crown className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white mb-1 truncate">
                {estadisticas.promocionMasUsada?.nombre || 'N/A'}
              </div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Más Popular
              </div>
              {estadisticas.promocionMasUsada && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-bold">
                    {estadisticas.promocionMasUsada.usos} usos
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar promociones..."
            className="w-full pl-12 pr-4 py-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-2 border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-gray-900 dark:text-white font-medium"
          />
        </div>

        <div className="flex gap-3">
          {['todas', 'activas', 'inactivas'].map((filtro) => (
            <button
              key={filtro}
              onClick={() => setFiltroEstado(filtro as any)}
              className={`px-5 py-3 rounded-xl font-bold transition-all ${
                filtroEstado === filtro
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                  : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {filtro.charAt(0).toUpperCase() + filtro.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Promociones */}
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-semibold">Cargando promociones...</p>
        </div>
      ) : promocionesFiltradas.length === 0 ? (
        <div className="text-center py-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border-2 border-dashed border-gray-300 dark:border-slate-600">
          <Sparkles className="w-20 h-20 mx-auto text-gray-400 mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            No hay promociones
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {busqueda ? 'No se encontraron resultados' : 'Crea tu primera promoción para comenzar'}
          </p>
          {!busqueda && (
            <button
              onClick={() => {
                setPromocionEditar(null);
                setModalOpen(true);
              }}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-xl font-bold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Crear Primera Promoción
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {promocionesFiltradas.map((promo) => {
            const tipoInfo = getTipoInfo(promo.tipo);
            const Icon = tipoInfo.icon;
            const vigente = estaVigente(promo);

            return (
              <div
                key={promo.id}
                className={`group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-xl border-2 transition-all hover:scale-105 ${
                  promo.activa && vigente
                    ? 'border-purple-300 dark:border-purple-700/50'
                    : 'border-gray-200 dark:border-slate-700 opacity-75'
                }`}
              >
                {/* Badge de estado */}
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                  {promo.activa && vigente && (
                    <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                      <Power className="w-3 h-3" />
                      ACTIVA
                    </span>
                  )}
                  {!vigente && (
                    <span className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full shadow-lg">
                      VENCIDA
                    </span>
                  )}
                </div>

                {/* Header con gradiente */}
                <div className={`bg-gradient-to-br ${tipoInfo.color} p-6 text-white relative`}>
                  <div className="absolute inset-0 bg-black/10"></div>
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-5xl">{tipoInfo.emoji}</div>
                      <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                        <Star className="w-4 h-4 fill-white" />
                        <span className="font-bold">{promo.prioridad}</span>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold mb-1">{promo.nombre}</h3>
                    <p className="text-white/80 text-sm line-clamp-2">{promo.descripcion || 'Sin descripción'}</p>
                  </div>
                </div>

                {/* Contenido */}
                <div className="p-6 space-y-4">
                  {/* Valor del descuento */}
                  {(promo.tipo === 'porcentaje' || promo.tipo === 'monto_fijo') && promo.valorDescuento && (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border-2 border-green-200 dark:border-green-800">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                          {promo.tipo === 'porcentaje' ? `${promo.valorDescuento}%` : `$${promo.valorDescuento.toLocaleString('es-CO')}`}
                        </div>
                        <div className="text-sm font-semibold text-green-700 dark:text-green-500 mt-1">
                          de descuento
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Información adicional */}
                  <div className="space-y-2 text-sm">
                    {promo.montoMinimo && promo.montoMinimo > 0 && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <DollarSign className="w-4 h-4" />
                        <span>Compra mínima: <span className="font-bold text-gray-900 dark:text-white">${promo.montoMinimo.toLocaleString('es-CO')}</span></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">
                        {new Date(promo.fechaInicio).toLocaleDateString('es-CO')} - {new Date(promo.fechaFin).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                    {promo.horaInicio && promo.horaFin && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs">{promo.horaInicio} - {promo.horaFin}</span>
                      </div>
                    )}
                  </div>

                  {/* Estadísticas */}
                  <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Usos</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {promo.usosActuales}
                        {promo.usosMaximos ? `/${promo.usosMaximos}` : ''}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Descuentos</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${(promo.descuentoTotalOtorgado / 1000).toFixed(0)}K
                      </div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    {promo.acumulable && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-full">
                        Acumulable
                      </span>
                    )}
                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full">
                      {tipoInfo.label}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="px-6 pb-6 flex gap-2">
                  <button
                    onClick={() => handleToggle(promo.id)}
                    className={`flex-1 px-4 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      promo.activa
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                    }`}
                  >
                    {promo.activa ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    {promo.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => handleEditar(promo)}
                    className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicar(promo.id)}
                    className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-xl font-bold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEliminar(promo.id, promo.nombre)}
                    className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-400 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-slate-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <ModalPromocion
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setPromocionEditar(null);
        }}
        onSuccess={() => {
          cargarDatos();
          setPromocionEditar(null);
        }}
        promocionEditar={promocionEditar}
      />
    </div>
  );
}