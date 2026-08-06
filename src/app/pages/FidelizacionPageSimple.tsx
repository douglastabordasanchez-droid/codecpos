/**
 * 💳 PÁGINA DE FIDELIZACIÓN - VERSIÓN SIMPLIFICADA
 */

import React, { useState, useEffect } from 'react';
import { Gift, User, Star } from 'lucide-react';
import { toast } from 'sonner';

export default function FidelizacionPageSimple() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Gift className="w-8 h-8 text-purple-600" />
          Sistema de Fidelización
        </h1>
        <p className="text-gray-600 mt-2">
          Gestión completa del programa de puntos y clientes
        </p>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Clientes Activos</div>
            </div>
            <User className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Puntos Activos</div>
            </div>
            <Star className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Puntos Redimidos</div>
            </div>
            <Gift className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">$0</div>
              <div className="text-sm opacity-80">Valor Puntos</div>
            </div>
            <Gift className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Lista de Clientes</h2>
        <div className="text-center py-12 text-gray-500">
          <User className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No hay clientes registrados</p>
          <button 
            className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            onClick={() => toast.success('Función en desarrollo')}
          >
            Agregar Cliente
          </button>
        </div>
      </div>
    </div>
  );
}
