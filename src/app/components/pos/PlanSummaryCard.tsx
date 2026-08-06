/**
 * RESUMEN DE PLAN ACTUAL - CODEC POS v2.0
 * Muestra un resumen visual detallado del plan activo del usuario
 */

import { motion } from 'motion/react';
import { Crown, Check, X, Infinity, TrendingUp, Users, BarChart3, Smartphone, Database, Sparkles, Award, Shield, Zap, FileText, ShoppingCart, Package, DollarSign, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { usePOS } from '../../contexts/POSContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';

export function PlanSummaryCard() {
  const { darkMode } = usePOS();
  const { planInfo, isPremium, isBasico } = usePlanRestrictions();

  // Debug: Ver qué plan se está detectando
  console.log('🔍 PlanSummaryCard - Plan detectado:', planInfo);

  const esPremium = planInfo.plan === 'PREMIUM';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
    >
      <Card className={`shadow-xl border-2 ${ 
        esPremium
          ? darkMode
            ? 'bg-gradient-to-br from-amber-900/20 via-purple-900/20 to-amber-900/20 border-amber-600/50'
            : 'bg-gradient-to-br from-amber-50 via-purple-50 to-amber-50 border-amber-400'
          : darkMode
            ? 'bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border-blue-700/40'
            : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300'
      }`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {esPremium ? (
                <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-purple-600 rounded-2xl blur-xl opacity-50 animate-pulse" />
                  <Crown className="w-7 h-7 text-white relative z-10" />
                </div>
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
              )}
              <div>
                <CardTitle className={`flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {esPremium ? '👑 Plan Premium' : '⚡ Plan Básico'}
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    esPremium
                      ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow-lg'
                      : darkMode 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-blue-500 text-white'
                  }`}>
                    TU PLAN ACTUAL
                  </span>
                </CardTitle>
                <CardDescription className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {esPremium
                    ? '¡Felicitaciones! Tienes acceso completo a todas las funcionalidades profesionales de CODEC POS v2.0'
                    : 'Perfecto para iniciar tu negocio - Actualiza a Premium para desbloquear funcionalidades avanzadas y llevar tu tienda al siguiente nivel'}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ==================== PLAN PREMIUM ==================== */}
          {esPremium && (
            <>
              {/* Mensaje de Felicitación Extendido */}
              <div className={`p-6 rounded-2xl border-2 ${
                darkMode
                  ? 'bg-gradient-to-r from-amber-900/30 to-purple-900/30 border-amber-600/40'
                  : 'bg-gradient-to-r from-amber-50 to-purple-50 border-amber-400'
              }`}>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Award className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-xl mb-3 ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>
                      ¡Excelente decisión! Has elegido lo mejor 🎉
                    </h3>
                    <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Has activado el <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-purple-600">Plan Premium</span>, 
                      la opción más completa y profesional de CODEC POS. Ahora tienes acceso <span className="font-bold">ilimitado</span> a 
                      todas las funcionalidades avanzadas diseñadas para hacer crecer tu negocio sin límites.
                    </p>
                    <div className={`grid grid-cols-3 gap-3 mt-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-amber-500">∞</div>
                        <div className="text-xs mt-1">Productos</div>
                      </div>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-purple-500">∞</div>
                        <div className="text-xs mt-1">Usuarios</div>
                      </div>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-pink-500">12</div>
                        <div className="text-xs mt-1">Meses</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Características Principales Premium */}
              <div>
                <h4 className={`font-bold text-lg mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <Crown className="w-6 h-6 text-amber-500" />
                  Funcionalidades Completas de Tu Plan Premium:
                </h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Productos Ilimitados */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Infinity className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Productos Ilimitados ∞
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Registra todos los productos que necesites sin restricciones. Ideal para minimercados, supermercados 
                          y negocios con inventarios extensos. Sin límites técnicos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Usuarios Ilimitados */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Usuarios Ilimitados ∞
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Crea cuentas para todo tu equipo de trabajo sin restricciones. Cajeros, administradores, supervisores 
                          y más. Gestión completa de permisos y turnos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Historial 12 Meses */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          12 Meses de Historial Completo
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Guarda y consulta todo un año de información: ventas, devoluciones, movimientos de caja, 
                          inventarios y más. Análisis histórico completo para tomar mejores decisiones.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dashboard Ejecutivo */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Dashboard Ejecutivo con Métricas
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Visualiza en tiempo real las métricas más importantes de tu negocio: ventas del día, productos 
                          más vendidos, rendimiento por usuario, alertas de stock y análisis avanzados.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reportes Avanzados */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          6 Tipos de Reportes Profesionales
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Genera reportes detallados en PDF y Excel: ventas por período, inventario valorizado, 
                          movimientos de caja, productos con pérdidas, rendimiento por empleado y más.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Codec Verify PRO */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Smartphone className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Codec Verify PRO Integrado
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Recibe notificaciones instantáneas de pagos móviles (Nequi, Bancolombia, Daviplata). 
                          Confirma transferencias automáticamente para agilizar tus ventas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Personalización Total */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Shield className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Personalización Completa
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Personaliza tirillas con tu logo, configura IVA personalizado, ajusta mensajes de despedida 
                          y adapta el sistema completamente a la identidad de tu negocio.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Todo el POS Completo */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-gray-200 hover:border-amber-400 hover:shadow-lg'
                  } transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ShoppingCart className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          + Todas las Funciones del POS
                        </h5>
                        <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Facturación multifacturas, devoluciones, control de caja, gastos, alertas de vencimiento, 
                          múltiples métodos de pago, impresión de tirillas y mucho más.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mensaje de Aprovechamiento */}
              <div className={`p-6 rounded-2xl text-center border-2 ${
                darkMode
                  ? 'bg-gradient-to-r from-amber-900/20 to-purple-900/20 border-amber-600/30'
                  : 'bg-gradient-to-r from-amber-50 to-purple-50 border-amber-300'
              }`}>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-purple-600 rounded-full mb-4 shadow-xl">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h4 className={`font-bold text-xl mb-2 ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>
                  🚀 Estás aprovechando al máximo CODEC POS v2.0
                </h4>
                <p className={`text-base ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Todas las funcionalidades profesionales están activas y listas para impulsar tu negocio
                </p>
                <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                  darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-semibold">Plan Activo y Funcionando</span>
                </div>
              </div>
            </>
          )}

          {/* ==================== PLAN BÁSICO ==================== */}
          {!esPremium && (
            <>
              {/* Descripción del Plan Básico */}
              <div className={`p-6 rounded-2xl border-2 ${
                darkMode
                  ? 'bg-blue-900/20 border-blue-700/40'
                  : 'bg-blue-50 border-blue-300'
              }`}>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Package className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-xl mb-3 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                      Plan Básico - Perfecto para Empezar 🎯
                    </h3>
                    <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Tu plan <span className="font-bold">Básico</span> incluye todas las herramientas esenciales para 
                      operar tu negocio de manera profesional. Es ideal para tiendas pequeñas y medianas que están 
                      comenzando su transformación digital.
                    </p>
                    <div className={`grid grid-cols-3 gap-3 mt-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-blue-500">5K</div>
                        <div className="text-xs mt-1">Productos</div>
                      </div>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-indigo-500">5</div>
                        <div className="text-xs mt-1">Usuarios</div>
                      </div>
                      <div className="text-center p-3 bg-white/5 rounded-lg">
                        <div className="text-2xl font-bold text-purple-500">3</div>
                        <div className="text-xs mt-1">Meses</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lo que INCLUYE el Plan Básico */}
              <div>
                <h4 className={`font-bold text-lg mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <Check className="w-6 h-6 text-green-500" />
                  Lo que Incluye Tu Plan Básico:
                </h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 5,000 Productos */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Hasta 5,000 Productos
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Registra hasta 5,000 productos diferentes. Perfecto para tiendas pequeñas y medianas 
                          con surtido variado.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 5 Usuarios */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Hasta 5 Usuarios Simultáneos
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Crea cuentas para tu equipo: cajeros, supervisores y administradores. Gestión de 
                          permisos y turnos incluida.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3 Meses Historial */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          3 Meses de Historial
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Consulta y analiza las ventas, inventarios y movimientos de los últimos 3 meses 
                          para tomar decisiones informadas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* POS Completo */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Sistema POS Completo
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Facturación, devoluciones, control de caja, múltiples facturas, 6 métodos de pago, 
                          impresión de tirillas y más.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Gestión de Inventario */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Gestión de Inventario Avanzada
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Control de stock, alertas de vencimiento, categorías, importación masiva CSV y 
                          seguimiento completo.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reportes Básicos */}
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          Reportes Básicos
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Consulta ventas diarias, movimientos de caja y estadísticas básicas directamente 
                          en el sistema.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lo que te PIERDES en Plan Básico */}
              <div>
                <h4 className={`font-bold text-lg mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <X className="w-6 h-6 text-red-500" />
                  Funcionalidades Exclusivas de Premium que te Estás Perdiendo:
                </h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Sin Límites */}
                  <div className={`p-5 rounded-xl border-2 opacity-70 ${
                    darkMode
                      ? 'bg-slate-800/30 border-slate-700'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 line-through ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Productos y Usuarios Ilimitados
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          En Premium puedes crecer sin límites. Registra millones de productos y todos los 
                          empleados que necesites.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sin Dashboard */}
                  <div className={`p-5 rounded-xl border-2 opacity-70 ${
                    darkMode
                      ? 'bg-slate-800/30 border-slate-700'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 line-through ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Dashboard Ejecutivo
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Métricas en tiempo real, gráficos avanzados, productos top, rendimiento por usuario 
                          y análisis de tendencias.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sin Reportes Avanzados */}
                  <div className={`p-5 rounded-xl border-2 opacity-70 ${
                    darkMode
                      ? 'bg-slate-800/30 border-slate-700'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 line-through ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Reportes Avanzados PDF y Excel
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          6 tipos de reportes profesionales descargables: ventas, inventario, caja, productos 
                          con pérdidas y más.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sin Codec Verify */}
                  <div className={`p-5 rounded-xl border-2 opacity-70 ${
                    darkMode
                      ? 'bg-slate-800/30 border-slate-700'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-semibold text-base mb-2 line-through ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Codec Verify PRO
                        </h5>
                        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Recibe notificaciones automáticas de pagos móviles de Nequi, Bancolombia y Daviplata 
                          en tiempo real.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA Grande para Actualizar */}
              <div className={`p-8 rounded-2xl border-2 text-center ${
                darkMode
                  ? 'bg-gradient-to-br from-purple-900/30 to-amber-900/30 border-purple-600/50'
                  : 'bg-gradient-to-br from-purple-50 to-amber-50 border-purple-400'
              }`}>
                <div className="flex flex-col items-center gap-5">
                  <div className="relative">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-amber-500 rounded-2xl flex items-center justify-center shadow-2xl">
                      <Crown className="w-10 h-10 text-white" />
                    </div>
                    <div className="absolute -inset-2 bg-gradient-to-br from-purple-600 to-amber-500 rounded-2xl blur-2xl opacity-40 animate-pulse" />
                  </div>
                  
                  <div>
                    <h4 className={`font-bold text-2xl mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      ¿Listo para Llevar tu Negocio al Siguiente Nivel?
                    </h4>
                    <p className={`text-base mb-5 leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Actualiza a <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500">Plan Premium</span> y 
                      desbloquea todo el poder de CODEC POS sin limitaciones
                    </p>
                    
                    {/* Lista de beneficios */}
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 text-left ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">Productos y usuarios ilimitados</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">Dashboard ejecutivo completo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">6 reportes avanzados PDF/Excel</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">Codec Verify PRO integrado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">12 meses de historial completo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-semibold">Personalización total del sistema</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      window.open('https://wa.me/573238646844?text=Quiero%20actualizar%20mi%20licencia%20a%20Plan%20Premium%20de%20CODEC%20POS', '_blank');
                    }}
                    className="bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-700 hover:to-amber-600 text-white font-bold px-10 py-4 text-lg shadow-2xl hover:shadow-3xl transition-all hover:scale-105"
                  >
                    <Crown className="w-6 h-6 mr-3" />
                    Actualizar a Premium Ahora
                  </Button>

                  <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    💬 Contacta al desarrollador vía WhatsApp: +57 323 864 6844
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}