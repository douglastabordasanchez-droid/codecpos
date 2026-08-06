/**
 * 📦 PÁGINA DE PROVEEDORES - VERSIÓN SIMPLIFICADA
 */

import React from 'react';
import { Package, TrendingUp, Phone } from 'lucide-react';
import { toast } from 'sonner';

export default function ProveedoresPageSimple() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="w-8 h-8 text-blue-600" />
          Proveedores y Órdenes de Compra
        </h1>
        <p className="text-gray-600 mt-2">
          Gestión completa de proveedores y órdenes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Proveedores Activos</div>
            </div>
            <Package className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Órdenes Activas</div>
            </div>
            <TrendingUp className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">$0</div>
              <div className="text-sm opacity-80">Pendiente Pago</div>
            </div>
            <Phone className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Recibidas Este Mes</div>
            </div>
            <Package className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Lista de Proveedores</h2>
        <div className="text-center py-12 text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No hay proveedores registrados</p>
          <button 
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={() => toast.success('Función en desarrollo')}
          >
            Agregar Proveedor
          </button>
        </div>
      </div>
    </div>
  );
}
