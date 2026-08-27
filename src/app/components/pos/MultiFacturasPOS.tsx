/**
 * 🧾 CODEC POS v2.0 - Sistema de Múltiples Facturas Simultáneas
 * Permite atender varios clientes al mismo tiempo con facturas independientes
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, ShoppingCart, Users, DollarSign, ShieldCheck } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { Button } from '../ui/button';
import POSPageNew from './POSPageNew';
import { toast } from 'sonner';

interface Factura {
  id: string;
  numero: number;
  nombreCliente?: string;
  createdAt: number;
  totalItems?: number;
  total?: number;
  /** true apenas CODEC Verify detecta el pago de este carrito, aunque el cajero esté viendo otro. */
  pagoListo?: boolean;
  pagoInfo?: { monto: number; entidad: string };
}

export default function MultiFacturasPOS() {
  const { darkMode } = usePOS();
  const [facturas, setFacturas] = useState<Factura[]>([
    {
      id: 'factura-1',
      numero: 1,
      createdAt: Date.now(),
    }
  ]);
  const [facturaActivaId, setFacturaActivaId] = useState<string>('factura-1');
  const [contadorFacturas, setContadorFacturas] = useState(1);

  // actualizarInfoFactura es estable (useCallback, deps vacías) para no
  // recrear el efecto que la llama en cada POSPageNew hijo — por eso lee el
  // carrito activo desde un ref en vez de capturarlo en el closure (que
  // quedaría desactualizado para siempre con el valor del primer render).
  const facturaActivaIdRef = useRef(facturaActivaId);
  useEffect(() => { facturaActivaIdRef.current = facturaActivaId; }, [facturaActivaId]);

  // 🆕 AGREGAR NUEVA FACTURA
  const agregarFactura = () => {
    if (facturas.length >= 10) {
      // Máximo 10 facturas abiertas
      return;
    }

    const nuevoNumero = contadorFacturas + 1;
    const nuevaFactura: Factura = {
      id: `factura-${nuevoNumero}`,
      numero: nuevoNumero,
      createdAt: Date.now(),
    };

    setFacturas(prev => [...prev, nuevaFactura]);
    setFacturaActivaId(nuevaFactura.id);
    setContadorFacturas(nuevoNumero);
  };

  // 🗑️ CERRAR FACTURA
  const cerrarFactura = (id: string) => {
    if (facturas.length === 1) {
      // No permitir cerrar la última factura
      return;
    }

    const factura = facturas.find(f => f.id === id);
    
    // 🔔 Confirmar si tiene items
    if (factura && (factura.totalItems || 0) > 0) {
      const confirmar = window.confirm(
        `¿Cerrar factura #${factura.numero}?\n\n` +
        `Tiene ${factura.totalItems} productos por valor de $${(factura.total || 0).toLocaleString('es-CO')}.\n\n` +
        `Esta acción eliminará todos los productos del carrito.`
      );
      
      if (!confirmar) return;
    }

    const index = facturas.findIndex(f => f.id === id);
    const nuevasFacturas = facturas.filter(f => f.id !== id);
    setFacturas(nuevasFacturas);

    // Si cerramos la factura activa, activar otra
    if (id === facturaActivaId) {
      const nuevaActiva = nuevasFacturas[Math.max(0, index - 1)];
      setFacturaActivaId(nuevaActiva.id);
    }
  };

  // 📊 ACTUALIZAR INFO DE FACTURA (desde el hijo)
  // 🐛 FIX bucle de re-render (ver comentario en POSPageNew.tsx): esta
  // función debe tener identidad ESTABLE porque se pasa directo como
  // `onUpdateInfo` (ya no como closure inline por-factura) y es dependencia
  // de un useEffect en cada POSPageNew hijo. useCallback con deps vacías es
  // seguro aquí porque solo usa la forma funcional de setState. Además, si
  // los valores no cambiaron realmente, no se llama setFacturas — evita
  // crear una referencia de array nueva (y por lo tanto un re-render) por
  // cada tick en el que el total recalculado da exactamente igual.
  const actualizarInfoFactura = useCallback((id: string, info: Partial<Factura>) => {
    setFacturas(prev => {
      const factura = prev.find(f => f.id === id);
      if (!factura) return prev;
      const sinCambios = Object.entries(info).every(
        ([key, value]) => factura[key as keyof Factura] === value
      );
      if (sinCambios) return prev;

      // 🔔 Avisa cuando el pago de un carrito QUE NO ESTÁS MIRANDO ya está
      // listo — sin esto, el cajero solo se enteraría al volver manualmente
      // a esa pestaña. Se dispara una sola vez, justo al pasar de
      // "esperando" a "listo" (nunca en cada re-render).
      if (info.pagoListo && !factura.pagoListo && id !== facturaActivaIdRef.current) {
        const monto = info.pagoInfo?.monto ?? factura.pagoInfo?.monto;
        const entidad = info.pagoInfo?.entidad ?? factura.pagoInfo?.entidad;
        toast.success(`✅ Carrito #${factura.numero} recibió el pago${entidad ? ` · ${entidad}` : ''}${monto ? ` $${monto.toLocaleString('es-CO')}` : ''}`, {
          duration: 8000,
          action: { label: 'Ir al carrito', onClick: () => setFacturaActivaId(id) },
        });
      }

      return prev.map(f => (f.id === id ? { ...f, ...info } : f));
    });
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* 🔝 BARRA DE TABS - FACTURAS */}
      <div className={`flex-shrink-0 border-b ${
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-1 p-2 overflow-x-auto">
          {/* TABS DE FACTURAS */}
          <AnimatePresence mode="popLayout">
            {facturas.map((factura, index) => {
              const isActive = factura.id === facturaActivaId;
              const tieneItems = (factura.totalItems || 0) > 0;
              
              return (
                <motion.div
                  key={factura.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <button
                    onClick={() => setFacturaActivaId(factura.id)}
                    className={`
                      group relative flex items-center gap-2 px-4 py-2.5 rounded-t-xl
                      transition-all duration-200 min-w-[180px] max-w-[240px]
                      ${isActive
                        ? darkMode
                          ? 'bg-slate-800 text-white shadow-lg border-b-2 border-emerald-500'
                          : 'bg-gray-50 text-gray-900 shadow-lg border-b-2 border-emerald-500'
                        : darkMode
                        ? 'bg-slate-800/50 text-gray-400 hover:bg-slate-800/80 hover:text-white'
                        : 'bg-gray-100/50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    {/* ICONO */}
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                        : darkMode
                        ? 'bg-slate-700'
                        : 'bg-gray-200'
                      }
                    `}>
                      <ShoppingCart className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                    </div>

                    {/* INFO */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isActive ? 'text-emerald-500' : ''}`}>
                          #{factura.numero}
                        </span>
                        {tieneItems && (
                          <span className={`
                            px-1.5 py-0.5 rounded-full text-[10px] font-bold
                            ${isActive
                              ? 'bg-emerald-500 text-white'
                              : darkMode
                              ? 'bg-slate-600 text-gray-300'
                              : 'bg-gray-300 text-gray-700'
                            }
                          `}>
                            {factura.totalItems}
                          </span>
                        )}
                        {/* 💰 Pago de CODEC Verify ya confirmado en segundo plano — solo
                            tiene sentido mostrarlo mientras NO estás mirando este carrito,
                            el modal mismo ya se ve "verificado" cuando lo activas. */}
                        {factura.pagoListo && !isActive && (
                          <span
                            className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white animate-pulse"
                            title="Pago recibido — listo para cobrar"
                          >
                            <ShieldCheck className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate">
                        {factura.nombreCliente || 'Cliente'}
                      </div>
                      {factura.total && factura.total > 0 && (
                        <div className={`text-xs font-semibold ${
                          isActive ? 'text-emerald-500' : 'text-gray-500'
                        }`}>
                          ${factura.total.toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>

                    {/* BOTÓN CERRAR */}
                    {facturas.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cerrarFactura(factura.id);
                        }}
                        className={`
                          w-6 h-6 rounded-full flex items-center justify-center
                          opacity-0 group-hover:opacity-100 transition-opacity
                          ${darkMode
                            ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300'
                            : 'hover:bg-red-100 text-red-500 hover:text-red-600'
                          }
                        `}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* BOTÓN AGREGAR FACTURA */}
          {facturas.length < 10 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-shrink-0"
            >
              <Button
                onClick={agregarFactura}
                size="sm"
                variant="outline"
                className={`
                  rounded-xl h-[48px] px-3
                  ${darkMode
                    ? 'border-slate-600 hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-400'
                    : 'border-gray-300 hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-600'
                  }
                `}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {/* INDICADOR DE CAPACIDAD */}
          <div className={`ml-auto flex-shrink-0 px-3 py-1 rounded-xl text-xs font-semibold ${
            darkMode ? 'bg-slate-800 text-gray-400' : 'bg-gray-100 text-gray-600'
          }`}>
            {facturas.length}/10 facturas
          </div>
        </div>
      </div>

      {/* 📄 CONTENIDO DE TODAS LAS FACTURAS ABIERTAS
          🔑 A propósito NUNCA se desmontan las inactivas (antes sí, con
          `factura.id === facturaActivaId && <POSPageNew/>` dentro de
          AnimatePresence) — solo se ocultan con `hidden` (display:none).
          Desmontar mataba la suscripción en tiempo real de CODEC Verify
          (suscribirPagoEsperado) y todo el estado del modal "esperando
          pago" de esa factura apenas el cajero cambiaba de pestaña, así
          que no era posible cobrarle a un cliente mientras otro seguía
          pagando por Nequi/Daviplata/etc. Mantenerlas montadas dej que
          el pago siga esperando en segundo plano y el cajero se entera
          por el toast + el punto verde en la pestaña (ver
          actualizarInfoFactura) en vez de tener que quedarse mirando. */}
      <div className="flex-1 overflow-hidden relative">
        {facturas.map(factura => (
          <div
            key={factura.id}
            className={factura.id === facturaActivaId ? 'h-full' : 'hidden'}
          >
            <POSPageNew
              facturaId={factura.id}
              numeroFactura={factura.numero}
              onUpdateInfo={actualizarInfoFactura}
            />
          </div>
        ))}
      </div>

      {/* 💡 TOOLTIP DE AYUDA (aparece solo al inicio) */}
      {facturas.length === 1 && facturas[0].totalItems === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className={`
            absolute top-20 left-1/2 transform -translate-x-1/2
            px-4 py-2 rounded-xl shadow-lg pointer-events-none z-50
            ${darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white'}
          `}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-semibold">
              💡 Tip: Usa el botón + para atender varios clientes simultáneamente
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}