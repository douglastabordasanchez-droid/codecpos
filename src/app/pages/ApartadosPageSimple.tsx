/**
 * 🛍️ PÁGINA DE APARTADOS - VERSIÓN SIMPLIFICADA
 */

import React from 'react';
import { ShoppingBag, DollarSign, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function ApartadosPageSimple() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-8 h-8 text-cyan-600" />
          Apartados y Reservas
        </h1>
        <p className="text-gray-600 mt-2">
          Sistema de apartados con abonos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Apartados Activos</div>
            </div>
            <ShoppingBag className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">$0</div>
              <div className="text-sm opacity-80">Saldo Pendiente</div>
            </div>
            <DollarSign className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Entregados</div>
            </div>
            <ShoppingBag className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0%</div>
              <div className="text-sm opacity-80">Tasa Completación</div>
            </div>
            <Calendar className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Lista de Apartados</h2>
        <div className="text-center py-12 text-gray-500">
          <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No hay apartados registrados</p>
          <button 
            className="mt-4 px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
            onClick={() => toast.success('Los apartados se crean desde el POS')}
          >
            Ir al POS
          </button>
        </div>
      </div>
    </div>
  );
}
