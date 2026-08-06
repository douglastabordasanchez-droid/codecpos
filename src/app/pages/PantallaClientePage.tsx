/**
 * 🖥️ PANTALLA DEL CLIENTE - DUAL DISPLAY
 * Muestra productos y precios en pantalla secundaria
 */

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package } from 'lucide-react';
import { EstadoPantallaCliente } from '../lib/multiDisplayService';
import { motion, AnimatePresence } from 'motion/react';

export default function PantallaClientePage() {
  const [estado, setEstado] = useState<EstadoPantallaCliente>({
    productos: [],
    total: 0,
    totalItems: 0,
    ultimaActualizacion: Date.now(),
    modoPublicidad: true,
  });

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('codec_pos_config');
    return saved ? JSON.parse(saved) : {
      nombreComercial: 'CODEC POS',
      eslogan: 'Tu tienda de confianza',
      logoUrl: '',
    };
  });

  const [horaActual, setHoraActual] = useState(new Date());

  useEffect(() => {
    // Actualizar hora cada segundo
    const intervalo = setInterval(() => {
      setHoraActual(new Date());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    // Escuchar mensajes del POS principal
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.tipo === 'ACTUALIZAR_ESTADO') {
        setEstado(event.data.estado);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Modo Publicidad (cuando no hay productos)
  if (estado.modoPublicidad || estado.productos.length === 0) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center text-white overflow-hidden relative">
        {/* Fondo animado */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500 rounded-full filter blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl animate-pulse delay-500" />
        </div>

        {/* Contenido */}
        <div className="relative z-10 text-center space-y-8 p-12">
          {/* Logo o nombre */}
          {config.logoUrl ? (
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              src={config.logoUrl}
              alt={config.nombreComercial}
              className="w-64 h-64 mx-auto object-contain drop-shadow-2xl"
            />
          ) : (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <ShoppingCart className="w-48 h-48 mx-auto mb-6 drop-shadow-2xl" />
            </motion.div>
          )}

          {/* Nombre comercial */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-8xl font-black tracking-tight drop-shadow-2xl"
          >
            {config.nombreComercial}
          </motion.h1>

          {/* Eslogan */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-light opacity-90 drop-shadow-lg"
          >
            {config.eslogan}
          </motion.p>

          {/* Mensaje de bienvenida */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-12 space-y-3"
          >
            <p className="text-3xl font-semibold">
              ¡Bienvenido!
            </p>
            <p className="text-2xl opacity-80">
              Estamos listos para atenderte
            </p>
          </motion.div>

          {/* Hora */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-6xl font-bold font-mono opacity-70"
          >
            {horaActual.toLocaleTimeString('es-CO', { 
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit'
            })}
          </motion.div>
        </div>
      </div>
    );
  }

  // Modo Compra (mostrando productos)
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 px-12 py-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {config.logoUrl ? (
              <img
                src={config.logoUrl}
                alt={config.nombreComercial}
                className="w-24 h-24 object-contain drop-shadow-xl"
              />
            ) : (
              <ShoppingCart className="w-24 h-24 drop-shadow-xl" />
            )}
            <div>
              <h1 className="text-5xl font-black tracking-tight drop-shadow-lg">
                {config.nombreComercial}
              </h1>
              <p className="text-2xl font-light opacity-90 mt-1">
                {config.eslogan}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold font-mono">
              {horaActual.toLocaleTimeString('es-CO', { 
                hour: '2-digit', 
                minute: '2-digit'
              })}
            </div>
            <div className="text-2xl opacity-80 mt-1">
              {horaActual.toLocaleDateString('es-CO', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Lista de productos */}
      <div className="flex-1 overflow-y-auto px-12 py-8">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {estado.productos.map((producto, index) => (
              <motion.div
                key={producto.id}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-white/10 backdrop-blur-md border-2 border-white/20 rounded-3xl p-8 shadow-2xl hover:bg-white/15 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 flex-1">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                      <Package className="w-12 h-12" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-4xl font-bold mb-2">
                        {producto.nombre}
                      </h3>
                      <p className="text-2xl opacity-80">
                        {producto.cantidad} {producto.cantidad === 1 ? 'unidad' : 'unidades'} × ${producto.precio.toLocaleString('es-CO')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-6xl font-black text-green-400 drop-shadow-lg">
                      ${producto.subtotal.toLocaleString('es-CO')}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer - Total */}
      <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 px-12 py-10 shadow-2xl border-t-4 border-white/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-semibold opacity-90 mb-2">
              Total de artículos
            </p>
            <p className="text-5xl font-bold">
              {estado.totalItems} {estado.totalItems === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-semibold opacity-90 mb-2">
              TOTAL A PAGAR
            </p>
            <div className="text-8xl font-black tracking-tight drop-shadow-2xl">
              ${estado.total.toLocaleString('es-CO')}
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje personalizado */}
      {estado.mensajePersonalizado && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="absolute bottom-0 left-0 right-0 bg-yellow-500 text-black px-12 py-6 text-center"
        >
          <p className="text-3xl font-bold">
            {estado.mensajePersonalizado}
          </p>
        </motion.div>
      )}
    </div>
  );
}
