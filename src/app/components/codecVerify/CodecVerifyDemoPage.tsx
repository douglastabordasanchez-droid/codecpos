import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Smartphone,
  Monitor,
  Settings,
  Shield,
  Zap,
  ArrowRight,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CodecVerifyMobile } from './CodecVerifyMobile';
import { CodecVerifyWidget } from './CodecVerifyWidget';
import { AlertaPagoEntrante, useCodecVerify } from './AlertaPagoEntrante';
import { AuditoriaDigital } from './AuditoriaDigital';
import { EsperandoSeñal } from './EsperandoSeñal';
import { ConfiguradorParser } from './ConfiguradorParser';
import { QRCodePOS } from './QRCodePOS';
import { usePOS } from '../../contexts/POSContext';
import { useNavigate } from 'react-router';

type Vista = 'demo' | 'mobile' | 'pos' | 'configuracion';

export default function CodecVerifyDemoPage() {
  const { darkMode } = usePOS();
  const [vista, setVista] = useState<Vista>('demo');
  const [estadoSeñal, setEstadoSeñal] = useState<'esperando' | 'verificado' | 'error'>('esperando');
  const { pagoEntrante, simularPagoEntrante, vincularPago, descartarPago } = useCodecVerify();

  const simularVerificacion = () => {
    setEstadoSeñal('esperando');
    setTimeout(() => {
      setEstadoSeñal('verificado');
      setTimeout(() => setEstadoSeñal('esperando'), 3000);
    }, 3000);
  };

  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      {/* Barra Superior Fija */}
      <div className={`sticky top-0 z-50 border-b backdrop-blur-xl ${
        darkMode 
          ? 'bg-slate-900/80 border-slate-700' 
          : 'bg-white/80 border-gray-200'
      }`}>
        <div className="flex items-center justify-between px-6 py-4">
          {/* Título */}
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-500" />
            <div>
              <h1 className={`text-2xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Codec Verify
              </h1>
              <p className={`text-xs ${
                darkMode ? 'text-purple-400' : 'text-purple-600'
              }`}>
                Sistema de Verificación de Pagos
              </p>
            </div>
          </div>

          {/* Navegación de Vistas */}
          <div className="flex items-center gap-2">
            {/* Botón Volver */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>

            <div className="w-px h-6 bg-slate-600 mx-1" /> {/* Separador */}

            <Button
              variant={vista === 'demo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVista('demo')}
              className={vista === 'demo' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            >
              <Home className="w-4 h-4 mr-2" />
              Inicio
            </Button>
            <Button
              variant={vista === 'mobile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVista('mobile')}
              className={vista === 'mobile' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              App Móvil
            </Button>
            <Button
              variant={vista === 'pos' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVista('pos')}
              className={vista === 'pos' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              <Monitor className="w-4 h-4 mr-2" />
              POS
            </Button>
            <Button
              variant={vista === 'configuracion' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVista('configuracion')}
              className={vista === 'configuracion' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              <Settings className="w-4 h-4 mr-2" />
              Config
            </Button>
          </div>
        </div>
      </div>

      {/* Contenido con Scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {vista === 'demo' && (
            <div className="max-w-6xl mx-auto space-y-8">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
              >
                <div className="flex items-center justify-center gap-3">
                  <Shield className="w-16 h-16 text-purple-400" />
                  <h1 className="text-5xl font-bold text-white">Codec Verify</h1>
                </div>
                <p className="text-purple-300 text-xl max-w-2xl mx-auto">
                  Sistema de Verificación de Pagos Digitales en Tiempo Real
                </p>
                <div className="flex items-center justify-center gap-4 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <span>Velocidad</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-green-400" />
                    <span>Seguridad</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-blue-400" />
                    <span>Autonomía</span>
                  </div>
                </div>
              </motion.div>

              {/* Arquitectura Híbrida */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-2xl">Arquitectura Híbrida</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* App Móvil */}
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 border-2 border-purple-500/30 rounded-2xl p-6 space-y-4 cursor-pointer"
                      onClick={() => setVista('mobile')}
                    >
                      <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                        <Smartphone className="w-10 h-10 text-white" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-white font-bold text-xl mb-2">Emisor</h3>
                        <p className="text-purple-300 text-sm mb-4">App Móvil</p>
                        <ul className="text-left text-slate-300 text-sm space-y-2">
                          <li>✓ Escaneo de QR</li>
                          <li>✓ Gestión de notificaciones</li>
                          <li>✓ Monitor en tiempo real</li>
                          <li>✓ Servicio de fondo</li>
                        </ul>
                      </div>
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        Ver Demo
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </motion.div>

                    {/* Software POS */}
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border-2 border-green-500/30 rounded-2xl p-6 space-y-4 cursor-pointer"
                      onClick={() => setVista('pos')}
                    >
                      <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto">
                        <Monitor className="w-10 h-10 text-white" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-white font-bold text-xl mb-2">Receptores</h3>
                        <p className="text-green-300 text-sm mb-4">Software POS</p>
                        <ul className="text-left text-slate-300 text-sm space-y-2">
                          <li>✓ Widget de estado</li>
                          <li>✓ Alertas de pago</li>
                          <li>✓ Auditoría digital</li>
                          <li>✓ Vinculación rápida</li>
                        </ul>
                      </div>
                      <Button className="w-full bg-green-600 hover:bg-green-700">
                        Ver Demo
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>

              {/* Demos Rápidos */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Widget de Estado */}
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Widget de Estado (POS)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-center">
                      <CodecVerifyWidget />
                    </div>
                    <p className="text-slate-400 text-sm mt-4 text-center">
                      Se muestra en el navbar del POS indicando el estado de conexión
                    </p>
                  </CardContent>
                </Card>

                {/* Estado Esperando Señal */}
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Esperando Señal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EsperandoSeñal
                      estado={estadoSeñal}
                      monto={45000}
                      banco="Nequi"
                    />
                    <Button
                      onClick={simularVerificacion}
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
                    >
                      Simular Verificación
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Botón Simular Pago */}
              <div className="text-center pb-8">
                <Button
                  onClick={simularPagoEntrante}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8 py-6"
                >
                  <Zap className="w-6 h-6 mr-2" />
                  Simular Pago Entrante (Popup)
                </Button>
                <p className="text-slate-400 text-sm mt-2">
                  Prueba el popup de alerta que aparece cuando se recibe un pago
                </p>
              </div>

              {/* Versículo Bíblico */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center space-y-4 py-8"
              >
                <div className="max-w-3xl mx-auto bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-2xl p-8">
                  <p className="text-purple-300 text-lg leading-relaxed italic mb-4">
                    "Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, 
                    esto es, a los que conforme a su propósito son llamados."
                  </p>
                  <p className="text-purple-400 font-semibold text-sm">
                    — Romanos 8:28
                  </p>
                </div>
              </motion.div>

              {/* Footer */}
              <div className="text-center pb-12">
                <div className="inline-flex items-center gap-2 text-slate-500 text-sm">
                  <Shield className="w-4 h-4" />
                  <span>© Codecpos – Codec Studio</span>
                </div>
              </div>
            </div>
          )}

          {vista === 'mobile' && (
            <div className="max-w-2xl mx-auto pb-8">
              <CodecVerifyMobile />
            </div>
          )}

          {vista === 'pos' && (
            <div className="max-w-6xl mx-auto space-y-6 pb-8">
              <h2 className="text-3xl font-bold text-white">Software POS - Componentes</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <QRCodePOS />
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Simular Alerta de Pago</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={simularPagoEntrante}
                      className="w-full bg-purple-600 hover:bg-purple-700 h-32 text-lg"
                    >
                      <Zap className="w-8 h-8 mr-2" />
                      Generar Alerta de Pago
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <AuditoriaDigital />
            </div>
          )}

          {vista === 'configuracion' && (
            <div className="max-w-4xl mx-auto space-y-6 pb-8">
              <ConfiguradorParser />
            </div>
          )}
        </div>
      </div>

      {/* Alerta de Pago (Global) */}
      <AlertaPagoEntrante
        pago={pagoEntrante}
        onVincular={vincularPago}
        onDescartar={descartarPago}
      />
    </div>
  );
}