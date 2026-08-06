/**
 * 💳 PANEL DE FIDELIZACIÓN EN POS
 * Panel lateral para buscar cliente y redimir puntos
 */

import React, { useState } from 'react';
import { Search, Gift, User, Star, X } from 'lucide-react';
import { Cliente, buscarCliente } from '../../lib/fidelizacionService';
import { toast } from 'sonner';

interface PanelFidelizacionProps {
  onClienteSeleccionado: (cliente: Cliente | null) => void;
  onPuntosRedimir: (puntos: number) => void;
  clienteActual: Cliente | null;
  totalCompra: number;
}

export default function PanelFidelizacion({
  onClienteSeleccionado,
  onPuntosRedimir,
  clienteActual,
  totalCompra,
}: PanelFidelizacionProps) {
  const [busqueda, setBusqueda] = useState('');
  const [puntosARedimir, setPuntosARedimir] = useState(0);
  const [buscando, setBuscando] = useState(false);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busqueda.trim()) return;

    setBuscando(true);
    try {
      const cliente = await buscarCliente(busqueda);
      if (cliente) {
        onClienteSeleccionado(cliente);
        toast.success(`Cliente ${cliente.nombre} encontrado`);
        setBusqueda('');
      } else {
        toast.error('Cliente no encontrado');
      }
    } catch (error) {
      toast.error('Error buscando cliente');
    } finally {
      setBuscando(false);
    }
  };

  const handleRedimirPuntos = () => {
    if (!clienteActual) {
      toast.error('Primero seleccione un cliente');
      return;
    }

    if (puntosARedimir <= 0) {
      toast.error('Ingrese cantidad de puntos');
      return;
    }

    if (puntosARedimir > clienteActual.puntos) {
      toast.error('El cliente no tiene suficientes puntos');
      return;
    }

    onPuntosRedimir(puntosARedimir);
    toast.success(`${puntosARedimir} puntos aplicados al descuento`);
    setPuntosARedimir(0);
  };

  const getNivelColor = (nivel: Cliente['nivelFidelidad']) => {
    switch (nivel) {
      case 'bronce': return 'bg-orange-600';
      case 'plata': return 'bg-gray-400';
      case 'oro': return 'bg-yellow-500';
      case 'platino': return 'bg-purple-600';
      default: return 'bg-gray-500';
    }
  };

  const calcularPuntosGanados = () => {
    if (!clienteActual) return 0;
    
    let multiplicador = 1;
    switch (clienteActual.nivelFidelidad) {
      case 'plata': multiplicador = 1.2; break;
      case 'oro': multiplicador = 1.5; break;
      case 'platino': multiplicador = 2; break;
    }
    
    return Math.floor(totalCompra * multiplicador);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 h-full flex flex-col">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <Gift className="w-5 h-5 text-purple-600" />
        Fidelización
      </h3>

      {/* Búsqueda de Cliente */}
      {!clienteActual && (
        <form onSubmit={handleBuscar} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Doc, Tel o Código..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            type="submit"
            disabled={buscando}
            className="w-full mt-2 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
          >
            {buscando ? 'Buscando...' : 'Buscar Cliente'}
          </button>
        </form>
      )}

      {/* Cliente Seleccionado */}
      {clienteActual && (
        <div className="mb-4">
          <div className={`bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg p-4 text-white relative`}>
            <button
              onClick={() => {
                onClienteSeleccionado(null);
                setPuntosARedimir(0);
              }}
              className="absolute top-2 right-2 bg-white/20 hover:bg-white/30 rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className={`${getNivelColor(clienteActual.nivelFidelidad)} p-1 rounded`}>
                <Star className="w-4 h-4" />
              </div>
              <span className="text-xs uppercase font-bold">{clienteActual.nivelFidelidad}</span>
            </div>

            <div className="font-bold text-lg mb-1">{clienteActual.nombre}</div>
            <div className="text-xs opacity-80 mb-3">{clienteActual.telefono}</div>

            <div className="bg-white/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs">Puntos Disponibles</span>
                <Gift className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold">
                {clienteActual.puntos.toLocaleString('es-CO')}
              </div>
              <div className="text-xs opacity-80 mt-1">
                = ${(clienteActual.puntos * 10).toLocaleString('es-CO')} en descuentos
              </div>
            </div>
          </div>

          {/* Redimir Puntos */}
          {clienteActual.puntos > 0 && (
            <div className="mt-3 p-3 border rounded-lg">
              <label className="block text-sm font-medium mb-2">Redimir Puntos</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max={clienteActual.puntos}
                  value={puntosARedimir}
                  onChange={(e) => setPuntosARedimir(parseInt(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="0"
                />
                <button
                  onClick={handleRedimirPuntos}
                  disabled={puntosARedimir <= 0}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
                >
                  Aplicar
                </button>
              </div>
              {puntosARedimir > 0 && (
                <div className="mt-2 text-sm text-green-600 font-semibold">
                  Descuento: -${(puntosARedimir * 10).toLocaleString('es-CO')}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setPuntosARedimir(Math.min(100, clienteActual.puntos))}
                  className="flex-1 bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-200"
                >
                  100 pts
                </button>
                <button
                  onClick={() => setPuntosARedimir(Math.min(500, clienteActual.puntos))}
                  className="flex-1 bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-200"
                >
                  500 pts
                </button>
                <button
                  onClick={() => setPuntosARedimir(clienteActual.puntos)}
                  className="flex-1 bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-200"
                >
                  Todo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Puntos a Ganar */}
      {clienteActual && totalCompra > 0 && (
        <div className="mt-auto pt-4 border-t">
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-green-700 mb-1">Puntos a Ganar</div>
            <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
              +{calcularPuntosGanados()}
              <Gift className="w-5 h-5" />
            </div>
            <div className="text-xs text-green-700 mt-1">
              Con esta compra de ${totalCompra.toLocaleString('es-CO')}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {!clienteActual && (
        <div className="mt-auto pt-4 text-center text-gray-500 text-sm">
          <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Busca un cliente para acumular puntos</p>
        </div>
      )}
    </div>
  );
}
