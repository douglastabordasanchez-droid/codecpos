import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Shield, Globe, WifiOff, CheckCircle2, RefreshCw, QrCode, Smartphone, Zap, Bell, DollarSign, ArrowLeft, Link2, Copy, Check, AlertCircle, BookOpen, Store,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { usePOS } from '../../contexts/POSContext';
import { useNavigate } from 'react-router';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { confirmarPagoManual } from '../../lib/supabase/codecVerifyService';
import { isLinked, getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { getSupabaseClient } from '../../lib/supabase/config';

// URL pública de la PWA — escanear el QR abre esta página en el celular. El
// login del empleado (ya ligado a un cliente_id) es lo que realmente "une"
// el celular con este negocio; el QR solo evita tener que escribir la URL.
const PWA_URL = 'https://codecpos.vercel.app';

export default function CodecVerifyConexionPage() {
  const { darkMode } = usePOS();
  const navigate = useNavigate();

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [tieneInternet, setTieneInternet] = useState(false);
  const [verificandoInternet, setVerificandoInternet] = useState(true);
  const [vinculado, setVinculado] = useState(isLinked());
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null);

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

  // Verificar conexión a internet
  useEffect(() => {
    verificarInternet();
    const interval = setInterval(verificarInternet, 10000);
    return () => clearInterval(interval);
  }, []);

  // Estado de vinculación con Supabase + nombre del negocio vinculado
  useEffect(() => {
    setVinculado(isLinked());
    const clienteId = getLinkedClienteId();
    const client = getSupabaseClient();
    if (!clienteId || !client) {
      setNombreNegocio(null);
      return;
    }
    client
      .from('clientes_pos')
      .select('nombre_negocio')
      .eq('id', clienteId)
      .maybeSingle()
      .then(({ data }) => setNombreNegocio((data as { nombre_negocio: string } | null)?.nombre_negocio || null));
  }, []);

  // Generar el QR de acceso a la PWA una sola vez
  useEffect(() => {
    QRCode.toDataURL(PWA_URL, {
      width: 400,
      margin: 2,
      color: {
        dark: darkMode ? '#ffffff' : '#7c3aed',
        light: '#0000',
      },
      errorCorrectionLevel: 'H',
    })
      .then(setQrDataUrl)
      .catch(() => toast.error('Error al generar código QR'));
  }, [darkMode]);

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
    } catch {
      setTieneInternet(false);
    } finally {
      setVerificandoInternet(false);
    }
  };

  const copiarUrl = () => {
    navigator.clipboard.writeText(PWA_URL);
    setCopiedUrl(true);
    toast.success('Enlace copiado al portapapeles');
    setTimeout(() => setCopiedUrl(false), 2000);
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
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Codec Verify
              </h1>
              <p className={`text-xs ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>
                Panel de Administración
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

            <Badge className={vinculado
              ? darkMode
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : darkMode
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-red-100 text-red-700 border-red-300'
            }>
              <Link2 className="w-3 h-3 mr-2" />
              {vinculado ? 'Vinculado a Supabase' : 'Sin vincular'}
            </Badge>

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
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 mr-2" />
                  Sin internet
                </>
              )}
            </Badge>

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

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Alerta real: falta vincular esta instalación a Supabase */}
        {!vinculado && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <Card className={darkMode
              ? 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/40'
              : 'bg-gradient-to-r from-red-50 via-pink-50 to-rose-50 border-red-400 shadow-lg shadow-red-100/50'
            }>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-red-600 shadow-lg">
                    <Link2 className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-lg mb-2 ${darkMode ? 'text-red-300' : 'text-red-900'}`}>
                      Esta instalación no está vinculada a un negocio en Supabase
                    </p>
                    <p className={`text-sm mb-3 ${darkMode ? 'text-red-400' : 'text-red-800'}`}>
                      Codec Verify necesita que esta caja esté vinculada para recibir notificaciones de pago en tiempo real.
                    </p>
                    <Button
                      onClick={() => navigate('/configuracion')}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Ir a Configuración &gt; Sincronización
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Codec Verify vinculado pero apagado */}
        {vinculado && !codecVerifyActivo && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <Card className={darkMode
              ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30'
              : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300'
            }>
              <CardContent className="p-6 flex items-center justify-between gap-4">
                <div>
                  <p className={`font-bold ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>
                    Codec Verify está vinculado pero apagado
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                    Actívalo con el interruptor de arriba para empezar a recibir notificaciones de pago.
                  </p>
                </div>
                <Button onClick={alternarCodecVerifyActivo} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
                  Activar
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Banner de conectividad */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Card className={tieneInternet
            ? darkMode
              ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30'
              : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-300 shadow-lg shadow-emerald-100/50'
            : darkMode
              ? 'bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/20'
              : 'bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 border-orange-300 shadow-lg shadow-orange-100/50'
          }>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  tieneInternet ? 'bg-emerald-600' : 'bg-orange-600'
                } shadow-lg`}>
                  {tieneInternet ? <CheckCircle2 className="w-7 h-7 text-white" /> : <WifiOff className="w-7 h-7 text-white" />}
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-lg mb-1 ${
                    darkMode ? (tieneInternet ? 'text-emerald-300' : 'text-orange-300') : (tieneInternet ? 'text-emerald-900' : 'text-orange-900')
                  }`}>
                    {tieneInternet ? '🌐 Conectado a internet' : '📡 Sin conexión a internet'}
                  </p>
                  <p className={`text-sm ${
                    darkMode ? (tieneInternet ? 'text-emerald-400' : 'text-orange-400') : (tieneInternet ? 'text-emerald-800' : 'text-orange-800')
                  }`}>
                    {tieneInternet
                      ? 'Las notificaciones de pago llegarán al celular de forma instantánea vía Supabase Realtime.'
                      : 'Codec Verify necesita internet para funcionar — las notificaciones no llegarán hasta reconectar.'}
                  </p>
                </div>
                <Button onClick={verificarInternet} variant="ghost" size="sm" disabled={verificandoInternet} className={darkMode ? 'text-white' : 'text-gray-700'}>
                  <RefreshCw className={`w-4 h-4 ${verificandoInternet ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Columna Izquierda - QR de acceso a la app */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Card className={darkMode
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl'
              : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${
                    darkMode ? 'bg-gradient-to-br from-purple-600 to-violet-700' : 'bg-gradient-to-br from-purple-600 to-violet-600'
                  } flex items-center justify-center shadow-lg shadow-purple-500/30`}>
                    <QrCode className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Escanea para abrir la app
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-purple-700'}`}>
                      Con la cámara de tu celular — no necesitas una app especial
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div className={`rounded-3xl p-8 ${
                    darkMode ? 'bg-gradient-to-br from-slate-700/50 to-slate-800/50' : 'bg-gradient-to-br from-purple-50/50 to-violet-50/50 backdrop-blur-xl'
                  } flex items-center justify-center border-2 ${darkMode ? 'border-purple-500/20' : 'border-purple-200'}`}>
                    {qrDataUrl ? (
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }} className="relative">
                        <div className="p-4 rounded-2xl bg-white shadow-2xl">
                          <img src={qrDataUrl} alt="QR de acceso a CODEC POS" className="w-72 h-72 rounded-xl" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-16 h-16 rounded-xl flex items-center justify-center shadow-2xl bg-purple-600">
                            <Shield className="w-10 h-10 text-white" />
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="w-80 h-80 flex items-center justify-center">
                        <RefreshCw className={`w-12 h-12 animate-spin ${darkMode ? 'text-slate-500' : 'text-purple-400'}`} />
                      </div>
                    )}
                  </div>
                </div>

                <div className={`mt-6 p-4 rounded-xl ${darkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-100/70 border border-purple-300 backdrop-blur-xl'}`}>
                  <div className="flex items-start gap-3">
                    <Smartphone className={`w-5 h-5 mt-0.5 flex-shrink-0 ${darkMode ? 'text-purple-400' : 'text-purple-700'}`} />
                    <div>
                      <p className={`text-sm font-semibold mb-2 ${darkMode ? 'text-purple-300' : 'text-purple-900'}`}>Cómo conectar tu celular:</p>
                      <ol className={`text-xs space-y-1 ${darkMode ? 'text-purple-200' : 'text-purple-800'}`}>
                        <li>1. Escanea este código con la cámara de tu celular</li>
                        <li>2. Se abrirá la app CODEC POS en el navegador</li>
                        <li>3. Inicia sesión con tu cuenta de empleado</li>
                        <li>4. Listo — quedará conectada a este mismo negocio automáticamente</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Columna Derecha */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-6">
            <Card className={darkMode
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl'
              : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${
                    darkMode ? 'bg-gradient-to-br from-blue-600 to-cyan-700' : 'bg-gradient-to-br from-blue-600 to-cyan-600'
                  } flex items-center justify-center shadow-lg shadow-blue-500/30`}>
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Estado de la conexión</h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-blue-700'}`}>Negocio y enlace de la app</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-900/50' : 'bg-purple-50/50'}`}>
                    <p className={`text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Negocio vinculado</p>
                    <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {vinculado ? (nombreNegocio || 'Cargando...') : 'Ninguno — vincula esta caja primero'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Enlace directo a la app (por si prefieres escribirlo)</p>
                    <div className="flex gap-2">
                      <div className={`flex-1 px-4 h-12 rounded-lg flex items-center font-mono text-sm ${
                        darkMode ? 'bg-slate-900/50 border border-slate-600 text-white' : 'bg-purple-50/50 border border-purple-300 text-gray-900'
                      }`}>
                        {PWA_URL}
                      </div>
                      <Button onClick={copiarUrl} variant="outline" size="icon" className={`h-12 w-12 ${darkMode ? 'border-slate-600' : 'border-purple-300 hover:bg-purple-50'}`}>
                        {copiedUrl ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={darkMode
              ? 'bg-slate-800/30 border-slate-700/50'
              : 'bg-white/50 border-purple-200 backdrop-blur-xl'
            }>
              <CardContent className="p-6">
                <h3 className={`font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>¿Qué es Codec Verify?</h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-700'}`}>
                  Recibe notificaciones instantáneas de pagos desde tu celular. Verifica transacciones de Nequi,
                  Daviplata, Bancolombia y más en tiempo real, sin depender de ningún servidor local.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sección de Testing */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-8">
          <Card className={darkMode
            ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20'
            : 'bg-gradient-to-br from-orange-100/70 via-red-100/70 to-pink-100/70 border-orange-300 backdrop-blur-xl shadow-lg shadow-orange-100/50'
          }>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl ${
                  darkMode ? 'bg-gradient-to-br from-orange-500 to-red-600' : 'bg-gradient-to-br from-orange-600 to-red-700'
                } flex items-center justify-center shadow-lg shadow-orange-500/30`}>
                  <Bell className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Panel de Testing</h3>
                  <p className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-800'}`}>Simula notificaciones de pagos para probar el sistema</p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Button onClick={() => simularPago()} className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg shadow-purple-500/30">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Pago Aleatorio
                </Button>
                <Button onClick={() => simularPago('nequi')} className="bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white shadow-lg shadow-purple-500/30">
                  💜 Nequi
                </Button>
                <Button onClick={() => simularPago('daviplata')} className="bg-gradient-to-br from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white shadow-lg shadow-red-500/30">
                  ❤️ Daviplata
                </Button>
                <Button onClick={() => simularPago('bancolombia')} className="bg-gradient-to-br from-yellow-600 to-yellow-800 hover:from-yellow-700 hover:to-yellow-900 text-white shadow-lg shadow-yellow-500/30">
                  💛 Bancolombia
                </Button>
                <Button onClick={() => simularPago('dale')} className="bg-gradient-to-br from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white shadow-lg shadow-green-500/30">
                  💚 Dale
                </Button>
              </div>

              <div className={`mt-4 p-3 rounded-lg text-xs ${darkMode ? 'bg-slate-800/50 text-slate-400' : 'bg-white/50 text-gray-700 backdrop-blur-xl'}`}>
                <strong>Instrucciones:</strong> Haz clic en cualquier botón para simular un pago entrante. La notificación
                aparecerá en el celular conectado con Codec Verify activo.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="h-20" />
      </div>
    </div>
  );
}
