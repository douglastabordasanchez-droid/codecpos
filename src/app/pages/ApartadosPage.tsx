/**
 * 🎯 PÁGINA DE APARTADOS / RESERVAS
 * Sistema de apartados con abonos
 */

import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, DollarSign, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Apartado,
  listarApartados,
  registrarAbono,
  obtenerEstadisticasApartados,
  obtenerApartadosProximosVencer,
} from '../lib/apartadosService';
import { toast } from 'sonner';
import { usePOS } from '../contexts/POSContext';
import { ModalNuevoApartado } from '../components/modals/ModalNuevoApartado';

export default function ApartadosPage() {
  const { darkMode } = usePOS();
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [proximosVencer, setProximosVencer] = useState<Apartado[]>([]);
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState<Apartado['estado'] | 'todos'>('activo');
  const [loading, setLoading] = useState(false);
  const [modalApartadoOpen, setModalApartadoOpen] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [filtroEstado]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [apartadosData, proximosData, statsData] = await Promise.all([
        listarApartados(filtroEstado !== 'todos' ? { estado: filtroEstado as any } : {}),
        obtenerApartadosProximosVencer(3),
        obtenerEstadisticasApartados(),
      ]);
      setApartados(apartadosData);
      setProximosVencer(proximosData);
      setEstadisticas(statsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const getEstadoColor = (estado: Apartado['estado']) => {
    switch (estado) {
      case 'activo': return 'bg-blue-500';
      case 'pagado': return 'bg-green-500';
      case 'entregado': return 'bg-gray-500';
      case 'cancelado': return 'bg-red-500';
      case 'vencido': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const calcularProgreso = (apartado: Apartado) => {
    return (apartado.totalAbonado / apartado.total) * 100;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-8 h-8 text-blue-600" />
          Apartados
        </h1>
        <button
          onClick={() => setModalApartadoOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold"
        >
          <Plus className="w-5 h-5" />
          Nuevo Apartado
        </button>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-500 rounded-lg shadow-lg p-6 text-white">
            <div className="text-2xl font-bold">{estadisticas.activos}</div>
            <div className="text-sm opacity-80">Apartados Activos</div>
          </div>
          <div className="bg-green-500 rounded-lg shadow-lg p-6 text-white">
            <div className="text-2xl font-bold">
              ${(estadisticas.montoPendiente / 1000).toFixed(0)}K
            </div>
            <div className="text-sm opacity-80">Saldo Pendiente</div>
          </div>
          <div className="bg-purple-500 rounded-lg shadow-lg p-6 text-white">
            <div className="text-2xl font-bold">{estadisticas.entregados}</div>
            <div className="text-sm opacity-80">Entregados</div>
          </div>
          <div className="bg-orange-500 rounded-lg shadow-lg p-6 text-white">
            <div className="text-2xl font-bold">{estadisticas.tasaCompletacion.toFixed(1)}%</div>
            <div className="text-sm opacity-80">Tasa Completación</div>
          </div>
        </div>
      )}

      {/* Alertas */}
      {proximosVencer.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-orange-800">
              {proximosVencer.length} apartado(s) próximo(s) a vencer
            </span>
          </div>
          <div className="text-sm text-orange-700">
            {proximosVencer.map(a => `${a.numero} (${a.clienteNombre})`).join(', ')}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="mb-6 flex gap-2">
        {['todos', 'activo', 'pagado', 'entregado', 'cancelado', 'vencido'].map((estado) => (
          <button
            key={estado}
            onClick={() => setFiltroEstado(estado as any)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              filtroEstado === estado
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {estado.charAt(0).toUpperCase() + estado.slice(1)}
          </button>
        ))}
      </div>

      {/* Lista de Apartados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {apartados.map((apartado) => (
          <div key={apartado.id} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-mono font-bold text-lg">{apartado.numero}</div>
                <div className="text-gray-600">{apartado.clienteNombre}</div>
                <div className="text-sm text-gray-500">{apartado.clienteTelefono}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getEstadoColor(apartado.estado)}`}>
                {apartado.estado.toUpperCase()}
              </span>
            </div>

            {/* Productos */}
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">PRODUCTOS:</div>
              <div className="space-y-1">
                {apartado.productos.slice(0, 3).map((prod, idx) => (
                  <div key={idx} className="text-sm flex justify-between">
                    <span>{prod.cantidad}x {prod.productoNombre}</span>
                    <span className="font-semibold">${prod.subtotal.toLocaleString('es-CO')}</span>
                  </div>
                ))}
                {apartado.productos.length > 3 && (
                  <div className="text-xs text-gray-500">
                    +{apartado.productos.length - 3} más...
                  </div>
                )}
              </div>
            </div>

            {/* Progreso de Pago */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Progreso de Pago</span>
                <span className="font-semibold">{calcularProgreso(apartado).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${calcularProgreso(apartado)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Abonado: ${apartado.totalAbonado.toLocaleString('es-CO')}</span>
                <span>Saldo: ${apartado.saldo.toLocaleString('es-CO')}</span>
              </div>
            </div>

            {/* Total y Fechas */}
            <div className="pt-4 border-t">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Total:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${apartado.total.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar className="w-4 h-4" />
                Vence: {new Date(apartado.fechaVencimiento).toLocaleDateString('es-CO')}
              </div>
            </div>

            {/* Abonos */}
            {apartado.abonos.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs font-semibold text-gray-500 mb-2">HISTORIAL DE ABONOS:</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {apartado.abonos.map((abono) => (
                    <div key={abono.id} className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        {new Date(abono.fecha).toLocaleDateString('es-CO')} - {abono.metodoPago}
                      </span>
                      <span className="font-semibold text-green-600">
                        +${abono.monto.toLocaleString('es-CO')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {apartados.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          No hay apartados con el filtro seleccionado
        </div>
      )}

      {/* Modal Nuevo Apartado */}
      <ModalNuevoApartado
        isOpen={modalApartadoOpen}
        onClose={() => setModalApartadoOpen(false)}
        onSuccess={cargarDatos}
      />
    </div>
  );
}