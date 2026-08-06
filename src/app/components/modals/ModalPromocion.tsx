/**
 * 🎁 MODAL CREAR/EDITAR PROMOCIÓN
 * Diseño glassmorphism premium con previsualización en tiempo real
 */

import React, { useState, useEffect } from 'react';
import {
  X, Tag, Percent, DollarSign, Package, Gift, Calendar,
  Clock, Users, Sparkles, TrendingUp, Star, Zap, Crown
} from 'lucide-react';
import { Promocion, crearPromocion, actualizarPromocion } from '../../lib/promocionesService';
import { toast } from 'sonner';

interface ModalPromocionProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  promocionEditar?: Promocion | null;
}

export function ModalPromocion({ isOpen, onClose, onSuccess, promocionEditar }: ModalPromocionProps) {
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState(1);
  
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    tipo: 'porcentaje' as Promocion['tipo'],
    valorDescuento: 0,
    aplicaA: 'todos' as Promocion['aplicaA'],
    montoMinimo: 0,
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    horaInicio: '00:00',
    horaFin: '23:59',
    prioridad: 5,
    acumulable: false,
    usosMaximos: 0,
  });

  useEffect(() => {
    if (promocionEditar) {
      setForm({
        nombre: promocionEditar.nombre,
        descripcion: promocionEditar.descripcion,
        tipo: promocionEditar.tipo,
        valorDescuento: promocionEditar.valorDescuento || 0,
        aplicaA: promocionEditar.aplicaA,
        montoMinimo: promocionEditar.montoMinimo || 0,
        fechaInicio: promocionEditar.fechaInicio.split('T')[0],
        fechaFin: promocionEditar.fechaFin.split('T')[0],
        horaInicio: promocionEditar.horaInicio || '00:00',
        horaFin: promocionEditar.horaFin || '23:59',
        prioridad: promocionEditar.prioridad,
        acumulable: promocionEditar.acumulable,
        usosMaximos: promocionEditar.usosMaximos || 0,
      });
    }
  }, [promocionEditar]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...form,
        fechaInicio: new Date(form.fechaInicio).toISOString(),
        fechaFin: new Date(form.fechaFin).toISOString(),
      };

      if (promocionEditar) {
        await actualizarPromocion(promocionEditar.id, data);
        toast.success('✅ Promoción actualizada exitosamente');
      } else {
        await crearPromocion(data);
        toast.success('✅ Promoción creada exitosamente');
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error:', error);
      toast.error('❌ Error al guardar la promoción');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      nombre: '',
      descripcion: '',
      tipo: 'porcentaje',
      valorDescuento: 0,
      aplicaA: 'todos',
      montoMinimo: 0,
      fechaInicio: new Date().toISOString().split('T')[0],
      fechaFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      horaInicio: '00:00',
      horaFin: '23:59',
      prioridad: 5,
      acumulable: false,
      usosMaximos: 0,
    });
    setPaso(1);
  };

  const calcularDescuentoEjemplo = () => {
    const montoEjemplo = 50000;
    if (form.tipo === 'porcentaje') {
      return (montoEjemplo * form.valorDescuento) / 100;
    }
    return form.valorDescuento;
  };

  const tiposPromocion = [
    { value: 'porcentaje', label: 'Descuento %', icon: Percent, color: 'from-blue-500 to-cyan-500', emoji: '💙' },
    { value: 'monto_fijo', label: 'Descuento $', icon: DollarSign, color: 'from-green-500 to-emerald-500', emoji: '💵' },
    { value: '2x1', label: '2x1', icon: Package, color: 'from-purple-500 to-pink-500', emoji: '🎁' },
    { value: '3x2', label: '3x2', icon: Package, color: 'from-orange-500 to-red-500', emoji: '🎉' },
    { value: 'combo', label: 'Combo', icon: Gift, color: 'from-yellow-500 to-orange-500', emoji: '🎪' },
    { value: 'regalo_producto', label: 'Regalo', icon: Sparkles, color: 'from-pink-500 to-rose-500', emoji: '🎀' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-white/20 dark:border-slate-700/50">
        
        {/* Header Glassmorphism */}
        <div className="relative bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 px-8 py-6">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm animate-pulse">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {promocionEditar ? 'Editar' : 'Nueva'} Promoción
                  <Crown className="w-6 h-6 text-yellow-300" />
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {promocionEditar ? 'Actualiza los detalles de tu promoción' : 'Crea descuentos y ofertas irresistibles'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="bg-white/20 hover:bg-white/30 p-2 rounded-xl transition-all backdrop-blur-sm"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="relative mt-6 flex items-center justify-between">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex-1 flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                    paso >= num
                      ? 'bg-white text-purple-600 shadow-lg scale-110'
                      : 'bg-white/20 text-white/60'
                  }`}
                >
                  {num}
                </div>
                {num < 3 && (
                  <div className={`flex-1 h-1 mx-2 rounded-full transition-all ${
                    paso > num ? 'bg-white' : 'bg-white/20'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-8 overflow-y-auto max-h-[calc(90vh-280px)]">
            
            {/* PASO 1: Tipo y Nombre */}
            {paso === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                    🎯 Nombre de la Promoción *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-medium transition-all"
                    placeholder="Ej: Super Descuento de Fin de Semana"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                    📝 Descripción
                  </label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    rows={3}
                    placeholder="Describe los detalles de la promoción..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold mb-4 text-gray-800 dark:text-white">
                    🎨 Tipo de Promoción *
                  </label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {tiposPromocion.map((tipo) => {
                      const Icon = tipo.icon;
                      return (
                        <button
                          key={tipo.value}
                          type="button"
                          onClick={() => setForm({ ...form, tipo: tipo.value as Promocion['tipo'] })}
                          className={`relative group p-5 rounded-2xl border-2 transition-all transform hover:scale-105 ${
                            form.tipo === tipo.value
                              ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 shadow-lg'
                              : 'border-gray-200 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-600 bg-white dark:bg-slate-700/50'
                          }`}
                        >
                          <div className={`text-4xl mb-2 ${form.tipo === tipo.value ? 'animate-bounce' : ''}`}>
                            {tipo.emoji}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-5 h-5 ${form.tipo === tipo.value ? 'text-purple-600' : 'text-gray-500'}`} />
                            <span className={`font-bold ${form.tipo === tipo.value ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>
                              {tipo.label}
                            </span>
                          </div>
                          {form.tipo === tipo.value && (
                            <div className="absolute top-2 right-2">
                              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 animate-spin" style={{ animationDuration: '3s' }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* PASO 2: Valor y Condiciones */}
            {paso === 2 && (
              <div className="space-y-6">
                {(form.tipo === 'porcentaje' || form.tipo === 'monto_fijo') && (
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      {form.tipo === 'porcentaje' ? '💯 Porcentaje de Descuento *' : '💵 Monto de Descuento *'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="0"
                        step={form.tipo === 'porcentaje' ? '1' : '100'}
                        max={form.tipo === 'porcentaje' ? '100' : undefined}
                        value={form.valorDescuento}
                        onChange={(e) => setForm({ ...form, valorDescuento: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-4 pl-14 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-bold text-2xl transition-all"
                        placeholder={form.tipo === 'porcentaje' ? '20' : '10000'}
                      />
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl">
                        {form.tipo === 'porcentaje' ? '📊' : '💰'}
                      </div>
                    </div>
                    
                    {/* Previsualización del descuento */}
                    <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border-2 border-green-200 dark:border-green-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400">Ejemplo con compra de $50,000:</p>
                          <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                            Precio original: <span className="line-through">$50,000</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            -${calcularDescuentoEjemplo().toLocaleString('es-CO')}
                          </p>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                            Paga: ${(50000 - calcularDescuentoEjemplo()).toLocaleString('es-CO')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                    💳 Monto Mínimo de Compra (Opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.montoMinimo}
                    onChange={(e) => setForm({ ...form, montoMinimo: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    placeholder="0 (sin mínimo)"
                  />
                  {form.montoMinimo > 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      ⚡ Se aplicará solo en compras mayores a ${form.montoMinimo.toLocaleString('es-CO')}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      ⭐ Prioridad (1-10)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={form.prioridad}
                      onChange={(e) => setForm({ ...form, prioridad: parseInt(e.target.value) || 5 })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      🔢 Usos Máximos (0 = ilimitado)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.usosMaximos}
                      onChange={(e) => setForm({ ...form, usosMaximos: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-purple-200 dark:border-purple-800">
                  <input
                    type="checkbox"
                    id="acumulable"
                    checked={form.acumulable}
                    onChange={(e) => setForm({ ...form, acumulable: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="acumulable" className="flex-1 text-sm font-semibold text-gray-800 dark:text-white cursor-pointer">
                    🎁 Acumulable con otras promociones
                  </label>
                </div>
              </div>
            )}

            {/* PASO 3: Vigencia */}
            {paso === 3 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Calendar className="w-4 h-4 inline mr-2" />
                      📅 Fecha Inicio *
                    </label>
                    <input
                      type="date"
                      required
                      value={form.fechaInicio}
                      onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Calendar className="w-4 h-4 inline mr-2" />
                      📅 Fecha Fin *
                    </label>
                    <input
                      type="date"
                      required
                      value={form.fechaFin}
                      onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Clock className="w-4 h-4 inline mr-2" />
                      ⏰ Hora Inicio
                    </label>
                    <input
                      type="time"
                      value={form.horaInicio}
                      onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Clock className="w-4 h-4 inline mr-2" />
                      ⏰ Hora Fin
                    </label>
                    <input
                      type="time"
                      value={form.horaFin}
                      onChange={(e) => setForm({ ...form, horaFin: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    />
                  </div>
                </div>

                {/* Resumen Final */}
                <div className="p-6 bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 dark:from-purple-900/30 dark:via-pink-900/30 dark:to-orange-900/30 rounded-2xl border-2 border-purple-200 dark:border-purple-800">
                  <h4 className="font-bold text-lg text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Resumen de tu Promoción
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">📌 Nombre:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{form.nombre || 'Sin nombre'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">🎨 Tipo:</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {tiposPromocion.find(t => t.value === form.tipo)?.label}
                      </span>
                    </div>
                    {(form.tipo === 'porcentaje' || form.tipo === 'monto_fijo') && (
                      <div className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">💰 Descuento:</span>
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {form.tipo === 'porcentaje' ? `${form.valorDescuento}%` : `$${form.valorDescuento.toLocaleString('es-CO')}`}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">📅 Vigencia:</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {new Date(form.fechaInicio).toLocaleDateString('es-CO')} - {new Date(form.fechaFin).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer con navegación */}
          <div className="bg-gray-50 dark:bg-slate-900/50 px-8 py-5 flex items-center justify-between border-t border-gray-200 dark:border-slate-700">
            <div className="flex gap-3">
              {paso > 1 && (
                <button
                  type="button"
                  onClick={() => setPaso(paso - 1)}
                  className="px-6 py-3 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 font-bold transition-all"
                >
                  ← Anterior
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 font-bold transition-all"
              >
                Cancelar
              </button>
            </div>
            
            {paso < 3 ? (
              <button
                type="button"
                onClick={() => setPaso(paso + 1)}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 font-bold transition-all shadow-lg shadow-purple-500/30 flex items-center gap-2"
              >
                Siguiente →
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 font-bold transition-all shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    {promocionEditar ? 'Actualizar' : 'Crear'} Promoción
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}