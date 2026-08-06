/**
 * 🎁 PANEL DE PROMOCIONES EN POS
 * Muestra promociones aplicadas y disponibles
 */

import React from 'react';
import { Tag, Percent, Gift, TrendingDown } from 'lucide-react';
import { PromocionAplicada } from '../../lib/promocionesService';

interface PanelPromocionesProps {
  promocionesAplicadas: PromocionAplicada[];
  descuentoTotal: number;
  productosGratis: string[];
}

export default function PanelPromociones({
  promocionesAplicadas,
  descuentoTotal,
  productosGratis,
}: PanelPromocionesProps) {
  if (promocionesAplicadas.length === 0 && productosGratis.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-5 h-5 text-orange-600" />
        <span className="font-bold text-orange-800">Promociones Aplicadas</span>
      </div>

      {/* Promociones con Descuento */}
      {promocionesAplicadas.length > 0 && (
        <div className="space-y-2 mb-3">
          {promocionesAplicadas.map((promo, index) => (
            <div
              key={index}
              className="bg-white rounded-lg p-3 flex items-center justify-between shadow-sm"
            >
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-800">
                  {promo.promocionNombre}
                </div>
                <div className="text-xs text-gray-500">
                  {promo.productosAfectados.length} producto(s) con descuento
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600 flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" />
                  -${promo.descuento.toLocaleString('es-CO')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Productos Gratis */}
      {productosGratis.length > 0 && (
        <div className="bg-green-100 border border-green-200 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-800">Productos Gratis</span>
          </div>
          <div className="space-y-1">
            {productosGratis.map((prodId, index) => (
              <div key={index} className="text-sm text-green-700">
                • Producto gratis agregado
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total Ahorrado */}
      {descuentoTotal > 0 && (
        <div className="bg-orange-600 text-white rounded-lg p-3 flex items-center justify-between">
          <span className="font-semibold">Total Ahorrado:</span>
          <span className="text-xl font-bold">
            ${descuentoTotal.toLocaleString('es-CO')}
          </span>
        </div>
      )}
    </div>
  );
}
