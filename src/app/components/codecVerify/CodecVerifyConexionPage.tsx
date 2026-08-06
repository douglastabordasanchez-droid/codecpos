import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Shield, Globe, WifiOff, Signal, CheckCircle2, RefreshCw, QrCode, Smartphone, Server, Zap, Bell, DollarSign, ArrowLeft, Wifi, Lock, Copy, Check, AlertCircle, BookOpen,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { confirmarPagoManual } from '../../lib/supabase/codecVerifyService';
import { isLinked } from '../../lib/supabase/tenantLink';

export default function CodecVerifyConexionPage() {
  const { darkMode } = usePOS();
  const { esSuperUsuario, esDesarrollador } = useAuth();
  const navigate = useNavigate();
  
  // Estado local de conexión (sin WebSocket activo automáticamente)
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const [ipAddress, setIpAddress] = useState('');
  const [puerto, setPuerto] = useState('3969');
  const [pin, setPin] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedIP, setCopiedIP] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [clientesConectados, setClientesConectados] = useState(0);
  const [tieneInternet, setTieneInternet] = useState(false);
  const [verificandoInternet, setVerificandoInternet] = useState(true);

  const [codecVerifyActivo, setCodecVerifyActivo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('codecverify_config') || '{}').enabled === true;
    } catch {
      return false;
    }
  });

  const alternarCodecVerifyActivo = () => {
    const nuevoValor = !codecVerifyActivo;
    setCodecVerifyActivo(nuevoValor);
    localStorage.setItem('codecverify_config', JSON.stringify({ enabled: nuevoValor }));
    window.dispatchEvent(new CustomEvent('codecverify:config-changed'));
    toast.success(nuevoValor ? 'Codec Verify activado' : 'Codec Verify desactivado');
  };
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ✅ AUTO-GENERAR PIN AL INICIAR (para administradores)
  useEffect(() => {
    if (esSuperUsuario && !pin) {
      generarPINDesdeServidor();
    }
  }, [esSuperUsuario]);

  // Verificar conexión a internet (prioridad)
  useEffect(() => {
    verificarInternet();
    const interval = setInterval(verificarInternet, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-configuración basada en conectividad
  useEffect(() => {
    if (tieneInternet) {
      detectarIPPublica();
    } else {
      detectarIPLocal();
    }
    actualizarEstadisticas();
    
    const interval = setInterval(actualizarEstadisticas, 5000);
    return () => clearInterval(interval);
  }, [tieneInternet]);

  // Generar QR automáticamente cuando haya IP y PIN
  useEffect(() => {
    if (ipAddress && pin) {
      generarQR();
    }
  }, [ipAddress, puerto, pin]);

  const verificarInternet = async () => {
    setVerificandoInternet(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      await fetch('https://dns.google/resolve?name=google.com&type=A', {
        signal: controller.signal,
        mode: 'no-cors',
      });
      
      clearTimeout(timeoutId);
      setTieneInternet(true);
      console.log('✅ Internet detectado - Modo ONLINE ÓPTIMO');
    } catch (error) {
      setTieneInternet(false);
      console.log('📡 Modo Offline - Funcionalidad limitada');
    } finally {
      setVerificandoInternet(false);
    }
  };

  const detectarIPPublica = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      setIpAddress(data.ip);
      console.log('🌐 IP Pública detectada:', data.ip);
    } catch (error) {
      console.log('Fallback a detección local');
      detectarIPRealLocal();
    }
  };

  const detectarIPRealLocal = async () => {
    try {
      // Método 1: Usar WebRTC para obtener la IP local real
      const pc = new RTCPeerConnection({
        iceServers: []
      });
      
      pc.createDataChannel('');
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      return new Promise<void>((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
            const ipMatch = candidate.match(ipRegex);
            
            if (ipMatch && ipMatch[0]) {
              const localIP = ipMatch[0];
              
              // Evitar IPs de loopback (127.x.x.x)
              if (!localIP.startsWith('127.')) {
                console.log('🖥️ IP Local Real detectada:', localIP);
                setIpAddress(localIP);
                pc.close();
                resolve();
                return;
              }
            }
          }
        };
        
        // Timeout de 3 segundos
        setTimeout(() => {
          pc.close();
          console.log('⚠️ No se pudo detectar IP local, usando localhost');
          setIpAddress('localhost');
          resolve();
        }, 3000);
      });
    } catch (error) {
      console.error('Error detectando IP local:', error);
      setIpAddress('localhost');
    }
  };

  const detectarIPLocal = async () => {
    // Primero intentar obtener IP local real usando WebRTC
    await detectarIPRealLocal();
  };

  const generarPINDesdeServidor = async () => {
    try {
      // ✅ GENERACIÓN 100% LOCAL - SIN DEPENDENCIAS EXTERNAS
      // Generar PIN de 6 dígitos aleatorio
      const localPin = Math.floor(100000 + Math.random() * 900000).toString();
      setPin(localPin);
      
      console.log('🔐 PIN local generado:', localPin);
      toast.success(`PIN generado: ${localPin}`);
      
      // Guardar en localStorage para persistencia
      localStorage.setItem('codec_verify_pin', localPin);
      
    } catch (error) {
      console.error('⚠️ Error generando PIN:', error);
      
      // Fallback adicional
      const fallbackPin = Math.floor(100000 + Math.random() * 900000).toString();
      setPin(fallbackPin);
      toast.warning(`PIN generado localmente: ${fallbackPin}`);
    }
  };

  const actualizarEstadisticas = async () => {
    try {
      const response = await fetch('http://localhost:3969/health');
      const data = await response.json();
      
      if (data.codec_verify_clients !== undefined) {
        setClientesConectados(data.codec_verify_clients);
      }
      
      // ✅ Actualizar estado de conexión cuando el servidor responde
      setConnected(true);
      setConnectionError(null);
    } catch (error) {
      // ❌ Servidor no disponible
      setConnected(false);
      setConnectionError('Servidor no disponible. Asegúrate de que el servidor Node.js esté ejecutándose en el puerto 3969.');
      console.warn('Servidor CodecVerify no disponible:', error);
    }
  };

  const generarQR = async () => {
    try {
      const connectionData = {
        type: 'codecverify_connection',
        ip: ipAddress,
        port: puerto,
        pin: pin,
        mode: tieneInternet ? 'online' : 'offline',
        timestamp: Date.now(),
      };

      const qrString = JSON.stringify(connectionData);
      const dataUrl = await QRCode.toDataURL(qrString, {
        width: 400,
        margin: 2,
        color: {
          dark: darkMode ? '#ffffff' : '#7c3aed',
          light: '#0000',
        },
        errorCorrectionLevel: 'H',
      });

      setQrDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generando QR:', error);
      toast.error('Error al generar código QR');
    }
  };

  const copiarIP = () => {
    navigator.clipboard.writeText(ipAddress);
    setCopiedIP(true);
    toast.success('IP copiada al portapapeles');
    setTimeout(() => setCopiedIP(false), 2000);
  };

  const copiarPin = () => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(true);
    toast.success('PIN copiado al portapapeles');
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const regenerarPIN = () => {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
    setPin(newPin);
    toast.success('PIN regenerado (6 dígitos)');
  };

  const simularPago = async (banco?: string) => {
    if (!isLinked()) {
      toast.error('Esta instalación no está vinculada a un negocio en Supabase', {
        description: 'Ve a Configuración > Sincronización con la Nube para vincularla',
      });
      return;
    }

    const entidad = banco || 'nequi';
    const monto = Math.floor(Math.random() * 500000) + 10000;

    const resultado = await confirmarPagoManual({
      monto,
      entidad,
      referencia: `MANUAL-${Date.now()}`,
    });

    if (resultado.ok) {
      toast.success(`💰 Pago registrado: ${entidad.toUpperCase()} $${monto.toLocaleString('es-CO')}`);
    } else {
      console.error('Error simulando pago:', resultado.error);
      toast.error('Error al registrar el pago', { description: resultado.error });
    }
  };

  // Pantalla principal
  return (
    <div className={`h-screen overflow-y-auto ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900' 
        : 'bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50'
    }`}>
      {/* Barra Superior Glassmorphism */}
      <div className={`sticky top-0 z-50 border-b ${
        darkMode 
          ? 'bg-slate-900/80 border-slate-700 backdrop-blur-xl' 
          : 'bg-white/60 border-purple-200 backdrop-blur-2xl shadow-lg shadow-purple-100/50'
      }`}>
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl ${
              darkMode
                ? 'bg-gradient-to-br from-purple-600 to-violet-700'
                : 'bg-gradient-to-br from-purple-600 to-violet-600'
            } flex items-center justify-center shadow-lg shadow-purple-500/30`}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Codec Verify
              </h1>
              <p className={`text-xs ${
                darkMode ? 'text-purple-400' : 'text-purple-700'
              }`}>
                Panel de Administración
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Activar/Desactivar Codec Verify */}
            <button
              onClick={alternarCodecVerifyActivo}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                codecVerifyActivo
                  ? darkMode
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : darkMode
                    ? 'bg-slate-700/40 text-slate-400 border-slate-600'
                    : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${codecVerifyActivo ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
              {codecVerifyActivo ? 'Codec Verify Activo' : 'Codec Verify Inactivo'}
            </button>

            {/* Estado de Internet */}
            <Badge className={tieneInternet 
              ? darkMode
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : darkMode
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-orange-100 text-orange-700 border-orange-300'
            }>
              {tieneInternet ? (
                <>
                  <Globe className="w-3 h-3 mr-2 animate-pulse" />
                  Online (Recomendado)
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 mr-2" />
                  Red Local
                </>
              )}
            </Badge>

            {/* Estado del Servidor */}
            <Badge className={connected 
              ? darkMode
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-green-100 text-green-700 border-green-300'
              : darkMode
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-red-100 text-red-700 border-red-300'
            }>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`} />
              {connected ? 'Servidor Activo' : 'Servidor Inactivo'}
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/codec-verify/guia')}
              className={darkMode 
                ? 'border-violet-600 text-violet-300 hover:bg-violet-900/30' 
                : 'border-violet-300 text-violet-700 hover:bg-violet-50'
              }
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Guía de Conexión
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
              className={darkMode 
                ? 'border-slate-600 text-slate-300 hover:bg-slate-700' 
                : 'border-purple-300 text-purple-700 hover:bg-purple-50'
              }
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </div>
        </div>
      </div>

      {/* Contenido Principal con Scroll */}
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* ⚠️ ALERTA DE SERVIDOR NO DISPONIBLE */}
        {!connected && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className={`${
              darkMode
                ? 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/40'
                : 'bg-gradient-to-r from-red-50 via-pink-50 to-rose-50 border-red-400 shadow-lg shadow-red-100/50'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-red-600 shadow-lg`}>
                    <Server className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-lg mb-2 ${
                      darkMode ? 'text-red-300' : 'text-red-900'
                    }`}>
                      ⚠️ Codec Verify no está activo en este momento
                    </p>

                    {/* ── VISTA DESARROLLADOR: instrucciones técnicas (SOLO para desarrolladores) ── */}
                    {esDesarrollador ? (
                      <>
                        <p className={`text-sm mb-3 ${darkMode ? 'text-red-400' : 'text-red-800'}`}>
                          El servidor local no está ejecutándose en el puerto 3969. Para usar CodecVerify, debes iniciar el servidor de notificaciones.
                        </p>
                        <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-white/70'}`}>
                          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-800'}`}>
                            📋 Cómo iniciar el servidor:
                          </p>
                          <ol className={`text-xs space-y-1.5 list-decimal list-inside ${darkMode ? 'text-gray-400' : 'text-gray-700'}`}>
                            <li>Abre una terminal o consola de comandos</li>
                            <li>Navega a la carpeta <code className="px-2 py-0.5 rounded bg-slate-700 text-cyan-300 font-mono">server/</code> del proyecto</li>
                            <li>Ejecuta: <code className="px-2 py-0.5 rounded bg-slate-700 text-green-300 font-mono">npm install</code> (solo la primera vez)</li>
                            <li>Ejecuta: <code className="px-2 py-0.5 rounded bg-slate-700 text-green-300 font-mono">npm start</code></li>
                            <li>Verás el mensaje: <span className="font-semibold">"Servidor WebSocket corriendo en puerto 3969"</span></li>
                            <li>Recarga esta página para conectarte</li>
                          </ol>
                        </div>
                      </>
                    ) : (
                      /* ── VISTA CLIENTE: mensaje muy simple y amigable ── */
                      <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-800/60' : 'bg-white/80'}`}>
                        <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          El servicio de notificaciones Nequi está disponible solo en el <strong>Plan Premium</strong>.
                        </p>
                        <div className={`mt-4 flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-emerald-900/30 border border-emerald-700/40' : 'bg-emerald-50 border border-emerald-200'}`}>
                          <span className="text-2xl">👑</span>
                          <div>
                            <p className={`text-xs font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>¿Quieres activar Codec Verify?</p>
                            <p className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                              Contacta a CODEC Studio para actualizar tu plan a Premium.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Banner de Modo de Conexión - PRIORIDAD INTERNET */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className={`${
            tieneInternet
              ? darkMode
                ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30'
                : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-300 shadow-lg shadow-emerald-100/50'
              : darkMode
                ? 'bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/20'
                : 'bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 border-orange-300 shadow-lg shadow-orange-100/50'
          }`}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  tieneInternet
                    ? darkMode
                      ? 'bg-emerald-600'
                      : 'bg-emerald-600'
                    : darkMode
                      ? 'bg-orange-600'
                      : 'bg-orange-600'
                } shadow-lg`}>
                  {tieneInternet ? (
                    <CheckCircle2 className="w-7 h-7 text-white" />
                  ) : (
                    <Signal className="w-7 h-7 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-lg mb-1 ${
                    darkMode 
                      ? tieneInternet ? 'text-emerald-300' : 'text-orange-300'
                      : tieneInternet ? 'text-emerald-900' : 'text-orange-900'
                  }`}>
                    {tieneInternet 
                      ? '🌐 Modo Online Activo - Configuración Óptima' 
                      : '📡 Modo Red Local - Funcionalidad Limitada'
                    }
                  </p>
                  <p className={`text-sm mb-3 ${
                    darkMode 
                      ? tieneInternet ? 'text-emerald-400' : 'text-orange-400'
                      : tieneInternet ? 'text-emerald-800' : 'text-orange-800'
                  }`}>
                    {tieneInternet
                      ? 'Conexión a internet detectada. El lector de mensajes funcionará con fluidez y las notificaciones llegarán al cajero de forma instantánea.'
                      : 'Sin conexión a internet. El sistema funcionará para registros e inventarios, pero las notificaciones de pago pueden retrasarse.'
                    }
                  </p>
                  {!tieneInternet && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      darkMode
                        ? 'bg-orange-500/20'
                        : 'bg-orange-100'
                    }`}>
                      <AlertCircle className={`w-4 h-4 ${
                        darkMode ? 'text-orange-300' : 'text-orange-700'
                      }`} />
                      <p className={`text-xs font-medium ${
                        darkMode ? 'text-orange-200' : 'text-orange-900'
                      }`}>
                        Recomendación: Conecta el POS a internet para una experiencia completa.
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={verificarInternet}
                  variant="ghost"
                  size="sm"
                  disabled={verificandoInternet}
                  className={darkMode ? 'text-white' : 'text-gray-700'}
                >
                  <RefreshCw className={`w-4 h-4 ${verificandoInternet ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Columna Izquierda - QR Code */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className={`${
              darkMode
                ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl'
                : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }`}>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${
                    darkMode 
                      ? 'bg-gradient-to-br from-purple-600 to-violet-700' 
                      : 'bg-gradient-to-br from-purple-600 to-violet-600'
                  } flex items-center justify-center shadow-lg shadow-purple-500/30`}>
                    <QrCode className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Escanea el Código QR
                    </h2>
                    <p className={`text-sm ${
                      darkMode ? 'text-slate-400' : 'text-purple-700'
                    }`}>
                      Conexión automática con la app
                    </p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="relative">
                  <div className={`rounded-3xl p-8 ${
                    darkMode 
                      ? 'bg-gradient-to-br from-slate-700/50 to-slate-800/50' 
                      : 'bg-gradient-to-br from-purple-50/50 to-violet-50/50 backdrop-blur-xl'
                  } flex items-center justify-center border-2 ${
                    darkMode ? 'border-purple-500/20' : 'border-purple-200'
                  }`}>
                    {qrDataUrl ? (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="relative"
                      >
                        <div className={`p-4 rounded-2xl ${
                          darkMode ? 'bg-white' : 'bg-white'
                        } shadow-2xl`}>
                          <img 
                            src={qrDataUrl} 
                            alt="QR Code" 
                            className="w-72 h-72 rounded-xl"
                          />
                        </div>
                        
                        {/* Logo en el centro del QR */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-2xl ${
                            darkMode ? 'bg-purple-600' : 'bg-purple-600'
                          }`}>
                            <Shield className="w-10 h-10 text-white" />
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="w-80 h-80 flex items-center justify-center">
                        <RefreshCw className={`w-12 h-12 animate-spin ${
                          darkMode ? 'text-slate-500' : 'text-purple-400'
                        }`} />
                      </div>
                    )}
                  </div>

                  {/* Esquinas decorativas */}
                  <div className={`absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg ${
                    darkMode ? 'border-purple-500' : 'border-purple-600'
                  }`} />
                  <div className={`absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg ${
                    darkMode ? 'border-purple-500' : 'border-purple-600'
                  }`} />
                  <div className={`absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg ${
                    darkMode ? 'border-purple-500' : 'border-purple-600'
                  }`} />
                  <div className={`absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 rounded-br-lg ${
                    darkMode ? 'border-purple-500' : 'border-purple-600'
                  }`} />
                </div>

                {/* Instrucciones */}
                <div className={`mt-6 p-4 rounded-xl ${
                  darkMode 
                    ? 'bg-purple-500/10 border border-purple-500/20' 
                    : 'bg-purple-100/70 border border-purple-300 backdrop-blur-xl'
                }`}>
                  <div className="flex items-start gap-3">
                    <Smartphone className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      darkMode ? 'text-purple-400' : 'text-purple-700'
                    }`} />
                    <div>
                      <p className={`text-sm font-semibold mb-2 ${
                        darkMode ? 'text-purple-300' : 'text-purple-900'
                      }`}>
                        Cómo conectar:
                      </p>
                      <ol className={`text-xs space-y-1 ${
                        darkMode ? 'text-purple-200' : 'text-purple-800'
                      }`}>
                        <li>1. Abre la app <strong>Codec Verify</strong> en tu celular</li>
                        <li>2. Toca el botón <strong>"Escanear QR"</strong></li>
                        <li>3. Apunta la cámara al código de arriba</li>
                        <li>4. ¡Listo! La conexión será automática</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Botón Regenerar */}
                <Button
                  onClick={generarQR}
                  className={`w-full mt-4 ${
                    darkMode
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 shadow-lg shadow-purple-500/30'
                  }`}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerar Código QR
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Columna Derecha - Conexión Manual */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Datos de Conexión */}
            <Card className={`${
              darkMode
                ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl'
                : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }`}>
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl ${
                      darkMode 
                        ? 'bg-gradient-to-br from-blue-600 to-cyan-700' 
                        : 'bg-gradient-to-br from-blue-600 to-cyan-600'
                    } flex items-center justify-center shadow-lg shadow-blue-500/30`}>
                      <Server className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className={`text-xl font-bold ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Datos de Conexión
                      </h2>
                      <p className={`text-sm ${
                        darkMode ? 'text-slate-400' : 'text-blue-700'
                      }`}>
                        Configuración manual
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Dirección IP con botón de copiado */}
                  <div className="space-y-2">
                    <Label className={`flex items-center gap-2 ${
                      darkMode ? 'text-slate-300' : 'text-gray-700'
                    }`}>
                      {tieneInternet ? (
                        <Globe className="w-4 h-4" />
                      ) : (
                        <Wifi className="w-4 h-4" />
                      )}
                      {tieneInternet ? 'IP Pública' : 'IP Local'}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={ipAddress}
                        readOnly
                        className={`flex-1 ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-white'
                            : 'bg-purple-50/50 border-purple-300 text-gray-900 backdrop-blur-xl'
                        } font-mono text-lg h-14 cursor-default`}
                      />
                      <Button
                        onClick={copiarIP}
                        variant="outline"
                        size="icon"
                        className={`h-14 w-14 ${
                          darkMode
                            ? 'border-slate-600'
                            : 'border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        {copiedIP ? (
                          <Check className="w-5 h-5 text-green-500" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Puerto */}
                  <div className="space-y-2">
                    <Label className={`flex items-center gap-2 ${
                      darkMode ? 'text-slate-300' : 'text-gray-700'
                    }`}>
                      <Server className="w-4 h-4" />
                      Puerto
                    </Label>
                    <Input
                      value={puerto}
                      readOnly
                      className={`${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-white'
                          : 'bg-purple-50/50 border-purple-300 text-gray-900 backdrop-blur-xl'
                      } font-mono text-lg h-14 cursor-default`}
                    />
                  </div>

                  {/* PIN de Conexión (6 dígitos) con copiado */}
                  <div className="space-y-2">
                    <Label className={`flex items-center justify-between ${
                      darkMode ? 'text-slate-300' : 'text-gray-700'
                    }`}>
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        PIN de Conexión (6 dígitos)
                      </span>
                      <Button
                        onClick={regenerarPIN}
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Regenerar
                      </Button>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={pin}
                        readOnly
                        className={`flex-1 ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-white'
                            : 'bg-purple-50/50 border-purple-300 text-gray-900 backdrop-blur-xl'
                        } font-mono text-lg h-14 tracking-widest text-center cursor-default`}
                      />
                      <Button
                        onClick={copiarPin}
                        variant="outline"
                        size="icon"
                        className={`h-14 w-14 ${
                          darkMode
                            ? 'border-slate-600'
                            : 'border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        {copiedPin ? (
                          <Check className="w-5 h-5 text-green-500" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Info de seguridad */}
                <div className={`mt-6 p-4 rounded-xl ${
                  darkMode 
                    ? 'bg-amber-500/10 border border-amber-500/20' 
                    : 'bg-amber-100/70 border border-amber-300 backdrop-blur-xl'
                }`}>
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      darkMode ? 'text-amber-400' : 'text-amber-700'
                    }`} />
                    <div>
                      <p className={`text-sm font-semibold mb-1 ${
                        darkMode ? 'text-amber-300' : 'text-amber-900'
                      }`}>
                        Importante
                      </p>
                      <p className={`text-xs ${
                        darkMode ? 'text-amber-200' : 'text-amber-800'
                      }`}>
                        {tieneInternet 
                          ? 'Con internet, puedes conectarte desde cualquier ubicación usando la IP pública. Las notificaciones llegarán de forma instantánea.'
                          : 'Sin internet, asegúrate de estar conectado a la misma red WiFi del POS. Las notificaciones pueden retrasarse.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Estadísticas */}
            <Card className={`${
              darkMode
                ? 'bg-gradient-to-br from-emerald-500/10 to-teal-600/10 border-emerald-500/20'
                : 'bg-gradient-to-br from-emerald-100/70 via-teal-100/70 to-cyan-100/70 border-emerald-300 backdrop-blur-xl shadow-lg shadow-emerald-100/50'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className={`w-8 h-8 ${
                      darkMode ? 'text-emerald-400' : 'text-emerald-700'
                    }`} />
                    <div>
                      <p className={`text-sm font-medium ${
                        darkMode ? 'text-emerald-300' : 'text-emerald-800'
                      }`}>
                        Dispositivos Conectados
                      </p>
                      <p className={`text-3xl font-black ${
                        darkMode ? 'text-white' : 'text-emerald-900'
                      }`}>
                        {clientesConectados}
                      </p>
                    </div>
                  </div>
                  <div className={`w-16 h-16 rounded-full ${
                    darkMode 
                      ? 'bg-emerald-500/20' 
                      : 'bg-emerald-300/50 backdrop-blur-xl'
                  } flex items-center justify-center`}>
                    <Smartphone className={`w-8 h-8 ${
                      darkMode ? 'text-emerald-400' : 'text-emerald-800'
                    }`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info adicional */}
            <Card className={`${
              darkMode
                ? 'bg-slate-800/30 border-slate-700/50'
                : 'bg-white/50 border-purple-200 backdrop-blur-xl'
            }`}>
              <CardContent className="p-6">
                <h3 className={`font-bold mb-3 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  ¿Qué es Codec Verify?
                </h3>
                <p className={`text-sm ${
                  darkMode ? 'text-slate-400' : 'text-gray-700'
                }`}>
                  Aplicación móvil que te permite recibir notificaciones instantáneas 
                  de pagos desde tu celular. Verifica transacciones de Nequi, Daviplata, 
                  Bancolombia y más en tiempo real.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sección de Testing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <Card className={`${
            darkMode
              ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20'
              : 'bg-gradient-to-br from-orange-100/70 via-red-100/70 to-pink-100/70 border-orange-300 backdrop-blur-xl shadow-lg shadow-orange-100/50'
          }`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl ${
                  darkMode 
                    ? 'bg-gradient-to-br from-orange-500 to-red-600' 
                    : 'bg-gradient-to-br from-orange-600 to-red-700'
                } flex items-center justify-center shadow-lg shadow-orange-500/30`}>
                  <Bell className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Panel de Testing
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-800'}`}>
                    Simula notificaciones de pagos para probar el sistema
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Button
                  onClick={() => simularPago()}
                  className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg shadow-purple-500/30"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Pago Aleatorio
                </Button>
                
                <Button
                  onClick={() => simularPago('nequi')}
                  className="bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white shadow-lg shadow-purple-500/30"
                >
                  💜 Nequi
                </Button>
                
                <Button
                  onClick={() => simularPago('daviplata')}
                  className="bg-gradient-to-br from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white shadow-lg shadow-red-500/30"
                >
                  ❤️ Daviplata
                </Button>
                
                <Button
                  onClick={() => simularPago('bancolombia')}
                  className="bg-gradient-to-br from-yellow-600 to-yellow-800 hover:from-yellow-700 hover:to-yellow-900 text-white shadow-lg shadow-yellow-500/30"
                >
                  💛 Bancolombia
                </Button>
                
                <Button
                  onClick={() => simularPago('dale')}
                  className="bg-gradient-to-br from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white shadow-lg shadow-green-500/30"
                >
                  💚 Dale
                </Button>
              </div>

              <div className={`mt-4 p-3 rounded-lg text-xs ${
                darkMode 
                  ? 'bg-slate-800/50 text-slate-400' 
                  : 'bg-white/50 text-gray-700 backdrop-blur-xl'
              }`}>
                <strong>Instrucciones:</strong> Haz clic en cualquier botón para simular un pago entrante. 
                La notificación aparecerá en pantalla completa con los detalles del pago.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Espacio adicional al final para scroll */}
        <div className="h-20" />
      </div>
    </div>
  );
}