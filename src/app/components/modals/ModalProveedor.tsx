/**
 * 🏢 MODAL CREAR/EDITAR PROVEEDOR
 * Diseño glassmorphism premium con validación completa
 */

import React, { useState, useEffect } from 'react';
import {
  X, Building2, User, Phone, Mail, MapPin, CreditCard,
  Calendar, DollarSign, Star, Percent, FileText, Sparkles
} from 'lucide-react';
import { Proveedor, crearProveedor, actualizarProveedor } from '../../lib/proveedoresService';
import { toast } from 'sonner';

interface ModalProveedorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  proveedorEditar?: Proveedor | null;
}

export function ModalProveedor({ isOpen, onClose, onSuccess, proveedorEditar }: ModalProveedorProps) {
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState(1);
  
  const [form, setForm] = useState({
    nombre: '',
    razonSocial: '',
    nit: '',
    tipoDocumento: 'NIT' as Proveedor['tipoDocumento'],
    contactoPrincipal: '',
    telefono: '',
    email: '',
    direccion: '',
    ciudad: '',
    pais: 'Colombia',
    categoria: 'General',
    diasCredito: 0,
    limiteCredito: 0,
    descuentoHabitual: 0,
    metodoPagoPreferido: 'Transferencia',
    calificacion: 5,
    notas: '',
  });

  useEffect(() => {
    if (proveedorEditar) {
      setForm({
        nombre: proveedorEditar.nombre,
        razonSocial: proveedorEditar.razonSocial || '',
        nit: proveedorEditar.nit,
        tipoDocumento: proveedorEditar.tipoDocumento,
        contactoPrincipal: proveedorEditar.contactoPrincipal,
        telefono: proveedorEditar.telefono,
        email: proveedorEditar.email,
        direccion: proveedorEditar.direccion,
        ciudad: proveedorEditar.ciudad,
        pais: proveedorEditar.pais,
        categoria: proveedorEditar.categoria,
        diasCredito: proveedorEditar.diasCredito,
        limiteCredito: proveedorEditar.limiteCredito,
        descuentoHabitual: proveedorEditar.descuentoHabitual,
        metodoPagoPreferido: proveedorEditar.metodoPagoPreferido,
        calificacion: proveedorEditar.calificacion,
        notas: proveedorEditar.notas || '',
      });
    }
  }, [proveedorEditar]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (proveedorEditar) {
        await actualizarProveedor(proveedorEditar.id, form);
        toast.success('✅ Proveedor actualizado exitosamente');
      } else {
        await crearProveedor(form);
        toast.success('✅ Proveedor creado exitosamente');
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error:', error);
      toast.error('❌ Error al guardar el proveedor');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      nombre: '',
      razonSocial: '',
      nit: '',
      tipoDocumento: 'NIT',
      contactoPrincipal: '',
      telefono: '',
      email: '',
      direccion: '',
      ciudad: '',
      pais: 'Colombia',
      categoria: 'General',
      diasCredito: 0,
      limiteCredito: 0,
      descuentoHabitual: 0,
      metodoPagoPreferido: 'Transferencia',
      calificacion: 5,
      notas: '',
    });
    setPaso(1);
  };

  const categorias = [
    { value: 'Abarrotes', emoji: '🛒' },
    { value: 'Bebidas', emoji: '🥤' },
    { value: 'Aseo', emoji: '🧼' },
    { value: 'Lácteos', emoji: '🥛' },
    { value: 'Carnes', emoji: '🥩' },
    { value: 'Frutas y Verduras', emoji: '🥬' },
    { value: 'Panadería', emoji: '🍞' },
    { value: 'Snacks', emoji: '🍿' },
    { value: 'General', emoji: '📦' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-white/20 dark:border-slate-700/50">
        
        {/* Header Glassmorphism */}
        <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-6">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm animate-pulse">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  {proveedorEditar ? 'Editar' : 'Nuevo'} Proveedor
                  <Sparkles className="w-6 h-6 text-yellow-300" />
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {proveedorEditar ? 'Actualiza la información del proveedor' : 'Registra un nuevo proveedor en el sistema'}
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
                      ? 'bg-white text-blue-600 shadow-lg scale-110'
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
            
            {/* PASO 1: Datos Básicos */}
            {paso === 1 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Building2 className="w-4 h-4 inline mr-2" />
                      Nombre Comercial *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-medium transition-all"
                      placeholder="Distribuidora El Éxito"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      📋 Razón Social
                    </label>
                    <input
                      type="text"
                      value={form.razonSocial}
                      onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Distribuidora El Éxito S.A.S."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      📄 Tipo de Documento *
                    </label>
                    <select
                      value={form.tipoDocumento}
                      onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as Proveedor['tipoDocumento'] })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    >
                      <option value="NIT">NIT</option>
                      <option value="CC">Cédula</option>
                      <option value="CE">Cédula Extranjería</option>
                      <option value="Pasaporte">Pasaporte</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      🆔 NIT / Documento *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.nit}
                      onChange={(e) => setForm({ ...form, nit: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="900123456-7"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-4 text-gray-800 dark:text-white">
                      📂 Categoría *
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {categorias.map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setForm({ ...form, categoria: cat.value })}
                          className={`p-4 rounded-xl border-2 transition-all text-center ${
                            form.categoria === cat.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                              : 'border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700'
                          }`}
                        >
                          <div className="text-3xl mb-1">{cat.emoji}</div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            {cat.value}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PASO 2: Contacto */}
            {paso === 2 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <User className="w-4 h-4 inline mr-2" />
                      Contacto Principal *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.contactoPrincipal}
                      onChange={(e) => setForm({ ...form, contactoPrincipal: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Juan Pérez"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Phone className="w-4 h-4 inline mr-2" />
                      Teléfono *
                    </label>
                    <input
                      type="tel"
                      required
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="3001234567"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Mail className="w-4 h-4 inline mr-2" />
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="contacto@proveedor.com"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <MapPin className="w-4 h-4 inline mr-2" />
                      Dirección *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Calle 123 #45-67"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      🌆 Ciudad *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.ciudad}
                      onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Bogotá"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      🌎 País *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.pais}
                      onChange={(e) => setForm({ ...form, pais: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Colombia"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PASO 3: Condiciones Comerciales */}
            {paso === 3 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Calendar className="w-4 h-4 inline mr-2" />
                      Días de Crédito
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.diasCredito}
                      onChange={(e) => setForm({ ...form, diasCredito: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="30"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <DollarSign className="w-4 h-4 inline mr-2" />
                      Límite de Crédito
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={form.limiteCredito}
                      onChange={(e) => setForm({ ...form, limiteCredito: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="5000000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Percent className="w-4 h-4 inline mr-2" />
                      Descuento Habitual (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={form.descuentoHabitual}
                      onChange={(e) => setForm({ ...form, descuentoHabitual: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      placeholder="5"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <CreditCard className="w-4 h-4 inline mr-2" />
                      Método de Pago Preferido
                    </label>
                    <select
                      value={form.metodoPagoPreferido}
                      onChange={(e) => setForm({ ...form, metodoPagoPreferido: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                    >
                      <option value="Transferencia">Transferencia</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Crédito">Crédito</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <Star className="w-4 h-4 inline mr-2" />
                      Calificación Inicial
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setForm({ ...form, calificacion: star })}
                          className="transition-transform hover:scale-110"
                        >
                          <Star
                            className={`w-8 h-8 ${
                              star <= form.calificacion
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-3 text-lg font-bold text-gray-700 dark:text-gray-300">
                        {form.calificacion}/5
                      </span>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold mb-3 text-gray-800 dark:text-white">
                      <FileText className="w-4 h-4 inline mr-2" />
                      Notas / Observaciones
                    </label>
                    <textarea
                      value={form.notas}
                      onChange={(e) => setForm({ ...form, notas: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-all"
                      rows={4}
                      placeholder="Información adicional del proveedor..."
                    />
                  </div>
                </div>

                {/* Resumen */}
                <div className="p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-2xl border-2 border-blue-200 dark:border-blue-800">
                  <h4 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                    Resumen del Proveedor
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Nombre:</span>
                      <div className="font-bold text-gray-900 dark:text-white">{form.nombre || 'Sin nombre'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">NIT:</span>
                      <div className="font-bold text-gray-900 dark:text-white">{form.nit || 'Sin NIT'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Categoría:</span>
                      <div className="font-bold text-gray-900 dark:text-white">{form.categoria}</div>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Ciudad:</span>
                      <div className="font-bold text-gray-900 dark:text-white">{form.ciudad || 'Sin ciudad'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Crédito:</span>
                      <div className="font-bold text-green-600 dark:text-green-400">{form.diasCredito} días</div>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Límite:</span>
                      <div className="font-bold text-green-600 dark:text-green-400">
                        ${form.limiteCredito.toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
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
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2"
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
                    {proveedorEditar ? 'Actualizar' : 'Crear'} Proveedor
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