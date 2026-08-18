import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Shield, Globe, WifiOff, CheckCircle2, RefreshCw, QrCode, Smartphone, Zap, Bell, DollarSign, ArrowLeft, Link2, Copy, Check, AlertCircle, BookOpen, Store, Volume2, VolumeX, Users, XCircle, Eye, EyeOff, ChevronDown, Mail, ShieldCheck,
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
import { getSupabaseClient, getSupabasePublicConfig } from '../../lib/supabase/config';
import { verificarPassword } from '../../lib/passwordHash';
import { isVozActiva, setVozActiva, anunciarPagoRecibido, listarVocesEspanol, getVozSeleccionada, setVozSeleccionada, motorEmbebidoDisponible, PIPER_VOICE_ID } from '../../lib/voz';

// Link oficial para instalar MacroDroid — se ofrece para copiar/enviar al celular
// desde la sección "Por SMS" de las instrucciones de automatización.
const MACRODROID_URL = 'https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid';
const GOOGLE_SCRIPT_URL = 'https://script.google.com';

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
  const [celulares, setCelulares] = useState<{ id: string; nombre_completo: string; codec_verify_activo: boolean; codec_verify_actualizado_en: string | null }[]>([]);
  const [cargandoCelulares, setCargandoCelulares] = useState(true);

  // 🔑 Automatización de pagos (token + webhook) — mismo panel que ya existe
  // en Configuración de la app móvil, portado aquí porque el dueño lo
  // necesitaba también desde Electron para entender y probar el flujo
  // completo sin tener que ir al celular.
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [cargandoToken, setCargandoToken] = useState(true);
  const [generandoToken, setGenerandoToken] = useState(false);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [mostrarGuiaToken, setMostrarGuiaToken] = useState(false);
  const [copiadoToken, setCopiadoToken] = useState<'token' | 'url' | 'script' | 'gscript_link' | 'macrodroid_link' | 'macrodroid_notif_link' | 'json_nequi' | 'json_daviplata' | 'json_bancolombia' | 'apikey' | 'authorization' | null>(null);

  // 🔒 La sección de abajo expone el token de automatización + la clave anon
  // de Supabase — cualquiera con eso puede insertar "pagos confirmados"
  // falsos. Se pide la contraseña del usuario ya logueado antes de revelarla
  // (no es una cuenta nueva ni un rol nuevo, solo re-confirmar quién eres).
  const [automatizacionDesbloqueada, setAutomatizacionDesbloqueada] = useState(false);
  const [passwordVerificacion, setPasswordVerificacion] = useState('');
  const [verificandoPassword, setVerificandoPassword] = useState(false);

  const verificarAccesoAutomatizacion = () => {
    // Se valida contra la contraseña del usuario "Admin" (el dueño/maestro),
    // no la del usuario actualmente logueado en este terminal — un cajero no
    // debe poder desbloquear esto con su propia contraseña.
    setVerificandoPassword(true);
    let adminPassword: string | undefined;
    try {
      const usuarios = JSON.parse(localStorage.getItem('codecpos_usuarios') || '[]');
      adminPassword = usuarios.find((u: any) => u.username === 'Admin')?.password;
    } catch { /* ignore */ }
    const resultado = verificarPassword(passwordVerificacion, adminPassword);
    setVerificandoPassword(false);
    if (!resultado.valido) {
      toast.error('Contraseña incorrecta');
      return;
    }
    setAutomatizacionDesbloqueada(true);
    setPasswordVerificacion('');
  };

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
    localStorage.setItem(
      'codecverify_config',
      JSON.stringify({ ...JSON.parse(localStorage.getItem('codecverify_config') || '{}'), enabled: nuevoValor })
    );
    window.dispatchEvent(new CustomEvent('codecverify:config-changed'));
    toast.success(nuevoValor ? 'Codec Verify activado' : 'Codec Verify desactivado');
  };

  const [vozActiva, setVozActivaState] = useState(() => isVozActiva());
  const [vocesDisponibles, setVocesDisponibles] = useState<SpeechSynthesisVoice[]>([]);
  const [vozSeleccionada, setVozSeleccionadaState] = useState(() => getVozSeleccionada() || '');
  const [motorEmbebido, setMotorEmbebido] = useState<boolean | null>(null);

  // Las voces del sistema casi nunca están listas de inmediato — Chrome las
  // carga async y dispara 'voiceschanged' cuando por fin están disponibles.
  // Solo importa si NO hay motor embebido (ver motorEmbebidoDisponible abajo).
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const cargarVoces = () => setVocesDisponibles(listarVocesEspanol());
    cargarVoces();
    window.speechSynthesis.onvoiceschanged = cargarVoces;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Este build de Electron ¿trae el motor de voz embebido (Piper, Daniela)?
  // Si sí, no tiene sentido mostrarle al usuario un selector de voces del
  // sistema operativo — siempre va a sonar con la misma voz latina, sin
  // depender de qué tenga instalado Windows.
  useEffect(() => {
    motorEmbebidoDisponible().then(setMotorEmbebido);
  }, []);

  const alternarVoz = () => {
    const nuevoValor = !vozActiva;
    setVozActivaState(nuevoValor);
    setVozActiva(nuevoValor);
    toast.success(nuevoValor ? '🔊 Anuncio de voz activado' : '🔇 Anuncio de voz desactivado');
    if (nuevoValor) anunciarPagoRecibido(50000, 'nequi');
  };

  const cambiarVoz = (voiceURI: string) => {
    setVozSeleccionadaState(voiceURI);
    setVozSeleccionada(voiceURI);
    anunciarPagoRecibido(50000, 'nequi');
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

  // 📱 Estado de Codec Verify en los celulares del equipo — antes Electron no
  // tenía forma de saber si un empleado ya activó el interruptor en SU
  // celular (vivía solo en el localStorage del teléfono). Ver migración 0041.
  useEffect(() => {
    const clienteId = getLinkedClienteId();
    const client = getSupabaseClient();
    if (!clienteId || !client) { setCargandoCelulares(false); return; }

    const cargar = () => {
      client
        .from('empleados')
        .select('id, nombre_completo, codec_verify_activo, codec_verify_actualizado_en')
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('nombre_completo')
        .then(({ data }) => {
          setCelulares((data as typeof celulares) || []);
          setCargandoCelulares(false);
        });
    };

    cargar();
    const canal = client
      .channel(`codec-verify-empleados-${clienteId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'empleados', filter: `cliente_id=eq.${clienteId}` }, cargar)
      .subscribe();
    const interval = setInterval(cargar, 30000);

    return () => { client.removeChannel(canal); clearInterval(interval); };
  }, []);

  // Token de automatización — mismo dato que clientes_pos.webhook_token que ya usa la PWA.
  useEffect(() => {
    const clienteId = getLinkedClienteId();
    const client = getSupabaseClient();
    if (!clienteId || !client) { setCargandoToken(false); return; }
    client
      .from('clientes_pos')
      .select('webhook_token')
      .eq('id', clienteId)
      .maybeSingle()
      .then(({ data }) => {
        setWebhookToken((data as { webhook_token: string | null } | null)?.webhook_token || null);
        setCargandoToken(false);
      });
  }, []);

  const rotarToken = async () => {
    const clienteId = getLinkedClienteId();
    const client = getSupabaseClient();
    if (!clienteId || !client) return;
    setGenerandoToken(true);
    const { data, error } = await client.rpc('rotar_webhook_token', { p_cliente_id: clienteId });
    setGenerandoToken(false);
    if (error) {
      toast.error('No se pudo generar el token', { description: error.message });
      return;
    }
    setWebhookToken(data as string);
    setMostrarToken(true);
  };

  const copiarTextoToken = (texto: string, cual: 'token' | 'url' | 'script' | 'gscript_link' | 'macrodroid_link' | 'macrodroid_notif_link' | 'json_nequi' | 'json_daviplata' | 'json_bancolombia' | 'apikey' | 'authorization') => {
    navigator.clipboard.writeText(texto);
    setCopiadoToken(cual);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopiadoToken(null), 2000);
  };

  const publicConfig = getSupabasePublicConfig();
  const webhookUrl = publicConfig ? `${publicConfig.url}/rest/v1/rpc/registrar_pago_automatico` : '';
  // Cuerpo JSON listo para copiar/pegar en MacroDroid — ya trae el token real
  // de ESTE negocio. El valor de p_monto queda vacío a propósito: esa parte
  // no se puede "pre-llenar" porque es una variable interna de MacroDroid
  // (Texto de la notificación) que solo se inserta desde su propio selector,
  // nunca escribiéndola a mano — ver instrucciones junto al bloque.
  const jsonParaEntidad = (entidad: 'nequi' | 'daviplata' | 'bancolombia') =>
    `{"p_token":"${webhookToken || 'TU_TOKEN_AQUI'}","p_monto":"","p_entidad":"${entidad}"}`;
  const appsScriptCode = webhookToken
    ? `function revisarPagosNequi() {
  var hilos = GmailApp.search('from:nequi.com.co is:unread newer_than:1d', 0, 5);
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      var texto = msg.getPlainBody();
      var monto = texto.match(/\\$\\s?([\\d.,]+)/);
      if (!monto) return;
      var valor = parseInt(monto[1].replace(/[.,]/g, ''), 10);
      UrlFetchApp.fetch('${webhookUrl}', {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: '${publicConfig?.anonKey}', Authorization: 'Bearer ${publicConfig?.anonKey}' },
        payload: JSON.stringify({ p_token: '${webhookToken}', p_monto: valor, p_entidad: 'nequi', p_referencia: msg.getFrom() }),
      });
      msg.markRead();
    });
  });
}`
    : '';

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
      toast.error('Esta instalación no está vinculada a un negocio en nuestra base de datos', {
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

            <button
              onClick={alternarVoz}
              title={vozActiva ? 'Desactivar anuncio de voz' : 'Activar anuncio de voz'}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                vozActiva
                  ? darkMode
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-blue-100 text-blue-700 border-blue-300'
                  : darkMode
                    ? 'bg-slate-700/40 text-slate-400 border-slate-600'
                    : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}
            >
              {vozActiva ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {vozActiva ? 'Voz Activada' : 'Voz Desactivada'}
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
              {vinculado ? 'Vinculado a nuestra base de datos' : 'Sin vincular'}
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
                      Esta instalación no está vinculada a un negocio en nuestra base de datos
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
                      ? 'Las notificaciones de pago llegarán al celular de forma instantánea en tiempo real.'
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

            {/* 📱 Estado por celular — antes esto era invisible desde Electron */}
            <Card className={darkMode
              ? 'bg-slate-800/50 border-slate-700 backdrop-blur-xl'
              : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }>
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${
                    darkMode ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-emerald-600 to-teal-600'
                  } flex items-center justify-center shadow-lg shadow-emerald-500/30`}>
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Celulares del equipo</h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-blue-700'}`}>Quién ya activó Codec Verify en su celular</p>
                  </div>
                </div>

                {cargandoCelulares ? (
                  <div className="flex items-center gap-2 py-4">
                    <RefreshCw className={`w-4 h-4 animate-spin ${darkMode ? 'text-slate-500' : 'text-purple-400'}`} />
                    <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Consultando…</span>
                  </div>
                ) : celulares.length === 0 ? (
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Nadie del equipo tiene cuenta en la app móvil todavía — invítalos desde Perfil (en la app) o Personal.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {celulares.map((e) => (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl ${
                          darkMode ? 'bg-slate-900/50' : 'bg-purple-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {e.codec_verify_activo ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className={`w-4 h-4 shrink-0 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
                          )}
                          <span className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{e.nombre_completo}</span>
                        </div>
                        <span className={`text-xs font-bold shrink-0 ${
                          e.codec_verify_activo ? 'text-emerald-500' : darkMode ? 'text-slate-500' : 'text-gray-400'
                        }`}>
                          {e.codec_verify_activo
                            ? `Activo${e.codec_verify_actualizado_en ? ` · ${new Date(e.codec_verify_actualizado_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`
                            : 'No activado'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 🔑 Automatización de pagos — guardado como "cajón" cerrado por
                defecto, mismo panel que ya tiene la app móvil (Configuración),
                para que el dueño pueda entender/probar el flujo completo
                (token + webhook + Apps Script) sin depender del celular. */}
            <Card className={darkMode
              ? 'bg-slate-800/50 border-purple-700/40 backdrop-blur-xl'
              : 'bg-white/70 border-purple-200 backdrop-blur-2xl shadow-xl'
            }>
              <CardContent className="p-6">
                <button
                  type="button"
                  onClick={() => setMostrarGuiaToken((v) => !v)}
                  className="w-full flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-500 shrink-0" />
                    <span className={`text-left font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Automatización de pagos (token)
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${darkMode ? 'text-slate-400' : 'text-gray-500'} ${mostrarGuiaToken ? 'rotate-180' : ''}`} />
                </button>
                <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Conecta un correo o SMS de confirmación de pago para que el POS se entere solo, sin escribir el monto a mano.
                </p>

                {mostrarGuiaToken && !automatizacionDesbloqueada && (
                  <div className={`mt-4 rounded-xl p-4 border ${darkMode ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Esta sección tiene el token y las claves de tu proyecto — cualquiera con eso
                      podría insertar pagos falsos. Confirma tu contraseña para verla.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={passwordVerificacion}
                        onChange={(e) => setPasswordVerificacion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') verificarAccesoAutomatizacion(); }}
                        placeholder="Tu contraseña"
                        className={`flex-1 min-w-0 h-11 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-slate-300'}`}
                      />
                      <Button onClick={verificarAccesoAutomatizacion} disabled={verificandoPassword || !passwordVerificacion}>
                        {verificandoPassword ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Desbloquear'}
                      </Button>
                    </div>
                  </div>
                )}

                {mostrarGuiaToken && automatizacionDesbloqueada && (
                  <div className="mt-4 space-y-3">
                    {cargandoToken ? (
                      <div className="flex items-center gap-2 py-2">
                        <RefreshCw className={`w-4 h-4 animate-spin ${darkMode ? 'text-slate-500' : 'text-purple-400'}`} />
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Consultando…</span>
                      </div>
                    ) : !vinculado ? (
                      <p className={`text-sm ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                        Vincula esta instalación a nuestra base de datos primero (arriba) para generar el token.
                      </p>
                    ) : webhookToken ? (
                      <>
                        <div>
                          <p className={`text-xs font-semibold mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Token del negocio</p>
                          <div className="flex gap-2">
                            <div className={`flex-1 h-11 px-3 rounded-lg border flex items-center font-mono text-xs overflow-hidden ${darkMode ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-purple-50/50 border-purple-300 text-gray-900'}`}>
                              {mostrarToken ? webhookToken : '•'.repeat(24)}
                            </div>
                            <button onClick={() => setMostrarToken(!mostrarToken)} className={`h-11 w-11 rounded-lg border flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-purple-300 text-gray-600'}`}>
                              {mostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button onClick={() => copiarTextoToken(webhookToken, 'token')} className={`h-11 w-11 rounded-lg border flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-purple-300 text-gray-600'}`}>
                              {copiadoToken === 'token' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className={`text-xs font-semibold mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>URL del webhook</p>
                          <div className="flex gap-2">
                            <div className={`flex-1 h-11 px-3 rounded-lg border flex items-center font-mono text-[10px] overflow-x-auto whitespace-nowrap ${darkMode ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-purple-50/50 border-purple-300 text-gray-900'}`}>
                              {webhookUrl}
                            </div>
                            <button onClick={() => copiarTextoToken(webhookUrl, 'url')} className={`h-11 w-11 rounded-lg border flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-purple-300 text-gray-600'}`}>
                              {copiadoToken === 'url' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className={`rounded-xl p-4 border ${darkMode ? 'bg-slate-900/40 border-slate-700' : 'bg-purple-50/40 border-purple-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Mail className="w-4 h-4 text-sky-500" />
                            <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Por correo (Gmail) — sin instalar nada</p>
                          </div>
                          <ol className={`text-xs space-y-1 list-decimal list-inside mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            <li className="flex items-center gap-1.5 flex-wrap">
                              <span>Abre <span className={darkMode ? 'text-slate-300' : 'text-gray-800'}>script.google.com</span> con el Gmail donde llegan los correos de Nequi</span>
                              <button
                                onClick={() => copiarTextoToken(GOOGLE_SCRIPT_URL, 'gscript_link')}
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-purple-300 text-gray-600'}`}
                              >
                                {copiadoToken === 'gscript_link' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copiar link
                              </button>
                            </li>
                            <li>Crea un proyecto nuevo, pega el código de abajo</li>
                            <li>En "Activadores" (reloj), agrega uno cada 5 minutos para esta función</li>
                          </ol>
                          <div className="relative">
                            <pre className={`rounded-lg p-3 text-[10px] overflow-x-auto max-h-40 border ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-purple-200 text-gray-700'}`}>{appsScriptCode}</pre>
                            <button
                              onClick={() => copiarTextoToken(appsScriptCode, 'script')}
                              className={`absolute top-2 right-2 h-7 w-7 rounded-md flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-purple-100 text-gray-600'}`}
                            >
                              {copiadoToken === 'script' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className={`rounded-xl p-4 border ${darkMode ? 'bg-slate-900/40 border-emerald-700/50' : 'bg-emerald-50/60 border-emerald-300'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4 text-emerald-500" />
                            <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Por notificación push (recomendado — más rápido que el SMS)</p>
                          </div>
                          <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            Nequi, Daviplata y Bancolombia avisan por notificación apenas se confirma el pago — no
                            dependen de que el operador entregue el SMS. Guía para instalar en MacroDroid, con los
                            valores de <b>este negocio</b> ya listos para copiar.
                          </p>

                          <ol className={`text-xs space-y-2 list-decimal list-inside ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                            <li>
                              <b>Permiso previo (Android):</b> Ajustes → Aplicaciones → Acceso especial → Acceso a
                              notificaciones → activa el interruptor para MacroDroid.
                            </li>
                            <li className="flex items-center gap-1.5 flex-wrap">
                              <span>Instala <b>MacroDroid</b> en el celular donde llegan las notificaciones de pago</span>
                              <button
                                onClick={() => copiarTextoToken(MACRODROID_URL, 'macrodroid_notif_link')}
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-emerald-300 text-gray-600'}`}
                              >
                                {copiadoToken === 'macrodroid_notif_link' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copiar link MacroDroid
                              </button>
                            </li>
                            <li>
                              <b>Disparador:</b> Añadir macro → botón <span className="font-mono">+</span> en Disparadores →
                              Eventos del dispositivo → Notificación → Notificación recibida → elige <b>solo una app</b>
                              (crea una macro por separado para cada una — nunca combines varias apps en un mismo disparador).
                            </li>
                            <li>
                              <b>Acción → Solicitud HTTP</b>, pestaña "Configuración": Método <span className="font-mono">POST</span>,
                              URL (la misma para las tres apps y para cualquier negocio que instales — no cambia nunca):
                              <div className="flex gap-2 mt-1">
                                <div className={`flex-1 min-w-0 font-mono text-[10px] p-2 rounded-lg overflow-x-auto whitespace-nowrap ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white border border-emerald-200 text-gray-800'}`}>
                                  {webhookUrl}
                                </div>
                                <button onClick={() => copiarTextoToken(webhookUrl, 'url')} className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-gray-600'}`}>
                                  {copiadoToken === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </li>
                            <li>
                              Pestaña "Cabeceras" (Headers) — dos filas, también universales, iguales siempre:
                              <div className="grid gap-1.5 mt-1">
                                <div className="flex gap-2 items-center">
                                  <span className={`text-[10px] font-mono w-20 shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>apikey</span>
                                  <div className={`flex-1 min-w-0 font-mono text-[10px] p-2 rounded-lg overflow-x-auto whitespace-nowrap ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white border border-emerald-200 text-gray-800'}`}>
                                    {publicConfig?.anonKey || ''}
                                  </div>
                                  <button onClick={() => copiarTextoToken(publicConfig?.anonKey || '', 'apikey')} className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-gray-600'}`}>
                                    {copiadoToken === 'apikey' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <div className="flex gap-2 items-center">
                                  <span className={`text-[10px] font-mono w-20 shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Authorization</span>
                                  <div className={`flex-1 min-w-0 font-mono text-[10px] p-2 rounded-lg overflow-x-auto whitespace-nowrap ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white border border-emerald-200 text-gray-800'}`}>
                                    Bearer {publicConfig?.anonKey || ''}
                                  </div>
                                  <button onClick={() => copiarTextoToken(`Bearer ${publicConfig?.anonKey || ''}`, 'authorization')} className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-gray-600'}`}>
                                    {copiadoToken === 'authorization' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </li>
                            <li>
                              Pestaña "Cuerpo del Contenido": tipo <span className="font-mono">application/json</span>, marca
                              Texto, y pega uno de estos tres — <b>solo cambia según qué app elegiste en el disparador</b>
                              (el token ya viene puesto, es el de este negocio):
                            </li>
                          </ol>

                          <div className="grid gap-2 mt-2">
                            {([
                              { id: 'nequi' as const, nombre: 'Nequi', copyKey: 'json_nequi' as const },
                              { id: 'daviplata' as const, nombre: 'Daviplata', copyKey: 'json_daviplata' as const },
                              { id: 'bancolombia' as const, nombre: 'Bancolombia', copyKey: 'json_bancolombia' as const },
                            ]).map((ent) => (
                              <div key={ent.id}>
                                <p className={`text-[10px] font-semibold mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{ent.nombre}</p>
                                <div className="flex gap-2">
                                  <div className={`flex-1 min-w-0 font-mono text-[10px] p-2 rounded-lg overflow-x-auto whitespace-nowrap ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white border border-emerald-200 text-gray-800'}`}>
                                    {jsonParaEntidad(ent.id)}
                                  </div>
                                  <button onClick={() => copiarTextoToken(jsonParaEntidad(ent.id), ent.copyKey)} className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-emerald-100 text-gray-600'}`}>
                                    {copiadoToken === ent.copyKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <ol className={`text-xs space-y-2 list-decimal list-inside mt-3 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`} start={7}>
                            <li>
                              Con el cursor entre las comillas vacías de <span className="font-mono">"p_monto":""</span>, toca
                              el botón <span className="font-mono">…</span> junto al cuadro y elige la variable de texto de
                              la notificación de la lista — <b>nunca la escribas a mano</b>, y no dejes nada de texto suelto
                              antes o después de las llaves del JSON.
                            </li>
                            <li>
                              En Ajustes de Android → Notificaciones, <b>desactiva "Notificaciones mejoradas"</b> — puede
                              ocultar montos de dinero por privacidad antes de que MacroDroid los vea.
                            </li>
                            <li>
                              Antes de fijar la palabra del filtro del disparador, ponlo en "Cualquier" y agrega una acción
                              de "Mostrar notificación" con la misma variable para ver el texto REAL que manda cada app —
                              luego ajusta el filtro ("Contiene") a esa palabra exacta.
                            </li>
                            <li>
                              En la pestaña "Configuración" de la Solicitud HTTP, activa "Guardar el código de retorno HTTP
                              en una variable" — así ves en el historial de MacroDroid si Supabase respondió éxito (204)
                              o error, sin adivinar.
                            </li>
                            <li>
                              Guarda la macro (nómbrala, ej. "Codec Verify - Nequi") y repite los pasos 3-9 para las otras
                              dos apps, cambiando solo la app del disparador y cuál JSON de arriba pegas.
                            </li>
                          </ol>
                        </div>

                        <div className={`rounded-xl p-4 border ${darkMode ? 'bg-slate-900/40 border-slate-700' : 'bg-purple-50/40 border-purple-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Smartphone className="w-4 h-4 text-emerald-500" />
                            <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Por SMS (Tasker / MacroDroid)</p>
                          </div>
                          <ol className={`text-xs space-y-1 list-decimal list-inside ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            <li className="flex items-center gap-1.5 flex-wrap">
                              <span>Instala Tasker o MacroDroid en el celular donde llegan los SMS de pago</span>
                              <button
                                onClick={() => copiarTextoToken(MACRODROID_URL, 'macrodroid_link')}
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-purple-300 text-gray-600'}`}
                              >
                                {copiadoToken === 'macrodroid_link' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copiar link MacroDroid
                              </button>
                            </li>
                            <li>Crea una automatización: "Cuando llegue un SMS que contenga 'Nequi'"</li>
                            <li>Acción: HTTP Request POST a la URL de arriba, header <span className={`font-mono ${darkMode ? 'text-slate-300' : 'text-gray-800'}`}>apikey</span> con la anon key del proyecto</li>
                            <li>Cuerpo JSON: <span className={`font-mono ${darkMode ? 'text-slate-300' : 'text-gray-800'}`}>{'{"p_token":"...","p_monto":<extraído del SMS>,"p_entidad":"nequi"}'}</span></li>
                          </ol>
                        </div>

                        <div className={`rounded-xl p-4 border ${darkMode ? 'bg-slate-900/40 border-sky-700/40' : 'bg-sky-50/60 border-sky-200'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Mail className="w-4 h-4 text-sky-500" />
                            <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>iPhone (Nequi, Daviplata, Bancolombia)</p>
                          </div>
                          <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            Apple no deja que ninguna app lea notificaciones ni SMS de otras apps —
                            es una restricción de seguridad de iOS, no algo que Codec Verify pueda evitar.
                            Por eso el camino en iPhone es distinto según la entidad:
                          </p>
                          <ol className={`text-xs space-y-1.5 list-decimal list-inside ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            <li>
                              <b>Daviplata y Bancolombia — ya funciona hoy, sin instalar nada en el celular.</b> Usa la
                              opción "Por correo (Gmail)" de arriba: activa las notificaciones por correo dentro de cada
                              app (Bancolombia: "Alertas y Notificaciones" → correo; Daviplata: en su menú de
                              Notificaciones se envían solas al correo registrado) y apunta el Apps Script a ese Gmail.
                              No depende de qué celular use el negocio.
                            </li>
                            <li>
                              <b>Nequi — no manda correo por cada pago recibido</b> (sus avisos van ligados al número de
                              celular, no al correo), así que para clientes que solo tienen iPhone hay dos caminos:
                              <ul className="list-disc list-inside ml-3 mt-1 space-y-1">
                                <li>iOS 27 trae una automatización nueva en Shortcuts ("Cuando reciba una notificación
                                  de...") que sí puede leer el texto — gratis y sin apps de terceros, pero es muy
                                  reciente y aún inestable en sus primeras versiones; pruébala, pero no la dejes como
                                  único método para cobrar en un negocio todavía.</li>
                                <li>Camino confiable hoy: un celular Android de respaldo (uno viejo sirve) dedicado solo
                                  a recibir las notificaciones de Nequi con MacroDroid, mientras el dueño sigue usando
                                  su iPhone normalmente para todo lo demás.</li>
                              </ul>
                            </li>
                          </ol>
                        </div>

                        <button
                          onClick={rotarToken}
                          disabled={generandoToken}
                          className={`w-full text-xs ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          {generandoToken ? 'Generando…' : 'Generar un token nuevo (invalida el actual)'}
                        </button>
                      </>
                    ) : (
                      <Button onClick={rotarToken} disabled={generandoToken} className="w-full h-12 bg-gradient-to-r from-purple-600 to-fuchsia-600">
                        {generandoToken ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                        {generandoToken ? 'Generando…' : 'Generar token de automatización'}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 🔊 Voz del anuncio. Se deja elegir siempre — si este build trae
                el motor embebido (Piper/Daniela) aparece como una opción más
                en la lista ("voz incorporada"), pero el usuario puede elegir
                cualquier voz instalada en Windows y esa elección manda sobre
                Piper (ver anunciarVoz en lib/voz.ts). Si nunca elige nada,
                el comportamiento por defecto sigue siendo Piper cuando está
                disponible. */}
            {vozActiva && (
              <Card className={darkMode
                ? 'bg-slate-800/50 border-blue-700/40 backdrop-blur-xl'
                : 'bg-white/70 border-blue-200 backdrop-blur-2xl shadow-xl'
              }>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Volume2 className="w-5 h-5 text-blue-500 shrink-0" />
                    <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Voz del anuncio</span>
                  </div>

                  <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Elige con qué voz se leen en voz alta las notificaciones de pago. Tu elección se guarda en este equipo.
                  </p>

                  {!motorEmbebido && vocesDisponibles.length === 0 ? (
                    <p className={`text-sm ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                      No se encontró ninguna voz en español instalada en este equipo — Windows la instala en Configuración → Hora e idioma → Voz.
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={vozSeleccionada || (motorEmbebido ? PIPER_VOICE_ID : '')}
                        onChange={(e) => cambiarVoz(e.target.value)}
                        className={`flex-1 h-11 px-3 rounded-lg border text-sm ${darkMode ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-blue-50/50 border-blue-300 text-gray-900'}`}
                      >
                        {motorEmbebido && (
                          <option value={PIPER_VOICE_ID}>Daniela — voz incorporada (sin conexión)</option>
                        )}
                        {vocesDisponibles.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                        ))}
                      </select>
                      <Button variant="outline" onClick={() => anunciarPagoRecibido(50000, 'nequi')} className={darkMode ? 'border-slate-600' : 'border-blue-300'}>
                        Probar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
                aparecerá en el celular conectado con Codec Verify activo. Si el interruptor de voz está encendido,
                esta caja anunciará en voz alta el monto recibido.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="h-20" />
      </div>
    </div>
  );
}
