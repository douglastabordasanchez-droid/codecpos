import { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Heart, TrendingUp, Shield, Zap, Star, ArrowRight } from 'lucide-react';
import logoImage from '/logo.png';

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    setIsStarting(true);
    
    // Esperar animación
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Marcar setup como completado
    localStorage.setItem('codecpos_initial_setup_complete', 'true');

    // Iniciar con datos de ejemplo (se configuran después en Configuración)
    const defaultConfig = {
      nombreNegocio: 'Mi Negocio',
      nit: '000000000-0',
      direccion: 'Configurar en Configuración',
      telefono: '0000000000',
      email: 'configurar@email.com',
      nombrePropietario: 'Propietario',
      ciudadMunicipio: 'Ciudad',
      departamento: 'Departamento',
      tipoNegocio: 'MINIMERCADO',
      resolucionDian: '',
      prefijoFactura: 'FV',
      rangoInicial: '1',
      rangoFinal: '99999',
      usarPruebaGratis: true,
    };

    localStorage.setItem('codecpos_business_config', JSON.stringify(defaultConfig));

    // Activar licencia de prueba gratis (10 días)
    const trialLicense = {
      id: 'trial_' + Date.now(),
      nombreNegocio: 'Mi Negocio',
      nit: '000000000-0',
      contacto: 'Propietario',
      telefono: '0000000000',
      email: 'configurar@email.com',
      usuario: 'admin',
      contraseña: 'admin',
      plan: 'PROFESIONAL',
      duracion: 'PRUEBA',
      estado: 'ACTIVA',
      fechaActivacion: new Date().toISOString(),
      fechaExpiracion: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      enPrueba: true,
      diasPruebaRestantes: 10,
      createdAt: Date.now(),
    };

    localStorage.setItem('codecpos_active_license', JSON.stringify(trialLicense));
    
    setIsStarting(false);
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/40 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Partículas de fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-emerald-400/30 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              y: [null, Math.random() * window.innerHeight],
              x: [null, Math.random() * window.innerWidth],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-3xl" />

      {/* Contenido principal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl relative z-10"
        style={{
          maxHeight: '95vh',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#10b981 #1e293b'
        }}
      >
        <div className="backdrop-blur-2xl bg-slate-800/80 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden my-4">
          {/* Logo del sistema */}
          <div className="p-8 text-center border-b border-slate-700/50 bg-gradient-to-b from-slate-900/50 to-transparent">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-6"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-amber-500/30 rounded-3xl blur-2xl animate-pulse" />
                <img
                  src={logoImage}
                  alt="CODEC POS"
                  className="relative w-32 h-32 object-contain drop-shadow-2xl"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
                ¡Bienvenido a CODEC POS!
              </h1>
              <p className="text-xl text-emerald-400 font-bold mb-2">
                El Mejor Sistema POS del Mercado
              </p>
              <p className="text-slate-400 text-sm">
                Sistema de Punto de Venta Profesional v2.0
              </p>
            </motion.div>
          </div>

          {/* Bendición principal */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="p-8 bg-gradient-to-br from-emerald-500/10 to-purple-500/10 border-b border-slate-700/50"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  Bendición de Dios para tu Negocio
                  <Heart className="w-5 h-5 text-red-500 animate-pulse" />
                </h2>
                <p className="text-slate-200 text-sm leading-relaxed mb-4 italic">
                  "Que el Señor bendiga tu negocio abundantemente. Que cada venta sea próspera, 
                  cada cliente salga satisfecho, y tu esfuerzo sea multiplicado. Que la sabiduría 
                  de Dios guíe cada decisión y su protección cubra este establecimiento. 
                  Que nunca falte el sustento y siempre haya crecimiento. En el nombre de 
                  Jesucristo, que así sea."
                </p>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                  <p className="text-slate-300 text-xs text-center italic leading-relaxed">
                    "Fiel es Dios, que no os dejará ser tentados más de lo que podéis resistir, 
                    sino que dará también juntamente con la tentación la salida, para que podáis soportar."
                  </p>
                  <p className="text-emerald-400 text-xs text-center mt-2 font-bold">
                    1 Corintios 10:13
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Características destacadas */}
          <div className="p-8">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-lg font-bold text-white mb-4 text-center"
            >
              Sistema Profesional Completo
            </motion.h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { icon: TrendingUp, text: 'Control Total de Ventas', color: 'from-emerald-500 to-teal-500' },
                { icon: Shield, text: 'Seguridad Garantizada', color: 'from-purple-500 to-indigo-500' },
                { icon: Zap, text: 'Rendimiento Ultra Rápido', color: 'from-amber-500 to-orange-500' },
                { icon: Star, text: 'Facturación Electrónica', color: 'from-pink-500 to-rose-500' },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 hover:border-emerald-500/50 transition-all group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-slate-200 text-sm font-semibold">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Características adicionales */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="bg-gradient-to-r from-emerald-500/10 to-purple-500/10 rounded-xl p-4 border border-emerald-500/20 mb-6"
            >
              <p className="text-slate-300 text-xs text-center mb-2">
                <strong className="text-emerald-400">✓</strong> 6 Métodos de Pago Locales
                <span className="text-slate-600 mx-2">•</span>
                <strong className="text-emerald-400">✓</strong> Sistema Multi-Tienda
                <span className="text-slate-600 mx-2">•</span>
                <strong className="text-emerald-400">✓</strong> Control Anti-Mermas
              </p>
              <p className="text-slate-300 text-xs text-center">
                <strong className="text-emerald-400">✓</strong> 100% Offline
                <span className="text-slate-600 mx-2">•</span>
                <strong className="text-emerald-400">✓</strong> Sin Costos Recurrentes
                <span className="text-slate-600 mx-2">•</span>
                <strong className="text-emerald-400">✓</strong> Compatible DIAN
              </p>
            </motion.div>

            {/* Botón de inicio */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7 }}
              className="text-center"
            >
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="group relative w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {isStarting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      Iniciando sistema...
                    </>
                  ) : (
                    <>
                      ¡Comenzar ahora!
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
              </button>
              <p className="text-slate-400 text-xs mt-4">
                Los datos del negocio se configuran en <strong className="text-emerald-400">Configuración</strong> después de iniciar
              </p>
            </motion.div>
          </div>

          {/* Footer con otra bendición */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.9 }}
            className="bg-slate-900/50 p-6 border-t border-slate-700/50"
          >
            <p className="text-slate-300 text-xs text-center italic leading-relaxed mb-2">
              "Y poderoso es Dios para hacer que abunde en vosotros toda gracia, 
              a fin de que, teniendo siempre en todas las cosas todo lo suficiente, 
              abundéis para toda buena obra."
            </p>
            <p className="text-amber-400 text-xs text-center font-bold mb-3">
              2 Corintios 9:8
            </p>
            <p className="text-slate-500 text-[10px] text-center">
              © 2026 <span className="text-emerald-400 font-semibold">Codec Studio</span> - 
              Sistema diseñado con excelencia para el mercado colombiano
            </p>
          </motion.div>
        </div>

        {/* Texto final */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.1 }}
          className="mt-4 mb-4 text-center"
        >
          <p className="text-slate-400 text-xs font-medium">
            Que Dios bendiga abundantemente tu negocio y todo el trabajo de tus manos
          </p>
          <p className="text-emerald-500 text-xs mt-1 font-bold">
            ¡Prosperidad y éxito en el nombre de Jesús! 🙏
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}