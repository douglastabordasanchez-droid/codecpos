/**
 * 📊 PÁGINA DE CÓDIGOS DE BARRAS - VERSIÓN SIMPLIFICADA
 */

import React from 'react';
import { Barcode, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

export default function CodigosBarrasPageSimple() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Barcode className="w-8 h-8 text-indigo-600" />
          Códigos de Barras
        </h1>
        <p className="text-gray-600 mt-2">
          Generador de PLU y EAN-13
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Códigos Generados</div>
            </div>
            <Barcode className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">0</div>
              <div className="text-sm opacity-80">Etiquetas Impresas</div>
            </div>
            <Printer className="w-10 h-10 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">3</div>
              <div className="text-sm opacity-80">Plantillas</div>
            </div>
            <Download className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Generador de Códigos</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border-2 border-indigo-200 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4">Generar PLU</h3>
            <p className="text-gray-600 mb-4">
              Códigos de 4-5 dígitos para productos internos
            </p>
            <button 
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              onClick={() => toast.success('Función en desarrollo')}
            >
              Generar PLU
            </button>
          </div>

          <div className="border-2 border-purple-200 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4">Generar EAN-13</h3>
            <p className="text-gray-600 mb-4">
              Códigos de barras estándar de 13 dígitos
            </p>
            <button 
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              onClick={() => toast.success('Función en desarrollo')}
            >
              Generar EAN-13
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
